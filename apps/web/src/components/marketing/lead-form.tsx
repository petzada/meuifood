"use client";

// Formulário curto de lead (decisão 70): nome, WhatsApp, loja, cidade, pedidos/dia. Valida
// no cliente com o mesmo `parseLeadInput` do route handler e envia para `POST /contato/lead`
// com o token do Turnstile (a api confere o token e o rate limit por IP). Falha vira uma
// mensagem com o atalho do WhatsApp (nunca perde o lead em silêncio).
import { Button, Field, Input, Select } from "@foode/ui";
import { useId, useRef, useState, type FormEvent } from "react";

import { Turnstile, type TurnstileHandle } from "../turnstile";

import { FALAR_PATH, LEAD_PATH } from "../../content/site";
import {
  LEAD_UNAVAILABLE_MESSAGE,
  ORDERS_PER_DAY_LABELS,
  ORDERS_PER_DAY_OPTIONS,
  parseLeadInput,
  type LeadFieldErrors,
  type LeadResponse,
} from "../../lib/lead";

export type LeadFormProps = {
  /** Origem do lead (seção/UTM), gravada com o contato. */
  source?: string;
  /** Transporte injetável nos testes; padrão `fetch` global. */
  submit?: (input: unknown) => Promise<LeadResponse>;
  /**
   * Site key pública do Turnstile (`turnstileSiteKey()`). Ausente = sem widget (testes); vazia
   * em produção = o widget avisa "indisponível" e a api recusa sem token.
   */
  turnstileSiteKey?: string;
};

const CAPTCHA_PENDING_MESSAGE = "Conclua a verificação de segurança antes de enviar.";

async function defaultSubmit(input: unknown): Promise<LeadResponse> {
  const response = await fetch(LEAD_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => null)) as LeadResponse | null;
  if (body && typeof body === "object" && "ok" in body) return body;
  return { ok: false, kind: "unavailable", message: LEAD_UNAVAILABLE_MESSAGE };
}

type Status =
  { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "failed"; message: string };

export function LeadForm({
  source = "landing",
  submit = defaultSubmit,
  turnstileSiteKey,
}: LeadFormProps) {
  const [errors, setErrors] = useState<LeadFieldErrors>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const headingId = useId();
  const withCaptcha = turnstileSiteKey !== undefined;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form).entries());
    const parsed = parseLeadInput({ ...raw, source });
    if (!parsed.success) {
      setErrors(parsed.errors);
      setStatus({ kind: "idle" });
      return;
    }
    setErrors({});
    if (withCaptcha && !turnstileToken) {
      setStatus({ kind: "failed", message: CAPTCHA_PENDING_MESSAGE });
      return;
    }
    setStatus({ kind: "sending" });
    const payload = withCaptcha ? { ...parsed.data, turnstileToken } : parsed.data;
    // Cada token vale uma verificação: pede outro para a próxima tentativa.
    if (withCaptcha) turnstile.current?.reset();
    try {
      const result = await submit(payload);
      if (result.ok) {
        setStatus({ kind: "sent" });
        form.reset();
      } else if (result.kind === "invalid") {
        setErrors(result.errors);
        setStatus({ kind: "idle" });
      } else {
        setStatus({ kind: "failed", message: result.message });
      }
    } catch {
      setStatus({ kind: "failed", message: LEAD_UNAVAILABLE_MESSAGE });
    }
  }

  if (status.kind === "sent") {
    return (
      <div className="foode-outline grid gap-2 p-6" role="status">
        <p className="font-bold text-[var(--color-ink)]">Recebemos seu contato.</p>
        <p className="text-sm text-[var(--color-body)]">
          A Foode responde pelo WhatsApp que você informou.
        </p>
      </div>
    );
  }

  return (
    <form
      aria-labelledby={headingId}
      className="foode-outline grid gap-4 p-6"
      noValidate
      onSubmit={onSubmit}
    >
      <h3 className="mk-h3" id={headingId}>
        Conte como é o seu delivery
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field {...(errors.name ? { error: errors.name } : {})} label="Seu nome">
          {(a11y) => <Input {...a11y} autoComplete="name" name="name" required />}
        </Field>
        <Field {...(errors.whatsapp ? { error: errors.whatsapp } : {})} label="Seu WhatsApp">
          {(a11y) => (
            <Input
              {...a11y}
              autoComplete="tel"
              inputMode="tel"
              name="whatsapp"
              placeholder="(11) 99999-9999"
              required
            />
          )}
        </Field>
        <Field {...(errors.storeName ? { error: errors.storeName } : {})} label="Nome da loja">
          {(a11y) => <Input {...a11y} autoComplete="organization" name="storeName" required />}
        </Field>
        <Field {...(errors.city ? { error: errors.city } : {})} label="Cidade">
          {(a11y) => <Input {...a11y} autoComplete="address-level2" name="city" required />}
        </Field>
      </div>
      <Field
        {...(errors.ordersPerDay ? { error: errors.ordersPerDay } : {})}
        label="Pedidos por dia"
      >
        {(a11y) => (
          <Select {...a11y} defaultValue="" name="ordersPerDay" required>
            <option disabled value="">
              Escolha
            </option>
            {ORDERS_PER_DAY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {ORDERS_PER_DAY_LABELS[option]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {withCaptcha ? (
        <Turnstile onToken={setTurnstileToken} ref={turnstile} siteKey={turnstileSiteKey} />
      ) : null}
      {status.kind === "failed" ? (
        <p
          className="foode-outline border-[var(--color-error)] p-3 text-sm text-[var(--color-body)]"
          role="alert"
        >
          {status.message}{" "}
          <a className="font-bold text-[var(--color-primary-strong)]" href={FALAR_PATH}>
            Chamar no WhatsApp
          </a>
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button className="w-full sm:w-auto" disabled={status.kind === "sending"} type="submit">
          {status.kind === "sending" ? "Enviando…" : "Quero falar com a Foode"}
        </Button>
        <a className="text-sm font-bold text-[var(--color-primary-strong)]" href={FALAR_PATH}>
          ou chame no WhatsApp
        </a>
      </div>
      <p className="text-xs text-[var(--color-muted)]">
        Usamos seus dados só para responder a este contato.{" "}
        <a className="underline" href="/privacidade">
          Política de privacidade
        </a>
      </p>
    </form>
  );
}
