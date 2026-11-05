import { Button, OutlineContainer } from "@foode/ui";

import { Notice } from "../../../components/form";
import { turnstileSiteKey } from "../../../lib/turnstile";
import { SetPasswordForm } from "./set-password-form";

export const dynamic = "force-dynamic";

// Convite (`?convite=1`) e reset chegam aqui com `?token=` (uso único). O Better Auth
// redireciona com `?error=INVALID_TOKEN` quando o link expirou ou já foi usado.
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ convite?: string; error?: string; token?: string }>;
}) {
  const { convite, error, token } = await searchParams;
  const invite = convite !== undefined;
  const heading = invite ? "Defina sua senha do Painel." : "Crie uma senha nova.";

  if (!token || error) {
    return (
      <>
        <h1 className="mt-2 text-center text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
          {heading}
        </h1>
        <OutlineContainer className="mt-8 space-y-5 p-6">
          <Notice tone="error">
            {error
              ? "Este link expirou ou já foi usado. Peça um novo."
              : "Este link está incompleto. Abra o link do e-mail de novo."}
          </Notice>
          <Button href="/esqueci-senha" className="w-full">
            Pedir um novo link
          </Button>
        </OutlineContainer>
      </>
    );
  }

  return (
    <>
      <h1 className="mt-2 text-center text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
        {heading}
      </h1>
      <p className="mt-3 text-center leading-relaxed text-[var(--color-body)]">
        {invite
          ? "Seu convite foi aceito. Escolha a senha que vai usar para entrar."
          : "Escolha uma senha que você ainda não tenha usado aqui."}
      </p>
      <OutlineContainer className="mt-8 p-6">
        <SetPasswordForm siteKey={await turnstileSiteKey()} token={token} />
      </OutlineContainer>
    </>
  );
}
