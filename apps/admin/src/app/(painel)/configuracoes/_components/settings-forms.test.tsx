// Componente: configurações do Dono (CFG-01, CFG-03, P-4.3, P-IMP-1). Horários com erro
// inline por período e "Copiar para todos os dias"; Entrega com um modo de Delivery, aviso ao
// trocar e interruptor por bairro; bandeiras e Imprimir ao aceitar salvos com o parser real.
import type { StoreOperationSettings } from "@foode/shared/order";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { formError, formSuccess, type FormState } from "../../../../lib/ops-forms";
import {
  parseSetCardBrands,
  parseSetFulfillment,
  parseSetHours,
  parseSetPrintOnAccept,
} from "../../../../lib/settings-forms";
import { FulfillmentForm } from "./fulfillment-form";
import { HoursForm } from "./hours-form";
import { CardBrandsForm, PrintOnAcceptForm } from "./payment-forms";

const SETTINGS: StoreOperationSettings = {
  pause: { paused: false },
  hours: [{ weekday: 1, opensAt: "11:00", closesAt: "14:00" }],
  pickupEnabled: true,
  deliveryMode: "neighborhood",
  fixedFeeCents: null,
  neighborhoods: [
    { id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", name: "Centro", feeCents: 500, active: true },
  ],
  deliveryMinimumOrderCents: null,
  deliveryEta: { minMinutes: 30, maxMinutes: 45 },
  pickupEta: null,
  cardBrands: { debit: ["visa"], credit: [] },
  printOnAccept: false,
};

/** Igual às server actions: parser do contrato e RPC mocada. */
function actionWith<T>(
  parse: (form: FormData) => { ok: true; data: T } | { ok: false; errors: Record<string, string> },
) {
  const rpc = vi.fn<(data: T) => Promise<void>>(async () => undefined);
  const action = async (_prev: FormState, formData: FormData): Promise<FormState> => {
    const parsed = parse(formData);
    if (!parsed.ok) return formError(parsed.errors, "Confira os campos destacados.");
    await rpc(parsed.data);
    return formSuccess("Salvo.");
  };
  return { action, rpc };
}

describe("HoursForm", () => {
  it("copia a Segunda para todos os dias e salva a grade inteira", async () => {
    const user = userEvent.setup();
    const { action, rpc } = actionWith(parseSetHours);
    render(<HoursForm action={action} initial={SETTINGS.hours} />);
    const save = screen.getByRole("button", { name: "Salvar alterações" });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Copiar Segunda para todos os dias" }));
    expect(screen.getAllByLabelText(/início do período/u)).toHaveLength(7);
    expect(save).toBeEnabled();
    await user.click(save);
    expect(rpc).toHaveBeenCalledTimes(1);
    const periods = rpc.mock.calls[0]![0].periods;
    expect(periods).toHaveLength(7);
    expect(periods[6]).toEqual({ weekday: 7, opensAt: "11:00", closesAt: "14:00" });
    expect(await screen.findByRole("status")).toHaveTextContent("Salvo.");
  });

  it("início ≥ fim é erro inline no período, sem chamar a RPC", async () => {
    const user = userEvent.setup();
    const { action, rpc } = actionWith(parseSetHours);
    render(<HoursForm action={action} initial={SETTINGS.hours} />);
    const end = screen.getByLabelText("Segunda, fim do período");
    await user.clear(end);
    await user.type(end, "10:00");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(end).toHaveAttribute("aria-invalid", "true");
    expect(end).toHaveAccessibleDescription("O início precisa ser antes do fim (HH:MM).");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("+ Período adiciona uma linha no dia e sobreposição é apontada", async () => {
    const user = userEvent.setup();
    const { action, rpc } = actionWith(parseSetHours);
    render(<HoursForm action={action} initial={SETTINGS.hours} />);
    const [addMonday] = screen.getAllByRole("button", { name: "+ Período" });
    await user.click(addMonday!);
    const starts = screen.getAllByLabelText("Segunda, início do período");
    const ends = screen.getAllByLabelText("Segunda, fim do período");
    await user.type(starts[1]!, "13:00");
    await user.type(ends[1]!, "18:00");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(ends[1]).toHaveAccessibleDescription("Este período se sobrepõe a outro do mesmo dia.");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("FulfillmentForm", () => {
  it("trocar para Taxa fixa avisa o que deixa de valer e exige o valor", async () => {
    const user = userEvent.setup();
    const { action, rpc } = actionWith(parseSetFulfillment);
    render(<FulfillmentForm action={action} initial={SETTINGS} />);
    await user.click(screen.getByRole("radio", { name: "Taxa fixa" }));
    expect(screen.getByRole("status")).toHaveTextContent("a lista de bairros deixa de valer");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(screen.getByLabelText("Taxa fixa (R$)")).toHaveAccessibleDescription(
      /Informe a Taxa fixa/u,
    );
    expect(rpc).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Taxa fixa (R$)"), "6,00");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(rpc).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryMode: "fixed", fixedFeeCents: 600, pickupEnabled: true }),
    );
  });

  it("interruptor do bairro e '+ Bairro' vão no envio; sem bairro ativo é erro", async () => {
    const user = userEvent.setup();
    const { action, rpc } = actionWith(parseSetFulfillment);
    render(<FulfillmentForm action={action} initial={SETTINGS} />);
    const table = screen.getByRole("table", { name: "Bairros atendidos" });
    await user.click(within(table).getByRole("switch", { name: "Ativo" }));
    expect(within(table).getByRole("switch", { name: "Inativo" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(
      screen.getByText("Ative pelo menos um bairro para entregar por bairro."),
    ).toHaveAttribute("role", "alert");
    expect(rpc).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "+ Bairro" }));
    await user.type(screen.getByLabelText("Nome do bairro 2"), "Jardins");
    await user.type(screen.getByLabelText("Taxa do bairro 2 (R$)"), "8,00");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(rpc).toHaveBeenCalledWith(
      expect.objectContaining({
        neighborhoods: [
          expect.objectContaining({ name: "Centro", active: false }),
          { name: "Jardins", feeCents: 800, active: true },
        ],
      }),
    );
  });

  it("tempo estimado com mínimo maior que o máximo é erro no campo", async () => {
    const user = userEvent.setup();
    const { action, rpc } = actionWith(parseSetFulfillment);
    render(<FulfillmentForm action={action} initial={SETTINGS} />);
    const max = screen.getByLabelText("Tempo estimado do Delivery: máximo em minutos");
    await user.clear(max);
    await user.type(max, "10");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(max).toHaveAccessibleDescription("O mínimo não pode passar do máximo.");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("bandeiras e Imprimir ao aceitar", () => {
  it("salva Débito e Crédito separados", async () => {
    const user = userEvent.setup();
    const { action, rpc } = actionWith(parseSetCardBrands);
    render(<CardBrandsForm action={action} initial={SETTINGS.cardBrands} />);
    const credit = screen.getByRole("group", { name: "Crédito" });
    await user.click(within(credit).getByRole("checkbox", { name: "Mastercard" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(rpc).toHaveBeenCalledWith({ debit: ["visa"], credit: ["mastercard"] });
  });

  it("liga Imprimir ao aceitar", async () => {
    const user = userEvent.setup();
    const { action, rpc } = actionWith(parseSetPrintOnAccept);
    render(<PrintOnAcceptForm action={action} initial={false} />);
    await user.click(screen.getByRole("switch", { name: "Imprimir ao aceitar o Pedido" }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(rpc).toHaveBeenCalledWith({ printOnAccept: true });
  });
});
