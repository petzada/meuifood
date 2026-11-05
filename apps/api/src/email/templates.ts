// E-mails transacionais do Painel (Ticket 22), renderizados na api (a MillionSend não aceita
// `template`). Links apontam para o Painel (BETTER_AUTH_URL):
// - `/definir-senha?token=…&fluxo=convite|reset`: a tela do admin envia `POST /api/auth/reset-password`
//   com `{ token, newPassword }` e o header `x-captcha-response` (Turnstile);
// - `/entrar`: login.
import type { TransactionalEmail } from "./sender";

export type SetPasswordFlow = "convite" | "reset";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function setPasswordUrl(panelUrl: string, token: string, flow: SetPasswordFlow): string {
  const url = new URL("/definir-senha", panelUrl);
  url.searchParams.set("token", token);
  url.searchParams.set("fluxo", flow);
  return url.href;
}

export function loginUrl(panelUrl: string): string {
  return new URL("/entrar", panelUrl).href;
}

function layout(title: string, paragraphs: string[], action: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("");
  const html = `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#1f1f1f;line-height:1.5">
<h1 style="font-size:20px">${escapeHtml(title)}</h1>${body}
<p><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 20px;background:#ea1d2c;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(action.label)}</a></p>
<p style="font-size:12px;color:#666">Se você não esperava este e-mail, ignore-o.</p></body></html>`;
  const text = `${title}\n\n${paragraphs.join("\n\n")}\n\n${action.label}: ${action.url}\n\nSe você não esperava este e-mail, ignore-o.`;
  return { html, text };
}

const ROLE_LABEL = { owner: "Dono", operator: "Operador" } as const;

export function inviteEmail(input: {
  to: string;
  storeName: string;
  role: keyof typeof ROLE_LABEL;
  url: string;
  idempotencyKey: string;
}): TransactionalEmail {
  const { html, text } = layout(
    `Convite para o Painel da ${input.storeName}`,
    [
      `Você foi convidado como ${ROLE_LABEL[input.role]} da ${input.storeName} no Foode.`,
      "Defina sua senha para entrar. O link vale por 72 horas e só pode ser usado uma vez.",
    ],
    { label: "Definir senha", url: input.url },
  );
  return {
    to: input.to,
    subject: `Convite para o Painel da ${input.storeName}`,
    html,
    text,
    idempotencyKey: input.idempotencyKey,
  };
}

export function inviteNoticeEmail(input: {
  to: string;
  storeName: string;
  role: keyof typeof ROLE_LABEL;
  url: string;
  idempotencyKey: string;
}): TransactionalEmail {
  const { html, text } = layout(
    `Você agora faz parte da ${input.storeName}`,
    [
      `Você foi adicionado como ${ROLE_LABEL[input.role]} da ${input.storeName} no Foode.`,
      "Entre com a sua senha atual e escolha a Loja no seletor do Painel.",
    ],
    { label: "Entrar no Painel", url: input.url },
  );
  return {
    to: input.to,
    subject: `Acesso à ${input.storeName} no Foode`,
    html,
    text,
    idempotencyKey: input.idempotencyKey,
  };
}

export function passwordResetEmail(input: {
  to: string;
  url: string;
  idempotencyKey: string;
}): TransactionalEmail {
  const { html, text } = layout(
    "Redefinir a senha do Painel",
    [
      "Recebemos um pedido para redefinir a sua senha do Painel Foode.",
      "O link vale por 1 hora e só pode ser usado uma vez.",
    ],
    { label: "Redefinir senha", url: input.url },
  );
  return {
    to: input.to,
    subject: "Redefinir a senha do Painel Foode",
    html,
    text,
    idempotencyKey: input.idempotencyKey,
  };
}

const ORDERS_PER_DAY_TEXT = {
  ate_10: "até 10",
  "10_a_50": "10 a 50",
  mais_de_50: "mais de 50",
} as const;

/**
 * Aviso de lead novo para a Foode (Ticket 31, decisão 70). Vai só para LEADS_NOTIFY_EMAIL (o
 * e-mail do próprio Dono da Foode), com os dados que o lojista digitou, para a resposta rápida.
 */
export function leadNoticeEmail(input: {
  to: string;
  lead: {
    name: string;
    whatsapp: string;
    storeName: string;
    city: string;
    ordersPerDay: keyof typeof ORDERS_PER_DAY_TEXT;
    source?: string | undefined;
  };
  opsUrl: string;
  idempotencyKey: string;
}): TransactionalEmail {
  const { lead } = input;
  const { html, text } = layout(
    `Novo lead: ${lead.storeName}`,
    [
      `${lead.name} (${lead.storeName}, ${lead.city}) pediu contato pela landing.`,
      `WhatsApp: +${lead.whatsapp}. Pedidos por dia: ${ORDERS_PER_DAY_TEXT[lead.ordersPerDay]}.`,
      ...(lead.source ? [`Origem: ${lead.source}.`] : []),
    ],
    { label: "Ver leads no Ops", url: input.opsUrl },
  );
  return {
    to: input.to,
    subject: `Novo lead da landing: ${lead.storeName}`,
    html,
    text,
    idempotencyKey: input.idempotencyKey,
  };
}
