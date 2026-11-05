// Mockups do produto desenhados com os tokens e primitivos reais (`@foode/ui`), em molduras
// CSS com proporção fixa (sem CLS). Dados fictícios rotulados "exemplo". Substituir por
// capturas reais quando existir a Loja-modelo (docs/landing/ASSETS.md). Server components:
// zero JS no cliente.
import { Bell, MagnifyingGlass, Printer, ShoppingCart, Star } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@foode/ui";
import type { ReactNode } from "react";

type FrameProps = { children: ReactNode; className?: string; label?: string };

export function PhoneFrame({ children, className, label = "exemplo" }: FrameProps) {
  return (
    <div className={["mk-phone", className].filter(Boolean).join(" ")}>
      <div className="mk-phone__screen mk-shot">
        {children}
        <span aria-hidden className="mk-shot__label">
          {label}
        </span>
      </div>
    </div>
  );
}

export function LaptopFrame({ children, className, label = "exemplo" }: FrameProps) {
  return (
    <div className={["mk-laptop", className].filter(Boolean).join(" ")}>
      <div className="mk-laptop__screen mk-shot">
        {children}
        <span aria-hidden className="mk-shot__label">
          {label}
        </span>
      </div>
    </div>
  );
}

const MENU = [
  {
    name: "X-Burger da casa",
    desc: "Pão brioche, 160 g, queijo, molho especial",
    price: "R$ 32,90",
  },
  { name: "Smash duplo", desc: "Dois smash, cheddar, cebola caramelizada", price: "R$ 38,90" },
  { name: "Batata rústica", desc: "Porção para dois, com páprica", price: "R$ 19,90" },
] as const;

/** Storefront: cardápio com destaques, categorias e barra do carrinho. */
export function StorefrontShot({ alt }: { alt: string }) {
  return (
    <figure aria-label={alt} className="flex h-full flex-col" role="img">
      <div className="flex items-center justify-between border-b border-[var(--color-hairline-soft)] px-[6%] py-[4%]">
        <div className="flex items-center gap-[2cqw]">
          <span className="size-[9cqw] rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-soft)]" />
          <div>
            <p className="font-bold">Burger do Bairro</p>
            <p className="text-[0.85em] text-[var(--color-muted)]">Aberto · 30–45 min</p>
          </div>
        </div>
        <Badge tone="success">Aberto</Badge>
      </div>
      <div className="mx-[6%] mt-[4%] flex items-center gap-[2cqw] rounded-full border border-[var(--color-hairline)] px-[4cqw] py-[2.5cqw] text-[var(--color-muted)]">
        <MagnifyingGlass aria-hidden size="1em" />
        Buscar no cardápio
      </div>
      <div className="mt-[4%] flex gap-[2cqw] overflow-hidden px-[6%] text-[0.85em] font-bold">
        {["Destaques", "Lanches", "Porções", "Bebidas"].map((cat, i) => (
          <span
            key={cat}
            className={[
              "rounded-full border px-[3cqw] py-[1.5cqw]",
              i === 0
                ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"
                : "border-[var(--color-hairline)]",
            ].join(" ")}
          >
            {cat}
          </span>
        ))}
      </div>
      <p className="mt-[5%] flex items-center gap-[1.5cqw] px-[6%] font-bold">
        <Star aria-hidden size="1em" weight="fill" className="text-[var(--color-accent)]" />
        Destaques
      </p>
      <ul className="mt-[2%] grid gap-[2.5cqw] px-[6%]">
        {MENU.map((item) => (
          <li
            key={item.name}
            className="flex items-start justify-between gap-[2cqw] rounded-[4cqw] border border-[var(--color-hairline)] p-[3cqw]"
          >
            <div className="min-w-0">
              <p className="truncate font-bold">{item.name}</p>
              <p className="line-clamp-2 text-[0.85em] text-[var(--color-muted)]">{item.desc}</p>
              <p className="mt-[1cqw] font-bold text-[var(--color-primary-strong)]">{item.price}</p>
            </div>
            <span className="size-[18cqw] shrink-0 rounded-[3cqw] bg-[var(--color-hairline-soft)]" />
          </li>
        ))}
      </ul>
      <div className="mt-auto border-t border-[var(--color-hairline)] px-[6%] py-[4%]">
        <span className="flex items-center justify-between rounded-full bg-[var(--color-primary-strong)] px-[4cqw] py-[3cqw] font-bold text-[var(--color-on-primary)]">
          <span className="flex items-center gap-[2cqw]">
            <ShoppingCart aria-hidden size="1em" weight="bold" /> Ver carrinho
          </span>
          <span>R$ 52,80</span>
        </span>
      </div>
    </figure>
  );
}

const ORDERS = [
  {
    id: "#1042",
    name: "Mariana S.",
    kind: "Delivery",
    items: "2 itens",
    total: "R$ 71,80",
    status: "Novo",
    tone: "primary" as const,
    time: "agora",
  },
  {
    id: "#1041",
    name: "Carlos A.",
    kind: "Retirada",
    items: "1 item",
    total: "R$ 32,90",
    status: "Em preparo",
    tone: "accent" as const,
    time: "4 min",
  },
  {
    id: "#1040",
    name: "Juliana R.",
    kind: "Delivery",
    items: "3 itens",
    total: "R$ 96,70",
    status: "Saiu para entrega",
    tone: "success" as const,
    time: "18 min",
  },
] as const;

/** Painel: fila de pedidos com chips, som e imprimir. */
export function PanelQueueShot({ alt }: { alt: string }) {
  return (
    <figure aria-label={alt} className="flex h-full" role="img">
      <aside className="hidden w-[22%] flex-col gap-[1.5cqw] border-r border-[var(--color-hairline-soft)] p-[2.5cqw] text-[0.9em] font-bold sm:flex">
        <span className="mb-[2cqw] text-[1.1em] text-[var(--color-primary-strong)]">Foode</span>
        {["Pedidos", "Cardápio", "Cupons", "Relatórios", "Configurações"].map((item, i) => (
          <span
            key={item}
            className={[
              "rounded-full px-[2cqw] py-[1.2cqw]",
              i === 0
                ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"
                : "text-[var(--color-body)]",
            ].join(" ")}
          >
            {item}
          </span>
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col p-[2.5cqw]">
        <div className="flex items-center justify-between">
          <p className="text-[1.15em] font-bold">Pedidos de hoje</p>
          <div className="flex items-center gap-[1.5cqw]">
            <Badge tone="success">Loja aberta</Badge>
            <span className="grid size-[4cqw] place-items-center rounded-full border border-[var(--color-hairline)]">
              <Bell aria-hidden size="1em" weight="bold" />
            </span>
          </div>
        </div>
        <div className="mt-[2cqw] flex gap-[1.2cqw] text-[0.85em] font-bold">
          {["Todos", "Delivery", "Retirada"].map((chip, i) => (
            <span
              key={chip}
              className={[
                "rounded-full border px-[2cqw] py-[0.8cqw]",
                i === 0
                  ? "border-[var(--color-primary)] text-[var(--color-primary-strong)]"
                  : "border-[var(--color-hairline)]",
              ].join(" ")}
            >
              {chip}
            </span>
          ))}
        </div>
        <ul className="mt-[2cqw] grid gap-[1.5cqw]">
          {ORDERS.map((order) => (
            <li
              key={order.id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-[2cqw] rounded-[2.5cqw] border border-[var(--color-hairline)] px-[2.5cqw] py-[1.8cqw]"
            >
              <span className="font-bold text-[var(--color-muted)]">{order.id}</span>
              <span className="min-w-0">
                <span className="block truncate font-bold">{order.name}</span>
                <span className="block text-[0.85em] text-[var(--color-muted)]">
                  {order.kind} · {order.items} · {order.time}
                </span>
              </span>
              <span className="flex items-center gap-[1.5cqw]">
                <span className="font-bold">{order.total}</span>
                <Badge className="hidden @[26rem]:inline-flex" tone={order.tone}>
                  {order.status}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex items-center justify-end gap-[1.5cqw] pt-[2cqw] text-[0.9em] font-bold">
          <span className="rounded-full border border-[var(--color-hairline)] px-[2.5cqw] py-[1.2cqw]">
            Recusar
          </span>
          <span className="flex items-center gap-[1cqw] rounded-full bg-[var(--color-primary-strong)] px-[2.5cqw] py-[1.2cqw] text-[var(--color-on-primary)]">
            <Printer aria-hidden size="1em" weight="bold" /> Aceitar e imprimir
          </span>
        </div>
      </div>
    </figure>
  );
}

/** Painel: onboarding com link personalizado e QR Code. */
export function PanelLinkShot({ alt }: { alt: string }) {
  return (
    <figure aria-label={alt} className="flex h-full flex-col p-[3cqw]" role="img">
      <p className="text-[1.15em] font-bold">Seu link está pronto</p>
      <p className="mt-[0.5cqw] text-[var(--color-muted)]">
        Divulgue na bio, no WhatsApp e na mesa.
      </p>
      <div className="mt-[3cqw] grid gap-[2cqw] sm:grid-cols-[1fr_auto]">
        <div className="rounded-[2.5cqw] border border-[var(--color-hairline)] p-[2.5cqw]">
          <p className="text-[0.85em] font-bold uppercase tracking-wider text-[var(--color-muted)]">
            Link personalizado
          </p>
          <p className="mt-[1cqw] truncate font-bold text-[var(--color-primary-strong)]">
            foodedelivery.com.br/loja/burger-do-bairro
          </p>
          <div className="mt-[2cqw] flex gap-[1.5cqw] text-[0.9em] font-bold">
            <span className="rounded-full bg-[var(--color-primary-strong)] px-[2.5cqw] py-[1cqw] text-[var(--color-on-primary)]">
              Copiar link
            </span>
            <span className="rounded-full border border-[var(--color-hairline)] px-[2.5cqw] py-[1cqw]">
              Baixar QR Code
            </span>
          </div>
        </div>
        <div
          aria-hidden
          className="grid size-[22cqw] place-items-center justify-self-center rounded-[2.5cqw] border border-[var(--color-hairline)] p-[2cqw]"
        >
          <span
            className="block size-full"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, var(--color-ink) 0 10%, transparent 10% 20%), repeating-linear-gradient(0deg, var(--color-ink) 0 10%, transparent 10% 20%)",
              backgroundBlendMode: "multiply",
              opacity: 0.85,
            }}
          />
        </div>
      </div>
      <ul className="mt-[3cqw] grid gap-[1.2cqw] text-[0.95em]">
        {[
          "Cardápio publicado",
          "Horário de funcionamento",
          "Entrega por bairro",
          "PIX e cartão online",
        ].map((step, i) => (
          <li key={step} className="flex items-center gap-[1.5cqw]">
            <span
              className={[
                "size-[3cqw] rounded-full border",
                i < 3
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-strong)]"
                  : "border-[var(--color-hairline)]",
              ].join(" ")}
            />
            {step}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Storefront: checkout em uma tela. */
export function CheckoutShot({ alt }: { alt: string }) {
  const rows = [
    ["Subtotal", "R$ 52,80"],
    ["Entrega · Centro", "R$ 6,00"],
    ["Cupom BEMVINDO", "− R$ 5,28"],
  ] as const;
  return (
    <figure aria-label={alt} className="flex h-full flex-col" role="img">
      <div className="border-b border-[var(--color-hairline-soft)] px-[6%] py-[4%] font-bold">
        Finalizar pedido
      </div>
      <div className="grid gap-[3cqw] px-[6%] py-[4%]">
        {[
          ["Nome", "Mariana"],
          ["WhatsApp", "(11) 9 9999-0000"],
          ["Endereço", "Rua das Flores, 120 · Centro"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-[3cqw] border border-[var(--color-hairline)] px-[3cqw] py-[2cqw]"
          >
            <p className="text-[0.8em] text-[var(--color-muted)]">{label}</p>
            <p className="font-bold">{value}</p>
          </div>
        ))}
        <div className="grid grid-cols-3 gap-[1.5cqw] text-center text-[0.85em] font-bold">
          {["PIX", "Cartão", "Na entrega"].map((method, i) => (
            <span
              key={method}
              className={[
                "rounded-full border py-[2cqw]",
                i === 0
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"
                  : "border-[var(--color-hairline)]",
              ].join(" ")}
            >
              {method}
            </span>
          ))}
        </div>
        <dl className="grid gap-[1cqw] text-[0.9em]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-[var(--color-muted)]">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-[var(--color-hairline-soft)] pt-[1.5cqw] font-bold">
            <dt>Total</dt>
            <dd>R$ 53,52</dd>
          </div>
        </dl>
      </div>
      <div className="mt-auto px-[6%] py-[4%]">
        <span className="block rounded-full bg-[var(--color-primary-strong)] py-[3cqw] text-center font-bold text-[var(--color-on-primary)]">
          Pagar com PIX
        </span>
      </div>
    </figure>
  );
}
