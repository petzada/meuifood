// Componente (decisão 67): "A repassar hoje" e "Marcar lote pago" (Ticket 14; OPS-04). A action
// falsa reproduz a server action com o parser do contrato e a RPC mocada: o payload chega
// completo (storeId, asOf, expectedAmountCents, idempotencyKey, data, conta, identificador,
// custo); `conflict` avisa e recarrega; Loja sem conta não tem o botão.
import type {
  OpsPayoutsDueView,
  OpsPayoutDueStoreView,
  OpsPayoutMarkPaidInput,
} from "@foode/shared/finance";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "../../../../../test/render";
import {
  MARK_PAID_CONFLICT_MESSAGE,
  type MarkPaidState,
  parseMarkPaid,
} from "../../../../../lib/finance-forms";
import { formError, formSuccess } from "../../../../../lib/ops-forms";
import { PayoutsDue } from "./payouts-due";
import type { MarkPaidAction } from "./mark-paid-modal";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: navigation.refresh }),
}));

const STORE_ID = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";

const store = (overrides: Partial<OpsPayoutDueStoreView> = {}): OpsPayoutDueStoreView => ({
  storeId: STORE_ID,
  storeName: "Loja A",
  storeSlug: "loja-a",
  payout: { pixKeyType: "cnpj", pixKey: "12345678000199", holderName: "Loja A LTDA" },
  payable: true,
  entriesCents: 12_000,
  debitsCents: 2_000,
  adjustmentsCents: 0,
  amountCents: 10_000,
  itemCount: 3,
  items: [
    {
      kind: "entry",
      id: "e1",
      amountCents: 7_000,
      orderCode: 101,
      method: "pix",
      expectedPayoutDate: "2026-11-05",
      reason: null,
    },
    {
      kind: "entry",
      id: "e2",
      amountCents: 5_000,
      orderCode: 102,
      method: "credit",
      expectedPayoutDate: "2026-11-04",
      reason: null,
    },
    {
      kind: "debit",
      id: "d1",
      amountCents: -2_000,
      orderCode: 99,
      method: "pix",
      expectedPayoutDate: "2026-11-05",
      reason: null,
    },
  ],
  ...overrides,
});

const view = (stores: OpsPayoutDueStoreView[]): OpsPayoutsDueView => ({
  asOf: "2026-11-05",
  isBusinessDay: true,
  stores,
});

const rpc = vi.fn<(input: OpsPayoutMarkPaidInput) => Promise<"ok" | "conflict">>();

const action: MarkPaidAction = async (_prev, formData): Promise<MarkPaidState> => {
  const parsed = parseMarkPaid(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const result = await rpc(parsed.data);
  if (result === "conflict")
    return { ...formError({}, MARK_PAID_CONFLICT_MESSAGE), conflict: true };
  return formSuccess("Lote pago: R$ 100,00 em 3 itens.");
};

beforeEach(() => {
  rpc.mockReset();
  navigation.refresh.mockReset();
});

describe("A repassar hoje (Ops)", () => {
  it("mostra total, chave Pix, titular e débitos compensados por Loja; sem conta não há botão", () => {
    render(
      <PayoutsDue
        action={action}
        view={view([
          store(),
          store({
            storeId: "1f1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f",
            storeName: "Loja B",
            storeSlug: "loja-b",
            payout: null,
            payable: false,
          }),
        ])}
      />,
    );
    const a = screen.getByRole("article", { name: /Loja A/u });
    expect(within(a).getByText("R$ 100,00")).toBeInTheDocument();
    expect(within(a).getByText("CNPJ: 12345678000199")).toBeInTheDocument();
    expect(within(a).getByText("Loja A LTDA")).toBeInTheDocument();
    expect(within(a).getByText(/débitos de Estorno compensados − R\$ 20,00/u)).toBeInTheDocument();
    expect(within(a).getByRole("button", { name: "Marcar lote pago" })).toBeInTheDocument();

    const b = screen.getByRole("article", { name: /Loja B/u });
    expect(within(b).queryByRole("button", { name: "Marcar lote pago" })).not.toBeInTheDocument();
    expect(within(b).getByRole("note")).toHaveTextContent("Sem conta de repasse");
  });

  it("marcar lote pago: resumo antes de confirmar, depois envia o payload completo e fecha", async () => {
    rpc.mockResolvedValue("ok");
    const user = userEvent.setup();
    render(<PayoutsDue action={action} view={view([store()])} />);
    await user.click(screen.getByRole("button", { name: "Marcar lote pago" }));
    const dialog = await screen.findByRole("dialog", { name: /Marcar lote pago · Loja A/u });

    await user.selectOptions(within(dialog).getByLabelText("Conta de saída"), "abacatepay");
    await user.type(within(dialog).getByLabelText(/Identificador ou comprovante/u), "E2E123");
    const cost = within(dialog).getByLabelText("Custo do envio");
    await user.clear(cost);
    await user.type(cost, "150");
    await user.click(within(dialog).getByRole("button", { name: "Marcar lote pago" }));

    // 1ª etapa: nada gravado; o resumo diz o que muda (OPS-04).
    expect(rpc).not.toHaveBeenCalled();
    const summary = within(dialog).getByRole("status");
    expect(summary).toHaveTextContent("Marcar como pago o lote de Loja A: R$ 100,00 (3 itens");
    expect(summary).toHaveTextContent("débitos de Estorno R$ 20,00");
    expect(summary).toHaveTextContent("Pix de 05/11/2026 pela conta AbacatePay");
    expect(summary).toHaveTextContent('identificador "E2E123", custo do envio R$ 1,50');
    expect(summary).toHaveTextContent("não pode ser editado nem apagado");

    await user.click(within(dialog).getByRole("button", { name: "Confirmar lote pago" }));
    expect(rpc).toHaveBeenCalledTimes(1);
    const payload = rpc.mock.calls[0]![0];
    expect(payload).toMatchObject({
      storeId: STORE_ID,
      asOf: "2026-11-05",
      paidOn: "2026-11-05",
      sourceAccount: "abacatepay",
      reference: "E2E123",
      transferCostCents: 150,
      expectedAmountCents: 10_000,
    });
    expect(payload.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(await screen.findByText("Lote pago: R$ 100,00 em 3 itens.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it("conflito (o lote mudou): avisa, volta ao formulário e recarrega os valores", async () => {
    rpc.mockResolvedValue("conflict");
    const user = userEvent.setup();
    render(<PayoutsDue action={action} view={view([store()])} />);
    await user.click(screen.getByRole("button", { name: "Marcar lote pago" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Identificador ou comprovante/u), "E2E999");
    await user.click(within(dialog).getByRole("button", { name: "Marcar lote pago" }));
    await user.click(within(dialog).getByRole("button", { name: "Confirmar lote pago" }));

    expect(await screen.findByText(MARK_PAID_CONFLICT_MESSAGE)).toBeInTheDocument();
    expect(navigation.refresh).toHaveBeenCalled();
    expect(within(dialog).queryByRole("status")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Marcar lote pago" })).toBeInTheDocument();
  });

  it("identificador vazio não chega à RPC: erro no campo", async () => {
    const user = userEvent.setup();
    render(<PayoutsDue action={action} view={view([store()])} />);
    await user.click(screen.getByRole("button", { name: "Marcar lote pago" }));
    const dialog = await screen.findByRole("dialog");
    const reference = within(dialog).getByLabelText(/Identificador ou comprovante/u);
    reference.removeAttribute("required");
    await user.click(within(dialog).getByRole("button", { name: "Marcar lote pago" }));
    expect(await within(dialog).findByText(/Informe o identificador/u)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("vazio: 'Nada a repassar hoje.'", () => {
    render(<PayoutsDue action={action} view={view([])} />);
    expect(screen.getByText("Nada a repassar hoje.")).toBeInTheDocument();
  });
});
