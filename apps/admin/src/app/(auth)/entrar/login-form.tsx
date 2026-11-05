"use client";

import { Button } from "@foode/ui";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { Field, Notice } from "../../../components/form";
import { Turnstile, type TurnstileHandle } from "../../../components/turnstile";
import { AUTH_FAILURE_MESSAGES, signInWithEmail } from "../../../lib/auth-client";
import { parseLoginForm, type FieldErrors } from "../../../lib/auth-forms";
import type { LoginInput } from "@foode/shared/auth";

export function LoginForm({
  next,
  notice,
  siteKey,
}: {
  next: string;
  notice?: { tone: "info" | "success"; text: string } | undefined;
  siteKey: string;
}) {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors<LoginInput>>({});
  const [pending, setPending] = useState(false);
  const turnstile = useRef<TurnstileHandle>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = parseLoginForm({
      email: form.get("email"),
      password: form.get("password"),
      turnstileToken: turnstileToken ?? "",
    });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setPending(true);
    const outcome = await signInWithEmail(parsed.data);
    if (outcome.ok) {
      // Navegação completa: o middleware lê o cookie novo e manda para a home do papel.
      window.location.assign(next);
      return;
    }
    setPending(false);
    setErrors({ form: AUTH_FAILURE_MESSAGES[outcome.error] });
    turnstile.current?.reset();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
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
      <Field
        id="password"
        label="Senha"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={errors.password}
      />
      <Turnstile ref={turnstile} siteKey={siteKey} onToken={setTurnstileToken} />
      {errors.turnstileToken ? <Notice tone="error">{errors.turnstileToken}</Notice> : null}
      {errors.form ? <Notice tone="error">{errors.form}</Notice> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Entrando..." : "Entrar no Painel"}
      </Button>
      <p className="text-center text-sm">
        <Link
          href="/esqueci-senha"
          className="font-bold text-[var(--color-primary-active)] underline-offset-4 hover:underline"
        >
          Esqueci minha senha
        </Link>
      </p>
    </form>
  );
}
