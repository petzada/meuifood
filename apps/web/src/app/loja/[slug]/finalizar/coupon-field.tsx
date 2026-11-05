"use client";

// Campo de Cupom inline no checkout (Ticket 13, U1–U4): linha "Tem um cupom?" recolhida que
// expande Input + "Aplicar"; maiúsculas e sem espaços enquanto digita; spinner no próprio
// botão; aplicado = chip com o desconto + "Remover"; recusa = mensagem específica inline
// (motivo do servidor). O Cupom de boas-vindas entra sozinho quando elegível, com explicação.
// Cupom digitado e aceito também é confirmado no Toast padrão (decisão 74); erro fica inline (G4).
// Sem vitrine de Cupons (P-7.1): só por código.
import { COUPON_CODE_MAX, type AppliedCoupon } from "@foode/shared/coupon";
import { formatBRL } from "@foode/shared/money";
import { Badge, Button, Field, Input, useToast } from "@foode/ui";
import { SpinnerGap, Tag } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";

export type CouponFieldProps = {
  /** Cupom aceito pela cotação (promocional digitado ou boas-vindas automático). */
  applied: AppliedCoupon | null;
  /** Código enviado na cotação e ainda sem resposta. */
  checking: boolean;
  /** Fulfillment Delivery mostra o microcopy "não vale para a taxa" (U3). */
  delivery: boolean;
  /** Motivo da recusa do servidor para o código digitado (U2); null = sem erro. */
  error: string | null;
  onApply: (code: string) => void;
  onRemove: () => void;
  /** Código aplicado pelo Consumidor (mantido no campo quando recusado, para corrigir). */
  pendingCode: string;
};

/** Maiúsculas automáticas, sem espaços, só A–Z 0–9 _ - (o contrato normaliza de novo). */
export function normalizeCouponInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/gu, "")
    .slice(0, COUPON_CODE_MAX);
}

export function CouponField({
  applied,
  checking,
  delivery,
  error,
  onApply,
  onRemove,
  pendingCode,
}: CouponFieldProps) {
  const [open, setOpen] = useState(pendingCode !== "" || error !== null);
  const [code, setCode] = useState(pendingCode);
  const inputId = useId();
  const focusInput = () => document.getElementById(inputId)?.focus();
  const toast = useToast();
  const announced = useRef<string | null>(null);

  // Cupom digitado que o servidor aceitou: confirma uma vez no Toast.
  const appliedKey =
    applied?.source === "promo" ? `${applied.code}:${applied.discountCents}` : null;
  useEffect(() => {
    if (!appliedKey || announced.current === appliedKey || !applied) return;
    announced.current = appliedKey;
    toast.success(`Cupom ${applied.code ?? ""} aplicado: −${formatBRL(applied.discountCents)}`);
  }, [applied, appliedKey, toast]);

  // Recusa do servidor reabre o campo com o código para corrigir.
  useEffect(() => {
    if (error) setOpen(true);
  }, [error]);

  useEffect(() => {
    setCode(pendingCode);
  }, [pendingCode]);

  if (applied) {
    const label =
      applied.source === "welcome"
        ? "Cupom de boas-vindas aplicado"
        : `${applied.code ?? "Cupom"} aplicado`;
    return (
      <div className="grid gap-2" role="group" aria-label="Cupom">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="success">
            {label} · −{formatBRL(applied.discountCents)}
          </Badge>
          {applied.source === "promo" ? (
            <button
              className="font-bold text-[var(--color-primary-strong)] underline-offset-2 hover:underline"
              onClick={onRemove}
              type="button"
            >
              Remover
            </button>
          ) : null}
        </p>
        <p className="text-sm text-[var(--color-muted)]">
          {applied.source === "welcome"
            ? "Sua primeira compra nesta Loja com a conta Foode ganha o desconto da Loja."
            : null}
          {applied.source === "welcome" && delivery ? " " : null}
          {delivery ? "O desconto não vale para a taxa de entrega." : null}
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        className="inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-[var(--color-primary-strong)] underline-offset-2 hover:underline"
        onClick={() => {
          setOpen(true);
          setTimeout(focusInput, 0);
        }}
        type="button"
      >
        <Tag aria-hidden size={18} weight="bold" />
        Tem um cupom?
      </button>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
      <Field {...(error ? { error } : {})} id={inputId} label="Código do cupom">
        {(a11y) => (
          <Input
            {...a11y}
            autoCapitalize="characters"
            autoComplete="off"
            name="couponCode"
            onChange={(event) => setCode(normalizeCouponInput(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (code) onApply(code);
              }
            }}
            placeholder="Ex.: BEMVINDO10"
            spellCheck={false}
            value={code}
          />
        )}
      </Field>
      <Button
        aria-busy={checking ? true : undefined}
        {...(error ? { className: "sm:mb-7" } : {})}
        disabled={checking}
        onClick={() => {
          if (code) onApply(code);
          else focusInput();
        }}
        variant="secondary"
      >
        <span className="inline-flex items-center justify-center gap-2">
          {checking ? (
            <SpinnerGap aria-hidden className="animate-spin" size={18} weight="bold" />
          ) : null}
          Aplicar
        </span>
      </Button>
    </div>
  );
}
