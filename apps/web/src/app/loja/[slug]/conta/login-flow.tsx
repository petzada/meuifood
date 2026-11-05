"use client";

// Entrada do Consumidor por código no WhatsApp (Ticket 13, decisão 65): telefone → código de 4
// dígitos (`one-time-code`, reenvio após 30 s com contador, 5 tentativas com as mensagens do
// contrato) → no 1º acesso, nome + CPF (máscara e validação local; a api valida de novo).
// Login indisponível (sem secrets da whatsmiau) é uma mensagem controlada: quem embute o fluxo
// (Storefront, checkout) segue funcionando como Guest. Nenhum erro revela se o telefone tem conta.
import {
  LOGIN_CODE_LENGTH,
  LOGIN_CODE_RESEND_SECONDS,
  customerErrorMessagePt,
  type CustomerAccountView,
  type CustomerError,
} from "@foode/shared/customer";
import { Button, Field, Input } from "@foode/ui";
import { SpinnerGap } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Turnstile, type TurnstileHandle } from "../../../../components/turnstile";
import { storefrontSupportChatActive } from "../../../../lib/support-widget";
import { formatPhoneBr } from "../finalizar/checkout-state";
import { createAccountApi, type AccountApi, type AccountResult } from "./account-api";
import {
  codeError,
  formatCodeInput,
  formatCpfInput,
  phoneError,
  resendSecondsLeft,
  validateSignup,
  type SignupErrors,
} from "./login-state";

export type LoginFlowProps = {
  /** Injetável nos testes; por padrão fala com `/conta/*`. */
  api?: AccountApi;
  /** Telefone já digitado no checkout (decisão 68). */
  initialPhone?: string;
  /** Relógio injetável (contador de reenvio). */
  now?: () => number;
  onSignedIn: (account: CustomerAccountView) => void;
  /** Site key pública do Turnstile; vazia = login indisponível. */
  siteKey: string;
  /**
   * Widget de suporte ligado no Storefront (decisão 66): muda a mensagem do conflito. Sem a prop,
   * vale a configuração do widget (`NEXT_PUBLIC_SUPPORT_WIDGET_*`) na página atual.
   */
  supportChatActive?: boolean;
  /** Telefone verificado aguardando nome + CPF (sessão `signup_required` já aberta). */
  startAtSignup?: boolean;
};

type Step = "phone" | "code" | "signup";

const UNAVAILABLE_MESSAGE =
  "Não conseguimos falar com o servidor agora. Tente de novo em instantes.";

function messageFor(
  result: Exclude<AccountResult<unknown>, { kind: "ok" }>,
  supportChatActive: boolean | undefined,
): string {
  if (result.kind !== "error") return UNAVAILABLE_MESSAGE;
  const chat =
    supportChatActive ??
    storefrontSupportChatActive(typeof window === "undefined" ? null : window.location.pathname);
  return customerErrorMessagePt(result.error, { supportChatActive: chat });
}

export function LoginFlow({
  api: apiProp,
  initialPhone = "",
  now = () => Date.now(),
  onSignedIn,
  siteKey,
  startAtSignup = false,
  supportChatActive,
}: LoginFlowProps) {
  const api = useMemo(() => apiProp ?? createAccountApi(), [apiProp]);
  const [step, setStep] = useState<Step>(startAtSignup ? "signup" : "phone");
  const [phone, setPhone] = useState(() => formatPhoneBr(initialPhone));
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [signupErrors, setSignupErrors] = useState<SignupErrors>({});
  const [fieldError, setFieldError] = useState<string | null>(null);
  /** Mensagem controlada (login indisponível, limite, conflito): `role="alert"` inline. */
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [resendAfter, setResendAfter] = useState(LOGIN_CODE_RESEND_SECONDS);
  const [nowMs, setNowMs] = useState(now);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const codeInputId = useId();
  const codeInput = {
    focus: () => document.getElementById(codeInputId)?.focus(),
  };

  const clock = useRef(now);
  clock.current = now;

  const secondsLeft = sentAt === null ? 0 : resendSecondsLeft(sentAt, nowMs, resendAfter);

  // Contador do reenvio: um tique por segundo enquanto houver espera.
  useEffect(() => {
    if (step !== "code" || secondsLeft === 0) return;
    const timer = setInterval(() => setNowMs(clock.current()), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft, step]);

  useEffect(() => {
    if (step === "code") codeInput.focus();
  }, [step]);

  function consumeToken(): string | null {
    const token = turnstileToken;
    setTurnstileToken(null);
    turnstile.current?.reset();
    return token;
  }

  async function requestCode() {
    const error = phoneError(phone);
    if (error) {
      setFieldError(error);
      return;
    }
    if (!turnstileToken) {
      setNotice("Aguarde a verificação de segurança e tente de novo.");
      return;
    }
    setBusy(true);
    setNotice(null);
    setFieldError(null);
    const result = await api.requestCode({ phone, turnstileToken: consumeToken() ?? "" });
    setBusy(false);
    if (result.kind !== "ok") {
      setNotice(messageFor(result, supportChatActive));
      return;
    }
    setResendAfter(result.data.resendAfterSeconds);
    const sent = now();
    setSentAt(sent);
    setNowMs(sent);
    setCode("");
    setStep("code");
  }

  async function finishSignedIn() {
    const session = await api.session();
    if (session.kind === "ok" && session.data.state === "signed_in") {
      onSignedIn(session.data.account);
      return;
    }
    if (session.kind === "ok" && session.data.state === "signup_required") {
      setStep("signup");
      return;
    }
    setNotice(UNAVAILABLE_MESSAGE);
  }

  async function verifyCode() {
    const error = codeError(code);
    if (error) {
      setFieldError(error);
      return;
    }
    if (!turnstileToken) {
      setNotice("Aguarde a verificação de segurança e tente de novo.");
      return;
    }
    setBusy(true);
    setNotice(null);
    setFieldError(null);
    const result = await api.verifyCode({ code, phone, turnstileToken: consumeToken() ?? "" });
    if (result.kind !== "ok") {
      setBusy(false);
      const message = messageFor(result, supportChatActive);
      const codeIssue: ReadonlySet<CustomerError["error"]> = new Set([
        "code_invalid",
        "code_expired",
        "code_attempts_exhausted",
      ]);
      if (result.kind === "error" && codeIssue.has(result.error.error)) {
        setFieldError(message);
        setCode("");
        codeInput.focus();
      } else {
        setNotice(message);
      }
      return;
    }
    if (result.data.status === "signup_required") {
      setBusy(false);
      setStep("signup");
      return;
    }
    await finishSignedIn();
    setBusy(false);
  }

  async function submitSignup() {
    const validation = validateSignup({ cpf, name });
    setSignupErrors(validation.errors);
    if (!validation.ok) return;
    setBusy(true);
    setNotice(null);
    const result = await api.signup({ cpf, name: name.trim() });
    setBusy(false);
    if (result.kind !== "ok") {
      setNotice(messageFor(result, supportChatActive));
      return;
    }
    if (result.data.state === "signed_in") onSignedIn(result.data.account);
    else setNotice(UNAVAILABLE_MESSAGE);
  }

  const alert = notice ? (
    <p className="text-sm font-bold text-[var(--color-error)]" role="alert">
      {notice}
    </p>
  ) : null;

  const spinner = busy ? (
    <SpinnerGap aria-hidden className="animate-spin" size={18} weight="bold" />
  ) : null;

  if (step === "signup") {
    return (
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submitSignup();
        }}
      >
        <p className="text-sm text-[var(--color-body)]">
          WhatsApp confirmado. Para criar sua conta Foode, falta só nome e CPF — a conta vale em
          qualquer Loja.
        </p>
        <Field
          {...(signupErrors.name ? { error: signupErrors.name } : {})}
          label="Nome e sobrenome"
        >
          {(a11y) => (
            <Input
              {...a11y}
              autoComplete="name"
              name="name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          )}
        </Field>
        <Field
          {...(signupErrors.cpf ? { error: signupErrors.cpf } : {})}
          hint="Só para identificar sua conta: nunca aparece para a Loja."
          label="CPF"
        >
          {(a11y) => (
            <Input
              {...a11y}
              autoComplete="off"
              inputMode="numeric"
              name="cpf"
              onChange={(event) => setCpf(formatCpfInput(event.target.value))}
              placeholder="000.000.000-00"
              value={cpf}
            />
          )}
        </Field>
        {alert}
        <Button aria-busy={busy ? true : undefined} disabled={busy} type="submit">
          <span className="inline-flex items-center justify-center gap-2">
            {spinner}
            Criar minha conta
          </span>
        </Button>
      </form>
    );
  }

  if (step === "code") {
    return (
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void verifyCode();
        }}
      >
        <p className="text-sm text-[var(--color-body)]">
          Enviamos um código de {LOGIN_CODE_LENGTH} dígitos no WhatsApp{" "}
          <strong className="text-[var(--color-ink)]">{phone}</strong>. Ele vale por 5 minutos.{" "}
          <button
            className="font-bold text-[var(--color-primary-strong)] underline-offset-2 hover:underline"
            onClick={() => {
              setStep("phone");
              setFieldError(null);
              setNotice(null);
            }}
            type="button"
          >
            Trocar número
          </button>
        </p>
        <Field {...(fieldError ? { error: fieldError } : {})} id={codeInputId} label="Código">
          {(a11y) => (
            <Input
              {...a11y}
              autoComplete="one-time-code"
              className="tracking-[0.4em]"
              inputMode="numeric"
              maxLength={LOGIN_CODE_LENGTH}
              name="code"
              onChange={(event) => setCode(formatCodeInput(event.target.value))}
              pattern="[0-9]*"
              value={code}
            />
          )}
        </Field>
        <Turnstile onToken={setTurnstileToken} ref={turnstile} siteKey={siteKey} />
        {alert}
        <Button aria-busy={busy ? true : undefined} disabled={busy} type="submit">
          <span className="inline-flex items-center justify-center gap-2">
            {spinner}
            Confirmar código
          </span>
        </Button>
        <p className="text-sm text-[var(--color-muted)]" aria-live="polite">
          {secondsLeft > 0 ? (
            `Reenviar código em ${secondsLeft} s`
          ) : (
            <button
              className="font-bold text-[var(--color-primary-strong)] underline-offset-2 hover:underline disabled:opacity-60"
              disabled={busy}
              onClick={() => void requestCode()}
              type="button"
            >
              Reenviar código
            </button>
          )}
        </p>
      </form>
    );
  }

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void requestCode();
      }}
    >
      <p className="text-sm text-[var(--color-body)]">
        Você recebe um código no WhatsApp. Sem senha: a conta vale em qualquer Loja da Foode.
      </p>
      <Field {...(fieldError ? { error: fieldError } : {})} label="WhatsApp">
        {(a11y) => (
          <Input
            {...a11y}
            autoComplete="tel-national"
            inputMode="tel"
            name="phone"
            onChange={(event) => setPhone(formatPhoneBr(event.target.value))}
            placeholder="(11) 91234-5678"
            type="tel"
            value={phone}
          />
        )}
      </Field>
      <Turnstile onToken={setTurnstileToken} ref={turnstile} siteKey={siteKey} />
      {alert}
      <Button aria-busy={busy ? true : undefined} disabled={busy} type="submit">
        <span className="inline-flex items-center justify-center gap-2">
          {spinner}
          Receber código
        </span>
      </Button>
    </form>
  );
}
