"use server";

import { redirect } from "next/navigation";

import { createClient } from "../../lib/supabase/server";

export async function definePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password.length < 12) redirect("/definir-senha?erro=senha");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/definir-senha?erro=senha");
  redirect("/");
}
