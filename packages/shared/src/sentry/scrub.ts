// Sentry sem dado pessoal nem segredo (Ticket 30, revisão de segurança: S4 no Storefront, K3 no
// Painel). Compartilhado por `apps/web` e `apps/admin`, sem depender do SDK do Sentry (tipos
// estruturais), ligado no `beforeSend`/`beforeBreadcrumb` do cliente, do servidor e do edge.
// - URL: sem query/hash (`/definir-senha?token=…` do convite e da redefinição de senha,
//   `?webhookSecret=`, `?callbackURL=`) e sem segredo no caminho: token do Pedido
//   (`/loja/{slug}/pedido/{token}` dá acesso a nome, endereço e itens) e o token do link de
//   redefinição do Better Auth (`/api/auth/reset-password/{token}`);
// - request: sem corpo (checkout: telefone, endereço, CPF; login: e-mail e senha), cookies e headers;
// - usuário fora do evento;
// - breadcrumbs de navegação e de fetch/xhr passam pela mesma limpeza; `console` sem a mensagem.

const SECRET_PATH_SEGMENTS = [
  /(\/pedido\/)[^/?#]+/gu,
  /(\/pedidos\/)[^/?#]+/gu,
  /(\/reset-password\/)[^/?#]+/gu,
];

/** Caminho/URL sem query, sem hash e sem token no caminho. */
export function redactUrl(value: string): string {
  let result = value.replace(/[?#].*$/su, "");
  for (const pattern of SECRET_PATH_SEGMENTS) result = result.replace(pattern, "$1:token");
  return result;
}

type ScrubbableEvent = {
  request?: {
    url?: string;
    data?: unknown;
    query_string?: unknown;
    cookies?: unknown;
    headers?: unknown;
  };
  transaction?: string;
  user?: unknown;
};

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.request) {
    if (event.request.url) event.request.url = redactUrl(event.request.url);
    delete event.request.data;
    delete event.request.query_string;
    delete event.request.cookies;
    delete event.request.headers;
  }
  if (event.transaction) event.transaction = redactUrl(event.transaction);
  delete event.user;
  return event;
}

type ScrubbableBreadcrumb = { category?: string; message?: string; data?: Record<string, unknown> };

export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(breadcrumb: T): T | null {
  if (breadcrumb.category === "console") {
    // Mensagens de console podem carregar qualquer coisa: fica só o registro de que houve log.
    delete breadcrumb.message;
    delete breadcrumb.data;
    return breadcrumb;
  }
  if (breadcrumb.message) breadcrumb.message = redactUrl(breadcrumb.message);
  if (breadcrumb.data) {
    for (const key of ["url", "from", "to"]) {
      const value = breadcrumb.data[key];
      if (typeof value === "string") breadcrumb.data[key] = redactUrl(value);
    }
  }
  return breadcrumb;
}
