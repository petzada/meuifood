// Constantes institucionais e de navegação da landing (decisão 70). Fonte única para
// metadados, rodapé, JSON-LD e sitemap. Copy pública em português corrente (sem as
// maiúsculas do glossário).

export const SITE_URL = "https://foodedelivery.com.br";
export const SITE_NAME = "Foode Delivery";
export const ADMIN_URL = "https://admin.foodedelivery.com.br";

export const SITE_TITLE = "Foode Delivery — Cardápio digital e pedidos sem comissão";
export const SITE_DESCRIPTION =
  "Canal próprio para o seu delivery: cardápio digital, pedidos, PIX e cartão online, fila de pedidos e relatórios. Mensalidade por faixa de pedidos, sem comissão.";

export const LEGAL = {
  cnpj: "63.940.273/0001-36",
  razaoSocial: "MARCT SOLUÇÕES DIGITAIS",
  institucional:
    "A plataforma Foode Delivery é operada integralmente pela empresa Marct Soluções Digitais, situada em São Paulo.",
  cidade: "São Paulo",
  email: "contato@foodedelivery.com.br",
} as const;

/** Rota da outra fatia do Ticket 31: redireciona no servidor para o `wa.me` de vendas. */
export const FALAR_PATH = "/falar";
/** Route handler desta fatia (`POST`), por ora responde 503 controlado. */
export const LEAD_PATH = "/contato/lead";

export const REFUND_LINE = "Reembolso integral em até 7 dias";

export const NAV = [
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#funcionalidades", label: "Funcionalidades" },
  { href: "/precos", label: "Preços" },
  { href: "/blog", label: "Blog" },
  { href: "/#faq", label: "FAQ" },
] as const;

export const FOUNDER = {
  name: "Marcio",
  role: "fundador da Foode Delivery",
} as const;
