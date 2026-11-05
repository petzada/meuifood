// Rodapé (decisão 70): CNPJ, razão social e o texto institucional; links de produto,
// segmentos, blog e legal. Sem newsletter, sem /sobre.
import { BrandMark } from "@foode/ui";
import Image from "next/image";
import Link from "next/link";

import logo from "../../../../../public/images/logo.png";
import { SEGMENTS } from "../../content/segments";
import { ADMIN_URL, LEGAL, NAV } from "../../content/site";

const COLUMNS = [
  { title: "Produto", links: NAV.map((item) => ({ href: item.href, label: item.label })) },
  {
    title: "Para quem",
    links: SEGMENTS.map((segment) => ({ href: `/para/${segment.slug}`, label: segment.name })),
  },
  {
    title: "Foode",
    links: [
      { href: "/#contato", label: "Falar com a Foode" },
      { href: ADMIN_URL, label: "Entrar no painel" },
      { href: "/blog/rss.xml", label: "RSS do blog" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/termos", label: "Termos de uso" },
      { href: "/privacidade", label: "Política de privacidade" },
    ],
  },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--color-hairline-soft)]">
      <div className="mk-container grid gap-10 py-12 md:grid-cols-[1.2fr_repeat(4,1fr)]">
        <div>
          <BrandMark size="compact">
            <Image alt="Foode Delivery" height={96} src={logo} width={96} />
          </BrandMark>
          <p className="mt-4 max-w-[32ch] text-sm leading-relaxed text-[var(--color-muted)]">
            Cardápio digital, pedidos e pagamento online para o seu delivery, sem comissão por
            pedido.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <nav aria-label={column.title} key={column.title}>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
              {column.title}
            </p>
            <ul className="mt-3 grid gap-2 text-sm">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    className="font-bold text-[var(--color-body)] hover:text-[var(--color-primary-strong)]"
                    href={link.href}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-[var(--color-hairline-soft)]">
        <div className="mk-container grid gap-2 py-6 text-xs leading-relaxed text-[var(--color-muted)]">
          <p>
            <strong className="font-bold text-[var(--color-body)]">{LEGAL.razaoSocial}</strong> ·
            CNPJ {LEGAL.cnpj} · {LEGAL.cidade}
          </p>
          <p>{LEGAL.institucional}</p>
        </div>
      </div>
    </footer>
  );
}
