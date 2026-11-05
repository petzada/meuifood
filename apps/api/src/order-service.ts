// RPCs do Painel sobre Pedidos e configuração operacional (Ticket 24a; o 24b consome). Cada
// método valida a entrada com o schema de @foode/shared/order e autoriza pela política única
// (`can()`) na Loja ATIVA, com StoreContext emitido por @foode/db:
// - `orders.view` (Dono e Operador): fila, detalhe e leitura da configuração operacional;
// - `orders.update_status` / `orders.cancel` (Dono e Operador): avançar e cancelar (sem Estorno —
//   o Estorno automático é do Ticket 12);
// - `store.pause` (Dono e Operador, P-OPE-4): ligar/retomar a Pausa, com auditoria;
// - `store.settings` (só Dono): horários, entrega, bandeiras e "Imprimir ao aceitar".
// Ops recebe `forbidden`. As operações ficam em `db.store(context).operation()/.orders()`
// (UPDATE condicional no estado `from`, `order_status_events`, `audit_events`).
// Ordem: validar entrada → sessão → autorizar (política única) → operar.
import {
  type FoodeDb,
  FoodeDbError,
  type OperationResult,
  type OperationSettings,
  type OrderTransitionData,
  type StoreContext,
} from "@foode/db";
import {
  normalizeNeighborhoodKey,
  type PainelCaller,
  sanitizeNeighborhoodDisplayName,
} from "@foode/shared";
import type { Permission, RpcResult, SessionCtx } from "@foode/shared/auth";
import {
  allowedTransitions,
  CARD_BRANDS,
  type Fulfillment,
  isAcceptTransition,
  isCancellable,
  type OrderDetail,
  orderCancelInputSchema,
  orderRefInputSchema,
  type OrdersList,
  ordersListInputSchema,
  type OrderStatus,
  orderTrackingPath,
  orderTransitionInputSchema,
  type OrderTransitionResult,
  type PauseState,
  saoPauloCivil,
  saoPauloInstant,
  type StoreOperationSettings,
  storeSetCardBrandsInputSchema,
  storeSetFulfillmentInputSchema,
  storeSetHoursInputSchema,
  storeSetPauseInputSchema,
  storeSetPrintOnAcceptInputSchema,
} from "@foode/shared/order";

import type { FoodeAuth } from "./auth/auth";
import { authorizeSession, resolveSessionCtx, rolesWith } from "./auth/guard";
import { orderAccessToken, requireSecret } from "./order-crypto";
import { callerHeaders } from "./painel-service";

export type OrderServiceDeps = {
  db: FoodeDb;
  auth: FoodeAuth;
  /** ORDER_TOKEN_SECRET: remonta o link da página do Pedido no detalhe. */
  orderTokenSecret: string | undefined;
  now?: () => Date;
};

/** O que a api usa de um schema Zod (a api não depende de `zod` diretamente). */
type InputSchema<O> = {
  safeParse(input: unknown): { success: true; data: O } | { success: false };
};

const noInput: InputSchema<undefined> = {
  safeParse: (input) =>
    input === undefined ? { success: true, data: undefined } : { success: false },
};

/** Transições do botão de avanço (sem `cancelled`, que fica no detalhe). */
function nextOf(fulfillment: Fulfillment, status: OrderStatus): OrderStatus[] {
  return allowedTransitions(fulfillment, status).filter((to) => to !== "cancelled");
}

/** Início do dia civil de São Paulo (base de "Concluídos hoje"). */
export function saoPauloDayStart(now: Date): string {
  const civil = saoPauloCivil(now.getTime());
  return new Date(saoPauloInstant(civil.year, civil.month, civil.day, 0, 0)).toISOString();
}

function toSettings(settings: OperationSettings): StoreOperationSettings {
  const brands = (list: string[]) => CARD_BRANDS.filter((brand) => list.includes(brand));
  return {
    ...settings,
    cardBrands: {
      debit: brands(settings.cardBrands.debit),
      credit: brands(settings.cardBrands.credit),
    },
  };
}

/** Erro de regra do @foode/db vira código do RpcResult; falha inesperada propaga. */
async function guarded<T>(operation: () => Promise<RpcResult<T>>): Promise<RpcResult<T>> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof FoodeDbError) {
      const code = error.code === "slug_unavailable" ? "conflict" : error.code;
      return { ok: false, error: code };
    }
    throw error;
  }
}

export function createOrderService(deps: OrderServiceDeps) {
  const { db, auth } = deps;
  const clock = deps.now ?? (() => new Date());

  /** Valida, resolve a sessão e exige StoreContext com `permission`; só então chama `operation`. */
  async function asStoreMember<O, T>(
    permission: Permission,
    caller: PainelCaller,
    schema: InputSchema<O>,
    input: unknown,
    operation: (context: StoreContext, input: O, session: SessionCtx) => Promise<RpcResult<T>>,
  ): Promise<RpcResult<T>> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const session = await resolveSessionCtx(auth, db, callerHeaders(caller));
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await authorizeSession(db, session, rolesWith(permission));
    if (!result.ok) return { ok: false, error: result.error };
    if (result.authorized.kind !== "store") return { ok: false, error: "forbidden" };
    const { store, session: authorizedSession } = result.authorized;
    return guarded(() => operation(store, parsed.data, authorizedSession));
  }

  function transitionResult(
    outcome: OperationResult<OrderTransitionData>,
    from: OrderStatus,
  ): RpcResult<OrderTransitionResult> {
    if (!outcome.ok) return outcome;
    const { status, fulfillment, printOnAccept } = outcome.data;
    return {
      ok: true,
      data: {
        status,
        next: nextOf(fulfillment, status),
        print: isAcceptTransition(from, status) && printOnAccept,
      },
    };
  }

  return {
    // ---- Fila e detalhe (Dono e Operador).

    /** Fila ativa ou "Concluídos hoje", com chips por Fulfillment; só a Loja ativa. */
    ordersList(caller: PainelCaller, input?: unknown): Promise<RpcResult<OrdersList>> {
      return asStoreMember(
        "orders.view",
        caller,
        ordersListInputSchema,
        input ?? {},
        async (context, query): Promise<RpcResult<OrdersList>> => {
          const now = clock();
          const result = await db
            .store(context)
            .orders()
            .list({
              filter: query.filter,
              scope: query.scope,
              closedSince: saoPauloDayStart(now),
            });
          return {
            ok: true,
            data: {
              orders: result.orders.map((order) => ({
                ...order,
                next: nextOf(order.fulfillment, order.status),
              })),
              closedToday: result.closedToday,
              serverTime: now.toISOString(),
            },
          };
        },
      );
    },

    /** Detalhe; Pedido de outra Loja ou inexistente = `not_found`. */
    ordersGet(caller: PainelCaller, input: unknown): Promise<RpcResult<OrderDetail>> {
      return asStoreMember(
        "orders.view",
        caller,
        orderRefInputSchema,
        input,
        async (context, { orderId }, session): Promise<RpcResult<OrderDetail>> => {
          const order = await db.store(context).orders().get(orderId);
          if (!order) return { ok: false, error: "not_found" };
          const slug = session.activeStore?.slug;
          if (!slug) return { ok: false, error: "forbidden" };
          const token = await orderAccessToken(
            requireSecret(deps.orderTokenSecret, "ORDER_TOKEN_SECRET"),
            order.id,
          );
          return {
            ok: true,
            data: {
              id: order.id,
              code: order.code,
              status: order.status,
              fulfillment: order.fulfillment,
              createdAt: order.createdAt,
              customer: { name: order.customerName, phone: order.customerPhone },
              address: order.address,
              lines: order.lines,
              subtotalCents: order.subtotalCents,
              deliveryFeeCents: order.deliveryFeeCents,
              discountCents: order.discountCents,
              totalCents: order.totalCents,
              payment: { method: order.paymentMethod, changeForCents: order.changeForCents },
              note: order.note,
              eta: order.eta,
              next: nextOf(order.fulfillment, order.status),
              cancellable: isCancellable(order.fulfillment, order.status),
              history: order.history,
              trackingPath: orderTrackingPath(slug, token),
            },
          };
        },
      );
    },

    /**
     * Avança pelo módulo de estados: inválida = `invalid_input`; estado atual diferente de `from`
     * = `conflict`, sem gravar. Grava `order_status_events` com quem e papel.
     */
    ordersTransition(
      caller: PainelCaller,
      input: unknown,
    ): Promise<RpcResult<OrderTransitionResult>> {
      return asStoreMember(
        "orders.update_status",
        caller,
        orderTransitionInputSchema,
        input,
        async (context, { orderId, from, to }) => {
          const outcome = await db.store(context).orders().advance(orderId, from, to);
          return transitionResult(outcome, from);
        },
      );
    },

    /** Cancela (só status + histórico; Estorno no Ticket 12). Estado final ou ≠ `from` = `conflict`. */
    ordersCancel(caller: PainelCaller, input: unknown): Promise<RpcResult<OrderTransitionResult>> {
      return asStoreMember(
        "orders.cancel",
        caller,
        orderCancelInputSchema,
        input,
        async (context, { orderId, from }) => {
          const outcome = await db.store(context).orders().cancel(orderId, from);
          if (!outcome.ok && outcome.error === "invalid_input") {
            return { ok: false, error: "conflict" };
          }
          return transitionResult(outcome, from);
        },
      );
    },

    // ---- Configuração operacional.

    /** Leitura (Dono e Operador: o Operador precisa da Pausa e do "Imprimir ao aceitar"). */
    storeOperationGet(caller: PainelCaller): Promise<RpcResult<StoreOperationSettings>> {
      return asStoreMember("orders.view", caller, noInput, undefined, async (context) => ({
        ok: true,
        data: toSettings(await db.store(context).operation().get()),
      }));
    },

    /** Liga/retoma a Pausa; auditada (`store.pause`/`store.resume`, com papel). Idempotente. */
    storeSetPause(caller: PainelCaller, input: unknown): Promise<RpcResult<PauseState>> {
      return asStoreMember(
        "store.pause",
        caller,
        storeSetPauseInputSchema,
        input,
        async (context, { paused }) => ({
          ok: true,
          data: await db.store(context).operation().setPause(paused),
        }),
      );
    },

    /** Grade inteira, atômica (decisão 58). Só Dono. */
    storeSetHours(caller: PainelCaller, input: unknown): Promise<RpcResult<null>> {
      return asStoreMember(
        "store.settings",
        caller,
        storeSetHoursInputSchema,
        input,
        async (context, { periods }) => {
          await db.store(context).operation().setHours(periods);
          return { ok: true, data: null };
        },
      );
    },

    /** Retirada, modo do Delivery, bairros (lista completa), mínimo e tempos. Só Dono. */
    storeSetFulfillment(caller: PainelCaller, input: unknown): Promise<RpcResult<null>> {
      return asStoreMember(
        "store.settings",
        caller,
        storeSetFulfillmentInputSchema,
        input,
        (context, data) =>
          db
            .store(context)
            .operation()
            .setFulfillment({
              ...data,
              neighborhoods: data.neighborhoods.map((n) => ({
                id: n.id,
                name: sanitizeNeighborhoodDisplayName(n.name),
                normalizedName: normalizeNeighborhoodKey(n.name),
                feeCents: n.feeCents,
                active: n.active,
              })),
            }),
      );
    },

    storeSetCardBrands(caller: PainelCaller, input: unknown): Promise<RpcResult<null>> {
      return asStoreMember(
        "store.settings",
        caller,
        storeSetCardBrandsInputSchema,
        input,
        async (context, brands) => {
          await db.store(context).operation().setCardBrands(brands);
          return { ok: true, data: null };
        },
      );
    },

    storeSetPrintOnAccept(caller: PainelCaller, input: unknown): Promise<RpcResult<null>> {
      return asStoreMember(
        "store.settings",
        caller,
        storeSetPrintOnAcceptInputSchema,
        input,
        async (context, { printOnAccept }) => {
          await db.store(context).operation().setPrintOnAccept(printOnAccept);
          return { ok: true, data: null };
        },
      );
    },
  };
}

export type OrderService = ReturnType<typeof createOrderService>;
