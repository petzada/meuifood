// Mockups do produto: capturas REAIS das telas (Storefront e fila de Pedidos do Painel),
// geradas das páginas renderizadas com fixtures do repositório (docs/landing/ASSETS.md),
// dentro de molduras de celular e notebook desenhadas em CSS (outline, sem sombra). Toda
// imagem tem width/height reservados (sem CLS). Server components: zero JS no cliente.
import Image from "next/image";
import type { ReactNode } from "react";

type FrameProps = { children: ReactNode; className?: string };

/** Celular: proporção 9/19.5, moldura com entalhe e botões laterais. */
export function PhoneFrame({ children, className }: FrameProps) {
  return (
    <div className={["mk-phone", className].filter(Boolean).join(" ")}>
      <span aria-hidden className="mk-phone__btn mk-phone__btn--silence" />
      <span aria-hidden className="mk-phone__btn mk-phone__btn--vol-up" />
      <span aria-hidden className="mk-phone__btn mk-phone__btn--vol-down" />
      <span aria-hidden className="mk-phone__btn mk-phone__btn--power" />
      <div className="mk-phone__screen">
        <span aria-hidden className="mk-phone__island" />
        {children}
      </div>
    </div>
  );
}

/** Notebook: tela 16/10 com câmera, base e pé. */
export function LaptopFrame({ children, className }: FrameProps) {
  return (
    <div className={["mk-laptop", className].filter(Boolean).join(" ")}>
      <div className="mk-laptop__lid">
        <span aria-hidden className="mk-laptop__cam" />
        <div className="mk-laptop__screen">{children}</div>
      </div>
      <div aria-hidden className="mk-laptop__base">
        <span className="mk-laptop__notch" />
      </div>
    </div>
  );
}

/** Dimensões reais dos arquivos em `apps/web/public/images` (reservam espaço: sem CLS). */
export const SHOTS = {
  storefront: { src: "/images/shot-storefront.webp", width: 720, height: 1558 },
  pedidos: { src: "/images/shot-pedidos.webp", width: 1400, height: 875 },
} as const;

/** Storefront real: cardápio da Loja com destaques, categorias e a barra "Ver carrinho". */
export function StorefrontShot({ alt, priority }: { alt: string; priority?: boolean }) {
  return (
    <Image
      alt={alt}
      className="mk-shot"
      height={SHOTS.storefront.height}
      priority={priority ?? false}
      sizes="(min-width: 768px) 15rem, 60vw"
      src={SHOTS.storefront.src}
      unoptimized
      width={SHOTS.storefront.width}
    />
  );
}

/** Painel real: fila de Pedidos por coluna (Recebidos, Em preparo, Prontos/Saiu). */
export function PanelQueueShot({ alt, priority }: { alt: string; priority?: boolean }) {
  return (
    <Image
      alt={alt}
      className="mk-shot"
      height={SHOTS.pedidos.height}
      priority={priority ?? false}
      sizes="(min-width: 768px) 40rem, 92vw"
      src={SHOTS.pedidos.src}
      unoptimized
      width={SHOTS.pedidos.width}
    />
  );
}
