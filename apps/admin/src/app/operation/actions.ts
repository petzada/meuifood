"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { accessToken, apiUrl } from "../../lib/legacy-api";

function feedbackRedirect(code: string): never {
  redirect(`/?funcionamento=${code}#funcionamento`);
}

export async function saveOperatingHours(formData: FormData) {
  const schedule = String(formData.get("schedule") ?? "");
  let periods: unknown;
  try {
    periods = JSON.parse(schedule);
  } catch {
    feedbackRedirect("horarios-erro");
  }

  const response = await fetch(new URL("/operation/hours", apiUrl()), {
    body: JSON.stringify({ periods }),
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
    },
    method: "PUT",
  });
  if (!response.ok) feedbackRedirect("horarios-erro");
  revalidatePath("/");
  feedbackRedirect("horarios-salvos");
}

export async function setPause(formData: FormData) {
  const paused = String(formData.get("paused") ?? "") === "true";
  const response = await fetch(new URL("/operation/pause", apiUrl()), {
    body: JSON.stringify({ paused }),
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
    },
    method: "PUT",
  });
  if (!response.ok) feedbackRedirect("pausa-erro");
  revalidatePath("/");
  feedbackRedirect(paused ? "pausa-ativada" : "pausa-desativada");
}
