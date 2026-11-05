// Documentos e identificadores do cadastro de Loja (Ticket 29): CPF, CNPJ (numérico e o
// alfanumérico da Receita, válido desde jul/2026), Slug e chave Pix de repasse.
import { z } from "zod";

import { normalizeBrazilianMobilePhone } from "../phone-br.js";

const stripDocument = (value: string) => value.replace(/[\s./-]/g, "").toUpperCase();

/** Dígito verificador mod 11 (CPF/CNPJ): pesos dados, valor do caractere = código ASCII − 48. */
function mod11(chars: string, weights: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) sum += (chars.charCodeAt(i) - 48) * weights[i]!;
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

const CNPJ_W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const CNPJ_W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/** CNPJ com 14 posições: 12 alfanuméricas + 2 dígitos verificadores. Sem máscara. */
export function isValidCnpj(raw: string): boolean {
  const value = stripDocument(raw);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(value)) return false;
  if (/^(\d)\1{13}$/.test(value)) return false;
  const d1 = mod11(value, CNPJ_W1);
  const d2 = mod11(value, CNPJ_W2);
  return value.endsWith(`${d1}${d2}`);
}

export function isValidCpf(raw: string): boolean {
  const value = stripDocument(raw);
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  const d1 = mod11(value, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = mod11(value, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return value.endsWith(`${d1}${d2}`);
}

/** CNPJ normalizado (sem máscara, maiúsculo). */
export const cnpjSchema = z
  .string()
  .transform(stripDocument)
  .refine(isValidCnpj, { message: "CNPJ inválido." });

/** CPF ou CNPJ normalizado (titular do repasse). */
export const cpfOrCnpjSchema = z
  .string()
  .transform(stripDocument)
  .refine((value) => isValidCpf(value) || isValidCnpj(value), {
    message: "CPF ou CNPJ inválido.",
  });

/**
 * Slugs que colidem com rotas, marcas ou áreas da plataforma. A api recusa estes e os já
 * usados (`stores_slug_unique`); o Dono troca o Slug no onboarding com a mesma regra.
 */
export const RESERVED_STORE_SLUGS: readonly string[] = [
  "admin",
  "api",
  "app",
  "ajuda",
  "auth",
  "cardapio",
  "checkout",
  "conta",
  "entrar",
  "foode",
  "foode-delivery",
  "health",
  "loja",
  "lojas",
  "ops",
  "painel",
  "pedido",
  "pedidos",
  "sair",
  "status",
  "suporte",
  "www",
];

/** Mesmo formato do CHECK `stores_slug_format`: 3–63, a-z/0-9/hífen, sem hífen nas pontas. */
export const SLUG_PATTERN = /^(?=.{3,63}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const storeSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SLUG_PATTERN, { message: "Use 3 a 63 letras minúsculas, números ou hífen." })
  .refine((slug) => !RESERVED_STORE_SLUGS.includes(slug), { message: "Slug reservado." });

/** WhatsApp da Loja: celular BR normalizado para E.164 sem "+" (55 + DDD + 9 dígitos). */
export const whatsappSchema = z.string().transform((value, ctx) => {
  const result = normalizeBrazilianMobilePhone(value);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: "WhatsApp inválido (celular com DDD)." });
    return z.NEVER;
  }
  return result.e164;
});

export const PIX_KEY_TYPES = ["cpf", "cnpj", "email", "phone", "random"] as const;
export type PixKeyType = (typeof PIX_KEY_TYPES)[number];
export const pixKeyTypeSchema = z.enum(PIX_KEY_TYPES);

/**
 * Chave Pix de repasse, normalizada por tipo: CPF/CNPJ sem máscara, e-mail minúsculo,
 * telefone `+55DDDNÚMERO` (formato do DICT), aleatória (EVP) como UUID minúsculo.
 */
export const pixKeySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("cpf"),
    value: z.string().transform(stripDocument).refine(isValidCpf, { message: "CPF inválido." }),
  }),
  z.object({ type: z.literal("cnpj"), value: cnpjSchema }),
  z.object({
    type: z.literal("email"),
    value: z.string().trim().toLowerCase().max(77).pipe(z.email()),
  }),
  z.object({
    type: z.literal("phone"),
    value: z.string().transform((value, ctx) => {
      const result = normalizeBrazilianMobilePhone(value);
      if (!result.ok) {
        ctx.addIssue({ code: "custom", message: "Telefone inválido." });
        return z.NEVER;
      }
      return `+${result.e164}`;
    }),
  }),
  z.object({ type: z.literal("random"), value: z.string().trim().toLowerCase().pipe(z.uuid()) }),
]);

export type PixKey = z.output<typeof pixKeySchema>;

export const BRAZIL_STATES = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const;

const line = (max: number) => z.string().trim().min(1).max(max);

/** Endereço da Loja (cadastro e Retirada). CEP só dígitos. */
export const storeAddressSchema = z.object({
  postalCode: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => /^\d{8}$/.test(value), { message: "CEP inválido." }),
  street: line(160),
  number: line(20),
  complement: z.string().trim().max(80).nullable().default(null),
  district: line(80),
  city: line(80),
  state: z.enum(BRAZIL_STATES),
});

export type StoreAddress = z.output<typeof storeAddressSchema>;
