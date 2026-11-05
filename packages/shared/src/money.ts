// Dinheiro em um só lugar (Ticket 18.1 → 23). A unidade canônica do domínio é o centavo
// inteiro (`priceCents`); reais só existem na fronteira com o humano: o Dono digita
// reais no Painel, o Consumidor lê R$ no Storefront. Sem ponto flutuante na aritmética.
import { z } from "zod";

/** Teto do domínio: R$ 1.000.000,00. Igual ao que a `api` já aceitava em `priceCents`. */
export const MAX_CENTS = 100_000_000;

/** Centavos inteiros, não negativos, dentro do teto do domínio. */
export const centsSchema = z.number().int().min(0).max(MAX_CENTS);

export type Cents = z.infer<typeof centsSchema>;

export function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function assertCents(value: number, label = "value"): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`money: ${label} precisa ser um inteiro em centavos (recebido ${value})`);
  }
}

const REAIS_INPUT = /^(\d{1,7})(?:[.,](\d{1,2}))?$/u;

/**
 * Converte o texto digitado pelo Dono ("12,50", "12.5", "R$ 1.234,56", "7") em centavos.
 * Aceita vírgula ou ponto como decimal e no máximo duas casas: "1.5" vira 150, nunca 105.
 * Separador de milhar é aceito só quando a vírgula é o decimal ("1.234,56").
 * Devolve `null` para entrada inválida, negativa ou acima de `MAX_CENTS`.
 */
export function reaisToCents(raw: string): number | null {
  let text = raw
    .trim()
    .replace(/^R\$\s*/iu, "")
    .replace(/\s+/gu, "");
  if (text.includes(",")) {
    // "1.234,56": pontos são milhar.
    text = text.replace(/\./gu, "");
  }
  const match = REAIS_INPUT.exec(text);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const cents = whole * 100 + Number(fraction);
  return cents > MAX_CENTS ? null : cents;
}

/**
 * Valor para `<input type="number" step="0.01">` ou `type="text"` no Painel: "12.50".
 * Ponto como decimal porque é o que o input numérico do navegador entende.
 */
export function centsToReaisInput(cents: number): string {
  assertCents(cents, "cents");
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Espaço não separável, como o `Intl` pt-BR emite entre "R$" e o número. */
const NBSP = String.fromCharCode(0xa0);

/**
 * Formata centavos como o Consumidor lê: "R$ 1.234,56". Determinístico, sem depender
 * do ICU do runtime (Node, Workers e navegador formatam igual).
 */
export function formatBRL(cents: number): string {
  assertCents(cents, "cents");
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/gu, ".");
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}R$${NBSP}${whole},${fraction}`;
}

/** Soma segura: todo operando precisa ser inteiro; resultado continua inteiro seguro. */
export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    assertCents(value);
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError("money: soma estourou o inteiro seguro");
    }
  }
  return total;
}

/** Multiplica preço unitário por quantidade inteira (linha do carrinho). */
export function multiplyCents(unitCents: number, quantity: number): number {
  assertCents(unitCents, "unitCents");
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError(`money: quantity precisa ser inteiro >= 0 (recebido ${quantity})`);
  }
  const total = unitCents * quantity;
  if (!Number.isSafeInteger(total)) {
    throw new RangeError("money: multiplicação estourou o inteiro seguro");
  }
  return total;
}

/**
 * Aplica um percentual com arredondamento meio-para-cima, em inteiros
 * (ex.: faixa Anota −15% da Decisão 62). `percent` em pontos percentuais (15 = 15%).
 */
export function percentOfCents(cents: number, percent: number): number {
  assertCents(cents, "cents");
  if (!Number.isFinite(percent)) {
    throw new RangeError("money: percent precisa ser finito");
  }
  // Trabalha em centésimos de ponto percentual para não cair em float.
  const basisPoints = Math.round(percent * 100);
  const numerator = cents * basisPoints;
  const sign = numerator < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(numerator) + 5_000) / 10_000);
}
