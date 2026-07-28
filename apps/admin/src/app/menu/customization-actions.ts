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

function parseOptions(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

export async function createComplementGroup(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const required = String(formData.get("required") ?? "") === "on";
  const options = parseOptions(String(formData.get("options") ?? ""));
  if (!itemId || !name) feedbackRedirect("customizacao-erro");

  const response = await fetch(new URL("/menu/complement-groups", apiUrl()), {
    body: JSON.stringify({ itemId, name, options, required }),
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) feedbackRedirect("customizacao-erro");
  revalidatePath("/");
  feedbackRedirect("complemento-criado");
}

export async function replaceComplementGroup(formData: FormData) {
  const groupId = String(formData.get("groupId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const required = String(formData.get("required") ?? "") === "on";
  const options = parseOptions(String(formData.get("options") ?? ""));
  if (!groupId || !name) feedbackRedirect("customizacao-erro");

  const response = await fetch(
    new URL(`/menu/complement-groups/${encodeURIComponent(groupId)}`, apiUrl()),
    {
      body: JSON.stringify({ name, options, required }),
      headers: {
        authorization: `Bearer ${await accessToken()}`,
        "content-type": "application/json",
      },
      method: "PUT",
    },
  );
  if (!response.ok) feedbackRedirect("customizacao-erro");
  revalidatePath("/");
  feedbackRedirect("complemento-atualizado");
}

export async function deleteComplementGroup(formData: FormData) {
  const groupId = String(formData.get("groupId") ?? "").trim();
  if (!groupId) feedbackRedirect("customizacao-erro");
  const response = await fetch(
    new URL(`/menu/complement-groups/${encodeURIComponent(groupId)}`, apiUrl()),
    {
      headers: { authorization: `Bearer ${await accessToken()}` },
      method: "DELETE",
    },
  );
  if (!response.ok) feedbackRedirect("customizacao-erro");
  revalidatePath("/");
  feedbackRedirect("complemento-removido");
}

export async function reorderComplementGroups(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "").trim();
  const orderedGroupIds = String(formData.get("orderedGroupIds") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!itemId || orderedGroupIds.length === 0) {
    feedbackRedirect("customizacao-erro");
  }

  const response = await fetch(
    new URL("/menu/complement-groups/order", apiUrl()),
    {
      body: JSON.stringify({ itemId, orderedGroupIds }),
      headers: {
        authorization: `Bearer ${await accessToken()}`,
        "content-type": "application/json",
      },
      method: "PUT",
    },
  );
  if (!response.ok) feedbackRedirect("customizacao-erro");
  revalidatePath("/");
  feedbackRedirect("customizacao-ordenada");
}

export async function createAdditional(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const priceReais = String(formData.get("priceReais") ?? "").trim();
  const available = String(formData.get("available") ?? "") === "on";
  const priceCents = reaisToCents(priceReais);
  if (!itemId || !name || priceCents === null || priceCents < 0) {
    feedbackRedirect("customizacao-erro");
  }

  const response = await fetch(new URL("/menu/additionals", apiUrl()), {
    body: JSON.stringify({ available, itemId, name, priceCents }),
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) feedbackRedirect("customizacao-erro");
  revalidatePath("/");
  feedbackRedirect("adicional-criado");
}

export async function updateAdditional(formData: FormData) {
  const additionalId = String(formData.get("additionalId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const priceReais = String(formData.get("priceReais") ?? "").trim();
  const available = String(formData.get("available") ?? "") === "on";
  const priceCents = reaisToCents(priceReais);
  if (!additionalId || !name || priceCents === null || priceCents < 0) {
    feedbackRedirect("customizacao-erro");
  }

  const response = await fetch(
    new URL(`/menu/additionals/${encodeURIComponent(additionalId)}`, apiUrl()),
    {
      body: JSON.stringify({ available, name, priceCents }),
      headers: {
        authorization: `Bearer ${await accessToken()}`,
        "content-type": "application/json",
      },
      method: "PATCH",
    },
  );
  if (!response.ok) feedbackRedirect("customizacao-erro");
  revalidatePath("/");
  feedbackRedirect("adicional-atualizado");
}

export async function deleteAdditional(formData: FormData) {
  const additionalId = String(formData.get("additionalId") ?? "").trim();
  if (!additionalId) feedbackRedirect("customizacao-erro");
  const response = await fetch(
    new URL(`/menu/additionals/${encodeURIComponent(additionalId)}`, apiUrl()),
    {
      headers: { authorization: `Bearer ${await accessToken()}` },
      method: "DELETE",
    },
  );
  if (!response.ok) feedbackRedirect("customizacao-erro");
  revalidatePath("/");
  feedbackRedirect("adicional-removido");
}

export async function reorderAdditionals(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "").trim();
  const orderedAdditionalIds = String(formData.get("orderedAdditionalIds") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!itemId || orderedAdditionalIds.length === 0) {
    feedbackRedirect("customizacao-erro");
  }

  const response = await fetch(new URL("/menu/additionals/order", apiUrl()), {
    body: JSON.stringify({ itemId, orderedAdditionalIds }),
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
    },
    method: "PUT",
  });
  if (!response.ok) feedbackRedirect("customizacao-erro");
  revalidatePath("/");
  feedbackRedirect("customizacao-ordenada");
}
