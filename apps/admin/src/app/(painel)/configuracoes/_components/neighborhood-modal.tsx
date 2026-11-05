"use client";

// Cadastro de bairro de entrega em modal (decisão 74, sobre CFG-03): nome, taxa e ativo.
// "Adicionar bairro" valida aqui (nome, taxa, repetido) e devolve a linha para o formulário de
// Entrega, que salva na hora. A sugestão por km (decisão 73) aparece como placeholder da taxa.
import { useId, useState } from "react";

import {
  CadastroFooter,
  CadastroModal,
  StepNavButton,
} from "../../../../components/cadastro-modal";
import { Field } from "../../../../components/form";
import { parseMoneyToCents } from "../../../../lib/ops-format";

export type NewNeighborhood = { name: string; fee: string; active: boolean };

export function NeighborhoodModal({
  existing,
  onAdd,
  onClose,
  suggestFee,
}: {
  /** Nomes já na lista (para recusar repetido). */
  existing: string[];
  onAdd: (row: NewNeighborhood) => void;
  onClose: () => void;
  /** Placeholder da taxa para o nome digitado ("R$ 0,00" sem sugestão). */
  suggestFee: (name: string) => string;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<{ name?: string; fee?: string }>({});

  function add() {
    const trimmed = name.trim();
    const next: { name?: string; fee?: string } = {};
    if (!trimmed) next.name = "Informe o nome do bairro.";
    else if (existing.some((other) => other.trim().toLowerCase() === trimmed.toLowerCase())) {
      next.name = "Este bairro já está na lista.";
    }
    if (parseMoneyToCents(fee) === null) next.fee = "Informe a taxa (R$ 0,00 = entrega grátis).";
    setErrors(next);
    if (next.name || next.fee) {
      const field = document.getElementById(next.name ? `${id}-nome` : `${id}-taxa`);
      field?.focus();
      return;
    }
    onAdd({ name: trimmed, fee, active });
  }

  return (
    <CadastroModal
      open
      size="md"
      title="Novo bairro"
      description="O Consumidor escolhe o bairro no checkout e paga a taxa dele."
      dirty={name !== "" || fee !== ""}
      onClose={onClose}
    >
      <div
        className="space-y-5"
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") {
            event.preventDefault();
            add();
          }
        }}
      >
        <div className="grid gap-5 md:grid-cols-[1fr_12rem]">
          <Field
            id={`${id}-nome`}
            label="Nome do bairro"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            maxLength={80}
            autoComplete="off"
            autoFocus
            error={errors.name}
          />
          <Field
            id={`${id}-taxa`}
            label="Taxa de entrega (R$)"
            inputMode="numeric"
            data-money=""
            autoComplete="off"
            value={fee}
            onChange={(event) => setFee(event.currentTarget.value)}
            placeholder={suggestFee(name)}
            error={errors.fee}
          />
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold text-[var(--color-ink)]">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.currentTarget.checked)}
            className="size-5 accent-[var(--color-primary-strong)]"
          />
          Entregar neste bairro agora (ativo)
        </label>
        <CadastroFooter>
          <StepNavButton variant="text" onClick={onClose}>
            Cancelar
          </StepNavButton>
          <StepNavButton variant="primary" onClick={add}>
            Adicionar bairro
          </StepNavButton>
        </CadastroFooter>
      </div>
    </CadastroModal>
  );
}
