"use client";

// "Minha conta" (Ticket 13): nome, WhatsApp, CPF mascarado, Pedidos desta Loja (código, estado,
// data, total, link de acompanhamento) e "Sair". Sem sessão, o fluxo de código aparece aqui
// mesmo; com telefone verificado sem conta, começa em nome + CPF.
import {
  type CustomerAccountView,
  type CustomerOrders,
  type CustomerSessionState,
} from "@foode/shared/customer";
import { formatBRL } from "@foode/shared/money";
import { orderStatusLabelPt } from "@foode/shared/order";
import { Button, OutlineContainer } from "@foode/ui";
import { ArrowLeft } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { formatPhoneBr } from "../finalizar/checkout-state";
import { createAccountApi, type AccountApi } from "./account-api";
import { LoginFlow } from "./login-flow";

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export function AccountView({
  api: apiProp,
  orders,
  session,
  siteKey,
  storeName,
  storeSlug,
}: {
  api?: AccountApi;
  orders: CustomerOrders | null;
  session: CustomerSessionState;
  siteKey: string;
  storeName: string;
  storeSlug: string;
}) {
  const router = useRouter();
  const api = useMemo(() => apiProp ?? createAccountApi(), [apiProp]);
  const [account, setAccount] = useState<CustomerAccountView | null>(
    session.state === "signed_in" ? session.account : null,
  );
  const [signingOut, setSigningOut] = useState(false);
  const menuHref = `/loja/${encodeURIComponent(storeSlug)}`;

  async function signOut() {
    setSigningOut(true);
    await api.signOut();
    setSigningOut(false);
    setAccount(null);
    router.refresh();
  }

  return (
    <main className="min-h-dvh bg-[var(--color-canvas)] pb-16">
      <header className="border-b border-[var(--color-hairline)]">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-2 py-3 md:px-6">
          <a aria-label="Voltar ao Cardápio" className="foode-icon-button" href={menuHref}>
            <ArrowLeft aria-hidden size={20} weight="bold" />
          </a>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
              {storeName}
            </p>
            <h1 className="truncate text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">
              Minha conta
            </h1>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-3xl gap-6 px-4 pt-6 md:px-8">
        {account ? (
          <>
            <OutlineContainer as="section" aria-labelledby="conta-dados" className="grid gap-3 p-4">
              <h2 className="text-lg font-bold text-[var(--color-ink)]" id="conta-dados">
                Seus dados
              </h2>
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-body)]">Nome</dt>
                  <dd className="m-0 text-right font-bold text-[var(--color-ink)]">
                    {account.name}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-body)]">WhatsApp</dt>
                  <dd className="m-0 tabular-nums text-[var(--color-ink)]">
                    {formatPhoneBr(account.phone)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-body)]">CPF</dt>
                  <dd className="m-0 tabular-nums text-[var(--color-ink)]">{account.cpfMasked}</dd>
                </div>
              </dl>
              <p className="text-sm text-[var(--color-muted)]">
                Sua conta vale em qualquer Loja da Foode. Para trocar o WhatsApp, fale com o suporte
                Foode.
              </p>
              <Button
                aria-busy={signingOut ? true : undefined}
                className="justify-self-start"
                disabled={signingOut}
                onClick={() => void signOut()}
                variant="secondary"
              >
                Sair da conta
              </Button>
            </OutlineContainer>

            <section aria-labelledby="conta-pedidos" className="grid gap-3">
              <h2 className="text-lg font-bold text-[var(--color-ink)]" id="conta-pedidos">
                Seus pedidos em {storeName}
              </h2>
              {orders === null ? (
                <p className="text-sm text-[var(--color-muted)]" role="status">
                  Não conseguimos carregar seus pedidos agora. Tente de novo em instantes.
                </p>
              ) : orders.orders.length === 0 ? (
                <div className="foode-outline grid gap-3 p-4 text-center">
                  <p className="text-[var(--color-body)]">Você ainda não fez pedidos nesta Loja.</p>
                  <Button className="justify-self-center" href={menuHref} variant="secondary">
                    Ver Cardápio
                  </Button>
                </div>
              ) : (
                <ul className="grid gap-2" role="list">
                  {orders.orders.map((order) => (
                    <li key={order.code}>
                      <a
                        className="foode-outline flex items-center justify-between gap-3 p-4 hover:border-[var(--color-primary)]"
                        href={order.trackingPath}
                      >
                        <span className="grid gap-0.5">
                          <span className="font-bold text-[var(--color-ink)]">
                            Pedido #{order.code}
                          </span>
                          <span className="text-sm text-[var(--color-muted)]">
                            {dateFormat.format(new Date(order.createdAt))} ·{" "}
                            {order.fulfillment === "delivery" ? "Delivery" : "Retirada"}
                          </span>
                        </span>
                        <span className="grid shrink-0 gap-0.5 text-right">
                          <span className="tabular-nums font-bold text-[var(--color-ink)]">
                            {formatBRL(order.totalCents)}
                          </span>
                          <span className="text-sm text-[var(--color-body)]">
                            {orderStatusLabelPt(order.status)}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <OutlineContainer as="section" aria-labelledby="conta-entrar" className="grid gap-4 p-4">
            <h2 className="text-lg font-bold text-[var(--color-ink)]" id="conta-entrar">
              Entrar com WhatsApp
            </h2>
            <LoginFlow
              api={api}
              onSignedIn={(signedIn) => {
                setAccount(signedIn);
                router.refresh();
              }}
              siteKey={siteKey}
              startAtSignup={session.state === "signup_required"}
            />
          </OutlineContainer>
        )}
      </div>
    </main>
  );
}
