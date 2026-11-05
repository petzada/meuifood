// Componente: bloco do PIX na página do Pedido (§6 PIX). QR, copia-e-cola com "Código copiado"
// no Toast padrão (`role="status"`, decisão 74), valor, contagem regressiva e os estados (gerando, pago, expirado, falhou).
import type { OrderPix } from "@foode/shared/payment";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "../../../../../test/render";
import { PixPayment } from "./pix-payment";

const NOW = Date.parse("2026-11-05T15:00:00.000Z");
const pending: OrderPix = {
  state: "pending",
  amountCents: 5330,
  copyPaste: "00020101021226950014br.gov.bcb.pix",
  qrCodeDataUrl: "data:image/png;base64,iVBORw0KGgo=",
  expiresAt: "2026-11-05T15:30:00.000Z",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("PixPayment", () => {
  it("mostra QR, copia-e-cola, valor e tempo restante; 'Copiar código' avisa em role=status", async () => {
    const copy = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(<PixPayment copy={copy} menuHref="/loja/x" now={() => NOW} pix={pending} />);
    expect(screen.getByRole("heading", { name: "Aguardando pagamento" })).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(screen.getByText("R$ 53,30")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "QR Code do PIX" })).toHaveAttribute(
      "src",
      pending.qrCodeDataUrl,
    );
    expect(screen.getByLabelText("PIX copia e cola")).toHaveValue(pending.copyPaste);
    expect(screen.getByText("30:00")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copiar código" }));
    expect(copy).toHaveBeenCalledWith(pending.copyPaste);
    expect(screen.getByRole("status")).toHaveTextContent("Código copiado");
  });

  it("falha ao copiar orienta copiar manualmente", async () => {
    const user = userEvent.setup();
    render(
      <PixPayment
        copy={async () => Promise.reject(new Error("negado"))}
        menuHref="/loja/x"
        now={() => NOW}
        pix={pending}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Copiar código" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/copie manualmente/u);
  });

  it("contagem regressiva anda a cada segundo e, no fim, avisa que está conferindo", () => {
    vi.useFakeTimers();
    let clock = Date.parse("2026-11-05T15:29:58.000Z");
    render(<PixPayment copy={vi.fn()} menuHref="/loja/x" now={() => clock} pix={pending} />);
    expect(screen.getByText("0:02")).toBeInTheDocument();
    clock += 1000;
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("0:01")).toBeInTheDocument();
    clock += 2000;
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("heading", { name: "Conferindo o pagamento" })).toBeInTheDocument();
  });

  it("pago, gerando, expirado e falhou", () => {
    const { rerender } = render(
      <PixPayment
        menuHref="/loja/x"
        now={() => NOW}
        pix={{ ...pending, state: "paid", copyPaste: null, qrCodeDataUrl: null, expiresAt: null }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Pagamento confirmado" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copiar código" })).not.toBeInTheDocument();

    rerender(
      <PixPayment
        menuHref="/loja/x"
        now={() => NOW}
        pix={{ ...pending, state: "creating", copyPaste: null, qrCodeDataUrl: null }}
      />,
    );
    expect(screen.getByText(/Gerando o código do PIX/u)).toBeInTheDocument();

    rerender(
      <PixPayment
        menuHref="/loja/x"
        now={() => NOW}
        pix={{ ...pending, state: "expired", copyPaste: null, qrCodeDataUrl: null }}
      />,
    );
    expect(screen.getByRole("heading", { name: "PIX expirado" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fazer o pedido de novo" })).toHaveAttribute(
      "href",
      "/loja/x",
    );

    rerender(
      <PixPayment
        menuHref="/loja/x"
        now={() => NOW}
        pix={{ ...pending, state: "failed", copyPaste: null, qrCodeDataUrl: null }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Não foi possível gerar o PIX" }),
    ).toBeInTheDocument();
  });
});
