"use client";

// Motion da landing (PROPOSTA-LANDING §4.2): um IntersectionObserver para `[data-reveal]`,
// `.js` no <html> para ligar o estado inicial (sem JS, tudo nasce visível) e a hairline do
// header. Sem listener de scroll síncrono; `unobserve` ao entrar. ~1 KB.
import { useEffect } from "react";

export function MotionObserver() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) root.classList.add("js");

    const header = document.querySelector<HTMLElement>("[data-mk-header]");
    const sentinel = document.querySelector<HTMLElement>("[data-mk-scroll-sentinel]");
    const headerObserver =
      header && sentinel
        ? new IntersectionObserver(([entry]) => {
            header.classList.toggle("is-scrolled", entry ? !entry.isIntersecting : false);
          })
        : null;
    if (sentinel) headerObserver?.observe(sentinel);

    if (reduced) return () => headerObserver?.disconnect();

    const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px" },
    );
    targets.forEach((target) => observer.observe(target));

    return () => {
      observer.disconnect();
      headerObserver?.disconnect();
      root.classList.remove("js");
    };
  }, []);

  return null;
}
