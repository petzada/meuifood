"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";

function apiUrl() {
  const value = process.env.API_URL?.trim();
  if (!value) throw new Error("API_URL_is_required");
  return value;
}

async function accessToken() {
  const supabase = await createClient();
  const { error: claimsError } = await supabase.auth.getClaims();
  if (claimsError) redirect("/entrar");
  const { data } = await supabase.auth.getSession();
  if (!data.session) redirect("/entrar");
  return data.session.access_token;
}

function feedbackRedirect(code: string): never {
  redirect(`/?cardapio=${code}#cardapio`);
}

function reaisToCents(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/u.exec(normalized);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = (match[2] ?? "00").padEnd(2, "0").slice(0, 2);
  return whole * 100 + Number(fraction);
}

export async function createCategory(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const response = await fetch(new URL("/menu/categories", apiUrl()), {
    body: JSON.stringify({ name }),
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) feedbackRedirect("categoria-erro");
  revalidatePath("/");
  feedbackRedirect("categoria-criada");
}

export async function updateCategory(formData: FormData) {
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!categoryId) feedbackRedirect("categoria-erro");
  const response = await fetch(
    new URL(`/menu/categories/${encodeURIComponent(categoryId)}`, apiUrl()),
    {
      body: JSON.stringify({ name }),
      headers: {
        authorization: `Bearer ${await accessToken()}`,
        "content-type": "application/json",
      },
      method: "PATCH",
    },
  );
  if (!response.ok) feedbackRedirect("categoria-erro");
  revalidatePath("/");
  feedbackRedirect("categoria-atualizada");
}

export async function deleteCategory(formData: FormData) {
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  if (!categoryId) feedbackRedirect("categoria-erro");
  const response = await fetch(
    new URL(`/menu/categories/${encodeURIComponent(categoryId)}`, apiUrl()),
    {
      headers: { authorization: `Bearer ${await accessToken()}` },
      method: "DELETE",
    },
  );
  if (response.status === 409) feedbackRedirect("categoria-com-itens");
  if (!response.ok) feedbackRedirect("categoria-erro");
  revalidatePath("/");
  feedbackRedirect("categoria-removida");
}

export async function reorderCategories(formData: FormData) {
  const ordered = String(formData.get("orderedCategoryIds") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const response = await fetch(new URL("/menu/categories/order", apiUrl()), {
    body: JSON.stringify({ orderedCategoryIds: ordered }),
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
    },
    method: "PUT",
  });
  if (!response.ok) feedbackRedirect("ordem-erro");
  revalidatePath("/");
  feedbackRedirect("ordem-atualizada");
}

export async function createItem(formData: FormData) {
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priceReais = String(formData.get("priceReais") ?? "").trim();
  const available = String(formData.get("available") ?? "") === "on";
  const priceCents = reaisToCents(priceReais);
  if (!categoryId || priceCents === null || priceCents < 0) {
    feedbackRedirect("item-erro");
  }

  const response = await fetch(new URL("/menu/items", apiUrl()), {
    body: JSON.stringify({
      available,
      categoryId,
      description,
      name,
      priceCents,
    }),
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) feedbackRedirect("item-erro");
  revalidatePath("/");
  feedbackRedirect("item-criado");
}

export async function updateItem(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priceReais = String(formData.get("priceReais") ?? "").trim();
  const available = String(formData.get("available") ?? "") === "on";
  const priceCents = reaisToCents(priceReais);
  if (!itemId || !categoryId || priceCents === null || priceCents < 0) {
    feedbackRedirect("item-erro");
  }

  const response = await fetch(
    new URL(`/menu/items/${encodeURIComponent(itemId)}`, apiUrl()),
    {
      body: JSON.stringify({
        available,
        categoryId,
        description,
        name,
        priceCents,
      }),
      headers: {
        authorization: `Bearer ${await accessToken()}`,
        "content-type": "application/json",
      },
      method: "PATCH",
    },
  );
  if (!response.ok) feedbackRedirect("item-erro");
  revalidatePath("/");
  feedbackRedirect("item-atualizado");
}

export async function deleteItem(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) feedbackRedirect("item-erro");
  const response = await fetch(
    new URL(`/menu/items/${encodeURIComponent(itemId)}`, apiUrl()),
    {
      headers: { authorization: `Bearer ${await accessToken()}` },
      method: "DELETE",
    },
  );
  if (!response.ok) feedbackRedirect("item-erro");
  revalidatePath("/");
  feedbackRedirect("item-removido");
}

export async function uploadItemImage(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "").trim();
  const fileEntry = formData.get("image");
  if (!itemId || !(fileEntry instanceof File) || fileEntry.size === 0) {
    feedbackRedirect("foto-erro");
  }
  const file = fileEntry;

  const contentType = file.type;
  const token = await accessToken();
  const presignResponse = await fetch(new URL("/menu/images/presign", apiUrl()), {
    body: JSON.stringify({
      contentLength: file.size,
      contentType,
    }),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!presignResponse.ok) feedbackRedirect("foto-erro");
  const signed = (await presignResponse.json()) as {
    objectKey?: string;
    uploadUrl?: string;
  };
  if (!signed.objectKey || !signed.uploadUrl) feedbackRedirect("foto-erro");
  const objectKey = signed.objectKey;
  const uploadUrl = signed.uploadUrl;

  const uploadResponse = await fetch(uploadUrl, {
    body: file,
    headers: { "content-type": contentType },
    method: "PUT",
  });
  if (!uploadResponse.ok) feedbackRedirect("foto-erro");

  const attachResponse = await fetch(
    new URL(`/menu/items/${encodeURIComponent(itemId)}`, apiUrl()),
    {
      body: JSON.stringify({ imageObjectKey: objectKey }),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "PATCH",
    },
  );
  if (!attachResponse.ok) feedbackRedirect("foto-erro");
  revalidatePath("/");
  feedbackRedirect("foto-atualizada");
}
