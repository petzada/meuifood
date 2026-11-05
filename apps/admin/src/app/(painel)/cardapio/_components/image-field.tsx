"use client";

// Foto do item (CAR-07): arrastar ou escolher, formatos e 5 MB ditos antes do erro, validação
// de tipo/tamanho no cliente, prévia imediata e upload pelos bytes (decisão 64). O campo
// oculto `imageObjectKey` entra no formulário do item; a foto só vira do item ao salvar.
import { useEffect, useId, useRef, useState, useTransition, type DragEvent } from "react";

import {
  checkMenuImageFile,
  MENU_IMAGE_ACCEPT,
  MENU_IMAGE_HINT,
  type UploadResult,
} from "../../../../lib/menu-forms";

type Status = { kind: "idle" } | { kind: "uploading" } | { kind: "error"; message: string };

export function ImageField({
  initialKey,
  initialUrl,
  onChange,
  upload,
}: {
  initialKey: string | null;
  initialUrl: string | null;
  /** Avisa o formulário (dirty) quando a foto muda. */
  onChange?: () => void;
  upload: (formData: FormData) => Promise<UploadResult>;
}) {
  const id = useId();
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

  // Avisa o formulário depois que o campo oculto já reflete a chave nova (dirty, T-06).
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
    const check = checkMenuImageFile(file);
    if (!check.ok) {
      setStatus({ kind: "error", message: check.message });
      return;
    }
    showLocal(file);
    setStatus({ kind: "uploading" });
    const formData = new FormData();
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

  return (
    <div>
      <input type="hidden" name="imageObjectKey" value={objectKey} />
      <p id={`${id}-rotulo`} className="text-sm font-bold text-[var(--color-ink)]">
        Foto
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
            alt="Prévia da foto do item"
            width={112}
            height={112}
            className={`size-28 shrink-0 rounded-xl border border-[var(--color-hairline)] object-cover ${busy ? "opacity-60" : ""}`}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-28 shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--color-hairline)] text-xs font-bold text-[var(--color-muted)]"
          >
            sem foto
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <p id={`${id}-dica`} className="text-sm text-[var(--color-body)]">
            Arraste a imagem aqui ou escolha um arquivo. {MENU_IMAGE_HINT}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor={`${id}-arquivo`}
              className="foode-button foode-button--secondary min-h-11 cursor-pointer px-4 py-2 text-sm"
            >
              {busy ? "Enviando..." : previewUrl ? "Trocar foto" : "Escolher foto"}
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
                Remover foto
              </button>
            ) : null}
          </div>
          <p role="status" className={`text-xs text-[var(--color-muted)] ${busy ? "" : "sr-only"}`}>
            {busy ? "Enviando a foto..." : ""}
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
