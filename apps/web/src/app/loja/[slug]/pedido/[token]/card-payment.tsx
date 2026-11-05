"use client";

// Bloco do Cartão na página do Pedido (Ticket 27, DIRETRIZES-UX-CLIENTE §6 Cartão): estados
// processando / em análise / aprovado / recusado em `aria-live`; no recusado, o motivo exibível
// (código nosso, nunca o texto do provedor) e as ações do contrato: "Tentar outro cartão"
// (formulário inline, tokenizado no navegador, enviado à rota de nova tentativa com `attemptKey`
// novo) e "Pagar com PIX". Regras e rótulos vêm de @foode/shared/payment; aqui só a apresentação.
import { formatBRL } from "@foode/shared/money";
import {
  cardDeclineMessagePt,
  cardStateLabelPt,
  isCardAwaiting,
  type OrderCard,
} from "@foode/shared/payment";
import { Button } from "@foode/ui";
import { CheckCircle, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { useRef, useState } from "react";

import { CardFields, type CardFieldsHandle } from "../../finalizar/card-fields";
import {
  CARD_FIELDS,
  buildCardPaymentInput,
  describeCard,
  emptyCardForm,
  firstCardError,
  validateCardForm,
  type CardField,
  type CardFormValues,
} from "../../finalizar/card-form-state";
import { CardSdkError, type CardSdkFactory } from "../../finalizar/card-tokenizer";
import {
  cardRetryErrorMessagePt,
  createCardRetryApi,
  type CardRetryApi,
  type CardRetryRequestInput,
} from "./card-api";

export type CardPaymentProps = {
  /** Injetável nos testes; por padrão fala com `/loja/{slug}/pedido/{token}/cartao`. */
  api?: CardRetryApi;
  card: OrderCard;
  /** Nome do pagador para o SDK hospedado (o Pedido expõe só o primeiro nome). */
  customerName: string;
  menuHref: string;
  /** Relógio injetável (validade do cartão). */
  now?: () => number;
  /** Chamado depois de uma nova tentativa aceita: a página volta a consultar o estado. */
  onRetried: () => void;
  sdkFactory?: CardSdkFactory;
  storeSlug: string;
  token: string;
};

const retryFieldId = (field: CardField) => `retry-card-${field}`;

export function CardPayment({
  api: apiProp,
  card,
  customerName,
  menuHref,
  now = Date.now,
  onRetried,
  sdkFactory,
  storeSlug,
  token,
}: CardPaymentProps) {
  const api = apiProp ?? createCardRetryApi();
  const [retrying, setRetrying] = useState(false);
  const [values, setValues] = useState<CardFormValues>(emptyCardForm);
  const [touched, setTouched] = useState<ReadonlySet<CardField>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Uma chave por tentativa (idempotência): nasce ao abrir o formulário e troca após cada envio.
  const [attemptKey, setAttemptKey] = useState<string | null>(null);
  const fields = useRef<CardFieldsHandle>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);

  const tokenizer = card.tokenizer;
  const canRetryCard = card.state === "declined" && card.retryActions.includes("other_card");
  const canPix = card.state === "declined" && card.retryActions.includes("pix");
  const errors = tokenizer ? validateCardForm(values, tokenizer.sdk, new Date(now())) : {};
  const visibleErrors = Object.fromEntries(
    CARD_FIELDS.filter((field) => showAll || touched.has(field)).map((f) => [f, errors[f]]),
  );

  function openRetry() {
    setRetrying(true);
    setAttemptKey(crypto.randomUUID());
    setError(null);
  }

  async function submitRetry() {
    if (sending || !tokenizer || !attemptKey) return;
    const first = firstCardError(errors);
    if (first) {
      setShowAll(true);
      setError("Confira os campos destacados.");
      document.getElementById(retryFieldId(first))?.focus();
      return;
    }
    setSending(true);
    setError(null);
    let body: CardRetryRequestInput;
    try {
      const tokenized = await fields.current!.tokenize({ name: customerName });
      body = { attemptKey, card: buildCardPaymentInput(tokenizer.sdk, tokenized, values) };
    } catch (caught) {
      setSending(false);
      setError(
        caught instanceof CardSdkError
          ? caught.message
          : "Não foi possível confirmar o cartão. Tente de novo em instantes.",
      );
      alertRef.current?.focus();
      return;
    }
    const result = await api.retry(storeSlug, token, body);
    setSending(false);
    // Token de uso único: toda nova tentativa tokeniza de novo com chave nova.
    setAttemptKey(crypto.randomUUID());
    if (result.kind === "ok") {
      setRetrying(false);
      setValues(emptyCardForm);
      setTouched(new Set());
      setShowAll(false);
      onRetried();
      return;
    }
    setError(
      result.kind === "error"
        ? cardRetryErrorMessagePt(result.error)
        : "Não conseguimos enviar o novo cartão agora. Tente de novo em instantes.",
    );
    alertRef.current?.focus();
  }

  const title = cardStateLabelPt(card.state);
  const awaiting = isCardAwaiting(card.state);

  return (
    <div className="grid gap-3">
      <h2 aria-live="polite" className="text-xl font-bold text-[var(--color-ink)]" id="card-status">
        <span className="inline-flex items-center gap-2">
          {card.state === "approved" ? (
            <CheckCircle
              aria-hidden
              className="text-[var(--color-primary)]"
              size={24}
              weight="fill"
            />
          ) : null}
          {card.state === "declined" ? (
            <WarningCircle
              aria-hidden
              className="text-[var(--color-error)]"
              size={24}
              weight="fill"
            />
          ) : null}
          {awaiting ? <SpinnerGap aria-hidden className="animate-spin" size={22} /> : null}
          {title}
        </span>
      </h2>
      <p className="text-sm text-[var(--color-body)]">
        {describeCard(card.brand, card.lastFour)} · à vista ·{" "}
        <strong className="tabular-nums text-[var(--color-ink)]">
          {formatBRL(card.amountCents)}
        </strong>
      </p>

      {card.state === "processing" ? (
        <p className="text-sm text-[var(--color-body)]">
          Estamos enviando o pagamento ao processador do cartão. Isso leva poucos segundos.
        </p>
      ) : null}
      {card.state === "pending" ? (
        <p className="text-sm text-[var(--color-body)]">
          O banco do cartão está analisando o pagamento. Assim que aprovar, o Pedido segue para a
          Loja e esta página mostra a confirmação.
        </p>
      ) : null}
      {card.state === "approved" ? (
        <p className="text-sm text-[var(--color-body)]">
          Pagamento aprovado. O Pedido já foi para a Loja.
        </p>
      ) : null}

      {card.state === "declined" ? (
        <>
          <p className="text-sm text-[var(--color-body)]">
            {cardDeclineMessagePt(card.declineReason ?? "unknown")} O Pedido ainda não foi enviado à
            Loja.
          </p>
          {!retrying ? (
            <div className="flex flex-wrap gap-2">
              {canRetryCard && tokenizer ? (
                <Button onClick={openRetry}>Tentar outro cartão</Button>
              ) : null}
              {canPix ? (
                <Button
                  href={menuHref}
                  variant={canRetryCard && tokenizer ? "secondary" : "primary"}
                >
                  Pagar com PIX
                </Button>
              ) : null}
            </div>
          ) : null}
          {canPix ? (
            <p className="text-xs text-[var(--color-muted)]">
              Para pagar com PIX, faça o pedido de novo escolhendo PIX no pagamento.
            </p>
          ) : null}
        </>
      ) : null}

      {retrying && tokenizer ? (
        <form
          aria-label="Novo cartão"
          className="grid gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submitRetry();
          }}
        >
          <CardFields
            amountCents={card.amountCents}
            errors={visibleErrors}
            fieldId={retryFieldId}
            onBlur={(field) =>
              setTouched((current) => (current.has(field) ? current : new Set(current).add(field)))
            }
            onChange={(patch) => {
              setValues((current) => ({ ...current, ...patch }));
              setError(null);
            }}
            ref={fields}
            {...(sdkFactory ? { sdkFactory } : {})}
            tokenizer={tokenizer}
            values={values}
          />
          <p
            aria-live="assertive"
            className={["text-sm font-bold text-[var(--color-error)]", !error && "sr-only"]
              .filter(Boolean)
              .join(" ")}
            ref={alertRef}
            role="alert"
            tabIndex={-1}
          >
            {error}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button aria-busy={sending ? true : undefined} disabled={sending} type="submit">
              <span className="inline-flex items-center gap-2">
                {sending ? <SpinnerGap aria-hidden className="animate-spin" size={20} /> : null}
                {sending ? "Enviando…" : `Pagar ${formatBRL(card.amountCents)}`}
              </span>
            </Button>
            <Button
              disabled={sending}
              onClick={() => {
                setRetrying(false);
                setError(null);
              }}
              variant="secondary"
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
