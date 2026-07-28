import { randomUUID } from "node:crypto";

export const MENU_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const MENU_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type MenuImageContentType = (typeof MENU_IMAGE_CONTENT_TYPES)[number];

const extensionByContentType: Record<MenuImageContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isMenuImageContentType(
  value: string,
): value is MenuImageContentType {
  return (MENU_IMAGE_CONTENT_TYPES as readonly string[]).includes(value);
}

export function menuImageObjectKey(
  storeId: string,
  contentType: MenuImageContentType,
  objectId = randomUUID(),
) {
  return `stores/${storeId}/menu/${objectId}.${extensionByContentType[contentType]}`;
}

export function isOwnedMenuImageObjectKey(storeId: string, objectKey: string) {
  const pattern = new RegExp(
    `^stores/${storeId}/menu/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(?:jpg|png|webp)$`,
    "u",
  );
  return pattern.test(objectKey);
}

export function publicMenuImageUrl(publicBaseUrl: string, objectKey: string) {
  const base = publicBaseUrl.replace(/\/+$/u, "");
  return `${base}/${objectKey}`;
}

export function assertMenuImageUploadRequest(input: {
  contentLength: number;
  contentType: string;
}) {
  if (!isMenuImageContentType(input.contentType)) {
    return { ok: false as const, error: "invalid_image_content_type" };
  }
  if (
    !Number.isInteger(input.contentLength) ||
    input.contentLength <= 0 ||
    input.contentLength > MENU_IMAGE_MAX_BYTES
  ) {
    return { ok: false as const, error: "invalid_image_size" };
  }
  return {
    ok: true as const,
    contentType: input.contentType,
    contentLength: input.contentLength,
  };
}
