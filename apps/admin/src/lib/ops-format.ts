// Formatação e conversão da área Ops (Ticket 29). O contrato fala em centavos, basis points e
// instantes UTC; a tela fala em R$, % e horário de America/Sao_Paulo. Puro, roda no
// navegador e no servidor (sem dependência do banco nem do Next).

import { formatMoneyInput } from "./money-mask";

export const SAO_PAULO_TZ = "America/Sao_Paulo";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 8499 → "R$ 84,99". */
export function formatCents(cents: number): string {
  return brl.format(cents / 100);
}

/** 349 → "3,49%". */
export function formatBps(bps: number): string {
  return `${percent.format(bps / 100)}%`;
}

/** Texto digitado em R$ ("84,99", "R$ 1.234,50", "84.99") → centavos inteiros; null se inválido. */
export function parseMoneyToCents(raw: string): number | null {
  const text = raw.replace(/[R$\s]/g, "");
  if (!text) return null;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Texto digitado em % ("3,49", "3.49") → basis points; null se inválido. */
export function parsePercentToBps(raw: string): number | null {
  const text = raw.replace(/[%\s]/g, "").replace(",", ".");
  if (!text || !/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

/** 8499 → "R$ 84,99" (valor inicial de um campo de dinheiro, já na máscara do item 10d). */
export function centsToInput(cents: number): string {
  return formatMoneyInput(cents);
}

/** 349 → "3,49" (valor inicial de um campo de percentual). */
export function bpsToInput(bps: number): string {
  return (bps / 100).toFixed(2).replace(".", ",");
}

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsIn(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

function offsetMinutes(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * `datetime-local` ("2026-11-05T14:30") lido como horário de São Paulo → ISO UTC
 * ("2026-11-05T17:30:00.000Z"). null se o texto não é uma data/hora.
 */
export function zonedInputToUtcIso(local: string, timeZone = SAO_PAULO_TZ): string | null {
  const match = LOCAL_INPUT.exec(local.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const guess = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? 0),
  );
  if (Number.isNaN(guess)) return null;
  // Rejeita estouro (mês 13, hora 99): a data gerada tem que bater com o que foi digitado.
  const check = new Date(guess);
  if (
    check.getUTCMonth() !== Number(mo) - 1 ||
    check.getUTCDate() !== Number(d) ||
    check.getUTCHours() !== Number(h) ||
    check.getUTCMinutes() !== Number(mi)
  ) {
    return null;
  }
  const first = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  const second = guess - offsetMinutes(new Date(first), timeZone) * 60_000;
  const result = new Date(second);
  if (Number.isNaN(result.getTime())) return null;
  return result.toISOString();
}

/** ISO UTC → valor de `datetime-local` em São Paulo ("2026-11-05T14:30"). */
export function utcIsoToZonedInput(iso: string, timeZone = SAO_PAULO_TZ): string {
  const p = partsIn(new Date(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

const dateTimeSp = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SAO_PAULO_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateSp = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SAO_PAULO_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** ISO UTC → "05/11/2026 14:30" (São Paulo). */
export function formatDateTimeSp(iso: string): string {
  return dateTimeSp.format(new Date(iso)).replace(",", "");
}

/** ISO UTC → "05/11/2026" (São Paulo). */
export function formatDateSp(iso: string): string {
  return dateSp.format(new Date(iso));
}

/** Vigência legível: "desde 01/11/2026", "01/11/2026 → 31/12/2026", "a partir de ..." se futura. */
export function formatPeriod(validFrom: string, validTo: string | null, now = new Date()): string {
  const from = formatDateTimeSp(validFrom);
  const future = new Date(validFrom).getTime() > now.getTime();
  if (validTo === null) return future ? `vale a partir de ${from}` : `desde ${from}`;
  return `${from} até ${formatDateTimeSp(validTo)}`;
}

/** Estado da vigência agora: futura, vigente ou encerrada. */
export function periodState(
  validFrom: string,
  validTo: string | null,
  now = new Date(),
): "future" | "current" | "ended" {
  const at = now.toISOString();
  if (validFrom > at) return "future";
  if (validTo !== null && validTo <= at) return "ended";
  return "current";
}

// ---- Máscaras de digitação (T-06): só visual; o contrato recebe o texto e normaliza. ----

export function maskCnpj(raw: string): string {
  const v = raw
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 14);
  return v
    .replace(/^(.{2})(.)/, "$1.$2")
    .replace(/^(.{2})\.(.{3})(.)/, "$1.$2.$3")
    .replace(/^(.{2})\.(.{3})\.(.{3})(.)/, "$1.$2.$3/$4")
    .replace(/^(.{2})\.(.{3})\.(.{3})\/(.{4})(.)/, "$1.$2.$3/$4-$5");
}

export function maskCpf(raw: string): string {
  const v = raw.replace(/\D/g, "").slice(0, 11);
  return v
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

/** CPF (11 dígitos) ou CNPJ (14 posições) conforme o tamanho digitado. */
export function maskCpfOrCnpj(raw: string): string {
  const clean = raw.replace(/[^0-9A-Za-z]/g, "");
  return clean.length <= 11 && /^\d*$/.test(clean) ? maskCpf(clean) : maskCnpj(clean);
}

export function maskCep(raw: string): string {
  const v = raw.replace(/\D/g, "").slice(0, 8);
  return v.replace(/^(\d{5})(\d)/, "$1-$2");
}

/** Celular BR: "(11) 91234-5678". Aceita com ou sem o 55. */
export function maskPhoneBr(raw: string): string {
  let v = raw.replace(/\D/g, "");
  if (v.startsWith("55") && v.length > 11) v = v.slice(2);
  v = v.slice(0, 11);
  return v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/^\((\d{2})\) (\d{5})(\d)/, "($1) $2-$3");
}

/** E.164 sem "+" (5511912345678) → "(11) 91234-5678" para exibir. */
export function formatWhatsapp(e164: string | null): string {
  if (!e164) return "—";
  return maskPhoneBr(e164);
}

export function formatCnpj(cnpj: string | null): string {
  return cnpj ? maskCnpj(cnpj) : "—";
}

export function formatCep(cep: string): string {
  return maskCep(cep);
}
