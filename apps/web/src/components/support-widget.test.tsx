// Componente (decisão 67): ponto de montagem do widget de suporte no Storefront (Ticket 30).
// Sem configuração nada aparece; com configuração, um único `<script>` do carregador; nunca nas
// páginas com o token do Pedido na URL.
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isSecretPath, storefrontSupportChatActive } from "../lib/support-widget";
import { SUPPORT_WIDGET_SCRIPT_ID, SupportWidget } from "./support-widget";

let pathname = "/loja/loja-a";

vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/script", () => ({
  default: (props: Record<string, string>) => (
    <script
      data-foode-surface={props["data-foode-surface"]}
      data-widget-id={props["data-widget-id"]}
      data-testid="widget-script"
      id={props.id}
      src={props.src}
    />
  ),
}));

const SRC = "https://widget.agentes.chat/loader.js";

function configure(src: string, id: string) {
  vi.stubEnv("NEXT_PUBLIC_SUPPORT_WIDGET_SRC", src);
  vi.stubEnv("NEXT_PUBLIC_SUPPORT_WIDGET_ID", id);
}

afterEach(() => {
  vi.unstubAllEnvs();
  pathname = "/loja/loja-a";
});

describe("SupportWidget (Storefront)", () => {
  it("sem configuração não renderiza nada", () => {
    configure("", "");
    const { container } = render(<SupportWidget />);
    expect(container).toBeEmptyDOMElement();
    expect(storefrontSupportChatActive("/loja/loja-a")).toBe(false);
  });

  it("configurado: carrega o script do agentes.chat com o id público", () => {
    configure(SRC, "foode-suporte");
    const { container } = render(<SupportWidget />);
    const script = container.querySelector(`#${SUPPORT_WIDGET_SCRIPT_ID}`);
    expect(script).toHaveAttribute("src", SRC);
    expect(script).toHaveAttribute("data-widget-id", "foode-suporte");
    expect(script).toHaveAttribute("data-foode-surface", "storefront");
    expect(storefrontSupportChatActive("/loja/loja-a/finalizar")).toBe(true);
  });

  it("nunca na página do Pedido (token na URL)", () => {
    configure(SRC, "foode-suporte");
    pathname = "/loja/loja-a/pedido/abcDEF123_-xyz";
    const { container } = render(<SupportWidget />);
    expect(container).toBeEmptyDOMElement();
    expect(isSecretPath(pathname)).toBe(true);
    expect(storefrontSupportChatActive(pathname)).toBe(false);
    expect(isSecretPath("/loja/loja-a/finalizar")).toBe(false);
  });

  it("wa.me configurado por engano fica desligado (decisão 64)", () => {
    configure("https://wa.me/5511999999999", "foode-suporte");
    const { container } = render(<SupportWidget />);
    expect(container).toBeEmptyDOMElement();
  });
});
