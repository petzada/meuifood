// `render` dos testes de componente com o ToastProvider do layout raiz: os avisos efêmeros do
// Storefront saem no Toast padrão de `@foode/ui` (decisão 74).
import { ToastProvider } from "@foode/ui";
import { render as rtlRender, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

function Providers({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

export function render(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return rtlRender(ui, { wrapper: Providers, ...options });
}
