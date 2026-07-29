/**
 * Normalização canônica de bairro (Ticket 09 Comments).
 * Display: input sanitizado (trim + colapso de espaços).
 * Chave: NFKD, sem diacríticos, trim, espaços colapsados, toLocaleLowerCase("pt-BR").
 */

export function sanitizeNeighborhoodDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/gu, " ");
}

export function normalizeNeighborhoodKey(raw: string): string {
  return sanitizeNeighborhoodDisplayName(raw)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR");
}
