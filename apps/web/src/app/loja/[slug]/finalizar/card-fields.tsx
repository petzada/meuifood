"use client";

// Formulário de Cartão de crédito à vista (Ticket 27; X5, §6 Cartão): aparece inline só com
// Cartão escolhido. Na Efí os campos são nossos (número, nome, validade, CVV) e vão só para o SDK
// na tokenização; na AbacatePay o SDK monta os campos no iframe dele. CPF e e-mail nos dois;
// data de nascimento só na Efí. O SDK é carregado sob demanda, quando este componente monta.
// `CardFieldsHandle.tokenize()` devolve só o token + bandeira/final 4: é o único caminho de saída.
import type { CardTokenizer } from "@foode/shared/payment";
import { Field, Input } from "@foode/ui";
import { LockSimple, SpinnerGap } from "@phosphor-icons/react";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

import {
  cardDigits,
  cardFieldsFor,
  cvvLengthFor,
  detectCardBrand,
  formatCardCvvInput,
  formatCardExpiryInput,
  formatCardNumberInput,
  formatCpfInput,
  parseCardExpiry,
  type CardField,
  type CardFormErrors,
  type CardFormValues,
  type CardTokenized,
  CARD_PAYMENT_BRAND_LABELS,
} from "./card-form-state";
import {
  CardSdkError,
  createCardSdk,
  toCardSdkError,
  type CardSdkFactory,
  type HostedCardFields,
} from "./card-tokenizer";

export type CardFieldsHandle = {
  /** Tokeniza no navegador. Rejeita com `CardSdkError` (mensagem pronta para a pessoa). */
  tokenize(payer: { name: string }): Promise<CardTokenized>;
};

export type CardFieldsProps = {
  /** Valor cobrado (total + tarifa), exigido pelo SDK hospedado. */
  amountCents: number;
  /** CPF mascarado da conta do Consumidor (decisão 65), como dica do campo. */
  cpfMasked?: string | null;
  errors: CardFormErrors;
  fieldId?: (field: CardField) => string;
  onBlur: (field: CardField) => void;
  onChange: (patch: Partial<CardFormValues>) => void;
  ref?: Ref<CardFieldsHandle>;
  /** Injetável nos testes; por padrão carrega o script oficial do provedor. */
  sdkFactory?: CardSdkFactory;
  tokenizer: CardTokenizer;
  values: CardFormValues;
};

const defaultFieldId = (field: CardField) => `card-${field}`;

type HostedPhase = "loading" | "ready" | "error";

export function CardFields({
  amountCents,
  cpfMasked = null,
  errors,
  fieldId = defaultFieldId,
  onBlur,
  onChange,
  ref,
  sdkFactory = createCardSdk,
  tokenizer,
  values,
}: CardFieldsProps) {
  const fields = cardFieldsFor(tokenizer.sdk);
  const brand = detectCardBrand(values.number);
  const hostRef = useRef<HTMLDivElement>(null);
  const hostedRef = useRef<HostedCardFields | null>(null);
  const [hostedPhase, setHostedPhase] = useState<HostedPhase>("loading");
  const latestValues = useRef(values);
  latestValues.current = values;

  // SDK sob demanda: campos próprios (Efí) baixam o script ao escolher Cartão; campos
  // hospedados (AbacatePay) montam no nosso elemento e desmontam ao sair.
  const hosted = tokenizer.sdk === "abacatepay";
  useEffect(() => {
    const client = sdkFactory(tokenizer);
    if (client.kind === "fields") {
      void client.preload?.().catch(() => undefined);
      return;
    }
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    setHostedPhase("loading");
    // Nó próprio: o SDK substitui o conteúdo do alvo e o React não pode perder o dele.
    const target = document.createElement("div");
    host.append(target);
    void client
      .mount(target, amountCents)
      .then((mounted) => {
        if (cancelled) {
          mounted.destroy();
          return;
        }
        hostedRef.current = mounted;
        setHostedPhase("ready");
      })
      .catch(() => {
        if (!cancelled) setHostedPhase("error");
      });
    return () => {
      cancelled = true;
      hostedRef.current?.destroy();
      hostedRef.current = null;
      target.remove();
    };
  }, [amountCents, sdkFactory, tokenizer]);

  useImperativeHandle(
    ref,
    () => ({
      async tokenize(payer) {
        const current = latestValues.current;
        const payerInput = {
          cpf: cardDigits(current.cpf),
          email: current.email.trim().toLowerCase(),
          name: payer.name,
        };
        if (hosted) {
          const mounted = hostedRef.current;
          if (!mounted) throw new CardSdkError("load_failed");
          return mounted.tokenize(payerInput);
        }
        const client = sdkFactory(tokenizer);
        if (client.kind !== "fields") throw new CardSdkError("load_failed");
        const expiry = parseCardExpiry(current.expiry);
        if (!expiry) throw new CardSdkError("card_invalid");
        try {
          return await client.tokenize({
            cvv: cardDigits(current.cvv),
            expirationMonth: expiry.month,
            expirationYear: expiry.year,
            holderDocument: payerInput.cpf,
            holderName: current.holderName.trim(),
            number: cardDigits(current.number),
          });
        } catch (error) {
          throw toCardSdkError(error);
        }
      },
    }),
    [hosted, sdkFactory, tokenizer],
  );

  const errorProps = (field: CardField): { error?: string } =>
    errors[field] ? { error: errors[field] } : {};

  return (
    <div className="foode-outline grid gap-4 p-4" role="group" aria-label="Cartão de crédito">
      <p className="inline-flex items-center gap-1.5 text-sm text-[var(--color-body)]">
        <LockSimple aria-hidden className="text-[var(--color-primary)]" size={16} weight="bold" />
        Pagamento à vista. Os dados do cartão ficam só no seu navegador e no processador do
        pagamento.
      </p>

      {hosted ? (
        <div className="grid gap-2">
          <p className="text-sm font-bold text-[var(--color-ink)]">Dados do cartão</p>
          <div
            aria-busy={hostedPhase === "loading" ? true : undefined}
            aria-label="Campos do cartão"
            className="min-h-14"
            ref={hostRef}
            role="group"
          />
          {hostedPhase === "loading" ? (
            <p
              className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]"
              role="status"
            >
              <SpinnerGap aria-hidden className="animate-spin" size={16} />
              Carregando os campos do cartão…
            </p>
          ) : null}
          {hostedPhase === "error" ? (
            <p className="text-sm font-bold text-[var(--color-error)]" role="alert">
              Não foi possível carregar os campos do cartão. Recarregue a página ou pague com PIX.
            </p>
          ) : null}
        </div>
      ) : null}

      {fields.includes("number") ? (
        <>
          <Field
            {...errorProps("number")}
            {...(brand ? { hint: CARD_PAYMENT_BRAND_LABELS[brand] } : {})}
            id={fieldId("number")}
            label="Número do cartão"
          >
            {(a11y) => (
              <Input
                {...a11y}
                autoComplete="cc-number"
                data-private
                inputMode="numeric"
                name="cardNumber"
                onBlur={() => onBlur("number")}
                onChange={(event) =>
                  onChange({ number: formatCardNumberInput(event.target.value) })
                }
                placeholder="0000 0000 0000 0000"
                value={values.number}
              />
            )}
          </Field>
          <Field {...errorProps("holderName")} id={fieldId("holderName")} label="Nome no cartão">
            {(a11y) => (
              <Input
                {...a11y}
                autoCapitalize="characters"
                autoComplete="cc-name"
                name="cardHolderName"
                onBlur={() => onBlur("holderName")}
                onChange={(event) => onChange({ holderName: event.target.value })}
                placeholder="Como está impresso"
                value={values.holderName}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field {...errorProps("expiry")} id={fieldId("expiry")} label="Validade">
              {(a11y) => (
                <Input
                  {...a11y}
                  autoComplete="cc-exp"
                  inputMode="numeric"
                  name="cardExpiry"
                  onBlur={() => onBlur("expiry")}
                  onChange={(event) =>
                    onChange({ expiry: formatCardExpiryInput(event.target.value) })
                  }
                  placeholder="MM/AA"
                  value={values.expiry}
                />
              )}
            </Field>
            <Field {...errorProps("cvv")} id={fieldId("cvv")} label="CVV">
              {(a11y) => (
                <Input
                  {...a11y}
                  autoComplete="cc-csc"
                  data-private
                  inputMode="numeric"
                  maxLength={cvvLengthFor(brand)}
                  name="cardCvv"
                  onBlur={() => onBlur("cvv")}
                  onChange={(event) =>
                    onChange({ cvv: formatCardCvvInput(event.target.value, brand) })
                  }
                  placeholder={brand === "amex" ? "0000" : "000"}
                  type="password"
                  value={values.cvv}
                />
              )}
            </Field>
          </div>
        </>
      ) : null}

      <Field
        {...errorProps("cpf")}
        hint={cpfMasked ? `CPF da sua conta: ${cpfMasked}` : "Do titular do cartão."}
        id={fieldId("cpf")}
        label="CPF do titular"
      >
        {(a11y) => (
          <Input
            {...a11y}
            autoComplete="off"
            inputMode="numeric"
            name="payerCpf"
            onBlur={() => onBlur("cpf")}
            onChange={(event) => onChange({ cpf: formatCpfInput(event.target.value) })}
            placeholder="000.000.000-00"
            value={values.cpf}
          />
        )}
      </Field>
      <Field
        {...errorProps("email")}
        hint="Para o recibo do pagamento."
        id={fieldId("email")}
        label="E-mail"
      >
        {(a11y) => (
          <Input
            {...a11y}
            autoComplete="email"
            inputMode="email"
            name="payerEmail"
            onBlur={() => onBlur("email")}
            onChange={(event) => onChange({ email: event.target.value })}
            placeholder="nome@exemplo.com"
            type="email"
            value={values.email}
          />
        )}
      </Field>
      {fields.includes("birthDate") ? (
        <Field
          {...errorProps("birthDate")}
          hint="Pedida pelo processador do cartão."
          id={fieldId("birthDate")}
          label="Data de nascimento do titular"
        >
          {(a11y) => (
            <Input
              {...a11y}
              autoComplete="bday"
              name="payerBirthDate"
              onBlur={() => onBlur("birthDate")}
              onChange={(event) => onChange({ birthDate: event.target.value })}
              type="date"
              value={values.birthDate}
            />
          )}
        </Field>
      ) : null}
    </div>
  );
}
