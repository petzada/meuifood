// Componente: configurações do Dono (CFG-01, CFG-03, P-4.3, P-IMP-1). Horários com erro
// inline por período e "Copiar para todos os dias"; Entrega com um modo de Delivery, aviso ao
// trocar e interruptor por bairro; bandeiras e Imprimir ao aceitar salvos com o parser real.
import type { StoreOperationSettings } from "@foode/shared/order";
import { screen, waitFor, within } from "@testing-library/react";

import { render } from "../../../../test/render";
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
    if (!parsed.ok) return formError(parsed.errors);
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
    render(<FulfillmentForm action={action} initial={SETTINGS} storeId="loja-a" storage={null} />);
    await user.click(screen.getByRole("radio", { name: "Taxa fixa" }));
    expect(screen.getByRole("status")).toHaveTextContent("a lista de bairros deixa de valer");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(screen.getByLabelText("Taxa fixa (R$)")).toHaveAccessibleDescription(
      /Informe a Taxa fixa/u,
    );
    expect(rpc).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Taxa fixa (R$)"), "6,00");
    expect(screen.getByLabelText("Taxa fixa (R$)")).toHaveValue("R$ 6,00");
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(rpc).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryMode: "fixed", fixedFeeCents: 600, pickupEnabled: true }),
    );
  });

  it("interruptor do bairro e '+ Bairro' (modal) vão no envio; sem bairro ativo é erro", async () => {
    const user = userEvent.setup();
    const { action, rpc } = actionWith(parseSetFulfillment);
    render(<FulfillmentForm action={action} initial={SETTINGS} storeId="loja-a" storage={null} />);
    const table = screen.getByRole("table", { name: "Bairros atendidos" });
    await user.click(within(table).getByRole("switch", { name: "Ativo" }));
    expect(within(table).getByRole("switch", { name: "Inativo" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(
      screen.getByText("Ative pelo menos um bairro para entregar por bairro."),
    ).toHaveAttribute("role", "alert");
    expect(rpc).not.toHaveBeenCalled();

    // Cadastro do bairro em modal (decisão 74): valida aqui e, ao adicionar, salva na hora.
    await user.click(screen.getByRole("button", { name: "+ Bairro" }));
    const dialog = screen.getByRole("dialog", { name: "Novo bairro" });
    await user.click(within(dialog).getByRole("button", { name: "Adicionar bairro" }));
    expect(within(dialog).getByLabelText("Nome do bairro")).toHaveAccessibleDescription(
      "Informe o nome do bairro.",
    );
    await user.type(within(dialog).getByLabelText("Nome do bairro"), "centro");
    await user.type(within(dialog).getByLabelText("Taxa de entrega (R$)"), "8,00");
    await user.click(within(dialog).getByRole("button", { name: "Adicionar bairro" }));
    expect(within(dialog).getByLabelText("Nome do bairro")).toHaveAccessibleDescription(
      "Este bairro já está na lista.",
    );
    await user.clear(within(dialog).getByLabelText("Nome do bairro"));
    await user.type(within(dialog).getByLabelText("Nome do bairro"), "Jardins");
    await user.click(within(dialog).getByRole("button", { name: "Adicionar bairro" }));
    expect(screen.queryByRole("dialog", { name: "Novo bairro" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nome do bairro 2")).toHaveValue("Jardins");
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
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
    render(<FulfillmentForm action={action} initial={SETTINGS} storeId="loja-a" storage={null} />);
    const max = screen.getByLabelText("Tempo estimado do Delivery: máximo em minutos");
    await user.clear(max);
    await user.type(max, "10");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(max).toHaveAccessibleDescription("O mínimo não pode passar do máximo.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("R$/km sugere as taxas como placeholder (bairro, Taxa fixa e mínimo) sem ir no envio", async () => {
    const user = userEvent.setup();
    const { action, rpc } = actionWith(parseSetFulfillment);
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    } as unknown as Storage;
    // Sé (Loja) → Paulista ("Centro" do teste): ~2,5 km em linha reta, ~3,3 km de rota.
    const locate = vi.fn(async (query: string) =>
      query.startsWith("Sé")
        ? { lat: -23.5503, lng: -46.6339 }
        : query.startsWith("Centro")
          ? { lat: -23.5614, lng: -46.6559 }
          : null,
    );
    render(
      <FulfillmentForm
        action={action}
        area={{ district: "Sé", city: "São Paulo", state: "SP" }}
        initial={SETTINGS}
        locate={locate}
        storage={storage}
        storeId="loja-a"
      />,
    );
    const perKm = screen.getByLabelText("Quanto você cobra por km (R$)");
    await user.type(perKm, "200");
    expect(perKm).toHaveValue("R$ 2,00");
    expect(store.get("foode.painel.reais-por-km.v1:loja-a")).toBe("R$ 2,00");

    const fee = screen.getByLabelText("Taxa do bairro 1 (R$)");
    await waitFor(() => expect(fee.getAttribute("placeholder")).toMatch(/^R\$ 6,\d\d$/u), {
      timeout: 3000,
    });
    // Mínimo = 3× a Taxa fixa sugerida (aqui a média de um bairro só).
    const minimum = screen.getByLabelText("Pedido mínimo do Delivery (R$)");
    expect(minimum.getAttribute("placeholder")).toMatch(/^R\$ 1\d,\d\d$/u);

    // Bairro que o geocodificador não acha = R$ 0,00 (falha silenciosa).
    await user.click(screen.getByRole("button", { name: "+ Bairro" }));
    const dialog = screen.getByRole("dialog", { name: "Novo bairro" });
    expect(within(dialog).getByLabelText("Taxa de entrega (R$)")).toHaveAttribute(
      "placeholder",
      "R$ 0,00",
    );

    // O R$/km não é campo do contrato: só a taxa confirmada vai no envio.
    await user.type(within(dialog).getByLabelText("Nome do bairro"), "Lugar Nenhum");
    await user.type(within(dialog).getByLabelText("Taxa de entrega (R$)"), "500");
    await user.click(within(dialog).getByRole("button", { name: "Adicionar bairro" }));
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith(
      expect.objectContaining({
        neighborhoods: [
          expect.objectContaining({ name: "Centro", feeCents: 500 }),
          { name: "Lugar Nenhum", feeCents: 500, active: true },
        ],
      }),
    );
    expect(JSON.stringify(rpc.mock.calls[0])).not.toContain("km");
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
