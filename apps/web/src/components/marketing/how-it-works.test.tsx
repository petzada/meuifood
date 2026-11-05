import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HOW_IT_WORKS_STEPS, HowItWorks } from "./how-it-works";

// "Como funciona": os 3 passos da esquerda são conteúdo comum, sempre visíveis — nenhum deles
// depende de `data-reveal`/observer para aparecer (bug relatado em produção: o passo a passo
// sumia ao rolar). A coluna sticky troca a tela pelo passo mais visível.
describe("HowItWorks", () => {
  const observers: { callback: IntersectionObserverCallback; targets: Element[] }[] = [];

  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("min-width"),
      addEventListener() {},
      removeEventListener() {},
    }));
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        targets: Element[] = [];
        constructor(public callback: IntersectionObserverCallback) {
          observers.push(this);
        }
        observe(target: Element) {
          this.targets.push(target);
        }
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    observers.length = 0;
    vi.unstubAllGlobals();
  });

  it("mantém os três passos visíveis, sem depender de reveal", () => {
    render(<HowItWorks />);
    const steps = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(steps).toHaveLength(HOW_IT_WORKS_STEPS.length);
    for (const [index, step] of steps.entries()) {
      expect(step).not.toHaveAttribute("data-reveal");
      expect(step).not.toHaveAttribute("data-reveal-state");
      expect(step).toHaveAttribute("data-step", String(index + 1));
      expect(
        within(step).getByRole("heading", { level: 3, name: HOW_IT_WORKS_STEPS[index]!.title }),
      ).toBeVisible();
    }
    expect(steps[0]).toHaveClass("is-active");
  });

  it("ativa o passo mais visível na viewport e troca a tela da coluna sticky", () => {
    const { container } = render(<HowItWorks />);
    const steps = within(screen.getByRole("list")).getAllByRole("listitem");
    const observer = observers[0]!;
    expect(observer.targets).toHaveLength(3);

    const entry = (target: Element, ratio: number) =>
      ({
        target,
        intersectionRatio: ratio,
        isIntersecting: ratio > 0,
      }) as unknown as IntersectionObserverEntry;
    act(() => {
      observer.callback(
        [entry(steps[0]!, 0.1), entry(steps[1]!, 0.9), entry(steps[2]!, 0.2)],
        observer as unknown as IntersectionObserver,
      );
    });

    expect(steps[1]).toHaveClass("is-active");
    expect(steps[0]).not.toHaveClass("is-active");
    const screens = container.querySelectorAll(".mk-how__screen");
    expect(screens[1]).toHaveClass("is-active");
    expect(screens[0]).not.toHaveClass("is-active");
    // Os passos continuam todos no DOM e visíveis.
    for (const step of steps) expect(step).toBeVisible();
  });
});
