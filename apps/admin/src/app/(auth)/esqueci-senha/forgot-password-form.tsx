"use client";

import { Button, useToast } from "@foode/ui";
import type { RequestPasswordResetInput } from "@foode/shared/auth";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { useFocusFirstError } from "../../../components/action-form";
import { Field, Notice } from "../../../components/form";
import { Turnstile, type TurnstileHandle } from "../../../components/turnstile";
import { AUTH_FAILURE_MESSAGES, requestPasswordReset } from "../../../lib/auth-client";
import { parsePasswordResetRequest, type FieldErrors } from "../../../lib/auth-forms";

export function ForgotPasswordForm({ siteKey }: { siteKey: string }) {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors<RequestPasswordResetInput>>({});
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstError(formRef, errors);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const turnstile = useRef<TurnstileHandle>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = parsePasswordResetRequest({
      email: form.get("email"),
      turnstileToken: turnstileToken ?? "",
    });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setPending(true);
    const outcome = await requestPasswordReset(parsed.data);
    setPending(false);
    if (outcome.ok) {
      setSent(true);
      return;
    }
    setErrors({});
    toast.error(AUTH_FAILURE_MESSAGES[outcome.error]);
    turnstile.current?.reset();
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <Notice tone="success">
          Se o e-mail estiver cadastrado, o link para criar a senha nova chega em instantes. Confira
          também a caixa de spam.
        </Notice>
        <Button href="/entrar" variant="secondary" className="w-full">
          Voltar para entrar
        </Button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5">
      <Field
        id="email"
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        error={errors.email}
      />
      <Turnstile ref={turnstile} siteKey={siteKey} onToken={setTurnstileToken} />
      {errors.turnstileToken ? <Notice tone="error">{errors.turnstileToken}</Notice> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Enviando..." : "Enviar link"}
      </Button>
      <p className="text-center text-sm">
        <Link
          href="/entrar"
          className="font-bold text-[var(--color-primary-strong)] underline-offset-4 hover:underline"
        >
          Lembrei a senha
        </Link>
      </p>
    </form>
  );
}
