// RPCs do Painel sobre Pedidos e configuração operacional (contrato do Ticket 24a; o 24b
// implementa). CONTRATO: cada método já valida a entrada com o schema de @foode/shared/order e
// autoriza pela política única (`can()`) na Loja ATIVA, com StoreContext emitido por @foode/db:
// - `orders.view` (Dono e Operador): fila, detalhe e leitura da configuração operacional;
// - `orders.update_status` / `orders.cancel` (Dono e Operador): avançar e cancelar (sem Estorno —
//   o Estorno automático é do Ticket 12);
// - `store.pause` (Dono e Operador, P-OPE-4): ligar/retomar a Pausa, com auditoria;
// - `store.settings` (só Dono): horários, entrega, bandeiras e "Imprimir ao aceitar".
// Ops recebe `forbidden`. A regra de negócio ainda devolve `not_implemented`: a fatia API do 24b
// troca cada `notImplemented` por operação em `db.store(context)` (UPDATE condicional no estado
// `from`, `order_status_events`, `audit_events`).
// Ordem: validar entrada → sessão → autorizar (política única) → operar.
import type { FoodeDb, StoreContext } from "@foode/db";
import type { PainelCaller } from "@foode/shared";
import type { Permission, RpcResult } from "@foode/shared/auth";
import {
  type OrderDetail,
  orderCancelInputSchema,
  orderRefInputSchema,
  type OrdersList,
  ordersListInputSchema,
  orderTransitionInputSchema,
  type OrderTransitionResult,
  type PauseState,
  type StoreOperationSettings,
  storeSetCardBrandsInputSchema,
  storeSetFulfillmentInputSchema,
  storeSetHoursInputSchema,
  storeSetPauseInputSchema,
  storeSetPrintOnAcceptInputSchema,
} from "@foode/shared/order";

import type { FoodeAuth } from "./auth/auth";
import { authorizeSession, resolveSessionCtx, rolesWith } from "./auth/guard";
import { callerHeaders } from "./painel-service";

export type OrderServiceDeps = { db: FoodeDb; auth: FoodeAuth };

/** O que a api usa de um schema Zod (a api não depende de `zod` diretamente). */
type InputSchema<O> = {
  safeParse(input: unknown): { success: true; data: O } | { success: false };
};

const noInput: InputSchema<undefined> = {
  safeParse: (input) =>
    input === undefined ? { success: true, data: undefined } : { success: false },
};

async function notImplemented<T>(): Promise<RpcResult<T>> {
  return { ok: false, error: "not_implemented" };
}

export function createOrderService(deps: OrderServiceDeps) {
  const { db, auth } = deps;

  /** Valida, resolve a sessão e exige StoreContext com `permission`; só então chama `operation`. */
  async function asStoreMember<O, T>(
    permission: Permission,
    caller: PainelCaller,
    schema: InputSchema<O>,
    input: unknown,
    operation: (context: StoreContext, input: O) => Promise<RpcResult<T>>,
  ): Promise<RpcResult<T>> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const session = await resolveSessionCtx(auth, db, callerHeaders(caller));
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await authorizeSession(db, session, rolesWith(permission));
    if (!result.ok) return { ok: false, error: result.error };
    if (result.authorized.kind !== "store") return { ok: false, error: "forbidden" };
    return operation(result.authorized.store, parsed.data);
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
        notImplemented<OrdersList>,
      );
    },

    /** Detalhe; Pedido de outra Loja ou inexistente = `not_found`. */
    ordersGet(caller: PainelCaller, input: unknown): Promise<RpcResult<OrderDetail>> {
      return asStoreMember(
        "orders.view",
        caller,
        orderRefInputSchema,
        input,
        notImplemented<OrderDetail>,
      );
    },

    /**
     * Avança pelo módulo de estados (`checkTransition`): inválida = `invalid_input`; estado atual
     * diferente de `from` = `conflict`, sem gravar. Grava `order_status_events` com quem e papel.
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
        notImplemented<OrderTransitionResult>,
      );
    },

    /** Cancela (só status + auditoria; Estorno no Ticket 12). Estado final ou ≠ `from` = `conflict`. */
    ordersCancel(caller: PainelCaller, input: unknown): Promise<RpcResult<OrderTransitionResult>> {
      return asStoreMember(
        "orders.cancel",
        caller,
        orderCancelInputSchema,
        input,
        notImplemented<OrderTransitionResult>,
      );
    },

    // ---- Configuração operacional.

    /** Leitura (Dono e Operador: o Operador precisa da Pausa e do "Imprimir ao aceitar"). */
    storeOperationGet(caller: PainelCaller): Promise<RpcResult<StoreOperationSettings>> {
      return asStoreMember(
        "orders.view",
        caller,
        noInput,
        undefined,
        notImplemented<StoreOperationSettings>,
      );
    },

    /** Liga/retoma a Pausa; auditada (`store.pause`/`store.resume`, com papel). Idempotente. */
    storeSetPause(caller: PainelCaller, input: unknown): Promise<RpcResult<PauseState>> {
      return asStoreMember(
        "store.pause",
        caller,
        storeSetPauseInputSchema,
        input,
        notImplemented<PauseState>,
      );
    },

    /** Grade inteira, atômica (decisão 58). Só Dono. */
    storeSetHours(caller: PainelCaller, input: unknown): Promise<RpcResult<null>> {
      return asStoreMember(
        "store.settings",
        caller,
        storeSetHoursInputSchema,
        input,
        notImplemented<null>,
      );
    },

    /** Retirada, modo do Delivery, bairros (lista completa), mínimo e tempos. Só Dono. */
    storeSetFulfillment(caller: PainelCaller, input: unknown): Promise<RpcResult<null>> {
      return asStoreMember(
        "store.settings",
        caller,
        storeSetFulfillmentInputSchema,
        input,
        notImplemented<null>,
      );
    },

    storeSetCardBrands(caller: PainelCaller, input: unknown): Promise<RpcResult<null>> {
      return asStoreMember(
        "store.settings",
        caller,
        storeSetCardBrandsInputSchema,
        input,
        notImplemented<null>,
      );
    },

    storeSetPrintOnAccept(caller: PainelCaller, input: unknown): Promise<RpcResult<null>> {
      return asStoreMember(
        "store.settings",
        caller,
        storeSetPrintOnAcceptInputSchema,
        input,
        notImplemented<null>,
      );
    },
  };
}

export type OrderService = ReturnType<typeof createOrderService>;
