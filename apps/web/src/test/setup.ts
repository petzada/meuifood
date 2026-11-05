// Setup dos testes de componente: matchers do jest-dom (`toBeInTheDocument`,
// `toHaveAccessibleName`...) e DOM limpo entre testes (sem `globals`, o Testing Library
// não registra o cleanup sozinho).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// O `navigator.sendBeacon` do happy-dom chama o `fetch` real dele numa promise solta, que
// rejeita (rede) fora de qualquer try/catch e suja os testes de componente. O funil do
// Storefront (Ticket 28) usa o beacon; aqui ele vira um no-op (os testes do funil injetam o
// transporte).
if (typeof navigator !== "undefined") {
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: () => true });
}
