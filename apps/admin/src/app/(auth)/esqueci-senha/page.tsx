import { OutlineContainer } from "@foode/ui";

import { turnstileSiteKey } from "../../../lib/turnstile";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mt-2 text-center text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
        Esqueceu a senha?
      </h1>
      <p className="mt-3 text-center leading-relaxed text-[var(--color-body)]">
        Informe o e-mail do seu acesso. Se ele estiver cadastrado, enviamos um link para criar uma
        senha nova.
      </p>
      <OutlineContainer className="mt-8 p-6">
        <ForgotPasswordForm siteKey={turnstileSiteKey()} />
      </OutlineContainer>
    </>
  );
}
