"use client";

// Ponto de montagem do widget de suporte no Painel (Ticket 30; decisões 63 P-ONB-5, 64, 66).
// Mesmo contrato do Storefront (`supportWidgetConfig` de @foode/shared e
// docs/integracao-suporte-agentes-chat.md): NEXT_PUBLIC_SUPPORT_WIDGET_SRC e
// NEXT_PUBLIC_SUPPORT_WIDGET_ID no build do admin. Sem as duas, não renderiza nada. Lidas pelo
// nome literal para o Next embutir no bundle. Carrega por último (`lazyOnload`). Nunca em
// `/definir-senha` (token de convite/reset na URL: script de terceiro não pode ler).
import { supportWidgetConfig } from "@foode/shared";
import { usePathname } from "next/navigation";
import Script from "next/script";

export const SUPPORT_WIDGET_SCRIPT_ID = "foode-support-widget";

/** Páginas do Painel com segredo na URL. */
export function painelSecretPath(pathname: string): boolean {
  return pathname.startsWith("/definir-senha");
}

export function painelSupportWidget() {
  return supportWidgetConfig({
    src: process.env.NEXT_PUBLIC_SUPPORT_WIDGET_SRC,
    widgetId: process.env.NEXT_PUBLIC_SUPPORT_WIDGET_ID,
  });
}

export function SupportWidget() {
  const pathname = usePathname();
  const config = painelSupportWidget();
  if (!config || (pathname && painelSecretPath(pathname))) return null;
  return (
    <Script
      data-foode-surface="painel"
      data-widget-id={config.widgetId}
      id={SUPPORT_WIDGET_SCRIPT_ID}
      src={config.src}
      strategy="lazyOnload"
    />
  );
}
