// Peças pequenas repetidas na landing: cabeçalho de seção, linha do cadeado, JSON-LD.
import { LockSimple } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

import { REFUND_LINE } from "../../content/site";

export function SectionHeading({
  align = "center",
  children,
  eyebrow,
  id,
  lead,
}: {
  align?: "center" | "left";
  children: ReactNode;
  eyebrow?: string;
  id?: string;
  lead?: ReactNode;
}) {
  return (
    <div
      className={[
        "grid gap-3",
        align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-2xl",
      ].join(" ")}
      data-reveal
    >
      {eyebrow ? <p className="mk-eyebrow">{eyebrow}</p> : null}
      <h2 className="mk-h2" id={id}>
        {children}
      </h2>
      {lead ? <p className="mk-lead">{lead}</p> : null}
    </div>
  );
}

/** Linha com cadeado, sem destaque: "reembolso integral em até 7 dias" (decisões 70/71). */
export function RefundLine({ className }: { className?: string }) {
  return (
    <p className={["mk-lock-line", className].filter(Boolean).join(" ")}>
      <LockSimple aria-hidden size={14} weight="bold" />
      {REFUND_LINE}
    </p>
  );
}

/** Um `<script type="application/ld+json">` por tipo (PROPOSTA-SEO §4). */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</gu, "\\u003c") }}
      type="application/ld+json"
    />
  );
}
