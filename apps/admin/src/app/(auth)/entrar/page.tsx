import { OutlineContainer } from "@foode/ui";

import { safeNext } from "../../../lib/access";
import { turnstileSiteKey } from "../../../lib/turnstile";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, { tone: "info" | "success"; text: string }> = {
  "senha-definida": { tone: "success", text: "Senha salva. Agora é só entrar." },
  saiu: { tone: "info", text: "Você saiu do Painel." },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; next?: string }>;
}) {
  const { aviso, next } = await searchParams;
  const notice = aviso ? NOTICES[aviso] : undefined;
  return (
    <>
      <h1 className="mt-2 text-center text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
        Entre na operação da sua Loja.
      </h1>
      <p className="mt-3 text-center leading-relaxed text-[var(--color-body)]">
        Use o e-mail convidado e sua senha do Painel.
      </p>
      <OutlineContainer className="mt-8 p-6">
        <LoginForm next={safeNext(next, "/")} notice={notice} siteKey={await turnstileSiteKey()} />
      </OutlineContainer>
    </>
  );
}
