/**
 * Telefone BR para WhatsApp no MVP: E.164 sem "+", só dígitos.
 * Formato canônico: 55 + DDD (2) + número (9 dígitos, celular com nono dígito).
 * Decisão de implementação do Ticket 08 (docs pedem normalização sem fixar o formato).
 */

export type PhoneNormalizationResult =
  | { ok: true; e164: string }
  | { error: "invalid_phone"; ok: false };

const mobileE164 = /^55[1-9][0-9]9[0-9]{8}$/u;

export function normalizeBrazilianMobilePhone(
  raw: string,
): PhoneNormalizationResult {
  const digits = raw.replace(/\D/gu, "");
  if (!digits) return { error: "invalid_phone", ok: false };

  let candidate = digits;
  if (candidate.startsWith("55") && candidate.length === 13) {
    // already country-coded
  } else if (candidate.length === 11) {
    candidate = `55${candidate}`;
  } else if (candidate.length === 10) {
    // landline-shaped — rejeitado no MVP (WhatsApp = celular)
    return { error: "invalid_phone", ok: false };
  } else {
    return { error: "invalid_phone", ok: false };
  }

  if (!mobileE164.test(candidate)) {
    return { error: "invalid_phone", ok: false };
  }

  return { ok: true, e164: candidate };
}

export function buildWhatsAppMeUrl(
  phoneE164: string,
  prefilledText?: string,
): string | null {
  if (!mobileE164.test(phoneE164)) return null;
  const base = `https://wa.me/${phoneE164}`;
  if (!prefilledText) return base;
  return `${base}?text=${encodeURIComponent(prefilledText)}`;
}
