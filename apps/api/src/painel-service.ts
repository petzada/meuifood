// Regras das RPCs de Auth/membership do Painel (Ticket 22). O PainelApi (painel.ts) só monta
// as dependências por request e delega para cá; os testes com D1 usam este módulo com e-mail e
// Turnstile falsos. Ordem em toda mutação: validar entrada → autorizar (política única) →
// rate limit → Turnstile → gravar (com auditoria, em @foode/db) → e-mail em background.
// Negação (sem sessão, papel errado, outra Loja) não grava nada.
import { type FoodeDb, FoodeDbError, type MembershipInvite } from "@foode/db";
import type { PainelCaller, StoreMemberView } from "@foode/shared";
import {
  type ActiveStore,
  inviteMemberInputSchema,
  opsInviteOwnerInputSchema,
  removeMemberInputSchema,
  type RpcResult,
  type SessionCtx,
  switchActiveStoreInputSchema,
} from "@foode/shared/auth";

import { type FoodeAuth, INVITE_TOKEN_TTL_SECONDS } from "./auth/auth";
import { authorizeSession, resolveSessionCtx, rolesWith, sessionCtxOf } from "./auth/guard";
import type { TurnstileVerifier } from "./auth/turnstile";
import { type EmailSender, sendInBackground } from "./email/sender";
import { inviteEmail, inviteNoticeEmail, loginUrl, setPasswordUrl } from "./email/templates";

/**
 * Convites por usuário autenticado (Dono ou Ops): 10 a cada 5 min. A janela não passa da maior
 * janela do Better Auth (AUTH_RATE_LIMIT_RULES, 300 s): ele apaga da tabela `rate_limits` as
 * linhas mais velhas que isso, e uma janela maior seria zerada antes da hora.
 */
export const INVITE_RATE_LIMIT = { windowSeconds: 300, max: 10 } as const;

export type PainelServiceDeps = {
  db: FoodeDb;
  auth: FoodeAuth;
  email: EmailSender;
  turnstile: TurnstileVerifier;
  waitUntil(promise: Promise<unknown>): void;
  /** URL pública do Painel (BETTER_AUTH_URL), base dos links dos e-mails. */
  panelUrl: string;
};

/** Headers da sessão a partir do que o admin repassa (nunca ids de usuário/Loja). */
export function callerHeaders(caller: PainelCaller | undefined | null): Headers {
  const headers = new Headers();
  if (caller && typeof caller.cookie === "string" && caller.cookie) {
    headers.set("cookie", caller.cookie);
  }
  if (caller && typeof caller.ip === "string" && caller.ip) {
    headers.set("cf-connecting-ip", caller.ip);
  }
  return headers;
}

function fail<T>(error: Extract<RpcResult<T>, { ok: false }>["error"]): RpcResult<T> {
  return { ok: false, error };
}

export function createPainelService(deps: PainelServiceDeps) {
  const { db, auth } = deps;

  async function sessionOf(caller: PainelCaller) {
    return resolveSessionCtx(auth, db, callerHeaders(caller));
  }

  /** Rate limit + Turnstile das mutações de convite; null = pode seguir. */
  async function guardInvite(
    userId: string,
    caller: PainelCaller,
    turnstileToken: string,
  ): Promise<"rate_limited" | "captcha_failed" | null> {
    const allowed = await db.rateLimit.consume(`painel:invite:user:${userId}`, INVITE_RATE_LIMIT);
    if (!allowed) return "rate_limited";
    const human = await deps.turnstile.verify(turnstileToken, caller?.ip ?? null);
    return human ? null : "captcha_failed";
  }

  /**
   * Depois do provisionamento: usuário sem senha recebe o link de "definir senha" (72 h, uso
   * único); com senha, só o aviso. Membership já existente com senha = `conflict`.
   */
  async function notify(invite: MembershipInvite): Promise<RpcResult<{ membershipId: string }>> {
    if (!invite.membershipCreated && invite.hasPassword) return fail("conflict");
    if (invite.hasPassword) {
      sendInBackground(
        deps.email,
        deps.waitUntil,
        "invite_notice",
        inviteNoticeEmail({
          to: invite.email,
          storeName: invite.storeName,
          role: invite.role,
          url: loginUrl(deps.panelUrl),
          idempotencyKey: `invite-notice-${invite.membershipId}`,
        }),
      );
    } else {
      const token = await auth.createSetPasswordToken(invite.userId, INVITE_TOKEN_TTL_SECONDS);
      sendInBackground(
        deps.email,
        deps.waitUntil,
        "invite",
        inviteEmail({
          to: invite.email,
          storeName: invite.storeName,
          role: invite.role,
          url: setPasswordUrl(deps.panelUrl, token, "convite"),
          idempotencyKey: `invite-${invite.membershipId}-${crypto.randomUUID()}`,
        }),
      );
    }
    return { ok: true, data: { membershipId: invite.membershipId } };
  }

  return {
    async session(caller: PainelCaller): Promise<SessionCtx | null> {
      return sessionOf(caller);
    },

    async switchActiveStore(caller: PainelCaller, input: unknown): Promise<RpcResult<ActiveStore>> {
      const parsed = switchActiveStoreInputSchema.safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      const authSession = await auth.getSession(callerHeaders(caller));
      if (!authSession) return fail("unauthenticated");
      const session = await sessionCtxOf(db, authSession);

      const target = session.stores.find((store) => store.id === parsed.data.storeId);
      // A membership é conferida de novo no banco ao emitir o contexto.
      const store = target
        ? await db.access.storeContext({ userId: session.user.id, storeId: target.id })
        : null;
      if (!target || !store) return fail("forbidden");

      await auth.setActiveStore(authSession.sessionId, store.storeId);
      await db.store(store).recordAudit({
        action: "session.active_store_switched",
        targetType: "store",
        targetId: store.storeId,
      });
      return { ok: true, data: target };
    },

    async listMembers(caller: PainelCaller): Promise<RpcResult<StoreMemberView[]>> {
      const session = await sessionOf(caller);
      if (!session) return fail("unauthenticated");
      const result = await authorizeSession(db, session, rolesWith("store.members"));
      if (!result.ok) return fail(result.error);
      if (result.authorized.kind !== "store") return fail("forbidden");
      return { ok: true, data: await db.store(result.authorized.store).members() };
    },

    async inviteMember(
      caller: PainelCaller,
      input: unknown,
    ): Promise<RpcResult<{ membershipId: string }>> {
      const parsed = inviteMemberInputSchema.safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      const session = await sessionOf(caller);
      if (!session) return fail("unauthenticated");
      const result = await authorizeSession(db, session, rolesWith("store.members"));
      if (!result.ok) return fail(result.error);
      if (result.authorized.kind !== "store") return fail("forbidden");

      const blocked = await guardInvite(session.user.id, caller, parsed.data.turnstileToken);
      if (blocked) return fail(blocked);

      try {
        const invite = await db.store(result.authorized.store).inviteMember({
          email: parsed.data.email,
          name: parsed.data.name,
          role: parsed.data.role,
        });
        return await notify(invite);
      } catch (error) {
        if (error instanceof FoodeDbError) {
          return fail(error.code === "invalid_input" ? "invalid_input" : "forbidden");
        }
        throw error;
      }
    },

    async opsInviteOwner(
      caller: PainelCaller,
      input: unknown,
    ): Promise<RpcResult<{ membershipId: string }>> {
      const parsed = opsInviteOwnerInputSchema.safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      const session = await sessionOf(caller);
      if (!session) return fail("unauthenticated");
      const result = await authorizeSession(db, session, rolesWith("ops.area"));
      if (!result.ok) return fail(result.error);
      if (result.authorized.kind !== "ops") return fail("forbidden");

      const blocked = await guardInvite(session.user.id, caller, parsed.data.turnstileToken);
      if (blocked) return fail(blocked);

      try {
        const invite = await db.ops(result.authorized.ops).inviteOwner(parsed.data.storeId, {
          email: parsed.data.email,
          name: parsed.data.name,
        });
        if (!invite) return fail("not_found");
        return await notify(invite);
      } catch (error) {
        if (error instanceof FoodeDbError && error.code === "invalid_input") {
          return fail("invalid_input");
        }
        throw error;
      }
    },

    async removeMember(caller: PainelCaller, input: unknown): Promise<RpcResult<null>> {
      const parsed = removeMemberInputSchema.safeParse(input);
      if (!parsed.success) return fail("invalid_input");
      const session = await sessionOf(caller);
      if (!session) return fail("unauthenticated");
      const result = await authorizeSession(db, session, rolesWith("store.members"));
      if (!result.ok) return fail(result.error);
      if (result.authorized.kind !== "store") return fail("forbidden");

      const store = db.store(result.authorized.store);
      const target = (await store.members()).find(
        (member) => member.membershipId === parsed.data.membershipId,
      );
      // Id de outra Loja é indistinguível de inexistente.
      if (!target) return fail("not_found");
      // O Dono não remove a si mesmo (não deixa a Loja sem quem a administre por engano).
      if (target.userId === session.user.id) return fail("conflict");
      if (!(await store.removeMember(target.membershipId))) return fail("not_found");

      // Sem nenhuma outra Loja (e sem papel de Ops), as sessões do usuário caem já.
      const [remaining, ops] = await Promise.all([
        db.access.storesOfUser(target.userId),
        db.access.opsContext(target.userId),
      ]);
      if (remaining.length === 0 && !ops) {
        await auth.revokeUserSessions(target.userId);
        await db.access.recordAuthEvent(target.userId, "auth.sessions_revoked", {
          actorUserId: session.user.id,
          metadata: { reason: "last_membership_removed" },
        });
      }
      return { ok: true, data: null };
    },
  };
}

export type PainelService = ReturnType<typeof createPainelService>;
