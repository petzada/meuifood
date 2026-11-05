// Componente (decisão 67): Relatórios do Dono (Ticket 14; REL-01/REL-02, P-REL-2..5). Trocar o
// período navega para a URL da consulta; o comparativo sai como seta + texto; Exportar CSV baixa
// o arquivo com o nome da api; vazio oferece outro período; Personalizado inválido avisa.
import {
  buildFinanceReport,
  type FinanceReport,
  type ReportPeriodInput,
} from "@foode/shared/finance";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "../../../../test/render";
import type { ExportCsvResult } from "../actions";
import { ReportView } from "./report-view";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, refresh: vi.fn() }),
}));

const PERIOD = {
  preset: "7d" as const,
  from: "2026-11-01",
  to: "2026-11-07",
  days: 7,
  previous: { from: "2026-10-25", to: "2026-10-31" },
  comparisonLabel: "7 dias anteriores",
};

function report(overrides: Partial<Parameters<typeof buildFinanceReport>[0]> = {}): FinanceReport {
  return buildFinanceReport({
    period: PERIOD,
    current: [
      {
        status: "completed",
        fulfillment: "delivery",
        paymentMethod: "pix",
        orders: 10,
        totalCents: 50_000,
      },
      {
        status: "completed",
        fulfillment: "pickup",
        paymentMethod: "on_delivery",
        orders: 2,
        totalCents: 6_000,
      },
      {
        status: "cancelled",
        fulfillment: "delivery",
        paymentMethod: "pix",
        orders: 1,
        totalCents: 3_000,
      },
    ],
    previous: [
      {
        status: "completed",
        fulfillment: "delivery",
        paymentMethod: "pix",
        orders: 8,
        totalCents: 40_000,
      },
      {
        status: "cancelled",
        fulfillment: "delivery",
        paymentMethod: "pix",
        orders: 1,
        totalCents: 1_000,
      },
    ],
    items: [
      { itemKey: "i1", itemName: "Misto Quente", weekday: 1, quantity: 4, totalCents: 4_000 },
      { itemKey: "i1", itemName: "Misto Quente", weekday: 6, quantity: 2, totalCents: 2_000 },
      { itemKey: "i2", itemName: "Suco", weekday: 0, quantity: 1, totalCents: 800 },
    ],
    customers: [{ name: "Ana Lima", orders: 3, totalCents: 15_000 }],
    funnel: {
      from: "2026-11-01",
      to: "2026-11-07",
      days: [],
      totals: { visit: 100, item_view: 50, add_to_cart: 20, checkout_start: 15, order: 12 },
      stepConversionBps: { item_view: 5000, add_to_cart: 4000, checkout_start: 7500, order: 8000 },
    },
    ...overrides,
  });
}

const exportCsv = vi.fn<(period: ReportPeriodInput) => Promise<ExportCsvResult>>();

beforeEach(() => {
  navigation.push.mockReset();
  exportCsv.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Relatórios (Dono)", () => {
  it("trocar o período navega para a consulta correspondente, inclusive o Personalizado", async () => {
    const user = userEvent.setup();
    render(
      <ReportView
        exportCsv={exportCsv}
        period={{ preset: "7d" }}
        report={report()}
        storeName="Loja A"
      />,
    );
    const group = screen.getByRole("group", { name: "Período" });
    expect(within(group).getByRole("button", { name: "7 dias" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(within(group).getByRole("button", { name: "Mês atual" }));
    expect(navigation.push).toHaveBeenCalledWith("/relatorios?periodo=month");

    await user.click(within(group).getByRole("button", { name: "Personalizado" }));
    const form = screen.getByRole("form", { name: "Período personalizado" });
    const from = within(form).getByLabelText("De");
    const to = within(form).getByLabelText("Até");
    await user.clear(from);
    await user.type(from, "2026-10-01");
    await user.clear(to);
    await user.type(to, "2026-10-15");
    await user.click(within(form).getByRole("button", { name: "Aplicar período" }));
    expect(navigation.push).toHaveBeenLastCalledWith(
      "/relatorios?periodo=custom&de=2026-10-01&ate=2026-10-15",
    );
  });

  it("números do topo com comparativo em texto (seta nunca é a única pista), quebras, top itens com Dom–Sáb, TOP 10 clientes e funil", () => {
    render(
      <ReportView
        exportCsv={exportCsv}
        period={{ preset: "7d" }}
        report={report()}
        storeName="Loja A"
      />,
    );
    const summary = screen.getByRole("region", { name: "Resumo do período" });
    expect(within(summary).getByText("Pedidos").closest("section, article, div")).toBeTruthy();
    // 12 Pedidos vs. 8 = +50%; 1 cancelado vs. 1 = igual.
    expect(within(summary).getByText("+50% vs. 7 dias anteriores")).toBeInTheDocument();
    expect(within(summary).getByText("Igual vs. 7 dias anteriores")).toBeInTheDocument();
    expect(within(summary).getAllByText(/^(Subiu|Caiu|Estável):$/u)).toHaveLength(4);

    // GMV como métrica, com a definição.
    const extra = screen.getByRole("region", { name: "Métricas complementares" });
    expect(within(extra).getByText("R$ 500,00")).toBeInTheDocument();
    expect(within(extra).getByTitle(/GMV: total dos Pedidos Concluídos/u)).toBeInTheDocument();
    expect(within(extra).getByText(/Tarifa de serviço/u)).toBeInTheDocument();

    const status = screen.getByRole("table", { name: "Pedidos e total por Status" });
    expect(within(status).getByRole("row", { name: /Cancelado/u })).toHaveTextContent("1");

    const items = screen.getByRole("table", { name: /Top 10 itens/u });
    expect(
      within(items)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["#", "Item", "Qtd.", "Total", "Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]);
    const misto = within(items).getByRole("row", { name: /Misto Quente/u });
    expect(
      within(misto)
        .getAllByRole("cell")
        .map((td) => td.textContent),
    ).toEqual(["1", "6", "R$ 60,00", "0", "4", "0", "0", "0", "0", "2"]);

    const customers = screen.getByRole("table", { name: "TOP 10 clientes por valor" });
    expect(within(customers).getByRole("row", { name: /Ana Lima/u })).toHaveTextContent("3");
    expect(
      within(customers)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["#", "Cliente", "Pedidos", "Total"]);
    // P-REL-3/K1: o TOP 10 clientes não sai na impressão (botão Imprimir e Ctrl+P).
    const customersSection = screen.getByRole("region", { name: "TOP 10 clientes" });
    expect(customersSection).toHaveClass("foode-print-hide", "print:hidden");
    expect(
      within(customersSection).getByText(/não sai no CSV nem na impressão/u),
    ).toBeInTheDocument();
    // O restante do relatório continua imprimível.
    for (const name of ["Top 10 itens", "Funil de conversão", "Por status"]) {
      expect(screen.getByRole("region", { name })).not.toHaveClass("foode-print-hide");
      expect(screen.getByRole("region", { name })).not.toHaveClass("print:hidden");
    }

    const funnel = screen.getByRole("table", { name: "Funil de conversão do Storefront" });
    expect(within(funnel).getByRole("row", { name: /Fizeram Pedido/u })).toHaveTextContent("80%");
  });

  it("Exportar CSV baixa o arquivo com o nome vindo da api", async () => {
    const createObjectURL = vi.fn(() => "blob:csv");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    exportCsv.mockResolvedValue({
      ok: true,
      file: {
        filename: "relatorio-loja-a-2026-11-01-a-2026-11-07.csv",
        contentType: "text/csv; charset=utf-8",
        csv: "﻿Relatório;De\r\n",
      },
    });
    const user = userEvent.setup();
    render(
      <ReportView
        exportCsv={exportCsv}
        period={{ preset: "7d" }}
        report={report()}
        storeName="Loja A"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(exportCsv).toHaveBeenCalledWith({ preset: "7d" });
    expect(
      await screen.findByText(/CSV exportado: relatorio-loja-a-2026-11-01-a-2026-11-07\.csv/u),
    ).toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("relatorio-loja-a-2026-11-01-a-2026-11-07.csv");
    click.mockRestore();
  });

  it("falha na exportação avisa sem baixar nada", async () => {
    const createObjectURL = vi.fn(() => "blob:csv");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    exportCsv.mockResolvedValue({ ok: false, message: "A api não respondeu." });
    const user = userEvent.setup();
    render(
      <ReportView
        exportCsv={exportCsv}
        period={{ preset: "7d" }}
        report={report()}
        storeName="Loja A"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(await screen.findByText("A api não respondeu.")).toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("vazio: 'Nenhum Pedido neste período' com atalhos para outro período; CSV e Imprimir desligados", async () => {
    const user = userEvent.setup();
    render(
      <ReportView
        exportCsv={exportCsv}
        period={{ preset: "today" }}
        report={report({ current: [], previous: [], items: [], customers: [] })}
        storeName="Loja A"
      />,
    );
    expect(screen.getByText("Nenhum Pedido neste período")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeDisabled();
    const empty = screen.getByText("Nenhum Pedido neste período").parentElement!;
    await user.click(within(empty).getByRole("button", { name: "30 dias" }));
    expect(navigation.push).toHaveBeenCalledWith("/relatorios?periodo=30d");
  });

  it("Personalizado com fim no futuro: aviso com saída, sem derrubar a tela", () => {
    render(
      <ReportView
        exportCsv={exportCsv}
        invalid
        period={{ preset: "custom", from: "2030-01-01", to: "2030-01-05" }}
        report={null}
        storeName="Loja A"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("O período termina no futuro");
    expect(screen.getByRole("button", { name: "Ver Hoje" })).toBeInTheDocument();
  });
});
