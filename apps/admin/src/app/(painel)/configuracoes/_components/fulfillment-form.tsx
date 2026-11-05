"use client";

// Entrega (CFG-03, decisão 42, P-CFG-1/2/5): Retirada liga/desliga; Delivery com UM modo —
// "Por bairro" ou "Taxa fixa" — com aviso do que deixa de valer ao trocar; tabela Bairro · Taxa ·
// interruptor ativo/inativo; "+ Bairro" abre o cadastro em modal (decisão 74) e salva na hora;
// pedido mínimo só do Delivery; tempo estimado mín–máx por Fulfillment. Validação (mín ≤ máx,
// ≥ 1 bairro ativo) no servidor.
// Sugestão por km (decisão 73): "Quanto você cobra por km" fica na Loja (RPC
// `storeSetDeliveryRate`, lido de `storeOperationGet`; salva ao sair do campo ou no Enter) e vira
// PLACEHOLDER das taxas — bairro: centro do bairro e da Loja pelo Nominatim, linha reta × 1,3;
// Taxa fixa: média dos bairros (ou 3 km); Pedido mínimo: 3× a Taxa fixa. Nunca cobra por km.
import { Button, useToast } from "@foode/ui";
import {
  type DeliveryMode,
  type DeliveryNeighborhood,
  MAX_DELIVERY_NEIGHBORHOODS,
  MAX_ETA_MINUTES,
  type StoreOperationSettings,
} from "@foode/shared/order";
import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";

import { NeighborhoodModal } from "./neighborhood-modal";

import { Field } from "../../../../components/form";
import {
  type LatLng,
  neighborhoodQuery,
  routeKm,
  suggestedFeeCents,
  suggestedFixedFeeCents,
  suggestedMinimumOrderCents,
} from "../../../../lib/delivery-suggestion";
import { geocoder } from "../../../../lib/geocode";
import { formatMoneyInput } from "../../../../lib/money-mask";
import { centsToInput, parseMoneyToCents } from "../../../../lib/ops-format";
import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { ActionNotice, SectionHeading } from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";
import { useDirtyForm } from "../../ops/_components/use-dirty-form";
import { ActionForm } from "../../../../components/action-form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
type Locate = (query: string) => Promise<LatLng | null>;
export type StoreArea = { district: string; city: string; state: string };
type Mode = DeliveryMode | "none";
type Row = { key: number; id: string | null; name: string; fee: string; active: boolean };

let rowSeq = 0;
const toRow = (n: DeliveryNeighborhood): Row => ({
  key: ++rowSeq,
  id: n.id,
  name: n.name,
  fee: centsToInput(n.feeCents),
  active: n.active,
});

const MODE_LABEL: Record<Mode, string> = {
  none: "Sem Delivery",
  neighborhood: "Por bairro",
  fixed: "Taxa fixa",
};

const MODE_WARNING: Record<Mode, string> = {
  none: "Sem Delivery, a Loja só atende Retirada. A lista de bairros e a Taxa fixa ficam guardadas.",
  neighborhood: "Por bairro, a Taxa fixa deixa de valer: cada bairro ativo tem a própria taxa.",
  fixed:
    "Com Taxa fixa, a lista de bairros deixa de valer (fica guardada) e o Consumidor digita o bairro.",
};

const INPUT =
  "min-h-11 w-full rounded-xl border border-[var(--color-hairline)] bg-transparent px-3 text-base text-[var(--color-ink)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]";

function Switch({
  checked,
  id,
  label,
  name,
  onChange,
}: {
  checked: boolean;
  id: string;
  label: string;
  name: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="inline-flex min-h-11 cursor-pointer items-center gap-3">
      <input
        id={id}
        name={name}
        type="checkbox"
        role="switch"
        checked={checked}
        aria-checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`relative inline-block h-6 w-11 rounded-full border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-primary-soft)] ${
          checked
            ? "border-[var(--color-primary-strong)] bg-[var(--color-primary-strong)]"
            : "border-[var(--color-hairline)] bg-[var(--color-canvas)]"
        }`}
      >
        <span
          className={`absolute top-0.5 size-[18px] rounded-full transition-transform ${
            checked ? "translate-x-[22px] bg-white" : "translate-x-0.5 bg-[var(--color-muted)]"
          }`}
        />
      </span>
      <span className="text-sm font-bold text-[var(--color-ink)]">{label}</span>
    </label>
  );
}

/** Chave antiga do R$/km no navegador (antes da RPC): migrada para a Loja e apagada. */
export const LEGACY_PER_KM_KEY = (storeId: string) => `foode.painel.reais-por-km.v1:${storeId}`;

export type SaveDeliveryRate = (
  ratePerKmCents: number | null,
) => Promise<{ ok: true } | { ok: false; message: string }>;

function readLegacy(storage: Storage | null, storeId: string): string | null {
  try {
    return storage?.getItem(LEGACY_PER_KM_KEY(storeId)) ?? null;
  } catch {
    return null;
  }
}

function clearLegacy(storage: Storage | null, storeId: string): void {
  try {
    storage?.removeItem(LEGACY_PER_KM_KEY(storeId));
  } catch {
    // Sem localStorage: nada a limpar.
  }
}

/** Sugestões de taxa (decisão 73): distâncias por bairro (nome) e placeholders em "R$ 0,00". */
function useFeeSuggestions({
  area,
  locate,
  names,
  perKmCents,
}: {
  area: StoreArea | null;
  locate: Locate;
  names: string[];
  perKmCents: number | null;
}) {
  const [storePoint, setStorePoint] = useState<LatLng | null>(null);
  const [distances, setDistances] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!area) return;
    const query = neighborhoodQuery(area.district, area);
    if (!query) return;
    let live = true;
    void locate(query).then((point) => {
      if (live) setStorePoint(point);
    });
    return () => {
      live = false;
    };
  }, [area, locate]);

  const namesKey = names.map((name) => name.trim()).join("|");
  useEffect(() => {
    if (!area || !storePoint) return;
    let live = true;
    // Espera o lojista parar de digitar antes de consultar (e a fila respeita 1 req/s).
    const timer = setTimeout(() => {
      for (const raw of namesKey.split("|")) {
        const query = neighborhoodQuery(raw, area);
        if (!query) continue;
        void locate(query).then((point) => {
          if (!live || !point) return;
          const key = raw.toLowerCase();
          setDistances((map) => (key in map ? map : { ...map, [key]: routeKm(storePoint, point) }));
        });
      }
    }, 700);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [area, locate, namesKey, storePoint]);

  const known = namesKey
    .split("|")
    .map((name) => distances[name.toLowerCase()])
    .filter((km): km is number => typeof km === "number");
  const fixed = suggestedFixedFeeCents(known, perKmCents);
  return {
    neighborhood: (name: string) =>
      formatMoneyInput(suggestedFeeCents(distances[name.trim().toLowerCase()] ?? 0, perKmCents)),
    fixed: formatMoneyInput(fixed),
    minimum: formatMoneyInput(suggestedMinimumOrderCents(fixed)),
  };
}

export function FulfillmentForm({
  action,
  area = null,
  initial,
  locate,
  saveRate,
  storage = typeof window === "undefined" ? null : window.localStorage,
  storeId,
}: {
  action: Action;
  /** Bairro/cidade da Loja (centro de onde saem as distâncias); null = sem sugestão por bairro. */
  area?: StoreArea | null;
  initial: StoreOperationSettings;
  /** Geocodificador (padrão: Nominatim do navegador); injetável nos testes. */
  locate?: Locate;
  /** Grava o R$/km na Loja (server action → `storeSetDeliveryRate`). */
  saveRate: SaveDeliveryRate;
  /** Só para migrar o R$/km antigo deste navegador (antes da RPC). */
  storage?: Storage | null;
  storeId: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const { dirty, onChange, ref } = useDirtyForm(state);
  const [pickup, setPickup] = useState(initial.pickupEnabled);
  const [mode, setMode] = useState<Mode>(initial.deliveryMode ?? "none");
  const [initialMode] = useState<Mode>(initial.deliveryMode ?? "none");
  const [rows, setRows] = useState<Row[]>(() => initial.neighborhoods.map(toRow));
  const [addingNeighborhood, setAddingNeighborhood] = useState(false);
  // Bairro novo do modal: entra na lista e o formulário salva no render seguinte.
  const [submitAfterAdd, setSubmitAfterAdd] = useState(false);
  useEffect(() => {
    if (!submitAfterAdd) return;
    setSubmitAfterAdd(false);
    ref.current?.requestSubmit();
  }, [ref, submitAfterAdd]);
  const headingId = useId();
  const modeId = useId();
  const errors = state.errors;
  const toast = useToast();
  const savedRate = useRef<number | null>(initial.deliveryRatePerKmCents ?? null);
  const [perKm, setPerKm] = useState(() =>
    savedRate.current === null ? "" : formatMoneyInput(savedRate.current),
  );

  async function persistRate(cents: number | null, silent = false): Promise<boolean> {
    const result = await saveRate(cents);
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    savedRate.current = cents;
    if (!silent) toast.success(cents === null ? "R$/km removido." : "R$/km salvo.");
    return true;
  }

  // 1ª carga depois da RPC: o R$/km que ficou neste navegador vai para a Loja (se a Loja ainda
  // não tem) e a chave antiga é apagada.
  const migrated = useRef(false);
  useEffect(() => {
    if (migrated.current) return;
    migrated.current = true;
    const legacy = readLegacy(storage, storeId);
    if (legacy === null) return;
    const cents = parseMoneyToCents(legacy);
    if (savedRate.current !== null || cents === null || cents <= 0) {
      clearLegacy(storage, storeId);
      return;
    }
    setPerKm(formatMoneyInput(cents));
    void persistRate(cents, true).then((ok) => {
      if (ok) clearLegacy(storage, storeId);
    });
    // `persistRate` só usa refs e props estáveis desta tela.
  }, [storage, storeId]);
  const locateFn = useMemo<Locate>(() => locate ?? ((query) => geocoder().locate(query)), [locate]);
  const suggestion = useFeeSuggestions({
    area,
    locate: locateFn,
    names: rows.map((r) => r.name),
    perKmCents: parseMoneyToCents(perKm),
  });

  /** Salva o R$/km se mudou (sair do campo ou Enter). Vazio limpa; inválido não grava. */
  function commitPerKm() {
    const trimmed = perKm.trim();
    const cents = trimmed === "" ? null : parseMoneyToCents(trimmed);
    if (trimmed !== "" && (cents === null || cents <= 0)) {
      toast.error("Informe o R$/km (ex.: R$ 1,50) ou deixe vazio.");
      return;
    }
    if (cents === savedRate.current) return;
    void persistRate(cents);
  }

  const touch = () => queueMicrotask(onChange);
  const update = (key: number, patch: Partial<Row>) => {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    touch();
  };

  return (
    <ActionForm
      formRef={ref}
      action={formAction}
      state={state}
      onChange={onChange}
      noValidate
      className="space-y-8"
    >
      <SectionHeading
        id={headingId}
        description="Como o Consumidor recebe o Pedido. Pelo menos uma forma precisa ficar ativa para a Loja vender."
      >
        Entrega
      </SectionHeading>

      <section aria-label="Retirada" className="space-y-3">
        <Switch
          id="pickupEnabled"
          name="pickupEnabled"
          label="Retirada na Loja"
          checked={pickup}
          onChange={(value) => {
            setPickup(value);
            touch();
          }}
        />
        {pickup ? (
          <EtaFields
            prefix="pickupEta"
            label="Tempo estimado da Retirada"
            initial={initial.pickupEta}
            errors={errors}
          />
        ) : null}
      </section>

      <section aria-labelledby={modeId} className="space-y-4">
        <p id={modeId} className="font-bold text-[var(--color-ink)]">
          Delivery
        </p>
        <div role="radiogroup" aria-labelledby={modeId} className="flex flex-wrap gap-2">
          {(["none", "neighborhood", "fixed"] as const).map((option) => (
            <label
              key={option}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-bold ${
                mode === option
                  ? "border-[var(--color-primary-strong)] bg-[var(--color-primary-strong)] text-white"
                  : "border-[var(--color-hairline)] text-[var(--color-body)]"
              }`}
            >
              <input
                type="radio"
                name="deliveryMode"
                value={option}
                checked={mode === option}
                onChange={() => {
                  setMode(option);
                  touch();
                }}
                className="sr-only"
              />
              {MODE_LABEL[option]}
            </label>
          ))}
        </div>
        {mode !== initialMode ? (
          <p
            role="status"
            className="rounded-xl border border-[var(--color-accent)] px-4 py-3 text-sm text-[var(--color-ink)]"
          >
            {MODE_WARNING[mode]}
          </p>
        ) : null}

        {mode !== "none" ? (
          <div className="max-w-sm">
            <Field
              id="reais-por-km"
              label="Quanto você cobra por km (R$)"
              inputMode="numeric"
              data-money=""
              autoComplete="off"
              value={perKm}
              onChange={(event) => setPerKm(event.currentTarget.value)}
              onBlur={commitPerKm}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitPerKm();
                }
              }}
              placeholder="R$ 0,00"
              hint="Só para sugerir as taxas abaixo (aparecem apagadas no campo). O Consumidor paga a taxa do bairro ou a Taxa fixa, nunca por km. Salvo na Loja ao sair do campo."
            />
          </div>
        ) : null}

        {mode === "fixed" ? (
          <div className="max-w-xs">
            <Field
              id="fixedFeeCents"
              name="fixedFeeCents"
              label="Taxa fixa (R$)"
              inputMode="numeric"
              data-money=""
              defaultValue={
                initial.fixedFeeCents === null ? "" : centsToInput(initial.fixedFeeCents)
              }
              error={errors.fixedFeeCents}
              placeholder={suggestion.fixed}
              hint="Vale para qualquer bairro. R$ 0,00 = entrega grátis."
            />
          </div>
        ) : null}

        {mode === "neighborhood" ? (
          <div className="space-y-3">
            <input type="hidden" name="neighborhoodCount" value={rows.length} />
            <table className="w-full text-sm">
              <caption className="sr-only">Bairros atendidos</caption>
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
                  <th scope="col" className="py-2 pr-3">
                    Bairro
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Taxa (R$)
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Ativo
                  </th>
                  <th scope="col" className="sr-only">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-hairline-soft)]">
                {rows.map((r, index) => {
                  const nameError = errors[`neighborhoods.${index}.name`];
                  const feeError = errors[`neighborhoods.${index}.feeCents`];
                  return (
                    <tr key={r.key} className="align-top">
                      <td className="py-2 pr-3">
                        {r.id ? (
                          <input type="hidden" name={`neighborhoods.${index}.id`} value={r.id} />
                        ) : null}
                        <label className="sr-only" htmlFor={`bairro-${r.key}-nome`}>
                          Nome do bairro {index + 1}
                        </label>
                        <input
                          id={`bairro-${r.key}-nome`}
                          name={`neighborhoods.${index}.name`}
                          value={r.name}
                          aria-invalid={nameError ? true : undefined}
                          aria-describedby={nameError ? `bairro-${r.key}-nome-erro` : undefined}
                          onChange={(event) => update(r.key, { name: event.target.value })}
                          className={INPUT}
                        />
                        {nameError ? (
                          <p
                            id={`bairro-${r.key}-nome-erro`}
                            className="mt-1 text-sm font-bold text-[var(--color-error)]"
                          >
                            {nameError}
                          </p>
                        ) : null}
                      </td>
                      <td className="w-32 py-2 pr-3">
                        <label className="sr-only" htmlFor={`bairro-${r.key}-taxa`}>
                          Taxa do bairro {index + 1} (R$)
                        </label>
                        <input
                          id={`bairro-${r.key}-taxa`}
                          name={`neighborhoods.${index}.feeCents`}
                          inputMode="numeric"
                          data-money=""
                          value={r.fee}
                          placeholder={suggestion.neighborhood(r.name)}
                          aria-invalid={feeError ? true : undefined}
                          aria-describedby={feeError ? `bairro-${r.key}-taxa-erro` : undefined}
                          onChange={(event) => update(r.key, { fee: event.target.value })}
                          className={INPUT}
                        />
                        {feeError ? (
                          <p
                            id={`bairro-${r.key}-taxa-erro`}
                            className="mt-1 text-sm font-bold text-[var(--color-error)]"
                          >
                            {feeError}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">
                        <Switch
                          id={`bairro-${r.key}-ativo`}
                          name={`neighborhoods.${index}.active`}
                          label={r.active ? "Ativo" : "Inativo"}
                          checked={r.active}
                          onChange={(value) => update(r.key, { active: value })}
                        />
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRows((list) => list.filter((item) => item.key !== r.key));
                            touch();
                          }}
                          className="min-h-11 rounded-full px-3 text-sm font-bold text-[var(--color-body)] underline-offset-4 hover:underline"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {errors.neighborhoods ? (
              <p role="alert" className="text-sm font-bold text-[var(--color-error)]">
                {errors.neighborhoods}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              {rows.length < MAX_DELIVERY_NEIGHBORHOODS ? (
                <Button
                  variant="secondary"
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setAddingNeighborhood(true)}
                >
                  + Bairro
                </Button>
              ) : null}
              <p className="text-sm text-[var(--color-muted)]">
                Total de {rows.length} {rows.length === 1 ? "bairro" : "bairros"} ·{" "}
                {rows.filter((r) => r.active).length} ativos
              </p>
            </div>
            {addingNeighborhood ? (
              <NeighborhoodModal
                existing={rows.map((r) => r.name)}
                onAdd={(row) => {
                  setRows((list) => [...list, { key: ++rowSeq, id: null, ...row }]);
                  setAddingNeighborhood(false);
                  setSubmitAfterAdd(true);
                }}
                onClose={() => setAddingNeighborhood(false)}
                suggestFee={suggestion.neighborhood}
              />
            ) : null}
          </div>
        ) : null}

        {mode !== "none" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="deliveryMinimumOrderCents"
              name="deliveryMinimumOrderCents"
              label="Pedido mínimo do Delivery (R$)"
              inputMode="numeric"
              data-money=""
              defaultValue={
                initial.deliveryMinimumOrderCents === null
                  ? ""
                  : centsToInput(initial.deliveryMinimumOrderCents)
              }
              error={errors.deliveryMinimumOrderCents}
              placeholder={suggestion.minimum}
              hint="Opcional. Sobre os itens, sem a taxa. Vazio = sem mínimo."
            />
            <EtaFields
              prefix="deliveryEta"
              label="Tempo estimado do Delivery"
              initial={initial.deliveryEta}
              errors={errors}
            />
          </div>
        ) : null}
      </section>

      <ActionNotice state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={!dirty} pendingLabel="Salvando...">
          Salvar alterações
        </SubmitButton>
        {!dirty ? (
          <p className="text-sm text-[var(--color-muted)]">Nenhuma alteração para salvar.</p>
        ) : null}
      </div>
    </ActionForm>
  );
}

function EtaFields({
  errors,
  initial,
  label,
  prefix,
}: {
  errors: Record<string, string>;
  initial: { minMinutes: number; maxMinutes: number } | null;
  label: string;
  prefix: "deliveryEta" | "pickupEta";
}) {
  const error = errors[`${prefix}.minMinutes`] ?? errors[`${prefix}.maxMinutes`] ?? errors[prefix];
  const errorId = `${prefix}-erro`;
  return (
    <fieldset>
      <legend className="text-sm font-bold text-[var(--color-ink)]">{label}</legend>
      <div className="mt-2 flex items-center gap-2">
        <label className="sr-only" htmlFor={`${prefix}-min`}>
          {label}: mínimo em minutos
        </label>
        <input
          id={`${prefix}-min`}
          name={`${prefix}.minMinutes`}
          inputMode="numeric"
          min={1}
          max={MAX_ETA_MINUTES}
          defaultValue={initial?.minMinutes ?? ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : `${prefix}-dica`}
          className={`${INPUT} w-24`}
        />
        <span className="text-[var(--color-muted)]">a</span>
        <label className="sr-only" htmlFor={`${prefix}-max`}>
          {label}: máximo em minutos
        </label>
        <input
          id={`${prefix}-max`}
          name={`${prefix}.maxMinutes`}
          inputMode="numeric"
          min={1}
          max={MAX_ETA_MINUTES}
          defaultValue={initial?.maxMinutes ?? ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : `${prefix}-dica`}
          className={`${INPUT} w-24`}
        />
        <span className="text-[var(--color-muted)]">min</span>
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm font-bold text-[var(--color-error)]">
          {error}
        </p>
      ) : (
        <p id={`${prefix}-dica`} className="mt-1.5 text-sm text-[var(--color-muted)]">
          Opcional. Aparece no checkout como "30–45 min".
        </p>
      )}
    </fieldset>
  );
}
