// Formulários do Ticket 28 (perfil do Dono, Link personalizado, contato, Pixel e vitrine): lê
// o FormData e valida com os Zod de `@foode/shared/onboarding`; a api valida de novo. Erros
// por campo em PT-BR, no padrão de `ops-forms.ts`. "Slug" no código = "Link personalizado"
// na interface (decisão 69).
import {
  ownerProfileInputSchema,
  storeContactInputSchema,
  storePixelsInputSchema,
  storeShowcaseInputSchema,
  storeSlugInputSchema,
  STORE_DESCRIPTION_MAX,
} from "@foode/shared/onboarding";

import { checkMenuImageFile, type ImageCheck } from "./menu-forms";
import { type FormLike, parseWith, text } from "./ops-forms";

export const SLUG_FORMAT_MESSAGE = "Use 3 a 63 letras minúsculas, números ou hífen.";
export const SLUG_RESERVED_MESSAGE = "Este nome é reservado. Escolha outro.";
export const SLUG_TAKEN_MESSAGE = "Este link já é de outra Loja. Escolha outro.";

const ONBOARDING_MESSAGES: Record<string, string> = {
  slug: SLUG_FORMAT_MESSAGE,
  "custom:Slug reservado.": SLUG_RESERVED_MESSAGE,
  whatsapp: "Informe um celular com DDD.",
  instagram: "Use só o usuário do Instagram (letras, números, ponto e sublinhado).",
  "custom:Usuário do Instagram inválido.":
    "Use só o usuário do Instagram (letras, números, ponto e sublinhado).",
  "address.postalCode": "CEP inválido (8 dígitos).",
  "custom:CEP inválido.": "CEP inválido (8 dígitos).",
  "address.street": "Informe a rua.",
  "address.number": "Informe o número.",
  "address.district": "Informe o bairro.",
  "address.city": "Informe a cidade.",
  "address.state": "Escolha o estado.",
  metaPixelId: "Use os 15 ou 16 números do Pixel da Meta.",
  googleTagId: "Use o formato G-XXXXXXX ou AW-XXXXXXX.",
  description: `A descrição tem no máximo ${STORE_DESCRIPTION_MAX} caracteres.`,
  "cuisine.value": "Escolha o tipo de cozinha.",
  "cuisine.other": "Conte qual é o tipo de cozinha.",
  "goal.value": "Escolha o objetivo.",
  "goal.other": "Conte qual é o objetivo.",
  "custom:Conte qual é.": "Conte qual é.",
};

function optionalText(form: FormLike, name: string): string | null {
  const value = text(form, name).trim();
  return value ? value : null;
}

export function parseAnswerProfile(form: FormLike) {
  return parseWith(
    ownerProfileInputSchema,
    {
      cuisine: { value: text(form, "cuisine"), other: optionalText(form, "cuisineOther") },
      goal: { value: text(form, "goal"), other: optionalText(form, "goalOther") },
    },
    ONBOARDING_MESSAGES,
  );
}

export function parseSetSlug(form: FormLike) {
  return parseWith(
    storeSlugInputSchema,
    { slug: text(form, "slug").trim().toLowerCase() },
    ONBOARDING_MESSAGES,
  );
}

/** Contato: WhatsApp e Instagram (vazio apaga). */
export function parseSetContact(form: FormLike) {
  return parseWith(
    storeContactInputSchema,
    { whatsapp: text(form, "whatsapp"), instagram: optionalText(form, "instagram") },
    ONBOARDING_MESSAGES,
  );
}

/** Endereço da Loja (CEP obrigatório como no cadastro do Ops; o CEP só preenche os campos). */
export function parseSetAddress(form: FormLike) {
  return parseWith(
    storeContactInputSchema,
    {
      address: {
        postalCode: text(form, "address.postalCode"),
        street: text(form, "address.street"),
        number: text(form, "address.number"),
        complement: optionalText(form, "address.complement"),
        district: text(form, "address.district"),
        city: text(form, "address.city"),
        state: text(form, "address.state"),
      },
    },
    ONBOARDING_MESSAGES,
  );
}

export function parseSetPixels(form: FormLike) {
  return parseWith(
    storePixelsInputSchema,
    { metaPixelId: text(form, "metaPixelId"), googleTagId: text(form, "googleTagId") },
    ONBOARDING_MESSAGES,
  );
}

/** Vitrine: descrição e as chaves de logo/capa (campo vazio = remover). */
export function parseSetShowcase(form: FormLike) {
  return parseWith(
    storeShowcaseInputSchema,
    {
      description: text(form, "description"),
      logoObjectKey: optionalText(form, "logoObjectKey"),
      coverObjectKey: optionalText(form, "coverObjectKey"),
    },
    ONBOARDING_MESSAGES,
  );
}

/** Mesma regra das fotos do Cardápio (JPEG/PNG/WebP ≤ 5 MB), conferida antes do envio. */
export function checkBrandImageFile(file: { size: number; type: string }): ImageCheck {
  return checkMenuImageFile(file);
}

/** Resultado do upload de logo/capa para o campo. */
export type BrandUploadResult =
  { ok: true; objectKey: string; imageUrl: string | null } | { ok: false; message: string };

export { STORE_DESCRIPTION_MAX };
