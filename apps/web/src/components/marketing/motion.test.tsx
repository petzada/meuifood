import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MotionObserver, REVEAL_ATTR } from "./motion";

// Bug de produção: ao navegar por Link (/ → /para/x) e ao Voltar, a página ficava em branco
// porque o CSS escondia `[data-reveal]` pelo `.js` no <html> e o observer só rodava no 1º
// carregamento. Agora: nada é escondido sem o atributo `data-reveal-state`; o observer
// re-arma a cada rota; o que já está na viewport vira "in" na hora; `pageshow` revela tudo.
const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

type Fake = { callback: IntersectionObserverCallback; targets: Element[]; disconnected: boolean };

describe("MotionObserver", () => {
  const observers: Fake[] = [];
  let rects: Map<Element, number>;

  beforeEach(() => {
    nav.pathname = "/";
    rects = new Map();
    document.documentElement.removeAttribute("data-mk-motion");
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        targets: Element[] = [];
        disconnected = false;
        constructor(public callback: IntersectionObserverCallback) {
          observers.push(this);
        }
        observe(target: Element) {
          this.targets.push(target);
        }
        unobserve() {}
        disconnect() {
          this.disconnected = true;
        }
      },
    );
    // Posição vertical de cada nó (top); viewport = 800px.
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const top = rects.get(this) ?? 0;
      return { top, bottom: top + 100, left: 0, right: 100, width: 100, height: 100 } as DOMRect;
    });
  });

  afterEach(() => {
    observers.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  function mount(children: string) {
    document.body.innerHTML = `<main>${children}</main>`;
    return render(<MotionObserver />, {
      container: document.body.appendChild(document.createElement("div")),
    });
  }

  it("sem JS nada é escondido: o HTML nasce sem data-reveal-state", () => {
    document.body.innerHTML = `<p data-reveal>oi</p>`;
    expect(document.querySelector("[data-reveal]")).not.toHaveAttribute(REVEAL_ATTR);
  });

  it("1º carregamento: arma tudo e revela ao intersectar", () => {
    mount(`<p data-reveal id="a">a</p><p data-reveal id="b">b</p>`);
    const a = document.getElementById("a")!;
    const b = document.getElementById("b")!;
    expect(a).toHaveAttribute(REVEAL_ATTR, "armed");
    expect(b).toHaveAttribute(REVEAL_ATTR, "armed");
    const observer = observers.find((o) => o.targets.includes(a))!;
    act(() => {
      observer.callback(
        [{ target: a, isIntersecting: true } as unknown as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      );
    });
    expect(a).toHaveAttribute(REVEAL_ATTR, "in");
    expect(b).toHaveAttribute(REVEAL_ATTR, "armed");
  });

  it("navegação client-side: re-arma a rota nova e o que já está na viewport aparece na hora", () => {
    const view = mount(`<p data-reveal id="a">a</p>`);
    // Troca de rota: a página nova chega com nós novos (um na dobra, outro abaixo).
    nav.pathname = "/para/hamburgueria";
    document.querySelector("main")!.innerHTML =
      `<p data-reveal id="c">c</p><p data-reveal id="d">d</p>`;
    const c = document.getElementById("c")!;
    const d = document.getElementById("d")!;
    rects.set(c, 100);
    rects.set(d, 2000);
    view.rerender(<MotionObserver />);
    expect(c).toHaveAttribute(REVEAL_ATTR, "in");
    expect(d).toHaveAttribute(REVEAL_ATTR, "armed");
    expect(document.querySelectorAll(`[${REVEAL_ATTR}="armed"]`)).toHaveLength(1);
  });

  it("ao desmontar/trocar de rota, nada fica escondido; pageshow (bfcache) revela tudo", () => {
    const view = mount(`<p data-reveal id="a">a</p>`);
    const a = document.getElementById("a")!;
    expect(a).toHaveAttribute(REVEAL_ATTR, "armed");
    act(() => {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    });
    expect(a).toHaveAttribute(REVEAL_ATTR, "in");

    a.setAttribute(REVEAL_ATTR, "armed");
    view.unmount();
    expect(a).toHaveAttribute(REVEAL_ATTR, "in");
  });

  it("reduced-motion: revela tudo e não arma nada", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    mount(`<p data-reveal id="a">a</p>`);
    expect(document.getElementById("a")).not.toHaveAttribute(REVEAL_ATTR, "armed");
  });
});
