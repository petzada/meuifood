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

export async function inviteOperator(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const response = await fetch(new URL("/team/operators/invitations", apiUrl()), {
    body: JSON.stringify({ email }),
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) redirect("/?equipe=convite-erro#equipe");
  revalidatePath("/");
  redirect("/?equipe=convite-enviado#equipe");
}

export async function removeOperator(formData: FormData) {
  const membershipId = String(formData.get("membershipId") ?? "").trim();
  if (!membershipId) redirect("/?equipe=remocao-erro#equipe");
  const response = await fetch(
    new URL(`/team/members/${encodeURIComponent(membershipId)}`, apiUrl()),
    {
      headers: { authorization: `Bearer ${await accessToken()}` },
      method: "DELETE",
    },
  );
  if (!response.ok) redirect("/?equipe=remocao-erro#equipe");
  revalidatePath("/");
  redirect("/?equipe=acesso-removido#equipe");
}
