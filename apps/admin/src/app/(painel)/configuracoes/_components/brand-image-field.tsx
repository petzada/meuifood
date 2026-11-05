"use client";

// Logo (quadrado) e capa da Loja (P-VIS-1, P-VIS-2): escolher ou arrastar, formatos e 5 MB
// ditos antes do erro, validação de tipo/tamanho no cliente, prévia imediata e upload pelos
// bytes. O campo oculto `{kind}ObjectKey` entra no formulário da vitrine; a imagem só vira da
// Loja ao salvar. Mesma mecânica do `image-field.tsx` do Cardápio.
import type { BrandImageKind } from "@foode/shared/onboarding";
import { useEffect, useId, useRef, useState, useTransition, type DragEvent } from "react";

import { MENU_IMAGE_ACCEPT, MENU_IMAGE_HINT } from "../../../../lib/menu-forms";
import { checkBrandImageFile, type BrandUploadResult } from "../../../../lib/onboarding-forms";

type Status = { kind: "idle" } | { kind: "uploading" } | { kind: "error"; message: string };

const COPY: Record<
  BrandImageKind,
  { label: string; hint: string; alt: string; choose: string; replace: string; remove: string }
> = {
  logo: {
    label: "Logo",
    hint: "Quadrado (ex.: 512×512). Aparece ao lado do nome da Loja no Cardápio.",
    alt: "Prévia do logo da Loja",
    choose: "Escolher logo",
    replace: "Trocar logo",
    remove: "Remover logo",
  },
  cover: {
    label: "Imagem de capa",
    hint: "Horizontal (ex.: 1600×600). Aparece no topo do Cardápio.",
    alt: "Prévia da capa da Loja",
    choose: "Escolher capa",
    replace: "Trocar capa",
    remove: "Remover capa",
  },
};

export function BrandImageField({
  initialKey,
  initialUrl,
  kind,
  onChange,
  upload,
}: {
  initialKey: string | null;
  initialUrl: string | null;
  kind: BrandImageKind;
  onChange?: () => void;
  upload: (formData: FormData) => Promise<BrandUploadResult>;
}) {
  const id = useId();
  const copy = COPY[kind];
  const [objectKey, setObjectKey] = useState(initialKey ?? "");
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const localUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    },
    [],
  );

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    onChange?.();
  }, [objectKey]);

  function showLocal(file: File) {
    if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    localUrl.current = URL.createObjectURL(file);
    setPreviewUrl(localUrl.current);
  }

  function send(file: File) {
    const check = checkBrandImageFile(file);
    if (!check.ok) {
      setStatus({ kind: "error", message: check.message });
      return;
    }
    showLocal(file);
    setStatus({ kind: "uploading" });
    const formData = new FormData();
    formData.set("kind", kind);
    formData.set("file", file);
    startTransition(async () => {
      const result = await upload(formData);
      if (!result.ok) {
        setStatus({ kind: "error", message: result.message });
        setPreviewUrl(initialUrl);
        return;
      }
      setObjectKey(result.objectKey);
      if (result.imageUrl) setPreviewUrl(result.imageUrl);
      setStatus({ kind: "idle" });
    });
  }

  function remove() {
    setObjectKey("");
    setPreviewUrl(null);
    setStatus({ kind: "idle" });
    if (input.current) input.current.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) send(file);
  }

  const busy = status.kind === "uploading" || pending;
  const describedBy = `${id}-dica${status.kind === "error" ? ` ${id}-erro` : ""}`;
  const previewClass =
    kind === "logo" ? "size-28 rounded-xl" : "aspect-[16/6] w-full max-w-xs rounded-xl";

  return (
    <div>
      <input type="hidden" name={`${kind}ObjectKey`} value={objectKey} />
      <p id={`${id}-rotulo`} className="text-sm font-bold text-[var(--color-ink)]">
        {copy.label}
      </p>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-2 flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center ${
          dragging
            ? "border-[var(--color-primary)]"
            : status.kind === "error"
              ? "border-[var(--color-error)]"
              : "border-dashed border-[var(--color-hairline)]"
        }`}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={copy.alt}
            className={`${previewClass} shrink-0 border border-[var(--color-hairline)] object-cover ${busy ? "opacity-60" : ""}`}
          />
        ) : (
          <span
            aria-hidden="true"
            className={`${previewClass} flex shrink-0 items-center justify-center border border-dashed border-[var(--color-hairline)] text-xs font-bold text-[var(--color-muted)]`}
          >
            sem imagem
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <p id={`${id}-dica`} className="text-sm text-[var(--color-body)]">
            {copy.hint} {MENU_IMAGE_HINT}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor={`${id}-arquivo`}
              className="foode-button foode-button--secondary min-h-11 cursor-pointer px-4 py-2 text-sm"
            >
              {busy ? "Enviando..." : previewUrl ? copy.replace : copy.choose}
            </label>
            <input
              ref={input}
              id={`${id}-arquivo`}
              type="file"
              accept={MENU_IMAGE_ACCEPT}
              disabled={busy}
              aria-labelledby={`${id}-rotulo`}
              aria-describedby={describedBy}
              aria-invalid={status.kind === "error" || undefined}
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) send(file);
              }}
            />
            {previewUrl && !busy ? (
              <button
                type="button"
                onClick={remove}
                className="min-h-11 rounded-full px-3 text-sm font-bold text-[var(--color-error)] underline-offset-4 hover:underline focus-visible:underline"
              >
                {copy.remove}
              </button>
            ) : null}
          </div>
          <p role="status" className={`text-xs text-[var(--color-muted)] ${busy ? "" : "sr-only"}`}>
            {busy ? "Enviando a imagem..." : ""}
          </p>
          {status.kind === "error" ? (
            <p
              id={`${id}-erro`}
              role="alert"
              className="text-sm font-bold text-[var(--color-error)]"
            >
              {status.message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
