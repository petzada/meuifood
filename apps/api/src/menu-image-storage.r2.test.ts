import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  createMenuImageStorage,
  menuImageStorageFromEnvironment,
} from "./menu-image-storage.js";
import { menuImageObjectKey } from "./menu-images.js";

async function readEnvFileValue(name: string) {
  const repositoryEnvironmentFile = new URL("../../../.env", import.meta.url);
  if (!existsSync(repositoryEnvironmentFile)) return undefined;
  const source = await readFile(repositoryEnvironmentFile, "utf8");
  const line = source
    .split(/\r?\n/u)
    .find((candidate) => candidate.trimStart().startsWith(`${name}=`));
  if (!line) return undefined;
  const value = line.slice(line.indexOf("=") + 1).trim();
  const unquoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
      ? value.slice(1, -1)
      : value;
  return unquoted || undefined;
}

async function r2ConfigFromEnvironment() {
  const names = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_PUBLIC_BASE_URL",
  ] as const;
  const values: Record<(typeof names)[number], string | undefined> = {
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID?.trim(),
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID?.trim(),
    R2_BUCKET: process.env.R2_BUCKET?.trim(),
    R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL?.trim(),
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY?.trim(),
  };
  for (const name of names) {
    if (!values[name]) values[name] = await readEnvFileValue(name);
  }
  if (names.some((name) => !values[name])) return null;
  return {
    accessKeyId: values.R2_ACCESS_KEY_ID!,
    accountId: values.R2_ACCOUNT_ID!,
    bucket: values.R2_BUCKET!,
    publicBaseUrl: values.R2_PUBLIC_BASE_URL!,
    secretAccessKey: values.R2_SECRET_ACCESS_KEY!,
  };
}

describe("prova estreita R2 real (condicional)", () => {
  it("sobe e remove um objeto sintético quando há credenciais", async () => {
    const config = await r2ConfigFromEnvironment();
    if (!config) {
      expect(menuImageStorageFromEnvironment({})).toBeNull();
      return;
    }

    const storage = createMenuImageStorage(config);
    const storeId = "00000000-0000-4000-8000-000000000005";
    const objectKey = menuImageObjectKey(storeId, "image/png", randomUUID());
    const body = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const signed = await storage.createPresignedUpload({
      contentLength: body.byteLength,
      contentType: "image/png",
      objectKey,
    });
    const uploaded = await fetch(signed.uploadUrl, {
      body,
      headers: { "content-type": "image/png" },
      method: "PUT",
    });
    expect(uploaded.ok).toBe(true);

    await storage.deleteObject(objectKey);
  });
});
