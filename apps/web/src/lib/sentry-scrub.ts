// Sentry do Storefront sem dado pessoal nem segredo (Ticket 30, revisão de segurança).
// - URL: sem query/hash e sem o token do Pedido (`/loja/{slug}/pedido/{token}` dá acesso a nome,
//   endereço e itens do Pedido);
// - request: sem corpo (checkout: telefone, endereço, CPF), cookies e headers;
// - breadcrumbs de navegação e de fetch/xhr passam pela mesma limpeza; `console` sem a mensagem.
// Usado no `beforeSend`/`beforeBreadcrumb` do cliente, do servidor e do edge.

/** Caminho/URL sem query, sem hash e sem o token do Pedido. */
export function redactUrl(value: string): string {
  return value
    .replace(/[?#].*$/su, "")
    .replace(/(\/pedido\/)[^/]+/u, "$1:token")
    .replace(/(\/pedidos\/)[^/]+/u, "$1:token");
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
