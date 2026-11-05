// Componente (decisão 67): formulário do Cupom (CUP-02/03/05, P-CUP-1/3/5). Modelo só preenche
// (nada é ativado sem salvar), dias da semana D S T Q Q S S, teto do % opcional, resumo vivo e
// validação no envio com o parser real do contrato. A RPC é mocada pela action falsa.
import { COUPON_TEMPLATES } from "@foode/shared/coupon";
import { formatBRL } from "@foode/shared/money";
import { screen, waitFor, within } from "@testing-library/react";

import { render } from "../../../../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  EMPTY_COUPON,
  couponSummaryPt,
  parseCouponCreate,
  weekdaysLabelPt,
} from "../../../../lib/coupon-forms";
import { formError, type FormState } from "../../../../lib/ops-forms";
import { CouponForm } from "./coupon-form";

const created: unknown[] = [];

/** Igual à server action: valida com o parser do contrato. */
async function createAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseCouponCreate(formData);
  if (!parsed.ok) return formError(parsed.errors);
  created.push(parsed.data);
  return { errors: {}, message: "Cupom criado.", status: "success" };
}

function setup() {
  const user = userEvent.setup();
  render(
    <CouponForm
      action={createAction}
      initial={EMPTY_COUPON}
      mode="create"
      templates={COUPON_TEMPLATES}
    />,
  );
  return { user };
}

describe("CouponForm (criar)", () => {
  it("envio vazio destaca o código e o valor sem chamar a RPC", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Criar Cupom" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Código")).toHaveAttribute("aria-invalid", "true"),
    );
    expect(screen.getByLabelText("Código")).toHaveFocus();
    expect(screen.queryByRole("alert", { name: /Confira/u })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Desconto (%)")).toHaveAttribute("aria-invalid", "true");
    expect(created).toHaveLength(0);
  });

  it("modelo só preenche o formulário e o resumo vivo acompanha; dias e teto vão no envio", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "15% de segunda a quinta (até R$ 20)" }));
    expect(screen.getByLabelText("Código")).toHaveValue("SEMANA15");
    expect(screen.getByLabelText("Desconto (%)")).toHaveValue("15");
    expect(screen.getByLabelText("Teto do desconto em R$ (opcional)")).toHaveValue("R$ 20,00");
    expect(screen.getByLabelText("Limite total de usos (opcional)")).toHaveValue("100");
    const days = within(screen.getByRole("group", { name: "Dias da semana" }));
    expect(days.getByRole("checkbox", { name: "segunda" })).toBeChecked();
    expect(days.getByRole("checkbox", { name: "quinta" })).toBeChecked();
    expect(days.getByRole("checkbox", { name: "domingo" })).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(
      "15% (até R$ 20,00) de desconto, em qualquer Pedido, segunda, terça, quarta e quinta, até 100 usos, sem data para acabar.",
    );
    // Nada foi gravado só por escolher o modelo (CUP-05).
    expect(created).toHaveLength(0);

    // Ajusta: tira a quinta, põe o sábado, pedido mínimo e validade.
    await user.click(days.getByRole("checkbox", { name: "quinta" }));
    await user.click(days.getByRole("checkbox", { name: "sábado" }));
    // Máscara em centavos: digitar 3000 vira R$ 30,00.
    await user.type(screen.getByLabelText("Pedido mínimo em R$ (opcional)"), "3000");
    await user.type(screen.getByLabelText("Vale até (opcional)"), "2026-11-30");
    expect(screen.getByRole("status")).toHaveTextContent(
      "em Pedidos a partir de R$ 30,00 em itens, segunda, terça, quarta e sábado, até 100 usos, válido até 30/11/2026.",
    );

    await user.click(screen.getByRole("button", { name: "Criar Cupom" }));
    expect(await screen.findByText("Cupom criado.")).toBeInTheDocument();
    expect(created).toEqual([
      {
        active: true,
        code: "SEMANA15",
        endsOn: "2026-11-30",
        kind: "percent",
        maxDiscountCents: 2000,
        minOrderCents: 3000,
        percent: 15,
        startsOn: null,
        usageLimit: 100,
        weekdays: [1, 2, 3, 6],
      },
    ]);
  });

  it("código vira maiúsculas sem espaços; tipo R$ troca os campos", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Código"), "ganhe 5!");
    expect(screen.getByLabelText("Código")).toHaveValue("GANHE5");
    await user.click(screen.getByRole("radio", { name: "Valor fixo (R$)" }));
    expect(screen.queryByLabelText("Desconto (%)")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Desconto em R$"), "5,00");
    expect(screen.getByRole("status")).toHaveTextContent("R$ 5,00 de desconto, em qualquer Pedido");
  });
});

describe("coupon-forms", () => {
  it("resumo e dias da semana em PT-BR", () => {
    expect(weekdaysLabelPt([])).toBe("todos os dias");
    expect(weekdaysLabelPt([7])).toBe("só domingo");
    expect(weekdaysLabelPt([1, 7])).toBe("domingo e segunda");
    expect(
      couponSummaryPt({
        discount: { kind: "fixed", amountCents: 500 },
        endsOn: null,
        minOrderCents: 4000,
        startsOn: "2026-12-01",
        usageLimit: null,
        weekdays: [],
      }),
    ).toBe(
      `${formatBRL(500)} de desconto, em Pedidos a partir de ${formatBRL(4000)} em itens, válido a partir de 01/12/2026. O desconto nunca vale para a taxa de entrega.`,
    );
  });

  it("parser recusa fim antes do início no campo certo", () => {
    const form = new FormData();
    form.set("code", "TESTE");
    form.set("kind", "percent");
    form.set("percent", "10");
    form.set("startsOn", "2026-12-10");
    form.set("endsOn", "2026-12-01");
    form.set("active", "on");
    const result = parseCouponCreate(form);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.endsOn).toBe("A validade precisa terminar depois de começar.");
    }
    vi.restoreAllMocks();
  });
});
