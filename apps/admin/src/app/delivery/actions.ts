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
  redirect(`/?entrega=${code}#configuracoes`);
}

export async function setPickupEnabled(formData: FormData) {
  const pickupEnabled = String(formData.get("pickupEnabled") ?? "") === "true";
  const response = await fetch(new URL("/delivery/pickup", apiUrl()), {
    body: JSON.stringify({ pickupEnabled }),
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
    },
    method: "PUT",
  });
  if (!response.ok) feedbackRedirect("retirada-erro");
  revalidatePath("/");
  feedbackRedirect(pickupEnabled ? "retirada-ativada" : "retirada-desativada");
}

export async function setFeeMode(formData: FormData) {
  const mode = String(formData.get("mode") ?? "");
  let body: unknown;
  if (mode === "fixed") {
    const reais = String(formData.get("fixedFeeReais") ?? "").replace(",", ".");
    const cents = Math.round(Number(reais) * 100);
    if (!Number.isFinite(cents) || cents < 0) feedbackRedirect("modo-erro");
    body = { mode: "fixed", fixedDeliveryFeeCents: cents };
  } else if (mode === "neighborhood") {
    body = { mode: "neighborhood" };
  } else {
    feedbackRedirect("modo-erro");
  }

  const response = await fetch(new URL("/delivery/fee-mode", apiUrl()), {
    body: JSON.stringify(body),
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
    },
    method: "PUT",
  });
  if (!response.ok) feedbackRedirect("modo-erro");
  revalidatePath("/");
  feedbackRedirect("modo-salvo");
}

export async function createNeighborhood(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const reais = String(formData.get("feeReais") ?? "").replace(",", ".");
  const feeCents = Math.round(Number(reais) * 100);
  const response = await fetch(new URL("/delivery/neighborhoods", apiUrl()), {
    body: JSON.stringify({ feeCents, name }),
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (response.status === 409) feedbackRedirect("bairro-duplicado");
  if (!response.ok) feedbackRedirect("bairro-erro");
  revalidatePath("/");
  feedbackRedirect("bairro-criado");
}

export async function deleteNeighborhood(formData: FormData) {
  const neighborhoodId = String(formData.get("neighborhoodId") ?? "");
  const response = await fetch(
    new URL(
      `/delivery/neighborhoods/${encodeURIComponent(neighborhoodId)}`,
      apiUrl(),
    ),
    {
      headers: { authorization: `Bearer ${await accessToken()}` },
      method: "DELETE",
    },
  );
  if (!response.ok) feedbackRedirect("bairro-erro");
  revalidatePath("/");
  feedbackRedirect("bairro-removido");
}
