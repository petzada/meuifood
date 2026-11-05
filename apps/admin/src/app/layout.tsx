import { ToastProvider } from "@foode/ui";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { MoneyMaskRoot } from "../components/money-mask-root";
import { SupportWidget } from "../components/support-widget";

import "@fontsource-variable/nunito";
import "./globals.css";

export const metadata: Metadata = {
  title: "Painel Foode",
  description: "Painel de operação da sua Loja.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <MoneyMaskRoot />
        <ToastProvider>{children}</ToastProvider>
        {/* Widget de suporte (Ticket 30): só com NEXT_PUBLIC_SUPPORT_WIDGET_* no build. */}
        <SupportWidget />
      </body>
    </html>
  );
}
