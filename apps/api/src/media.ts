// Imagens do Cardápio no R2 pelo binding `MEDIA` (decisões 57/59/64): sem credenciais S3 nem URL
// pré-assinada. Upload: a RPC recebe os bytes e grava aqui; leitura pública: rota `GET /media/*`
// da api, que só serve chaves do padrão `stores/{store_id}/menu/{uuid}.{ext}`.
import {
  isStoreMenuImageKey,
  MENU_IMAGE_EXTENSIONS,
  type MenuImageBytes,
  type MenuImageContentType,
  menuIdSchema,
  menuImageObjectKey,
  publicMenuImageUrl,
} from "@foode/shared/menu";

/** Caminho público da rota de leitura (a base pública termina nele). */
export const MEDIA_ROUTE_PREFIX = "/media";

/** Chave com UUID nunca é reescrita: cache longo e imutável. */
export const MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

const CONTENT_TYPE_BY_EXTENSION = new Map(
  Object.entries(MENU_IMAGE_EXTENSIONS).map(([type, ext]) => [ext, type as MenuImageContentType]),
);

/**
 * Base pública das imagens: `MEDIA_PUBLIC_BASE_URL` (ex.: `https://api.foodedelivery.com.br/media`)
 * ou, sem ela, a origem da própria request + `/media`.
 */
export function mediaBaseUrl(configured: string | undefined, requestUrl?: string): string | null {
  const value = configured?.trim();
  if (value) return value.replace(/\/+$/u, "");
  if (!requestUrl) return null;
  return `${new URL(requestUrl).origin}${MEDIA_ROUTE_PREFIX}`;
}

export function menuImageUrl(baseUrl: string | null, objectKey: string | null): string | null {
  return baseUrl && objectKey ? publicMenuImageUrl(baseUrl, objectKey) : null;
}

/** Grava a imagem (já validada pela assinatura dos bytes) numa chave nova da Loja. */
export async function putMenuImage(
  bucket: R2Bucket,
  storeId: string,
  contentType: MenuImageContentType,
  bytes: MenuImageBytes,
): Promise<string> {
  const objectKey = menuImageObjectKey(storeId, contentType, crypto.randomUUID());
  await bucket.put(objectKey, bytes, {
    httpMetadata: { contentType, cacheControl: MEDIA_CACHE_CONTROL },
    customMetadata: { storeId },
  });
  return objectKey;
}

/** A chave é desta Loja e o objeto existe no bucket? */
export async function menuImageExists(
  bucket: R2Bucket,
  storeId: string,
  objectKey: string,
): Promise<boolean> {
  if (!isStoreMenuImageKey(storeId, objectKey)) return false;
  return (await bucket.head(objectKey)) !== null;
}

/**
 * Apaga a imagem antiga ao trocar/remover. Nunca apaga fora do prefixo da Loja; falha não
 * desfaz a operação no Cardápio, mas fica registrada (observável) sem dados pessoais.
 */
export async function deleteMenuImage(
  bucket: R2Bucket,
  storeId: string,
  objectKey: string,
): Promise<boolean> {
  if (!isStoreMenuImageKey(storeId, objectKey)) {
    console.warn(JSON.stringify({ level: "warn", message: "menu_image_delete_refused" }));
    return false;
  }
  try {
    await bucket.delete(objectKey);
    return true;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "menu_image_delete_failed",
        objectKey,
        cause: error instanceof Error ? error.message : "desconhecido",
      }),
    );
    return false;
  }
}

/**
 * Leitura pública `GET /media/stores/{storeId}/menu/{file}`: só chaves do padrão (UUID + extensão
 * permitida), `Content-Type` pela extensão (nunca pelo metadado gravado), `nosniff`, CSP sem
 * nada executável e cache imutável; `If-None-Match` responde 304.
 */
export async function serveMenuImage(
  bucket: R2Bucket,
  storeId: string,
  file: string,
  request: Request,
): Promise<Response> {
  const objectKey = `stores/${storeId}/menu/${file}`;
  const extension = file.slice(file.lastIndexOf(".") + 1);
  const contentType = CONTENT_TYPE_BY_EXTENSION.get(extension);
  if (
    !menuIdSchema.safeParse(storeId).success ||
    !contentType ||
    !isStoreMenuImageKey(storeId, objectKey)
  ) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const object = await bucket.get(objectKey, { onlyIf: request.headers });
  if (!object) return Response.json({ error: "not_found" }, { status: 404 });

  const headers = new Headers({
    "content-type": contentType,
    "cache-control": MEDIA_CACHE_CONTROL,
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
    etag: object.httpEtag,
  });
  if (!("body" in object) || !object.body) return new Response(null, { status: 304, headers });
  headers.set("content-length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}
