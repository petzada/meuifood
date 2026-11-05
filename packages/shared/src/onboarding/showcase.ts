// Vitrine e divulgação da Loja (Ticket 28): descrição curta, logo, capa, Instagram, Pixel e o
// link público com o Slug. Os limites aqui são os mesmos dos CHECKs da migration 0005.
import { z } from "zod";

import {
  detectMenuImageContentType,
  MENU_IMAGE_CONTENT_TYPES,
  MENU_IMAGE_EXTENSIONS,
  MENU_IMAGE_MAX_BYTES,
  type MenuImageBytes,
  type MenuImageContentType,
} from "../menu/admin.js";
import { storeAddressSchema, storeSlugSchema, whatsappSchema } from "../ops/documents.js";

// ---- Link público e Slug (LNK-01, LNK-02) ------------------------------------------------

/** Origem pública do Storefront (domínio do Ticket 25). */
export const STOREFRONT_PUBLIC_ORIGIN = "https://foodedelivery.com.br";

/**
 * Link da Loja para copiar e para o QR Code. O QR (PNG e SVG) é gerado NO CLIENTE (LNK-01) a
 * partir desta URL: a api não gera imagem nem depende de biblioteca de QR.
 */
export function storePublicUrl(slug: string, origin = STOREFRONT_PUBLIC_ORIGIN): string {
  return `${origin.replace(/\/+$/u, "")}/loja/${slug}`;
}

export const storeSlugInputSchema = z.object({ slug: storeSlugSchema });
export type StoreSlugInput = z.input<typeof storeSlugInputSchema>;

/**
 * Verificação de disponibilidade enquanto o Dono digita (não reserva nada). `taken` inclui link
 * antigo de outra Loja (reservado, decisão 69); link antigo da própria Loja volta como disponível.
 * A gravação confere de novo na mesma escrita: corrida = `conflict`.
 */
export type SlugAvailability =
  | { slug: string; available: true; url: string }
  | { slug: string; available: false; reason: "invalid" | "reserved" | "taken" | "current" };

/** Classifica o Slug digitado sem banco: formato e reservados (mesma regra de `storeSlugSchema`). */
export function slugFormatIssue(raw: string): {
  slug: string;
  issue: "invalid" | "reserved" | null;
} {
  const slug = raw.trim().toLowerCase();
  const parsed = storeSlugSchema.safeParse(slug);
  if (parsed.success) return { slug: parsed.data, issue: null };
  const reserved = parsed.error.issues.some((issue) => issue.code === "custom");
  return { slug, issue: reserved ? "reserved" : "invalid" };
}

// ---- Link antigo → link atual (decisão 69) -----------------------------------------------

/**
 * Toda rota `/storefront/lojas/{link-antigo}/...` da api responde 308 com `Location` =
 * `/storefront/lojas/{atual}/...` (mesmo subcaminho e query), este header e o corpo
 * `storefrontSlugMovedSchema`. O web chama com `redirect: "manual"` e responde 308 para
 * `/loja/{atual}{subcaminho}?{query}` (`movedStorePath`). Um salto só; vale para Loja suspensa.
 */
export const STOREFRONT_CURRENT_SLUG_HEADER = "x-foode-current-slug";

export const storefrontSlugMovedSchema = z.object({
  error: z.literal("slug_moved"),
  currentSlug: z.string().regex(/^(?=.{3,63}$)[a-z0-9]+(?:-[a-z0-9]+)*$/u),
});
export type StorefrontSlugMoved = z.infer<typeof storefrontSlugMovedSchema>;

/**
 * Caminho público com o link atual: troca o 1º segmento depois de `/loja/` e preserva subcaminho
 * e query. Ex.: `/loja/antigo/pedido/abc?utm=x` → `/loja/atual/pedido/abc?utm=x`.
 */
export function movedStorePath(pathWithQuery: string, currentSlug: string): string {
  return pathWithQuery.replace(/^\/loja\/[^/?#]+/u, `/loja/${currentSlug}`);
}

// ---- Contato e endereço (CFG-04, P-CFG-4) ------------------------------------------------

/** Usuário do Instagram sem "@" nem URL: 1–30 de a-z, 0-9, ponto e sublinhado. */
export const INSTAGRAM_PATTERN = /^(?!.*\.\.)(?!\.)(?!.*\.$)[a-z0-9._]{1,30}$/u;

export const instagramSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) =>
    value
      .replace(/^https?:\/\/(www\.)?instagram\.com\//u, "")
      .replace(/^@/u, "")
      .replace(/\/+$/u, ""),
  )
  .pipe(z.string().regex(INSTAGRAM_PATTERN, { message: "Usuário do Instagram inválido." }));

/**
 * Contato da Loja editado pelo Dono: WhatsApp (máscara no cliente, E.164 aqui), Instagram
 * (null apaga) e, opcional, o endereço (mesmo schema do cadastro do Ops). CNPJ, chave Pix e
 * titular ficam só leitura (Ops). Ao menos um campo.
 */
export const storeContactInputSchema = z
  .object({
    whatsapp: whatsappSchema.optional(),
    instagram: instagramSchema.nullable().optional(),
    address: storeAddressSchema.optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "Nada para alterar.",
  });
export type StoreContactInput = z.input<typeof storeContactInputSchema>;
export type StoreContact = z.output<typeof storeContactInputSchema>;

// ---- Pixel (LNK-03) ----------------------------------------------------------------------

/** ID do Pixel da Meta: 15 ou 16 dígitos. */
export const META_PIXEL_ID_PATTERN = /^\d{15,16}$/u;
/** Tag do Google: GA4 `G-…`, Google Ads `AW-…`, tag do Google `GT-…` (maiúsculas). */
export const GOOGLE_TAG_ID_PATTERN = /^(?:G|AW|GT)-[A-Z0-9]{4,20}$/u;

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const metaPixelIdSchema = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .regex(META_PIXEL_ID_PATTERN, { message: "Use os 15 ou 16 números do Pixel." })
    .nullable(),
);

export const googleTagIdSchema = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(GOOGLE_TAG_ID_PATTERN, { message: "Use o formato G-XXXXXXX ou AW-XXXXXXX." })
    .nullable(),
);

/** Os dois campos são opcionais: vazio/null apaga. */
export const storePixelsInputSchema = z.object({
  metaPixelId: metaPixelIdSchema,
  googleTagId: googleTagIdSchema,
});
export type StorePixelsInput = z.input<typeof storePixelsInputSchema>;
export type StorePixels = z.output<typeof storePixelsInputSchema>;

// ---- Vitrine: descrição, logo e capa (P-VIS-1..3) ----------------------------------------

/** Descrição curta (cabeçalho, "Sobre a Loja" e meta description). */
export const STORE_DESCRIPTION_MAX = 160;

export const storeDescriptionSchema = z.preprocess(
  emptyToNull,
  z.string().trim().max(STORE_DESCRIPTION_MAX).nullable(),
);

export const BRAND_IMAGE_KINDS = ["logo", "cover"] as const;
export type BrandImageKind = (typeof BRAND_IMAGE_KINDS)[number];

const brandImageKeySchema = z.string().trim().min(1).max(200);

/**
 * Vitrine (só os campos enviados mudam). Chave de imagem = a devolvida por `storeUploadBrandImage`
 * desta Loja (a api confere prefixo e existência no R2); null remove e apaga a antiga.
 */
export const storeShowcaseInputSchema = z
  .object({
    description: storeDescriptionSchema.optional(),
    logoObjectKey: brandImageKeySchema.nullable().optional(),
    coverObjectKey: brandImageKeySchema.nullable().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "Nada para alterar.",
  });
export type StoreShowcaseInput = z.input<typeof storeShowcaseInputSchema>;
export type StoreShowcase = z.output<typeof storeShowcaseInputSchema>;

const brandImageBytesSchema = z
  .custom<MenuImageBytes>((value) => value instanceof ArrayBuffer || value instanceof Uint8Array, {
    message: "bytes da imagem ausentes",
  })
  .refine((bytes) => bytes.byteLength >= 1 && bytes.byteLength <= MENU_IMAGE_MAX_BYTES, {
    message: "imagem vazia ou maior que 5 MiB",
  });

/**
 * Upload do logo (quadrado) ou da capa pelos bytes, com a mesma regra das fotos do Cardápio:
 * JPEG/PNG/WebP ≤ 5 MiB conferidos pela assinatura, chave `stores/{store_id}/brand/{uuid}.{ext}`
 * gerada pela api e gravada pelo binding `MEDIA`. O recorte quadrado do logo é do cliente.
 */
export const storeUploadBrandImageInputSchema = z
  .object({
    kind: z.enum(BRAND_IMAGE_KINDS),
    contentType: z.enum(MENU_IMAGE_CONTENT_TYPES),
    bytes: brandImageBytesSchema,
  })
  .refine((input) => detectMenuImageContentType(input.bytes) === input.contentType, {
    message: "o conteúdo não é uma imagem do tipo declarado",
    path: ["bytes"],
  });
export type StoreUploadBrandImageInput = z.input<typeof storeUploadBrandImageInputSchema>;

export type StoreUploadedBrandImage = {
  kind: BrandImageKind;
  objectKey: string;
  /** null só se a api estiver sem `MEDIA_PUBLIC_BASE_URL`. */
  imageUrl: string | null;
};

export function brandImageObjectKey(
  storeId: string,
  contentType: MenuImageContentType,
  objectId: string,
): string {
  return `stores/${storeId}/brand/${objectId}.${MENU_IMAGE_EXTENSIONS[contentType]}`;
}

const BRAND_IMAGE_KEY_TAIL =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/u;

/** A chave é de logo/capa DESTA Loja? (nunca aceitar/apagar objeto de outra Loja). */
export function isStoreBrandImageKey(storeId: string, objectKey: string): boolean {
  const prefix = `stores/${storeId}/brand/`;
  return objectKey.startsWith(prefix) && BRAND_IMAGE_KEY_TAIL.test(objectKey.slice(prefix.length));
}

// ---- Vitrine pública (Storefront) --------------------------------------------------------

/**
 * Parte do `GET /storefront/lojas/:slug/estado` do Ticket 28: logo, capa, descrição (cabeçalho,
 * "Sobre a Loja" e meta description), Instagram e os IDs de Pixel SÓ desta Loja. Sem dado interno
 * (perfil do Dono, chaves do R2, CNPJ).
 */
export const storefrontShowcaseSchema = z.object({
  description: z.string().max(STORE_DESCRIPTION_MAX).nullable(),
  logoUrl: z.string().url().nullable(),
  coverUrl: z.string().url().nullable(),
  instagram: z.string().regex(INSTAGRAM_PATTERN).nullable(),
  pixels: z.object({
    metaPixelId: z.string().regex(META_PIXEL_ID_PATTERN).nullable(),
    googleTagId: z.string().regex(GOOGLE_TAG_ID_PATTERN).nullable(),
  }),
});
export type StorefrontShowcase = z.infer<typeof storefrontShowcaseSchema>;

export const EMPTY_STOREFRONT_SHOWCASE: StorefrontShowcase = Object.freeze({
  description: null,
  logoUrl: null,
  coverUrl: null,
  instagram: null,
  pixels: Object.freeze({ metaPixelId: null, googleTagId: null }),
}) as StorefrontShowcase;
