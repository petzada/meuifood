// Rótulos PT-BR da área Ops (Ticket 29), com a grafia do glossário. Puro.
import type { AuthErrorCode, StoreStatus } from "@foode/shared/auth";
import type {
  BillingCycle,
  CardMode,
  FeePaymentMethod,
  OnboardingCheck,
  PaymentProvider,
  PixKeyType,
  ProviderOperation,
} from "@foode/shared/ops";

export const STORE_STATUS_LABEL: Record<StoreStatus, string> = {
  onboarding: "Em configuração",
  active: "Ativa",
  suspended: "Suspensa",
};

/** Símbolo textual do estado (T-03: nunca só cor). */
export const STORE_STATUS_GLYPH: Record<StoreStatus, string> = {
  onboarding: "◔",
  active: "●",
  suspended: "■",
};

export const CARD_MODE_LABEL: Record<CardMode, string> = {
  normal: "Normal (Efí)",
  rapido: "Rápido (AbacatePay)",
};

export const CARD_MODE_HINT: Record<CardMode, string> = {
  normal: "Cartão pela Efí: taxa menor, repasse no prazo padrão da adquirente.",
  rapido: "Cartão pela AbacatePay: taxa maior, dinheiro disponível mais rápido.",
};

export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "Mensal (por faixa de Pedidos)",
  annual: "Anual (Pedidos ilimitados)",
};

export const ONBOARDING_CHECK_LABEL: Record<OnboardingCheck, string> = {
  profile: "Cadastro da Loja",
  payout: "Dados de Repasse",
  owner_invited: "Dono convidado",
  owner_accepted: "Dono aceitou o convite",
  plan: "Plano vigente",
  card_mode: "Modo do cartão",
  pix_fee: "Taxa Foode do PIX",
  credit_fee: "Taxa Foode do Crédito",
};

export const FEE_METHOD_LABEL: Record<FeePaymentMethod, string> = {
  pix: "PIX",
  credit: "Crédito",
};

export const PROVIDER_LABEL: Record<PaymentProvider, string> = {
  abacatepay: "AbacatePay",
  efi: "Efí",
};

export const PROVIDER_OPERATION_LABEL: Record<ProviderOperation, string> = {
  pix_charge: "Receber PIX",
  card_charge: "Cobrar cartão",
  pix_payout: "Enviar Pix de Repasse",
};

export const PIX_KEY_TYPE_LABEL: Record<PixKeyType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  phone: "Celular",
  random: "Chave aleatória",
};

/** Rótulo da chave da taxa Foode (meio + modo). */
export function feeLabel(method: FeePaymentMethod, cardMode: CardMode | null): string {
  if (method === "pix" || cardMode === null) return FEE_METHOD_LABEL[method];
  return `${FEE_METHOD_LABEL.credit} · ${CARD_MODE_LABEL[cardMode]}`;
}

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "store.created": "Loja cadastrada",
  "store.updated": "Cadastro alterado",
  "store.status_changed": "Estado alterado",
  "store.card_mode_set": "Modo do cartão definido",
  "store.plan_set": "Plano definido",
  "plan_tiers.published": "Tabela de faixas publicada",
  "payment_fee.created": "Taxa Foode cadastrada",
  "payment_fee.ended": "Taxa Foode encerrada",
  "provider_cost.created": "Custo de provedor cadastrado",
  "provider_cost.ended": "Custo de provedor encerrado",
  "membership.invited": "Convite enviado",
  "session.active_store_switched": "Loja ativa trocada",
  "coupon.created": "Cupom criado",
  "coupon.updated": "Cupom alterado",
  "coupon.activated": "Cupom ativado",
  "coupon.deactivated": "Cupom desativado",
  "coupon.deleted": "Cupom excluído",
  "coupon.welcome_updated": "Cupom de boas-vindas alterado",
  "customer.phone_changed": "Telefone do Consumidor trocado",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

/** Mensagem genérica por código de erro da RPC; as actions trocam por uma específica quando sabem mais. */
export const RPC_ERROR_MESSAGE: Record<AuthErrorCode, string> = {
  unauthenticated: "Sua sessão expirou. Entre de novo.",
  forbidden: "Você não tem permissão para esta ação.",
  invalid_input: "O servidor recusou algum dado. Revise e tente de novo.",
  captcha_failed: "A verificação de segurança falhou. Tente de novo.",
  rate_limited: "Muitas tentativas em pouco tempo. Aguarde um instante.",
  not_found: "Este registro não existe mais. Recarregue a página.",
  conflict: "Este registro conflita com outro já gravado.",
  not_implemented: "Esta ação ainda não está disponível.",
};
