"use client";

import { Button } from "@foode/ui";
import { PASSWORD_MIN_LENGTH, type SetPasswordInput } from "@foode/shared/auth";
import { useRef, useState, type FormEvent } from "react";

import { Field, Notice } from "../../../components/form";
import { Turnstile, type TurnstileHandle } from "../../../components/turnstile";
import { AUTH_FAILURE_MESSAGES, resetPassword } from "../../../lib/auth-client";
import { parseSetPasswordForm, type FieldErrors } from "../../../lib/auth-forms";

export function SetPasswordForm({ siteKey, token }: { siteKey: string; token: string }) {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors<SetPasswordInput>>({});
  const [pending, setPending] = useState(false);
  const turnstile = useRef<TurnstileHandle>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = parseSetPasswordForm({
      token,
      newPassword: form.get("newPassword"),
      confirmPassword: form.get("confirmPassword"),
      turnstileToken: turnstileToken ?? "",
    });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setPending(true);
    const outcome = await resetPassword(parsed.data);
    if (outcome.ok) {
      window.location.assign("/entrar?aviso=senha-definida");
      return;
    }
    setPending(false);
    setErrors({ form: AUTH_FAILURE_MESSAGES[outcome.error] });
    turnstile.current?.reset();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <Field
        id="newPassword"
        label="Nova senha"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        required
        hint={`Pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`}
        error={errors.newPassword}
      />
      <Field
        id="confirmPassword"
        label="Confirme a senha"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={errors.confirmPassword}
      />
      <Turnstile ref={turnstile} siteKey={siteKey} onToken={setTurnstileToken} />
      {errors.turnstileToken ? <Notice tone="error">{errors.turnstileToken}</Notice> : null}
      {errors.token ? <Notice tone="error">{errors.token}</Notice> : null}
      {errors.form ? <Notice tone="error">{errors.form}</Notice> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Salvando..." : "Salvar senha"}
      </Button>
    </form>
  );
}
