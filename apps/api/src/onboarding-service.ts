// RPCs do Painel do Ticket 28 (Onboarding do Dono, Slug, contato, Pixel, vitrine e leitura do
// funil). Cada método valida a entrada com @foode/shared/onboarding e autoriza pela política única
// (`store.settings`, só Dono) na Loja ATIVA, com StoreContext emitido por @foode/db; Operador e Ops
// recebem `forbidden` sem efeito. As escritas ficam em `db.store(context).onboarding()` (com
// auditoria). Logo/capa: bytes pela RPC, gravados no R2 pelo binding `MEDIA` (como o Cardápio).
// QR Code: gerado no cliente a partir de `storeUrl` (LNK-01); a api não gera imagem.
// Ordem: validar entrada → sessão → autorizar (política única) → operar.
import { type FoodeDb, FoodeDbError, type StoreContext } from "@foode/db";
import type { PainelCaller } from "@foode/shared";
import type { RpcResult } from "@foode/shared/auth";
import {
  buildFunnelReport,
  buildOwnerChecklist,
  type FunnelReport,
  funnelReportInputSchema,
  type OwnerOnboardingState,
  type OwnerPlanView,
  ownerProfileInputSchema,
  type OwnerStoreSettings,
  type SlugAvailability,
  tierForOrders,
  slugFormatIssue,
  storeContactInputSchema,
  storePixelsInputSchema,
  storePublicUrl,
  storeShowcaseInputSchema,
  storeSlugInputSchema,
  type StoreUploadedBrandImage,
  storeUploadBrandImageInputSchema,
} from "@foode/shared/onboarding";
import type { StoreAddress } from "@foode/shared/ops";

import type { FoodeAuth } from "./auth/auth";
import { authorizeSession, resolveSessionCtx, rolesWith } from "./auth/guard";
import { brandImageExists, deleteBrandImage, menuImageUrl, putBrandImage } from "./media";
import { callerHeaders } from "./painel-service";

export type OnboardingServiceDeps = {
  db: FoodeDb;
  auth: FoodeAuth;
  /** Binding R2 `MEDIA` (bucket `foode-media`). */
  media: R2Bucket;
  /** Base pública de leitura (`.../media`); null = sem URL de prévia. */
  mediaBaseUrl: string | null;
};

/** Uploads de logo/capa por usuário: 30 por hora. */
export const BRAND_UPLOAD_RATE_LIMIT = { windowSeconds: 3600, max: 30 } as const;
/** Verificações de Slug por usuário (enquanto digita, com debounce no cliente). */
export const SLUG_CHECK_RATE_LIMIT = { windowSeconds: 300, max: 120 } as const;

/** O que a api usa de um schema Zod (a api não depende de `zod` diretamente). */
type InputSchema<O> = {
  safeParse(input: unknown): { success: true; data: O } | { success: false };
};

const noInput: InputSchema<undefined> = {
  safeParse: (input) =>
    input === undefined ? { success: true, data: undefined } : { success: false },
};

/** Entrada crua (o Slug é classificado pela própria RPC: formato/reservado não é erro). */
const rawSlugInput: InputSchema<{ slug: string }> = {
  safeParse: (input) =>
    input &&
    typeof input === "object" &&
    typeof (input as { slug?: unknown }).slug === "string" &&
    (input as { slug: string }).slug.length <= 200
      ? { success: true, data: { slug: (input as { slug: string }).slug } }
      : { success: false },
};

const DB_ERRORS: Record<
  FoodeDbError["code"],
  "forbidden" | "conflict" | "invalid_input" | "not_found"
> = {
  forbidden: "forbidden",
  slug_unavailable: "conflict",
  invalid_input: "invalid_input",
  not_found: "not_found",
  conflict: "conflict",
};

export function createOnboardingService(deps: OnboardingServiceDeps) {
  const { db, auth, media, mediaBaseUrl } = deps;

  /** Valida, resolve a sessão e exige StoreContext com `store.settings` (só Dono). */
  async function asOwner<O, T>(
    caller: PainelCaller,
    schema: InputSchema<O>,
    input: unknown,
    operation: (context: StoreContext, input: O) => Promise<RpcResult<T>>,
  ): Promise<RpcResult<T>> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const session = await resolveSessionCtx(auth, db, callerHeaders(caller));
    if (!session) return { ok: false, error: "unauthenticated" };
    const result = await authorizeSession(db, session, rolesWith("store.settings"));
    if (!result.ok) return { ok: false, error: result.error };
    if (result.authorized.kind !== "store") return { ok: false, error: "forbidden" };
    try {
      return await operation(result.authorized.store, parsed.data);
    } catch (error) {
      if (error instanceof FoodeDbError) return { ok: false, error: DB_ERRORS[error.code] };
      throw error;
    }
  }

  const onboardingOf = (context: StoreContext) => db.store(context).onboarding();
  const ok = <T>(data: T): RpcResult<T> => ({ ok: true, data });

  async function stateOf(context: StoreContext): Promise<OwnerOnboardingState> {
    const ops = onboardingOf(context);
    const [facts, profile, store] = await Promise.all([
      ops.checklistFacts(),
      ops.ownerProfile(),
      db.store(context).get(),
    ]);
    return {
      checklist: buildOwnerChecklist(facts),
      profileAnswered: profile !== null,
      slug: store.slug,
      storeUrl: storePublicUrl(store.slug),
    };
  }

  return {
    /** Checklist (ONB-01/02/04), perfil respondido e link da Loja ativa. */
    onboardingGet: (caller: PainelCaller) =>
      asOwner(caller, noInput, undefined, async (context) => ok(await stateOf(context))),

    /** Perfil do 1º acesso (P-ONB-4): uma vez; de novo = `conflict`. */
    onboardingAnswerProfile: (caller: PainelCaller, input: unknown) =>
      asOwner(caller, ownerProfileInputSchema, input, async (context, data) => {
        await onboardingOf(context).answerProfile({
          cuisine: data.cuisine.value,
          cuisineOther: data.cuisine.other,
          goal: data.goal.value,
          goalOther: data.goal.other,
        });
        return ok(null);
      }),

    /**
     * Plano vigente, faixa do mês e Pedidos não cancelados do mês civil de São Paulo (decisão 72:
     * banner da sidebar e `/plano`). Só leitura, só Dono.
     */
    storePlanGet: (caller: PainelCaller) =>
      asOwner(caller, noInput, undefined, async (context): Promise<RpcResult<OwnerPlanView>> => {
        const row = await onboardingOf(context).planSummary();
        const tier =
          row.plan?.cycle === "annual"
            ? (row.tiers[0] ?? null)
            : row.plan
              ? tierForOrders(row.tiers, row.orderCount)
              : null;
        return ok({ month: row.month, orderCount: row.orderCount, plan: row.plan, tier });
      }),

    /** "Sua Loja está pronta" visto: só com o checklist completo (senão `conflict`). */
    onboardingAcknowledgeReady: (caller: PainelCaller) =>
      asOwner(caller, noInput, undefined, async (context): Promise<RpcResult<null>> => {
        const ops = onboardingOf(context);
        if (!buildOwnerChecklist(await ops.checklistFacts()).complete) {
          return { ok: false, error: "conflict" };
        }
        await ops.acknowledgeReady();
        return ok(null);
      }),

    /** Dados da Loja, vitrine e Pixel (CFG-04: cadastro do Ops só leitura). */
    storeSettingsGet: (caller: PainelCaller) =>
      asOwner(caller, noInput, undefined, async (context) => {
        const row = await onboardingOf(context).settings();
        const settings: OwnerStoreSettings = {
          ...row,
          // O D1 guarda a UF como TEXT (CHECK de tamanho); só o Zod da entrada a restringe ao enum.
          address: row.address as StoreAddress | null,
          storeUrl: storePublicUrl(row.slug),
          logoUrl: menuImageUrl(mediaBaseUrl, row.logoObjectKey),
          coverUrl: menuImageUrl(mediaBaseUrl, row.coverObjectKey),
        };
        return ok(settings);
      }),

    /**
     * Disponibilidade do Slug enquanto o Dono digita: formato/reservado/de outra Loja/o atual.
     * Não reserva nada; rate limit por usuário (`rate_limited`).
     */
    storeCheckSlug: (caller: PainelCaller, input: unknown) =>
      asOwner(
        caller,
        rawSlugInput,
        input,
        async (context, { slug: raw }): Promise<RpcResult<SlugAvailability>> => {
          const allowed = await db.rateLimit.consume(
            `slug_check:${context.userId}`,
            SLUG_CHECK_RATE_LIMIT,
          );
          if (!allowed) return { ok: false, error: "rate_limited" };
          const { slug, issue } = slugFormatIssue(raw);
          if (issue) return ok({ slug, available: false, reason: issue });
          const status = await onboardingOf(context).slugStatus(slug);
          if (status !== "free") return ok({ slug, available: false, reason: status });
          return ok({ slug, available: true, url: storePublicUrl(slug) });
        },
      ),

    /**
     * Troca ou confirma o Slug (LNK-02). Formato/reservado = `invalid_input`; de outra Loja =
     * `conflict`. Devolve o link novo.
     */
    storeSetSlug: (caller: PainelCaller, input: unknown) =>
      asOwner(caller, storeSlugInputSchema, input, async (context, { slug }) => {
        await onboardingOf(context).setSlug(slug);
        return ok({ slug, storeUrl: storePublicUrl(slug) });
      }),

    /** WhatsApp, Instagram e endereço. Sem cadastro do Ops (WhatsApp/endereço) = `conflict`. */
    storeSetContact: (caller: PainelCaller, input: unknown) =>
      asOwner(caller, storeContactInputSchema, input, async (context, data) => {
        await onboardingOf(context).setContact(data);
        return ok(null);
      }),

    /** IDs do Pixel Meta e Google (opcionais; vazio apaga). */
    storeSetPixels: (caller: PainelCaller, input: unknown) =>
      asOwner(caller, storePixelsInputSchema, input, async (context, data) => {
        await onboardingOf(context).setPixels(data);
        return ok(null);
      }),

    /**
     * Descrição ≤ 160, logo e capa. Chave de imagem de outra Loja, fora do padrão ou ausente no
     * R2 = `invalid_input`; a imagem substituída/removida é apagada do R2 depois de gravar.
     */
    storeSetShowcase: (caller: PainelCaller, input: unknown) =>
      asOwner(
        caller,
        storeShowcaseInputSchema,
        input,
        async (context, data): Promise<RpcResult<null>> => {
          for (const key of [data.logoObjectKey, data.coverObjectKey]) {
            if (key && !(await brandImageExists(media, context.storeId, key))) {
              return { ok: false, error: "invalid_input" };
            }
          }
          const discarded = await onboardingOf(context).setShowcase(data);
          await Promise.all(discarded.map((key) => deleteBrandImage(media, context.storeId, key)));
          return ok(null);
        },
      ),

    /** Upload do logo ou da capa pelos bytes (JPEG/PNG/WebP ≤ 5 MiB, assinatura conferida). */
    storeUploadBrandImage: (caller: PainelCaller, input: unknown) =>
      asOwner(
        caller,
        storeUploadBrandImageInputSchema,
        input,
        async (context, data): Promise<RpcResult<StoreUploadedBrandImage>> => {
          const allowed = await db.rateLimit.consume(
            `brand_image_upload:${context.userId}`,
            BRAND_UPLOAD_RATE_LIMIT,
          );
          if (!allowed) return { ok: false, error: "rate_limited" };
          const objectKey = await putBrandImage(
            media,
            context.storeId,
            data.contentType,
            data.bytes,
          );
          await onboardingOf(context).recordBrandImageUpload(data.kind, objectKey);
          return ok({
            kind: data.kind,
            objectKey,
            imageUrl: menuImageUrl(mediaBaseUrl, objectKey),
          });
        },
      ),

    /** Funil agregado da Loja ativa no período (fonte do relatório do Ticket 14). */
    funnelReport: (caller: PainelCaller, input: unknown) =>
      asOwner(
        caller,
        funnelReportInputSchema,
        input,
        async (context, { from, to }): Promise<RpcResult<FunnelReport>> =>
          ok(buildFunnelReport(from, to, await onboardingOf(context).funnelCounters(from, to))),
      ),
  };
}

export type OnboardingService = ReturnType<typeof createOnboardingService>;
