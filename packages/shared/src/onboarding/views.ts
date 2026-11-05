// Leituras do Ticket 28 no Painel (Dono da Loja ativa). A api monta a partir do D1; o admin só lê.
import type { PixKeyType, StoreAddress } from "../ops/documents.js";
import type { OwnerChecklist } from "./checklist.js";

/** `onboardingGet`: checklist, se o perfil já foi respondido e o link da Loja. */
export type OwnerOnboardingState = {
  checklist: OwnerChecklist;
  /** Perguntas de perfil já respondidas (não reaparecem). */
  profileAnswered: boolean;
  slug: string;
  /** `storePublicUrl(slug)`: copiar e gerar o QR Code no cliente. */
  storeUrl: string;
};

/** Dados que o Ops cadastrou: só leitura para o Dono ("Para alterar, fale com a equipe Foode"). */
export type OwnerReadOnlyRegistration = {
  cnpj: string;
  payoutPixKeyType: PixKeyType;
  payoutPixKey: string;
  payoutHolderName: string;
};

/** `storeSettingsGet`: tudo que as telas de Dados da Loja e Divulgação editam. */
export type OwnerStoreSettings = {
  name: string;
  slug: string;
  storeUrl: string;
  whatsapp: string | null;
  instagram: string | null;
  address: StoreAddress | null;
  /** null = Loja sem cadastro do Ops (anterior ao Ticket 29). */
  registration: OwnerReadOnlyRegistration | null;
  description: string | null;
  logoObjectKey: string | null;
  logoUrl: string | null;
  coverObjectKey: string | null;
  coverUrl: string | null;
  metaPixelId: string | null;
  googleTagId: string | null;
};
