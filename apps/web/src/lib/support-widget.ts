// Widget de suporte no Storefront (Ticket 30; decisões 63 P-ONB-5, 64, 66). Contrato em
// @foode/shared (`supportWidgetConfig`) e em docs/integracao-suporte-agentes-chat.md.
// As variáveis são públicas e entram no build do Next (NEXT_PUBLIC_*): lidas pelo NOME literal
// para o Next embutir no bundle do navegador. Sem as duas, o widget fica desligado.
import { type SupportWidgetConfig, supportWidgetConfig } from "@foode/shared";

export function storefrontSupportWidget(): SupportWidgetConfig | null {
  return supportWidgetConfig({
    src: process.env.NEXT_PUBLIC_SUPPORT_WIDGET_SRC,
    widgetId: process.env.NEXT_PUBLIC_SUPPORT_WIDGET_ID,
  });
}

/**
 * Página com segredo no caminho (`/loja/{slug}/pedido/{token}`): o token dá acesso a dados do
 * Pedido, então nenhum script de terceiro (widget, Pixel) pode ler essa URL.
 */
export function isSecretPath(pathname: string): boolean {
  return /\/pedido\/[^/]+/u.test(pathname);
}

/**
 * O chat de suporte está disponível nesta página? (widget configurado e fora de página com
 * token). Decide a mensagem do conflito de conta (decisão 66).
 */
export function storefrontSupportChatActive(pathname: string | null): boolean {
  if (!storefrontSupportWidget()) return false;
  return pathname === null || !isSecretPath(pathname);
}
