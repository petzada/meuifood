"use client";

// Ponto de montagem do widget de suporte no Storefront (Ticket 30). Sem configuração não
// renderiza nada (nem `<script>`, nem espaço na tela). Fora das páginas com token do Pedido na
// URL (o script de terceiro leria o token). Carrega por último (`lazyOnload`).
import { usePathname } from "next/navigation";
import Script from "next/script";

import { isSecretPath, storefrontSupportWidget } from "../lib/support-widget";

export const SUPPORT_WIDGET_SCRIPT_ID = "foode-support-widget";

export function SupportWidget() {
  const pathname = usePathname();
  const config = storefrontSupportWidget();
  if (!config || (pathname && isSecretPath(pathname))) return null;
  return (
    <Script
      data-foode-surface="storefront"
      data-widget-id={config.widgetId}
      id={SUPPORT_WIDGET_SCRIPT_ID}
      src={config.src}
      strategy="lazyOnload"
    />
  );
}
