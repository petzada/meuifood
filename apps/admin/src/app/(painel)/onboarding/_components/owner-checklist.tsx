"use client";

// Checklist do Dono na home (ONB-01, ONB-02, ONB-04): "Faltam N passos", itens Feito/Pendente
// com o porquê e "Configurar" (sem ordem forçada; "Plano ativo" não acionável). Concluído,
// some e aparece uma vez "Sua Loja está pronta para receber Pedidos" com link e QR Code.
import type { OwnerChecklist } from "@foode/shared/onboarding";
import { Button, OutlineContainer } from "@foode/ui";
import Link from "next/link";
import { useTransition } from "react";

import { CopyLinkButton } from "../../../../components/copy-link";
import { QrCode } from "../../../../components/qr-code";
import { OWNER_CHECKLIST_LABEL } from "../../../../lib/onboarding-labels";

export function OwnerChecklistCard({
  acknowledgeReady,
  checklist,
  slug,
  storeUrl,
}: {
  acknowledgeReady?: (() => Promise<void>) | undefined;
  checklist: OwnerChecklist;
  slug: string;
  storeUrl: string;
}) {
  const [pending, startTransition] = useTransition();

  if (checklist.complete && !checklist.showReadyMessage) return null;

  if (checklist.showReadyMessage) {
    return (
      <OutlineContainer as="section" aria-labelledby="loja-pronta" className="p-5" role="status">
        <h2
          id="loja-pronta"
          className="text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]"
        >
          Sua Loja está pronta para receber Pedidos
        </h2>
        <p className="mt-1 text-sm text-[var(--color-body)]">
          Divulgue o link <span className="font-bold text-[var(--color-ink)]">{storeUrl}</span> ou
          imprima o QR Code.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <CopyLinkButton url={storeUrl} />
          <QrCode compact slug={slug} url={storeUrl} />
          {acknowledgeReady ? (
            <Button
              disabled={pending}
              onClick={() => startTransition(() => acknowledgeReady())}
              type="button"
              variant="secondary"
            >
              {pending ? "Aguarde..." : "Entendi"}
            </Button>
          ) : null}
        </div>
      </OutlineContainer>
    );
  }

  const n = checklist.pendingCount;
  return (
    <OutlineContainer as="section" aria-labelledby="checklist-title" className="p-5">
      <h2
        id="checklist-title"
        className="text-xl font-bold tracking-[-0.02em] text-[var(--color-ink)]"
      >
        {n === 1 ? "Falta 1 passo" : `Faltam ${n} passos`} para sua Loja receber Pedidos
      </h2>
      <ul className="mt-4 divide-y divide-[var(--color-hairline-soft)]" role="list">
        {checklist.items.map((entry) => {
          const label = OWNER_CHECKLIST_LABEL[entry.item];
          return (
            <li key={entry.item} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
              <span
                className={`mt-0.5 inline-flex min-w-20 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${
                  entry.done
                    ? "border-[var(--color-primary)] text-[var(--color-primary-strong)]"
                    : "border-[var(--color-hairline)] text-[var(--color-muted)]"
                }`}
              >
                <span aria-hidden="true">{entry.done ? "✓" : "○"}</span>
                {entry.done ? "Feito" : "Pendente"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[var(--color-ink)]">{label.title}</p>
                <p className="text-sm text-[var(--color-body)]">{label.why}</p>
              </div>
              {!entry.done && entry.actionable && label.href ? (
                <Link
                  href={label.href}
                  className="foode-button foode-button--secondary min-h-11 px-4 py-2 text-sm"
                >
                  Configurar<span className="sr-only">: {label.title}</span>
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-sm text-[var(--color-muted)]">
        Opcional, fora da contagem:{" "}
        <Link
          href="/configuracoes/divulgacao"
          className="font-bold underline-offset-4 hover:underline"
        >
          Pixel Meta e Google
        </Link>
        .
      </p>
    </OutlineContainer>
  );
}
