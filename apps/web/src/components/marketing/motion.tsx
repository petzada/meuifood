"use client";

// Motion da landing (PROPOSTA-LANDING §4.2). Regra de ouro: o conteúdo NUNCA depende do JS
// para ficar visível. O HTML nasce sem `data-reveal-state`; só o script marca um nó como
// "armed" (opacity 0) e, ao entrar na viewport, "in". Por isso:
// - sem JS, ou com reduced-motion, nada é escondido;
// - a cada mudança de rota (`usePathname`) e a cada nó novo (MutationObserver) os nós são
//   re-armados — navegação client-side e Voltar/Avançar nunca deixam a página em branco;
// - um nó que já está na viewport quando é armado (ex.: logo após navegar) vira "in" na
//   hora, sem passar por opacity 0; só o 1º carregamento anima o que está na dobra;
// - `pageshow` persistido (bfcache) revela tudo que ficou armado.
// Um IntersectionObserver, `unobserve` ao entrar, sem listener de scroll. ~1,5 KB.
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export const REVEAL_ATTR = "data-reveal-state";

function revealAll(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(`[data-reveal][${REVEAL_ATTR}="armed"]`).forEach((el) => {
    el.setAttribute(REVEAL_ATTR, "in");
  });
}

export function MotionObserver() {
  const pathname = usePathname();

  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-mk-header]");
    const sentinel = document.querySelector<HTMLElement>("[data-mk-scroll-sentinel]");
    const headerObserver =
      header && sentinel
        ? new IntersectionObserver(([entry]) => {
            header.classList.toggle("is-scrolled", entry ? !entry.isIntersecting : false);
          })
        : null;
    if (sentinel) headerObserver?.observe(sentinel);
    if (header && !sentinel) header.classList.add("is-scrolled");
    return () => headerObserver?.disconnect();
  }, [pathname]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      revealAll(document);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute(REVEAL_ATTR, "in");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );

    // 1º carregamento do documento: anima também o que já está na dobra (stagger do hero).
    // Depois (navegação client-side, nós novos), o que está visível aparece na hora.
    const firstPaint = !document.documentElement.hasAttribute("data-mk-motion");
    document.documentElement.setAttribute("data-mk-motion", "");

    const arm = (root: ParentNode, animateVisible: boolean) => {
      const viewportBottom = window.innerHeight;
      root.querySelectorAll<HTMLElement>(`[data-reveal]:not([${REVEAL_ATTR}])`).forEach((el) => {
        const rect = el.getBoundingClientRect();
        const visible = rect.top < viewportBottom && rect.bottom > 0;
        if (visible && !animateVisible) {
          el.setAttribute(REVEAL_ATTR, "in");
          return;
        }
        el.setAttribute(REVEAL_ATTR, "armed");
        observer.observe(el);
      });
    };

    arm(document, firstPaint);

    // Conteúdo que chega depois (streaming, Suspense, navegação sem troca de pathname).
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement)
            arm(node.matches("[data-reveal]") ? (node.parentElement ?? node) : node, false);
        });
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) revealAll(document);
    };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("pageshow", onPageShow);
      // Nada fica escondido entre uma rota e outra.
      revealAll(document);
    };
  }, [pathname]);

  return null;
}
