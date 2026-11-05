// Setup dos testes de componente: matchers do jest-dom (`toBeInTheDocument`,
// `toHaveAccessibleName`...) e DOM limpo entre testes (sem `globals`, o Testing Library
// não registra o cleanup sozinho).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
