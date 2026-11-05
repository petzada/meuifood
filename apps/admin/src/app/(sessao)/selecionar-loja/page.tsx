import { OutlineContainer } from "@foode/ui";
import { redirect } from "next/navigation";

import { Notice } from "../../../components/form";
import { StoreSwitcher } from "../../../components/store-switcher";
import { getSession } from "../../../lib/session";
import { switchStore } from "../../(painel)/loja/actions";

const NOTICES: Record<string, string> = {
  "loja-invalida": "Escolha uma Loja da lista.",
  "sem-acesso": "Você não tem mais acesso a essa Loja. Escolha outra.",
};

// Usuário com várias Lojas e nenhuma ativa (primeiro acesso ou membership removida).
export default async function SelectStorePage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/entrar");
  if (session.stores.length === 0) redirect("/sem-acesso");
  const { aviso } = await searchParams;
  const notice = aviso ? NOTICES[aviso] : undefined;
  return (
    <>
      <p className="mt-6 text-sm font-bold text-[var(--color-primary-active)]">Painel Foode</p>
      <h1 className="mt-2 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
        Qual Loja você vai operar agora?
      </h1>
      <p className="mt-3 leading-relaxed text-[var(--color-body)]">
        Você faz parte de {session.stores.length} Lojas. Dá para trocar depois pelo menu do Painel.
      </p>
      <OutlineContainer className="mt-8 space-y-5 p-6">
        {notice ? <Notice tone="error">{notice}</Notice> : null}
        <StoreSwitcher action={switchStore} activeStoreId={null} stores={session.stores} />
      </OutlineContainer>
    </>
  );
}
