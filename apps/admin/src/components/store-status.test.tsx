// Componente: selo de status da Loja e Pausa a um clique (NAV-04, CFG-02, P-OPE-4). Ligar pede
// confirmação curta; a faixa persistente diz quem ativou; sem `store.pause` o selo é só leitura.
import type { PauseState } from "@foode/shared/order";
import { screen } from "@testing-library/react";

import { render } from "../test/render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PauseBand, StoreStatusControl } from "./store-status";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const PAUSED: PauseState = {
  paused: true,
  pausedAt: "2026-11-05T21:42:00.000Z",
  pausedBy: { userId: "u2", name: "Ana", role: "operator" },
};

describe("StoreStatusControl", () => {
  it("Pausar pede confirmação e só então chama a action", async () => {
    const user = userEvent.setup();
    const setPause = vi.fn(async (paused: boolean) =>
      paused
        ? ({ ok: true, pause: PAUSED } as const)
        : ({ ok: true, pause: { paused: false } } as const),
    );
    render(
      <StoreStatusControl
        canPause
        setPause={setPause}
        status={{
          open: { state: "open", closesAt: "2026-11-05T23:00:00.000Z" },
          pause: { paused: false },
        }}
      />,
    );
    expect(screen.getByText("Aberta · fecha às 20:00")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pausar Pedidos" }));
    expect(setPause).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Pausar os Pedidos agora?" })).toHaveTextContent(
      "O checkout fica bloqueado até você retomar.",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar Pausa" }));
    expect(setPause).toHaveBeenCalledWith(true);
    expect(refresh).toHaveBeenCalled();
  });

  it("com Pausa ativa: selo Em Pausa, Retomar direto e faixa com quem ativou", async () => {
    const user = userEvent.setup();
    const setPause = vi.fn(async () => ({ ok: true, pause: { paused: false } }) as const);
    render(
      <>
        <StoreStatusControl
          canPause
          setPause={setPause}
          status={{ open: { state: "paused" }, pause: PAUSED }}
        />
        <PauseBand canPause pause={PAUSED} setPause={setPause} />
      </>,
    );
    expect(screen.getByText("Em Pausa")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Pausa ativada por Ana (Operador) às 18:42",
    );
    const [retomar] = screen.getAllByRole("button", { name: "Retomar" });
    await user.click(retomar!);
    expect(setPause).toHaveBeenCalledWith(false);
  });

  it("sem permissão de Pausa o selo é só leitura", () => {
    render(
      <StoreStatusControl
        canPause={false}
        status={{ open: { state: "closed", nextOpening: null }, pause: { paused: false } }}
      />,
    );
    expect(screen.getByText("Fechada · sem horários")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
