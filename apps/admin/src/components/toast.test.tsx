// Toast padrão de @foode/ui (decisão 72): some em 4 s, fecha no X, empilha no máximo 3,
// erro com role="alert". Testado aqui porque o admin tem DOM (happy-dom) e Testing Library.
import { TOAST_DURATION_MS, ToastProvider, useToast } from "@foode/ui";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function Trigger() {
  const toast = useToast();
  let n = 0;
  return (
    <>
      <button type="button" onClick={() => toast.success(`Salvo ${(n += 1)}`)}>
        sucesso
      </button>
      <button type="button" onClick={() => toast.error("A api não respondeu.")}>
        erro
      </button>
    </>
  );
}

function setup() {
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
}

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("some sozinho em 4 s", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "sucesso" }));
    expect(screen.getByRole("status")).toHaveTextContent("Salvo 1");
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    });
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("fecha no X e erro usa role=alert", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "erro" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A api não respondeu.");
    fireEvent.click(screen.getByRole("button", { name: "Fechar aviso" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("empilha no máximo 3 (o mais antigo sai)", () => {
    setup();
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "sucesso" }));
    }
    const toasts = screen.getAllByRole("status");
    expect(toasts).toHaveLength(3);
    expect(toasts.map((toast) => toast.textContent)).toEqual(["Salvo 2", "Salvo 3", "Salvo 4"]);
  });
  it("ação de um toque (Storefront: Ver carrinho/Desfazer) roda e fecha; duração própria", () => {
    const onUndo = vi.fn();
    function WithAction() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() =>
            toast.show("X-Burger removido", {
              action: { label: "Desfazer", onClick: onUndo },
              durationMs: 5000,
            })
          }
        >
          remover
        </button>
      );
    }
    render(
      <ToastProvider>
        <WithAction />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "remover" }));
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS));
    expect(screen.getByRole("status")).toHaveTextContent("X-Burger removido");
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
