"use client";

// Oferta de criar conta depois do Pedido (decisão 71; Ticket 13/65/66): card discreto para quem
// não está logado. Abre o "Entrar com WhatsApp" já com o telefone deste aparelho (o lembrado no
// checkout; a página do Pedido não traz telefone). Ao entrar, consulta "meus Pedidos" desta Loja,
// o que vincula à conta os Pedidos Guest com o telefone verificado — inclusive este. Sem login
// disponível (site key do Turnstile vazia) o card não aparece.
import type { CustomerAccountView } from "@foode/shared/customer";
import { Button, OutlineContainer } from "@foode/ui";
import { WhatsappLogo } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { createAccountApi, type AccountApi } from "../../conta/account-api";
import { LoginSheet } from "../../conta/login-sheet";
import { readRememberedCustomer } from "../../finalizar/checkout-state";

export type AccountOfferProps = {
  storeSlug: string;
  /** Site key pública do Turnstile; vazia = login indisponível (card some). */
  siteKey: string;
  /** Sessão com telefone verificado sem cadastro: o fluxo começa no nome + CPF. */
  startAtSignup?: boolean;
  api?: AccountApi;
  /** Telefone do aparelho (E.164); padrão: o lembrado no checkout desta Loja. */
  initialPhone?: string;
};

function rememberedPhone(storeSlug: string): string {
  try {
    return readRememberedCustomer(window.localStorage, storeSlug)?.phone ?? "";
  } catch {
    return "";
  }
}

export function AccountOffer({
  api: apiProp,
  initialPhone,
  siteKey,
  startAtSignup = false,
  storeSlug,
}: AccountOfferProps) {
  const api = useMemo(() => apiProp ?? createAccountApi(), [apiProp]);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [account, setAccount] = useState<CustomerAccountView | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);

  useEffect(() => {
    if (initialPhone === undefined) setPhone(rememberedPhone(storeSlug));
  }, [initialPhone, storeSlug]);

  if (!siteKey) return null;

  async function onSignedIn(signedIn: CustomerAccountView) {
    setAccount(signedIn);
    // "Meus Pedidos" desta Loja vincula os Pedidos Guest com o telefone verificado.
    const result = await api.orders(storeSlug);
    setLinked(result.kind === "ok");
  }

  return (
    <OutlineContainer as="section" aria-labelledby="conta-oferta" className="grid gap-3 p-5">
      <h2 className="text-base font-bold text-[var(--color-ink)]" id="conta-oferta">
        {account ? `Olá, ${account.name.split(/\s+/u)[0]}!` : "Acompanhe tudo na sua conta"}
      </h2>
      {account ? (
        <p className="text-sm text-[var(--color-body)]" role="status">
          {linked === false
            ? "Você entrou na sua conta. Seus pedidos aparecem em Minha conta."
            : "Você entrou na sua conta e este pedido ficou salvo nela."}
        </p>
      ) : (
        <>
          <p className="text-sm text-[var(--color-body)]">
            Crie sua conta pelo WhatsApp para acompanhar seus pedidos e ganhar benefícios.
          </p>
          <Button onClick={() => setOpen(true)} variant="secondary">
            <span className="inline-flex items-center gap-2">
              <WhatsappLogo aria-hidden size={20} weight="bold" />
              Criar conta pelo WhatsApp
            </span>
          </Button>
          <LoginSheet
            api={api}
            {...(phone ? { initialPhone: phone } : {})}
            onClose={() => setOpen(false)}
            onSignedIn={(signedIn) => void onSignedIn(signedIn)}
            open={open}
            siteKey={siteKey}
            startAtSignup={startAtSignup}
          />
        </>
      )}
    </OutlineContainer>
  );
}
