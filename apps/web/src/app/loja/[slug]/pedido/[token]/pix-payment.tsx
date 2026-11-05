"use client";

// Bloco do PIX na página do Pedido (Ticket 26, DIRETRIZES-UX-CLIENTE §6 PIX): estado em
// `aria-live`, valor, QR, copia-e-cola com "Copiar código" (feedback "Código copiado" em
// `role="status"`), tempo restante e troca para "Pagamento confirmado" quando a página atualiza.
// As regras (estados, rótulos, contagem) vêm de @foode/shared/payment; aqui só a apresentação.
import { formatBRL } from "@foode/shared/money";
import {
  formatCountdownPt,
  type OrderPix,
  pixSecondsLeft,
  pixStateLabelPt,
} from "@foode/shared/payment";
import { Button, useToast } from "@foode/ui";
import { CheckCircle, Copy, SpinnerGap } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

export type PixPaymentProps = {
  pix: OrderPix;
  /** Relógio injetável (contagem regressiva). */
  now?: () => number;
  /** Injetável nos testes; padrão `navigator.clipboard.writeText`. */
  copy?: (text: string) => Promise<void>;
  menuHref: string;
};

async function defaultCopy(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

type CopyState = "idle" | "failed";

export function PixPayment({ copy = defaultCopy, menuHref, now = Date.now, pix }: PixPaymentProps) {
  const [secondsLeft, setSecondsLeft] = useState(() => pixSecondsLeft(pix.expiresAt, now()));
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const toast = useToast();

  useEffect(() => {
    setSecondsLeft(pixSecondsLeft(pix.expiresAt, now()));
    if (pix.state !== "pending") return;
    const timer = setInterval(() => setSecondsLeft(pixSecondsLeft(pix.expiresAt, now())), 1000);
    return () => clearInterval(timer);
  }, [now, pix.expiresAt, pix.state]);

  async function onCopy() {
    if (!pix.copyPaste) return;
    try {
      await copy(pix.copyPaste);
      setCopyState("idle");
      toast.success("Código copiado");
    } catch {
      setCopyState("failed");
    }
  }

  const waitingClock = pix.state === "pending" && secondsLeft === 0;
  const title = waitingClock ? "Conferindo o pagamento" : pixStateLabelPt(pix.state);

  return (
    <div className="grid gap-3">
      <h2 aria-live="polite" className="text-xl font-bold text-[var(--color-ink)]" id="pix-status">
        {pix.state === "paid" ? (
          <span className="inline-flex items-center gap-2">
            <CheckCircle
              aria-hidden
              className="text-[var(--color-primary)]"
              size={24}
              weight="fill"
            />
            {title}
          </span>
        ) : (
          title
        )}
      </h2>
      <p className="text-sm text-[var(--color-body)]">
        PIX de{" "}
        <strong className="tabular-nums text-[var(--color-ink)]">
          {formatBRL(pix.amountCents)}
        </strong>
      </p>

      {pix.state === "creating" ? (
        <p className="inline-flex items-center gap-2 text-sm text-[var(--color-body)]">
          <SpinnerGap aria-hidden className="animate-spin" size={18} />
          Gerando o código do PIX…
        </p>
      ) : null}

      {pix.state === "pending" && pix.copyPaste ? (
        <>
          <p className="text-sm text-[var(--color-body)]">
            Abra o app do seu banco, escolha pagar com PIX e leia o QR Code ou cole o código.
          </p>
          {pix.qrCodeDataUrl ? (
            <img
              alt="QR Code do PIX"
              className="mx-auto h-56 w-56 rounded-[var(--radius-md)] border border-[var(--color-hairline)] bg-white p-2"
              height={224}
              src={pix.qrCodeDataUrl}
              width={224}
            />
          ) : null}
          <label className="grid gap-1 text-sm" htmlFor="pix-copia-e-cola">
            <span className="font-bold text-[var(--color-ink)]">PIX copia e cola</span>
            <textarea
              className="foode-input min-h-20 resize-none break-all font-mono text-xs"
              id="pix-copia-e-cola"
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              rows={3}
              value={pix.copyPaste}
            />
          </label>
          <Button onClick={() => void onCopy()}>
            <span className="inline-flex items-center gap-2">
              <Copy aria-hidden size={20} weight="bold" />
              Copiar código
            </span>
          </Button>
          {/* Sucesso no Toast (decisão 74); falha fica aqui, junto do código a copiar. */}
          {copyState === "failed" ? (
            <p className="text-sm text-[var(--color-body)]" role="alert">
              Não deu para copiar. Selecione o código e copie manualmente.
            </p>
          ) : null}
          <p className="text-sm text-[var(--color-body)]">
            {secondsLeft > 0 ? (
              <>
                Expira em{" "}
                <span className="font-bold tabular-nums text-[var(--color-ink)]">
                  {formatCountdownPt(secondsLeft)}
                </span>
              </>
            ) : (
              "O prazo deste código acabou. Estamos conferindo se o pagamento entrou."
            )}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            Assim que o pagamento cair, esta página mostra a confirmação e o Pedido segue para a
            Loja.
          </p>
        </>
      ) : null}

      {pix.state === "paid" ? (
        <p className="text-sm text-[var(--color-body)]">
          Recebemos o seu PIX. O Pedido já foi para a Loja.
        </p>
      ) : null}

      {pix.state === "expired" || pix.state === "failed" ? (
        <>
          <p className="text-sm text-[var(--color-body)]">
            {pix.state === "expired"
              ? "O prazo para pagar acabou e o Pedido não foi enviado à Loja. Se você já pagou, aguarde: a confirmação aparece aqui."
              : "O Pedido não foi enviado à Loja. Faça o pedido de novo."}
          </p>
          <Button href={menuHref} variant="secondary">
            Fazer o pedido de novo
          </Button>
        </>
      ) : null}
    </div>
  );
}
