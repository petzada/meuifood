"use client";

// QR Code do link da Loja (LNK-01), gerado no cliente por `lib/qr.ts`: prévia em SVG inline
// e download em PNG (canvas) ou SVG. Sem rede, sem dependência.
import { Button } from "@foode/ui";
import { useMemo } from "react";

import { drawQrOnCanvas, encodeQr, qrToSvg } from "../lib/qr";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function qrFilename(slug: string, extension: "png" | "svg"): string {
  return `qr-${slug}.${extension}`;
}

export function QrCode({
  compact = false,
  slug,
  url,
}: {
  /** Só os botões (prévia menor), como no aviso "Loja pronta". */
  compact?: boolean;
  slug: string;
  url: string;
}) {
  const qr = useMemo(() => encodeQr(url), [url]);
  const svg = useMemo(() => (qr ? qrToSvg(qr) : null), [qr]);
  if (!qr || !svg) return null;

  function downloadSvg() {
    downloadBlob(new Blob([svg!], { type: "image/svg+xml" }), qrFilename(slug, "svg"));
  }

  function downloadPng() {
    const canvas = document.createElement("canvas");
    if (!drawQrOnCanvas(qr!, canvas, { margin: 4, scale: 16 })) return;
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, qrFilename(slug, "png"));
    }, "image/png");
  }

  return (
    <div className={compact ? "flex flex-wrap items-center gap-3" : "space-y-4"}>
      <div
        aria-label={`QR Code do link ${url}`}
        className={`${compact ? "size-24" : "size-48 sm:size-56"} shrink-0 overflow-hidden rounded-xl border border-[var(--color-hairline)] bg-white [&>svg]:size-full`}
        dangerouslySetInnerHTML={{ __html: svg }}
        role="img"
      />
      <div className="flex flex-wrap gap-3">
        <Button onClick={downloadPng} type="button" variant="secondary">
          Baixar QR Code (PNG)
        </Button>
        <Button onClick={downloadSvg} type="button" variant="secondary">
          Baixar QR Code (SVG)
        </Button>
      </div>
    </div>
  );
}
