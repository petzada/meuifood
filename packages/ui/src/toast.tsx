"use client";

// Toast padrão do Foode (decisão 72, item 11 do feedback do Dono): TODO aviso de feedback de
// ação (sucesso, erro de ação, conflito) sai aqui, nunca inline empurrando o layout. Erro de
// VALIDAÇÃO de campo continua abaixo do campo.
// - Fundo preto, texto branco (destoa do app de propósito), minimalista, sem ícone colorido.
// - Topo-centro (desktop desce do topo; no celular ocupa a largura e também vem do topo).
// - Some sozinho em 4 s ou no X (`aria-label="Fechar aviso"`); no máximo 3 empilhados (o mais
//   antigo sai). `role="status"`; erro `role="alert"`. Posição fixa: não desloca nada.
// - Animação só de entrada, desligada com `prefers-reduced-motion` (styles.css).
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastTone = "success" | "error" | "info";

export type ToastItem = { id: number; message: string; tone: ToastTone };

export type ToastApi = {
  /** Mostra um aviso; devolve o id (para fechar antes, se preciso). */
  show(message: string, options?: { tone?: ToastTone }): number;
  success(message: string): number;
  error(message: string): number;
  dismiss(id: number): void;
};

export const TOAST_DURATION_MS = 4000;
export const TOAST_MAX = 3;

const ToastContext = createContext<ToastApi | null>(null);

const NOOP_API: ToastApi = {
  show: () => 0,
  success: () => 0,
  error: () => 0,
  dismiss: () => undefined,
};

/** API do Toast; fora do provider vira no-op (render isolado em teste não quebra). */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP_API;
}

function ToastView({ item, onClose }: { item: ToastItem; onClose: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(item.id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [item.id, onClose]);
  return (
    <div className="foode-toast" role={item.tone === "error" ? "alert" : "status"}>
      <p className="foode-toast__message">{item.message}</p>
      <button
        type="button"
        className="foode-toast__close"
        aria-label="Fechar aviso"
        onClick={() => onClose(item.id)}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" fill="none" />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((item) => item.id !== id));
  }, []);

  const show = useCallback((message: string, options?: { tone?: ToastTone }) => {
    seq.current += 1;
    const id = seq.current;
    const tone = options?.tone ?? "info";
    setItems((list) => [...list, { id, message, tone }].slice(-TOAST_MAX));
    return id;
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message) => show(message, { tone: "success" }),
      error: (message) => show(message, { tone: "error" }),
      dismiss,
    }),
    [dismiss, show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="foode-toast-region" aria-label="Avisos">
        {items.map((item) => (
          <ToastView key={item.id} item={item} onClose={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
