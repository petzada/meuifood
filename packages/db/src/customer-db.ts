// Conta do Consumidor no D1 (Ticket 13; decisões 65, 66, 68). Sem StoreContext: o Consumidor não é
// membro de Loja. A identidade sai SÓ do código conferido aqui (uso único, atômico) e, depois, do
// hash do token da sessão; a Loja dos "meus Pedidos" sai SÓ do Slug `active`.
//
// - Código: o que vale é sempre o mais recente do telefone (`phone_key` = HMAC do telefone). A
//   tentativa é UM UPDATE condicional: conta a tentativa e, se o hash bate, consome o código na
//   mesma escrita — corrida de tentativas não passa de 5 nem usa o código duas vezes.
// - Sessão: `account_id` NULL = telefone verificado aguardando nome + CPF (sessão curta). A conta
//   nasce num batch com a promoção da sessão; telefone ou CPF já usados = `conflict` (UNIQUE), sem
//   revelar nada da outra conta.
// - Vínculo (decisão 65): Pedidos Guest com o telefone verificado NA MESMA Loja ganham a conta ao
//   listar os Pedidos daquela Loja (sem recriar o Pedido). Nada aqui atravessa Lojas, exceto o
//   endereço do último Delivery da própria conta (decisão 68) e a troca de telefone do Ops, que
//   liga à conta os Pedidos Guest do número antigo antes de trocá-lo (histórico preservado).
// Dados pessoais: nada aqui registra log.
import { assertIssued, type OpsContext } from "./context";
import { newId } from "./conventions";
import { FoodeDbError, isUniqueViolation } from "./errors";
import { LOGIN_CODE_MAX_ATTEMPTS } from "./schema";
import type { OrderAddressData, OrderFulfillment, OrderStatus } from "./store-operation-db";
import { toOrderAddress } from "./store-operation-db";

const SLUG_PATTERN = /^(?=.{3,63}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ACTIVE_STORE_BY_SLUG = `(SELECT id FROM stores WHERE slug = ? AND status = 'active')`;

export type CustomerAccount = { id: string; name: string; phoneE164: string; cpf: string };

export type CustomerSession = {
  phoneE164: string;
  expiresAt: string;
  account: CustomerAccount | null;
};

export type LoginCodeState = {
  id: string;
  attempts: number;
  expiresAt: string;
  consumedAt: string | null;
};

export type LoginCodeAttempt =
  | { kind: "accepted" }
  | { kind: "wrong"; attemptsLeft: number }
  | { kind: "expired" }
  | { kind: "exhausted" }
  /** Já usado (ou nenhum código): pedir outro. */
  | { kind: "missing" };

export type CustomerOrderRow = {
  id: string;
  code: number;
  status: OrderStatus;
  fulfillment: OrderFulfillment;
  createdAt: string;
  totalCents: number;
};

export type OpsCustomerRow = {
  accountId: string;
  name: string;
  phoneE164: string;
  cpf: string;
  createdAt: string;
};

export const CUSTOMER_AUDIT_ACTIONS = ["customer.phone_changed"] as const;

type AccountJoinRow = {
  phoneE164: string;
  expiresAt: string;
  accountId: string | null;
  name: string | null;
  accountPhone: string | null;
  cpf: string | null;
};

export function createCustomerOps(d1: D1Database) {
  async function latestLoginCode(phoneKey: string): Promise<LoginCodeState | null> {
    const row = await d1
      .prepare(
        `SELECT id, attempts, expires_at AS expiresAt, consumed_at AS consumedAt
         FROM customer_login_codes WHERE phone_key = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .bind(phoneKey)
      .first<LoginCodeState>();
    return row ?? null;
  }

  return {
    /**
     * Grava um código novo para o telefone, se o último foi criado há pelo menos `resendSeconds`
     * (a condição está no próprio INSERT). Senão, devolve quanto falta para o reenvio.
     */
    async issueLoginCode(input: {
      codeId: string;
      phoneKey: string;
      codeHash: string;
      now: string;
      expiresAt: string;
      resendSeconds: number;
    }): Promise<{ issued: true } | { issued: false; retryAfterSeconds: number }> {
      const nowMs = Date.parse(input.now);
      const boundary = new Date(nowMs - input.resendSeconds * 1000).toISOString();
      const result = await d1
        .prepare(
          `INSERT INTO customer_login_codes (id, phone_key, code_hash, attempts, created_at, expires_at)
           SELECT ?, ?, ?, 0, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM customer_login_codes WHERE phone_key = ? AND created_at > ?)`,
        )
        .bind(
          input.codeId,
          input.phoneKey,
          input.codeHash,
          input.now,
          input.expiresAt,
          input.phoneKey,
          boundary,
        )
        .run();
      if ((result.meta.changes ?? 0) > 0) return { issued: true };
      const last = await d1
        .prepare(
          `SELECT MAX(created_at) AS createdAt FROM customer_login_codes WHERE phone_key = ?`,
        )
        .bind(input.phoneKey)
        .first<{ createdAt: string | null }>();
      const lastMs = last?.createdAt ? Date.parse(last.createdAt) : nowMs;
      const wait = Math.ceil((lastMs + input.resendSeconds * 1000 - nowMs) / 1000);
      return { issued: false, retryAfterSeconds: Math.max(1, wait) };
    },

    /** Envio pelo WhatsApp falhou: o código some (não bloqueia o reenvio por 30 s). */
    async discardLoginCode(codeId: string): Promise<void> {
      await d1.prepare(`DELETE FROM customer_login_codes WHERE id = ?`).bind(codeId).run();
    },

    /** Código vigente do telefone (o mais recente), para a api derivar o hash da tentativa. */
    latestLoginCode,

    /**
     * Uma tentativa: conta +1 e consome se `candidateHash` bate, num UPDATE condicional (não
     * usado, não vencido, menos de 5 tentativas). Sem linha atualizada, diz o motivo.
     */
    async attemptLoginCode(input: {
      codeId: string;
      candidateHash: string;
      now: string;
    }): Promise<LoginCodeAttempt> {
      const row = await d1
        .prepare(
          `UPDATE customer_login_codes SET attempts = attempts + 1,
             consumed_at = CASE WHEN code_hash = ? THEN ? ELSE NULL END
           WHERE id = ? AND consumed_at IS NULL AND attempts < ? AND expires_at > ?
           RETURNING attempts, consumed_at AS consumedAt`,
        )
        .bind(input.candidateHash, input.now, input.codeId, LOGIN_CODE_MAX_ATTEMPTS, input.now)
        .first<{ attempts: number; consumedAt: string | null }>();
      if (row) {
        if (row.consumedAt) return { kind: "accepted" };
        return { kind: "wrong", attemptsLeft: Math.max(0, LOGIN_CODE_MAX_ATTEMPTS - row.attempts) };
      }
      const state = await d1
        .prepare(
          `SELECT attempts, expires_at AS expiresAt, consumed_at AS consumedAt
           FROM customer_login_codes WHERE id = ?`,
        )
        .bind(input.codeId)
        .first<Omit<LoginCodeState, "id">>();
      if (!state || state.consumedAt) return { kind: "missing" };
      if (state.attempts >= LOGIN_CODE_MAX_ATTEMPTS) return { kind: "exhausted" };
      return { kind: "expired" };
    },

    /**
     * Abre a sessão depois do código certo: com a conta do telefone (se existir) ou pendente de
     * cadastro. Devolve se já há conta.
     */
    async openSession(input: {
      tokenHash: string;
      phoneE164: string;
      now: string;
      accountExpiresAt: string;
      signupExpiresAt: string;
    }): Promise<{ hasAccount: boolean }> {
      const row = await d1
        .prepare(
          `INSERT INTO customer_sessions (id, token_hash, account_id, phone_e164, created_at, expires_at)
           SELECT ?, ?, a.id, ?, ?, CASE WHEN a.id IS NULL THEN ? ELSE ? END
           FROM (SELECT 1) LEFT JOIN customer_accounts a ON a.phone_e164 = ?
           RETURNING account_id AS accountId`,
        )
        .bind(
          newId(),
          input.tokenHash,
          input.phoneE164,
          input.now,
          input.signupExpiresAt,
          input.accountExpiresAt,
          input.phoneE164,
        )
        .first<{ accountId: string | null }>();
      return { hasAccount: Boolean(row?.accountId) };
    },

    /** Sessão válida pelo hash do token (vencida ou inexistente = null). */
    async sessionByTokenHash(tokenHash: string, now: string): Promise<CustomerSession | null> {
      const row = await d1
        .prepare(
          `SELECT s.phone_e164 AS phoneE164, s.expires_at AS expiresAt, a.id AS accountId,
                  a.name AS name, a.phone_e164 AS accountPhone, a.cpf AS cpf
           FROM customer_sessions s LEFT JOIN customer_accounts a ON a.id = s.account_id
           WHERE s.token_hash = ? AND s.expires_at > ?`,
        )
        .bind(tokenHash, now)
        .first<AccountJoinRow>();
      if (!row) return null;
      return {
        phoneE164: row.phoneE164,
        expiresAt: row.expiresAt,
        account:
          row.accountId && row.name && row.accountPhone && row.cpf
            ? { id: row.accountId, name: row.name, phoneE164: row.accountPhone, cpf: row.cpf }
            : null,
      };
    },

    async deleteSession(tokenHash: string): Promise<void> {
      await d1.prepare(`DELETE FROM customer_sessions WHERE token_hash = ?`).bind(tokenHash).run();
    },

    /**
     * Cadastro do 1º acesso: cria a conta com o telefone verificado da sessão pendente e promove a
     * sessão, no mesmo batch. Telefone/CPF já usados = `conflict` (sem dizer qual nem de quem).
     */
    async createAccount(input: {
      tokenHash: string;
      name: string;
      cpf: string;
      now: string;
      expiresAt: string;
    }): Promise<"created" | "conflict" | "unauthenticated"> {
      const accountId = newId();
      try {
        const [insert] = await d1.batch([
          d1
            .prepare(
              `INSERT INTO customer_accounts (id, phone_e164, cpf, name, created_at, updated_at)
               SELECT ?, s.phone_e164, ?, ?, ?, ? FROM customer_sessions s
               WHERE s.token_hash = ? AND s.account_id IS NULL AND s.expires_at > ?
               ON CONFLICT DO NOTHING`,
            )
            .bind(
              accountId,
              input.cpf,
              input.name,
              input.now,
              input.now,
              input.tokenHash,
              input.now,
            ),
          d1
            .prepare(
              `UPDATE customer_sessions SET account_id = ?, expires_at = ?
               WHERE token_hash = ? AND account_id IS NULL
                 AND EXISTS (SELECT 1 FROM customer_accounts WHERE id = ?)`,
            )
            .bind(accountId, input.expiresAt, input.tokenHash, accountId),
        ]);
        if ((insert?.meta.changes ?? 0) > 0) return "created";
      } catch (error) {
        if (isUniqueViolation(error)) return "conflict";
        throw error;
      }
      const pending = await d1
        .prepare(
          `SELECT 1 AS ok FROM customer_sessions
           WHERE token_hash = ? AND account_id IS NULL AND expires_at > ?`,
        )
        .bind(input.tokenHash, input.now)
        .first<{ ok: number }>();
      return pending ? "conflict" : "unauthenticated";
    },

    /** O telefone tem conta Foode? (decisão 68: o checkout oferece "Entrar com WhatsApp"). */
    async phoneHasAccount(phoneE164: string): Promise<boolean> {
      const row = await d1
        .prepare(`SELECT 1 AS ok FROM customer_accounts WHERE phone_e164 = ?`)
        .bind(phoneE164)
        .first<{ ok: number }>();
      return Boolean(row);
    },

    /** Endereço do último Delivery da conta (decisão 68); só o endereço, sem Loja nem itens. */
    async lastDeliveryAddress(accountId: string): Promise<OrderAddressData | null> {
      const row = await d1
        .prepare(
          `SELECT delivery_postal_code AS postalCode, delivery_street AS street,
                  delivery_number AS number, delivery_complement AS complement,
                  delivery_reference AS reference, delivery_neighborhood AS neighborhood
           FROM orders WHERE customer_account_id = ? AND fulfillment = 'delivery'
           ORDER BY created_at DESC LIMIT 1`,
        )
        .bind(accountId)
        .first<{
          postalCode: string | null;
          street: string | null;
          number: string | null;
          complement: string | null;
          reference: string | null;
          neighborhood: string | null;
        }>();
      return row ? toOrderAddress(row) : null;
    },

    /**
     * Pedidos da conta NA Loja `active` do Slug. Antes de ler, vincula à conta os Pedidos Guest
     * com o telefone verificado nessa mesma Loja (mesma escrita da leitura). null = Loja
     * inexistente/não ativa.
     */
    async ordersInStore(input: {
      slug: string;
      accountId: string;
      phoneE164: string;
      limit: number;
    }): Promise<CustomerOrderRow[] | null> {
      if (!SLUG_PATTERN.test(input.slug)) return null;
      const [store, , list] = await d1.batch([
        d1.prepare(ACTIVE_STORE_BY_SLUG.slice(1, -1)).bind(input.slug),
        d1
          .prepare(
            `UPDATE orders SET customer_account_id = ?
             WHERE store_id = ${ACTIVE_STORE_BY_SLUG} AND customer_phone_e164 = ?
               AND customer_account_id IS NULL`,
          )
          .bind(input.accountId, input.slug, input.phoneE164),
        d1
          .prepare(
            `SELECT id, code, status, fulfillment, created_at AS createdAt, total_cents AS totalCents
             FROM orders WHERE store_id = ${ACTIVE_STORE_BY_SLUG} AND customer_account_id = ?
             ORDER BY created_at DESC, code DESC LIMIT ?`,
          )
          .bind(input.slug, input.accountId, Math.min(Math.max(input.limit, 1), 200)),
      ]);
      if (!(store?.results as unknown[] | undefined)?.length) return null;
      return (list?.results as CustomerOrderRow[] | undefined) ?? [];
    },
  };
}

/** Ops (`foode_ops`): busca por telefone ou CPF e troca de telefone auditada (decisão 65). */
export function createOpsCustomerOps(d1: D1Database, context: OpsContext) {
  assertIssued(context);
  const select = `SELECT id AS accountId, name, phone_e164 AS phoneE164, cpf, created_at AS createdAt
                  FROM customer_accounts`;

  return {
    async findCustomer(by: { phone: string } | { cpf: string }): Promise<OpsCustomerRow | null> {
      const row =
        "phone" in by
          ? await d1
              .prepare(`${select} WHERE phone_e164 = ?`)
              .bind(by.phone)
              .first<OpsCustomerRow>()
          : await d1.prepare(`${select} WHERE cpf = ?`).bind(by.cpf).first<OpsCustomerRow>();
      return row ?? null;
    },

    /**
     * Troca o telefone da conta: audita antes/depois (quem, quando), liga à conta os Pedidos Guest
     * do número antigo (o histórico continua na conta), troca e derruba as sessões, num batch.
     * Conta inexistente = `not_found`; número de outra conta ou igual ao atual = `conflict`.
     */
    async changeCustomerPhone(input: { accountId: string; phoneE164: string; now: string }) {
      const current = await d1
        .prepare(`SELECT phone_e164 AS phoneE164 FROM customer_accounts WHERE id = ?`)
        .bind(input.accountId)
        .first<{ phoneE164: string }>();
      if (!current) throw new FoodeDbError("not_found");
      if (current.phoneE164 === input.phoneE164) throw new FoodeDbError("conflict");
      try {
        const [, , update] = await d1.batch([
          d1
            .prepare(
              `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
               SELECT ?, ?, ?, NULL, 'customer.phone_changed', 'customer_account', id,
                 json_object('before', phone_e164, 'after', ?)
               FROM customer_accounts WHERE id = ? AND phone_e164 = ?`,
            )
            .bind(
              newId(),
              input.now,
              context.userId,
              input.phoneE164,
              input.accountId,
              current.phoneE164,
            ),
          d1
            .prepare(
              `UPDATE orders SET customer_account_id = ?
               WHERE customer_phone_e164 = ? AND customer_account_id IS NULL`,
            )
            .bind(input.accountId, current.phoneE164),
          d1
            .prepare(
              `UPDATE customer_accounts SET phone_e164 = ?, updated_at = ?
               WHERE id = ? AND phone_e164 = ?`,
            )
            .bind(input.phoneE164, input.now, input.accountId, current.phoneE164),
          d1.prepare(`DELETE FROM customer_sessions WHERE account_id = ?`).bind(input.accountId),
        ]);
        if ((update?.meta.changes ?? 0) === 0) throw new FoodeDbError("conflict");
      } catch (error) {
        if (isUniqueViolation(error)) throw new FoodeDbError("conflict");
        throw error;
      }
    },
  };
}

export type CustomerOps = ReturnType<typeof createCustomerOps>;
