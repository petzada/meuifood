// Widget de suporte (Ticket 30; decisões 63 P-ONB-5, 64, 66): chat automatizado pelo agente do
// agentes.chat (MCP pós-lançamento) no Painel e no Storefront, com a MESMA base de integração.
//
// Contrato de configuração (variáveis PÚBLICAS do build do Next de cada app; nenhuma é segredo):
// - `NEXT_PUBLIC_SUPPORT_WIDGET_SRC`: URL `https://` do script carregador do widget;
// - `NEXT_PUBLIC_SUPPORT_WIDGET_ID`: id público do widget/agente no agentes.chat.
// As duas presentes e válidas = widget ativo naquele app; qualquer uma ausente ou inválida =
// desligado (nada carrega nem aparece). Sem link `wa.me` de suporte (64): URL do WhatsApp é
// recusada. Detalhes em docs/integracao-suporte-agentes-chat.md.

export type SupportWidgetSurface = "storefront" | "painel";

export type SupportWidgetConfig = {
  /** Script carregador (https). */
  src: string;
  /** Id público do widget no agentes.chat. */
  widgetId: string;
};

export type SupportWidgetEnv = {
  src: string | undefined;
  widgetId: string | undefined;
};

/** Hosts que NUNCA servem de widget de suporte (decisão 64: sem `wa.me`). */
const FORBIDDEN_HOSTS = ["wa.me", "api.whatsapp.com", "web.whatsapp.com", "whatsapp.com"];

const WIDGET_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;

/** Configuração válida do widget, ou null (desligado). Pura: os apps passam o `process.env`. */
export function supportWidgetConfig(env: SupportWidgetEnv): SupportWidgetConfig | null {
  const rawSrc = env.src?.trim();
  const widgetId = env.widgetId?.trim();
  if (!rawSrc || !widgetId || !WIDGET_ID_PATTERN.test(widgetId)) return null;
  let url: URL;
  try {
    url = new URL(rawSrc);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (FORBIDDEN_HOSTS.some((forbidden) => host === forbidden || host.endsWith(`.${forbidden}`))) {
    return null;
  }
  return { src: url.href, widgetId };
}
