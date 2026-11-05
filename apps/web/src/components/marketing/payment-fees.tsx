// Taxas PIX/Cartão (decisão 70): recebe a tabela padrão do `/ops` (só o que estiver
// vigente) e um card do modo Rápido. Sem tabela, as taxas não aparecem; o card do Rápido
// fica. TODO(31-taxas): a api ainda não expõe a tabela padrão publicamente; a página passa
// `fees={null}` até existir `GET /storefront/taxas` (ou equivalente) — nada é inventado.
import { Lightning, PixLogo, CreditCard } from "@phosphor-icons/react/dist/ssr";
import type { FeePaymentMethod } from "@foode/shared/ops";
import type { ReactNode } from "react";

import { formatBRL } from "../../content/pricing";

export type PublicFee = {
  method: FeePaymentMethod;
  cardMode: "normal" | "rapido" | null;
  percentBps: number;
  fixedCents: number;
};

function percent(bps: number): string {
  return `${(bps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function feeText(fee: PublicFee): string {
  return fee.fixedCents > 0
    ? `${percent(fee.percentBps)} + ${formatBRL(fee.fixedCents)}`
    : percent(fee.percentBps);
}

export function PaymentFees({ fees }: { fees: readonly PublicFee[] | null }) {
  const pix = fees?.find((fee) => fee.method === "pix") ?? null;
  const normal = fees?.find((fee) => fee.method === "credit" && fee.cardMode === "normal") ?? null;
  const rapido = fees?.find((fee) => fee.method === "credit" && fee.cardMode === "rapido") ?? null;
  const hasAny = Boolean(pix || normal || rapido);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {hasAny ? (
        <>
          <FeeCard
            icon={<PixLogo aria-hidden size={24} weight="bold" />}
            title="PIX"
            value={pix ? feeText(pix) : "Confirmada no cadastro"}
            note="Repasse em lote diário, 1 dia útil após a liberação."
          />
          <FeeCard
            icon={<CreditCard aria-hidden size={24} weight="bold" />}
            title="Cartão de crédito · Normal"
            value={normal ? feeText(normal) : "Confirmada no cadastro"}
            note="Repasse em lote diário após a liberação do provedor."
          />
        </>
      ) : (
        <FeeCard
          className="md:col-span-2"
          icon={<PixLogo aria-hidden size={24} weight="bold" />}
          title="PIX e cartão de crédito"
          value="Taxa combinada no cadastro da loja"
          note="Uma taxa Foode por transação, só no pagamento online. Pagamento na entrega não tem taxa. Sem custo escondido do provedor."
        />
      )}
      <FeeCard
        highlight
        icon={<Lightning aria-hidden size={24} weight="fill" />}
        title="Modo Rápido no cartão"
        value={rapido ? feeText(rapido) : "Taxa diferente"}
        note="O valor do cartão fica disponível em D+1, com uma taxa própria combinada no cadastro. Para quem precisa do dinheiro girando."
      />
    </div>
  );
}

function FeeCard({
  className,
  highlight,
  icon,
  note,
  title,
  value,
}: {
  className?: string;
  highlight?: boolean;
  icon: ReactNode;
  note: string;
  title: string;
  value: string;
}) {
  return (
    <article
      className={[
        "foode-outline grid content-start gap-3 p-6",
        highlight ? "border-[var(--color-primary)]" : "",
        className ?? "",
      ].join(" ")}
      data-reveal
    >
      <span className="text-[var(--color-primary-strong)]">{icon}</span>
      <h3 className="font-bold text-[var(--color-ink)]">{title}</h3>
      <p className="text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]">{value}</p>
      <p className="text-sm leading-relaxed text-[var(--color-body)]">{note}</p>
    </article>
  );
}
