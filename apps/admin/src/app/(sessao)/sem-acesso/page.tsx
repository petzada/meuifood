import { OutlineContainer } from "@foode/ui";
import { redirect } from "next/navigation";

import { getSession } from "../../../lib/session";

// Sessão válida sem nenhuma membership (convite removido antes do primeiro acesso, por
// exemplo). Não revela Lojas nem papéis: só orienta a falar com quem convidou.
export default async function NoAccessPage() {
  const session = await getSession();
  if (!session) redirect("/entrar");
  if (session.stores.length > 0 || session.user.platformRole) redirect("/");
  return (
    <>
      <p className="mt-6 text-sm font-bold text-[var(--color-primary-active)]">Painel Foode</p>
      <h1 className="mt-2 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
        Seu acesso ainda não está ligado a uma Loja.
      </h1>
      <OutlineContainer className="mt-8 p-6">
        <p className="leading-relaxed text-[var(--color-body)]">
          Você entrou como <strong className="text-[var(--color-ink)]">{session.user.email}</strong>
          , mas nenhuma Loja liberou esse e-mail. Peça um novo convite a quem cuida da Loja ou entre
          com o e-mail que recebeu o convite.
        </p>
      </OutlineContainer>
    </>
  );
}
