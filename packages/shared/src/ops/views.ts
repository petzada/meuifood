// Tipos de leitura da área Ops (listas e detalhe). A api monta a partir do D1; o admin só lê.
// Datas em ISO-8601 UTC; dinheiro em centavos; percentuais em basis points.
import type { StoreStatus } from "../auth/schemas.js";
import type { OwnerProfileView } from "../onboarding/profile.js";
import type { PixKeyType, StoreAddress } from "./documents.js";
import type { FeePaymentMethod, PaymentProvider, ProviderOperation } from "./fees.js";
import type { BillingCycle, PlanTier } from "./plans.js";
import type { CardMode } from "./stores.js";

/** Itens do checklist de onboarding que o Ops acompanha na lista de Lojas. */
export const ONBOARDING_CHECKS = [
  "profile",
  "payout",
  "owner_invited",
  "owner_accepted",
  "plan",
  "card_mode",
  "pix_fee",
  "credit_fee",
] as const;
export type OnboardingCheck = (typeof ONBOARDING_CHECKS)[number];

export type OnboardingChecklist = { check: OnboardingCheck; done: boolean }[];

/**
 * O que precisa estar feito para ativar a Loja: cadastro (perfil + repasse), Dono convidado e
 * Plano vigente. Modo do cartão e taxas não bloqueiam: meio sem taxa vigente só fica fora do
 * checkout (decisão 61). A api confere de novo no banco, no mesmo batch da ativação.
 */
export const ACTIVATION_REQUIRED_CHECKS = [
  "profile",
  "payout",
  "owner_invited",
  "plan",
] as const satisfies readonly OnboardingCheck[];

export type StorePlanView = {
  id: string;
  cycle: BillingCycle;
  validFrom: string;
  validTo: string | null;
};

/** Faixa do mês corrente: contagem de Pedidos e a faixa em que caiu (mensal) ou null (anual). */
export type StoreMonthTierView = {
  /** Mês civil `YYYY-MM` (America/Sao_Paulo). */
  month: string;
  orderCount: number;
  tier: PlanTier | null;
};

/** Linha da lista `/ops`: estado, Plano, faixa do mês e checklist. */
export type OpsStoreListItem = {
  id: string;
  slug: string;
  name: string;
  status: StoreStatus;
  cnpj: string | null;
  cardMode: CardMode | null;
  plan: StorePlanView | null;
  monthTier: StoreMonthTierView | null;
  onboarding: OnboardingChecklist;
  createdAt: string;
};

export type PayoutAccountView = {
  pixKeyType: PixKeyType;
  pixKey: string;
  holderName: string;
  holderDocument: string;
};

export type StoreOwnerView = {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  /** Já definiu senha (aceitou o convite). */
  accepted: boolean;
};

/** Detalhe da Loja no `/ops`. Perfil null = Loja anterior ao Ticket 29 sem cadastro completo. */
export type OpsStoreDetail = OpsStoreListItem & {
  whatsapp: string | null;
  address: StoreAddress | null;
  payout: PayoutAccountView | null;
  owners: StoreOwnerView[];
  planHistory: StorePlanView[];
  /** Respostas de perfil do Dono (Ticket 28, P-ONB-4; uso interno da Foode). null = não respondidas. */
  ownerProfile: OwnerProfileView | null;
  updatedAt: string;
};

export type PlanTierTableView = {
  validFrom: string;
  validTo: string | null;
  monthlyTiers: (PlanTier & { id: string })[];
  annual: { id: string; priceCents: number } | null;
};

export type PaymentFeeView = {
  id: string;
  /** null = tabela padrão. */
  storeId: string | null;
  method: FeePaymentMethod;
  cardMode: CardMode | null;
  percentBps: number;
  fixedCents: number;
  validFrom: string;
  validTo: string | null;
  createdAt: string;
  createdByUserId: string | null;
};

/** Taxa vigente que o checkout usa: override da Loja vence o padrão. */
export type EffectivePaymentFee = {
  feeId: string;
  source: "store" | "default";
  method: FeePaymentMethod;
  cardMode: CardMode | null;
  percentBps: number;
  fixedCents: number;
};

export type ProviderCostView = {
  id: string;
  provider: PaymentProvider;
  operation: ProviderOperation;
  percentBps: number;
  fixedCents: number;
  validFrom: string;
  validTo: string | null;
  createdAt: string;
  createdByUserId: string | null;
};

/** Ações de auditoria do Ticket 29 (`audit_events.action`); metadata traz `before`/`after`. */
export const OPS_AUDIT_ACTIONS = [
  "store.created",
  "store.updated",
  "store.status_changed",
  "store.card_mode_set",
  "store.plan_set",
  "plan_tiers.published",
  "payment_fee.created",
  "payment_fee.ended",
  "provider_cost.created",
  "provider_cost.ended",
] as const;
export type OpsAuditAction = (typeof OPS_AUDIT_ACTIONS)[number];

export type OpsAuditEntry = {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
};
