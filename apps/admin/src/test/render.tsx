// `render` dos testes de componente com o ToastProvider do layout raiz: o feedback das ações sai
// em Toast (decisão 72) e os campos de R$ usam a máscara global: o teste monta os mesmos
// providers do layout raiz.
import { ToastProvider } from "@foode/ui";
import { render as rtlRender, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { MoneyMaskRoot } from "../components/money-mask-root";

function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <MoneyMaskRoot />
      {children}
    </ToastProvider>
  );
}

export function render(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return rtlRender(ui, { wrapper: Providers, ...options });
}
