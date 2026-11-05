"use client";

// Sheet "Entrar com WhatsApp" (Ticket 13): o mesmo fluxo de código no cabeçalho do Storefront e
// no checkout. Fecha sozinha ao entrar e devolve a conta a quem abriu.
import type { CustomerAccountView } from "@foode/shared/customer";

import { Sheet } from "../storefront/sheet";
import type { AccountApi } from "./account-api";
import { LoginFlow } from "./login-flow";

export const LOGIN_SHEET_TITLE_ID = "entrar-sheet-title";

export function LoginSheet({
  api,
  initialPhone,
  onClose,
  onSignedIn,
  open,
  siteKey,
  startAtSignup,
}: {
  api?: AccountApi;
  initialPhone?: string;
  onClose: () => void;
  onSignedIn: (account: CustomerAccountView) => void;
  open: boolean;
  siteKey: string;
  startAtSignup?: boolean;
}) {
  return (
    <Sheet
      labelledBy={LOGIN_SHEET_TITLE_ID}
      onClose={onClose}
      open={open}
      title="Entrar com WhatsApp"
    >
      {open ? (
        <LoginFlow
          {...(api ? { api } : {})}
          {...(initialPhone ? { initialPhone } : {})}
          {...(startAtSignup ? { startAtSignup } : {})}
          onSignedIn={(account) => {
            onSignedIn(account);
            onClose();
          }}
          siteKey={siteKey}
        />
      ) : null}
    </Sheet>
  );
}
