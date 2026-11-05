// Contrato público do PIX na página do Pedido (Ticket 26, decisões 60/63, DIRETRIZES §6 PIX).
// A resposta pública traz SÓ o necessário para pagar: estado, valor, copia-e-cola, QR (PNG em
// data URL, como a AbacatePay devolve) e expiração. Nada do provedor (id da cobrança, taxas,
// custo) sai para o navegador.
import { z } from "zod";

import { centsSchema } from "../money.js";

/** Validade do QR pedida ao provedor (segundos). */
export const PIX_EXPIRES_IN_SECONDS = 30 * 60;

/** Intervalo da atualização da página do Pedido enquanto o PIX aguarda pagamento. */
export const PIX_POLL_INTERVAL_MS = 5_000;

/**
 * Estado da cobrança PIX como o Consumidor vê:
 * - `creating`: cobrança sendo gerada (resposta do provedor ainda não gravada);
 * - `pending`: QR válido, aguardando pagamento;
 * - `paid`: pagamento confirmado (webhook ou consulta autenticada);
 * - `expired`: QR venceu sem pagamento;
 * - `failed`: o provedor recusou gerar a cobrança.
 */
export const PIX_STATES = ["creating", "pending", "paid", "expired", "failed"] as const;
export type PixState = (typeof PIX_STATES)[number];
export const pixStateSchema = z.enum(PIX_STATES);

/** QR aceito na resposta pública: só PNG em base64 (vai direto num `<img src>`). */
export const PIX_QR_DATA_URL_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u;
/** Teto do QR em data URL (o PNG da AbacatePay tem poucos KiB). */
export const PIX_QR_DATA_URL_MAX = 200_000;
/** Teto do copia-e-cola (BR Code EMV tem bem menos que isso). */
export const PIX_COPY_PASTE_MAX = 1_024;

export const orderPixSchema = z.object({
  state: pixStateSchema,
  amountCents: centsSchema,
  /** Copia-e-cola (BR Code). Null enquanto `creating` ou quando `failed`. */
  copyPaste: z.string().min(1).max(PIX_COPY_PASTE_MAX).nullable(),
  /** QR em `data:image/png;base64,…`; null se o provedor não mandou um PNG válido. */
  qrCodeDataUrl: z.string().max(PIX_QR_DATA_URL_MAX).regex(PIX_QR_DATA_URL_PATTERN).nullable(),
  expiresAt: z.iso.datetime().nullable(),
});
export type OrderPix = z.infer<typeof orderPixSchema>;

/** Só devolve o QR se for um PNG em data URL dentro do teto; senão null (o copia-e-cola basta). */
export function safePixQrDataUrl(value: string | null | undefined): string | null {
  if (!value || value.length > PIX_QR_DATA_URL_MAX) return null;
  return PIX_QR_DATA_URL_PATTERN.test(value) ? value : null;
}

/** Segundos restantes até `expiresAt` (0 quando venceu ou sem data). */
export function pixSecondsLeft(expiresAt: string | null, nowMs: number): number {
  if (!expiresAt) return 0;
  const end = Date.parse(expiresAt);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - nowMs) / 1000));
}

/** "29:59", "1:05:00" — contagem regressiva do QR. */
export function formatCountdownPt(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Título do bloco do PIX na página do Pedido (lido em `aria-live`). */
export function pixStateLabelPt(state: PixState): string {
  switch (state) {
    case "creating":
      return "Gerando o PIX";
    case "pending":
      return "Aguardando pagamento";
    case "paid":
      return "Pagamento confirmado";
    case "expired":
      return "PIX expirado";
    case "failed":
      return "Não foi possível gerar o PIX";
  }
}

/** Estados em que a página continua consultando o servidor. */
export function isPixAwaiting(state: PixState): boolean {
  return state === "creating" || state === "pending";
}
