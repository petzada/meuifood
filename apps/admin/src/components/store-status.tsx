"use client";

// Status da Loja no shell (NAV-04) e Pausa a um clique (CFG-02, P-OPE-4): selo texto + símbolo
// (T-03) para todos; Dono e Operador ligam e retomam. Ligar pede confirmação curta; com Pausa
// ativa, faixa persistente "Loja em Pausa — Retomar" com quem ativou e quando.
import { Button } from "@foode/ui";
import type { PauseState, StoreOpenState } from "@foode/shared/order";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { formatTimeSp } from "../lib/orders-labels";

export type StoreStatusView = { open: StoreOpenState; pause: PauseState };

export type SetPause = (
  paused: boolean,
) => Promise<{ ok: true; pause: PauseState } | { ok: false; message: string }>;

const ROLE_LABEL = { owner: "Dono", operator: "Operador" } as const;

export function storeStatusText(open: StoreOpenState): { glyph: string; label: string } {
  switch (open.state) {
    case "paused":
      return { glyph: "❚❚", label: "Em Pausa" };
    case "open":
      return { glyph: "●", label: `Aberta · fecha às ${formatTimeSp(open.closesAt)}` };
    case "closed":
      return {
        glyph: "■",
        label: open.nextOpening
          ? `Fechada · abre às ${open.nextOpening.opensAt}`
          : "Fechada · sem horários",
      };
  }
}

const TONE: Record<StoreOpenState["state"], string> = {
  open: "border-[#2e7d32] text-[#1f5f23]",
  closed: "border-[var(--color-hairline)] text-[var(--color-muted)]",
  paused: "border-[var(--color-accent)] text-[#7a5600]",
};

export function StoreStatusBadge({ open }: { open: StoreOpenState }) {
  const { glyph, label } = storeStatusText(open);
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-bold ${TONE[open.state]}`}
    >
      <span aria-hidden="true" className="text-xs">
        {glyph}
      </span>
      {label}
    </span>
  );
}

/** Quem pausou e quando: "Pausa ativada por Ana (Operador) às 18:42". */
export function pausedByText(pause: PauseState): string | null {
  if (!pause.paused) return null;
  return `Pausa ativada por ${pause.pausedBy.name} (${ROLE_LABEL[pause.pausedBy.role]}) às ${formatTimeSp(pause.pausedAt)}`;
}

function usePauseAction(setPause: SetPause) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (paused: boolean, after?: () => void) => {
    setError(null);
    start(async () => {
      const result = await setPause(paused);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      after?.();
      router.refresh();
    });
  };
  return { error, pending, run };
}

/**
 * Selo + ação. `canPause` = `can(role, "store.pause")` resolvido pelo servidor; sem ele o selo é
 * só leitura (Ops, por exemplo).
 */
export function StoreStatusControl({
  canPause,
  setPause,
  status,
}: {
  canPause: boolean;
  setPause?: SetPause | undefined;
  status: StoreStatusView;
}) {
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();
  const action = usePauseAction(setPause ?? (async () => ({ ok: false, message: "" })));
  const paused = status.pause.paused;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StoreStatusBadge open={status.open} />
      {canPause && setPause ? (
        paused ? (
          <Button
            variant="secondary"
            type="button"
            className="min-h-9 px-4 py-1.5 text-sm"
            disabled={action.pending}
            onClick={() => action.run(false)}
          >
            {action.pending ? "Retomando..." : "Retomar"}
          </Button>
        ) : (
          <Button
            variant="secondary"
            type="button"
            className="min-h-9 px-4 py-1.5 text-sm"
            aria-expanded={confirming}
            onClick={() => setConfirming((value) => !value)}
          >
            Pausar Pedidos
          </Button>
        )
      ) : null}
      {action.error ? (
        <p role="alert" className="basis-full text-sm font-bold text-[var(--color-error)]">
          {action.error}
        </p>
      ) : null}
      {confirming && !paused ? (
        <div
          role="dialog"
          aria-labelledby={titleId}
          className="basis-full rounded-2xl border border-[var(--color-hairline)] p-4"
        >
          <p id={titleId} className="font-bold text-[var(--color-ink)]">
            Pausar os Pedidos agora?
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-body)]">
            O checkout fica bloqueado até você retomar. Pedidos em andamento continuam.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-9 px-4 py-1.5 text-sm"
              disabled={action.pending}
              onClick={() => action.run(true, () => setConfirming(false))}
            >
              {action.pending ? "Pausando..." : "Confirmar Pausa"}
            </Button>
            <Button
              variant="secondary"
              type="button"
              className="min-h-9 px-4 py-1.5 text-sm"
              onClick={() => setConfirming(false)}
            >
              Voltar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Faixa persistente com a Pausa ativa (CFG-02); aviso ao Dono de quem ativou (P-OPE-4). */
export function PauseBand({
  canPause,
  pause,
  setPause,
}: {
  canPause: boolean;
  pause: PauseState;
  setPause?: SetPause | undefined;
}) {
  const action = usePauseAction(setPause ?? (async () => ({ ok: false, message: "" })));
  if (!pause.paused) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-accent)] bg-[#fff7e0] px-4 py-3 md:px-10"
    >
      <div>
        <p className="font-bold text-[var(--color-ink)]">
          <span aria-hidden="true">❚❚ </span>Loja em Pausa — o checkout está bloqueado.
        </p>
        <p className="text-sm text-[var(--color-body)]">{pausedByText(pause)}</p>
        {action.error ? (
          <p role="alert" className="text-sm font-bold text-[var(--color-error)]">
            {action.error}
          </p>
        ) : null}
      </div>
      {canPause && setPause ? (
        <Button
          type="button"
          className="min-h-10 px-5 py-2 text-sm"
          disabled={action.pending}
          onClick={() => action.run(false)}
        >
          {action.pending ? "Retomando..." : "Retomar"}
        </Button>
      ) : null}
    </div>
  );
}
