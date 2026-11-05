// Destino do `/falar` (decisão 70): `wa.me` do WhatsApp de vendas (secret `SALES_WHATSAPP`, só
// no servidor) ou, sem número válido, o formulário de contato da landing.
import { CONTACT_ANCHOR, FALAR_MESSAGE } from "../content/site";

/** Só dígitos; aceita 10 a 15 (E.164 sem `+`). Número BR sem DDI (10/11 dígitos) ganha o `55`. */
export function salesWhatsAppDigits(raw: string | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/gu, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return digits;
  return null;
}

export function falarLocation(raw: string | undefined, requestUrl: string): string {
  const digits = salesWhatsAppDigits(raw);
  if (!digits) return new URL(CONTACT_ANCHOR, requestUrl).href;
  const url = new URL(`https://wa.me/${digits}`);
  url.searchParams.set("text", FALAR_MESSAGE);
  return url.href;
}
