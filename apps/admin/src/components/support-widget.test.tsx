// Componente (decisão 67): ponto de montagem do widget de suporte no Painel (Ticket 30).
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SUPPORT_WIDGET_SCRIPT_ID, SupportWidget } from "./support-widget";

let pathname = "/pedidos";

vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/script", () => ({
  default: (props: Record<string, string>) => (
    <script
      data-foode-surface={props["data-foode-surface"]}
      data-widget-id={props["data-widget-id"]}
      id={props.id}
      src={props.src}
    />
  ),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  pathname = "/pedidos";
});

describe("SupportWidget (Painel)", () => {
  it("sem configuração não renderiza nada", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_WIDGET_SRC", "");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_WIDGET_ID", "");
    const { container } = render(<SupportWidget />);
    expect(container).toBeEmptyDOMElement();
  });

  it("configurado: carrega o script com o id público e a superfície painel", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_WIDGET_SRC", "https://widget.agentes.chat/loader.js");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_WIDGET_ID", "foode-painel");
    const { container } = render(<SupportWidget />);
    const script = container.querySelector(`#${SUPPORT_WIDGET_SCRIPT_ID}`);
    expect(script).toHaveAttribute("src", "https://widget.agentes.chat/loader.js");
    expect(script).toHaveAttribute("data-widget-id", "foode-painel");
    expect(script).toHaveAttribute("data-foode-surface", "painel");
  });

  it("nunca em /definir-senha (token de convite/reset na URL)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_WIDGET_SRC", "https://widget.agentes.chat/loader.js");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_WIDGET_ID", "foode-painel");
    pathname = "/definir-senha";
    const { container } = render(<SupportWidget />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sem wa.me de suporte (decisão 64)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_WIDGET_SRC", "https://wa.me/5511999999999");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_WIDGET_ID", "foode-painel");
    const { container } = render(<SupportWidget />);
    expect(container).toBeEmptyDOMElement();
  });
});
