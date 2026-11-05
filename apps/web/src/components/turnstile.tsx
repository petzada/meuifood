"use client";

// Widget Turnstile (render explícito), igual ao do Painel: entrega o token por `onToken`; o
// checkout manda o token no corpo da busca por telefone (P-2.1). Depois de cada consulta,
// `TurnstileHandle.reset()` pede um token novo (cada token vale uma verificação).
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

type TurnstileApi = {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      language?: string;
      theme?: "light" | "dark" | "auto";
      size?: "normal" | "flexible" | "compact";
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    onFoodeTurnstileLoad?: () => void;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onFoodeTurnstileLoad&render=explicit";

const waiters = new Set<() => void>();

function loadTurnstile(onReady: () => void) {
  if (window.turnstile) {
    onReady();
    return () => undefined;
  }
  waiters.add(onReady);
  if (!document.querySelector(`script[src="${SCRIPT_SRC}"]`)) {
    window.onFoodeTurnstileLoad = () => {
      for (const waiter of waiters) waiter();
      waiters.clear();
    };
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    document.head.append(script);
  }
  return () => {
    waiters.delete(onReady);
  };
}

export type TurnstileHandle = { reset(): void };

export function Turnstile({
  onToken,
  ref,
  siteKey,
}: {
  onToken: (token: string | null) => void;
  ref?: Ref<TurnstileHandle>;
  siteKey: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const latestOnToken = useRef(onToken);
  latestOnToken.current = onToken;

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetId.current && window.turnstile) {
        window.turnstile.reset(widgetId.current);
        latestOnToken.current(null);
      }
    },
  }));

  useEffect(() => {
    if (!siteKey || !container.current) return;
    const element = container.current;
    const stop = loadTurnstile(() => {
      if (!window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(element, {
        sitekey: siteKey,
        language: "pt-BR",
        theme: "light",
        size: "flexible",
        callback: (token) => latestOnToken.current(token),
        "expired-callback": () => latestOnToken.current(null),
        "error-callback": () => latestOnToken.current(null),
      });
    });
    return () => {
      stop();
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey]);

  if (!siteKey) {
    return (
      <p role="alert" className="text-sm font-bold text-[var(--color-error)]">
        Verificação de segurança indisponível no momento. Tente de novo mais tarde.
      </p>
    );
  }

  return <div ref={container} className="min-h-[65px]" aria-label="Verificação de segurança" />;
}
