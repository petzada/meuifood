// Seções de Configurações (NAV-05): subrotas sob o mesmo prefixo, sem linhas novas no menu.
import Link from "next/link";

export const SETTINGS_SECTIONS = [
  {
    href: "/configuracoes/horarios",
    label: "Horários e Pausa",
    description: "Grade Seg–Dom no horário de Brasília e a Pausa dos Pedidos.",
  },
  {
    href: "/configuracoes/entrega",
    label: "Entrega",
    description: "Retirada, Delivery por bairro ou Taxa fixa, pedido mínimo e tempo estimado.",
  },
  {
    href: "/configuracoes/pagamento",
    label: "Bandeiras da maquininha",
    description: "Débito e Crédito aceitos no Pagamento na entrega.",
  },
  {
    href: "/configuracoes/impressao",
    label: "Impressão",
    description: "Imprimir o cupom 80 mm ao aceitar o Pedido.",
  },
] as const;

export function SettingsHeader({ current }: { current?: string }) {
  const section = SETTINGS_SECTIONS.find((item) => item.href === current);
  return (
    <header>
      {section ? (
        <nav aria-label="Caminho" className="text-sm font-bold text-[var(--color-muted)]">
          <Link href="/configuracoes" className="underline-offset-4 hover:underline">
            Configurações
          </Link>
          <span aria-hidden="true"> › </span>
        </nav>
      ) : (
        <p className="text-sm font-bold text-[var(--color-muted)]">Loja</p>
      )}
      <h1 className="mt-1 text-[1.75rem] font-bold tracking-[-0.03em] text-[var(--color-ink)]">
        {section?.label ?? "Configurações"}
      </h1>
    </header>
  );
}
