"use client";

// Bloco do Cartão na página do Pedido (Ticket 27, DIRETRIZES-UX-CLIENTE §6 Cartão): estados
// processando / em análise / aprovado / recusado em `aria-live`; no recusado, o motivo exibível
// (código nosso, nunca o texto do provedor) e as ações do contrato: "Tentar outro cartão"
// (formulário inline, tokenizado no navegador, enviado à rota de nova tentativa com `attemptKey`
// novo) e "Pagar com PIX" (troca o Pedido para PIX na mesma página, sem refazer o pedido; o bloco
// do PIX do Ticket 26 aparece depois que a página recarrega o estado). Com Consumidor logado e SDK
// que permite, o CPF da conta vem pré-escolhido (decisão 65). Regras e rótulos vêm de
// @foode/shared/payment; aqui só a apresentação.
import { formatBRL } from "@foode/shared/money";
import {
  cardDeclineMessagePt,
  cardStateLabelPt,
  isCardAwaiting,
  type OrderCard,
} from "@foode/shared/payment";
import { Button } from "@foode/ui";
import { CheckCircle, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { CardFields, type CardFieldsHandle } from "../../finalizar/card-fields";
import {
  CARD_FIELDS,
  buildCardPaymentInput,
  describeCard,
  firstCardError,
  initialCardForm,
  validateCardForm,
  type CardField,
  type CardFormValues,
} from "../../finalizar/card-form-state";
import { CardSdkError, type CardSdkFactory } from "../../finalizar/card-tokenizer";
import {
  cardRetryErrorMessagePt,
  createCardRetryApi,
  pixSwitchErrorMessagePt,
  type CardRetryApi,
  type CardRetryRequestInput,
} from "./card-api";

export type CardPaymentProps = {
  /** Injetável nos testes; por padrão fala com `/loja/{slug}/pedido/{token}/cartao`. */
  api?: CardRetryApi;
  card: OrderCard;
  /** CPF mascarado da conta do Consumidor logado (decisão 65); null = sem conta ou sem CPF. */
  cpfMasked?: string | null;
  /** Nome do pagador para o SDK hospedado (o Pedido expõe só o primeiro nome). */
  customerName: string;
  /** Relógio injetável (validade do cartão). */
  now?: () => number;
  /** Chamado depois de uma nova tentativa aceita: a página volta a consultar o estado. */
  onRetried: () => void;
  /**
   * Chamado depois de "Pagar com PIX" aceito: a página recarrega o Pedido (agora `pix`) e mostra
   * o bloco do PIX. Resolve `false` se não conseguiu recarregar (o bloco pede para atualizar).
   */
  onPixSwitched: () => Promise<boolean>;
  sdkFactory?: CardSdkFactory;
  storeSlug: string;
  token: string;
};

const retryFieldId = (field: CardField) => `retry-card-${field}`;

export function CardPayment({
  api: apiProp,
  card,
  cpfMasked = null,
  customerName,
  now = Date.now,
  onPixSwitched,
  onRetried,
  sdkFactory,
  storeSlug,
  token,
}: CardPaymentProps) {
  const api = apiProp ?? createCardRetryApi();
  const [retrying, setRetrying] = useState(false);
  const [values, setValues] = useState<CardFormValues>(() =>
    initialCardForm(card.tokenizer?.sdk, cpfMasked),
  );
  const [touched, setTouched] = useState<ReadonlySet<CardField>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Pagar com PIX": enquanto troca, e o aviso quando trocou mas a página não recarregou.
  const [switchingPix, setSwitchingPix] = useState(false);
  const [pixError, setPixError] = useState<string | null>(null);
  const [pixSwitched, setPixSwitched] = useState(false);
  // Uma chave por tentativa (idempotência): nasce ao abrir o formulário e troca após cada envio.
  const [attemptKey, setAttemptKey] = useState<string | null>(null);
  // Foco no CPF depois que o campo digitável volta a existir (422 `account_cpf_unavailable`).
  const [focusCpf, setFocusCpf] = useState(false);
  useEffect(() => {
    if (!focusCpf) return;
    document.getElementById(retryFieldId("cpf"))?.focus();
    setFocusCpf(false);
  }, [focusCpf]);
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
    setPixError(null);
  }

  async function payWithPix() {
    if (switchingPix || sending) return;
    setSwitchingPix(true);
    setPixError(null);
    const result = await api.payWithPix(storeSlug, token);
    if (result.kind === "ok") {
      const reloaded = await onPixSwitched();
      setSwitchingPix(false);
      // Recarregou: este bloco sai da tela e o do PIX entra. Senão, orienta a atualizar.
      if (!reloaded) setPixSwitched(true);
      return;
    }
    setSwitchingPix(false);
    setPixError(
      result.kind === "error"
        ? pixSwitchErrorMessagePt(result.error)
        : "Não conseguimos trocar para PIX agora. Tente de novo em instantes.",
    );
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
      setValues(initialCardForm(tokenizer.sdk, cpfMasked));
      setTouched(new Set());
      setShowAll(false);
      onRetried();
      return;
    }
    if (result.kind === "error" && result.error === "account_cpf_unavailable") {
      // CPF da conta indisponível no servidor: volta ao campo digitável e pede o CPF.
      setValues((current) => ({ ...current, cpf: "", useAccountCpf: false }));
      setError(cardRetryErrorMessagePt(result.error));
      setFocusCpf(true);
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
                <Button disabled={switchingPix} onClick={openRetry}>
                  Tentar outro cartão
                </Button>
              ) : null}
              {canPix ? (
                <Button
                  aria-busy={switchingPix ? true : undefined}
                  disabled={switchingPix || pixSwitched}
                  onClick={() => void payWithPix()}
                  variant={canRetryCard && tokenizer ? "secondary" : "primary"}
                >
                  <span className="inline-flex items-center gap-2">
                    {switchingPix ? (
                      <SpinnerGap aria-hidden className="animate-spin" size={20} />
                    ) : null}
                    {switchingPix ? "Trocando para PIX…" : "Pagar com PIX"}
                  </span>
                </Button>
              ) : null}
            </div>
          ) : null}
          {canPix && !retrying ? (
            <p className="text-xs text-[var(--color-muted)]">
              Pagar com PIX mantém este Pedido, o total e a tarifa: o código aparece aqui mesmo.
            </p>
          ) : null}
          {pixSwitched ? (
            <p className="text-sm font-bold text-[var(--color-ink)]" role="status">
              Trocamos para PIX. Atualize a página para ver o código de pagamento.
            </p>
          ) : null}
          {pixError ? (
            <p className="text-sm font-bold text-[var(--color-error)]" role="alert">
              {pixError}
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
            cpfMasked={cpfMasked}
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
