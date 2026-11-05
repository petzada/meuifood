"use client";

// Dados da Loja (`/configuracoes/loja`, CFG-04, LNK-02, P-CFG-4, P-VIS-1..3): seções
// independentes, cada uma salva sozinha (T-07) e só habilita "Salvar alterações" com mudança
// (T-06). Link personalizado com verificação enquanto digita e o link resultante visível;
// contato com WhatsApp mascarado e Instagram; endereço com CEP que preenche (ViaCEP →
// BrasilAPI, falha silenciosa); vitrine com descrição ≤ 160 (contador), logo e capa; cadastro
// do Ops só leitura.
import {
  slugFormatIssue,
  storePublicUrl,
  STORE_DESCRIPTION_MAX,
  type OwnerStoreSettings,
  type SlugAvailability,
} from "@foode/shared/onboarding";
import { BRAZIL_STATES } from "@foode/shared/ops";
import { OutlineContainer } from "@foode/ui";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

import { Field } from "../../../../components/form";
import {
  SLUG_FORMAT_MESSAGE,
  SLUG_RESERVED_MESSAGE,
  SLUG_TAKEN_MESSAGE,
  type BrandUploadResult,
} from "../../../../lib/onboarding-forms";
import { formatCep, formatCnpj, maskCep, maskPhoneBr } from "../../../../lib/ops-format";
import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { PIX_KEY_TYPE_LABEL } from "../../../../lib/ops-labels";
import {
  ActionNotice,
  Facts,
  SectionHeading,
  SelectField,
  TextareaField,
} from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";
import { useDirtyForm } from "../../ops/_components/use-dirty-form";
import { BrandImageField } from "./brand-image-field";

export type SettingsAction = (prev: FormState, formData: FormData) => Promise<FormState>;
export type SlugCheck = (slug: string) => Promise<SlugAvailability | null>;

function masked(mask: (value: string) => string) {
  return (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    input.value = mask(input.value);
  };
}

/** Seção editável: formulário próprio, dirty e aviso inline (T-05/T-06/T-07). */
export function EditSection({
  action,
  children,
  description,
  id,
  title,
}: {
  action: SettingsAction;
  children: (args: { errors: Record<string, string>; onChange: () => void }) => ReactNode;
  description: ReactNode;
  id: string;
  title: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const [savedCount, setSavedCount] = useState(0);
  const { dirty, onChange, ref } = useDirtyForm(savedCount);
  const headingId = useId();

  useEffect(() => {
    if (state.status === "success") setSavedCount((n) => n + 1);
  }, [state]);

  return (
    <OutlineContainer
      as="section"
      aria-labelledby={headingId}
      id={id}
      className="scroll-mt-8 p-5 md:p-7"
    >
      <form ref={ref} action={formAction} onChange={onChange} noValidate className="space-y-5">
        <SectionHeading id={headingId} description={description}>
          {title}
        </SectionHeading>
        {children({ errors: state.errors, onChange })}
        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton variant="secondary" disabled={!dirty}>
            Salvar alterações
          </SubmitButton>
          {!dirty && state.status !== "success" ? (
            <p className="text-sm text-[var(--color-muted)]">Nenhuma alteração para salvar.</p>
          ) : null}
          <div className="min-w-0 flex-1">
            <ActionNotice state={dirty && state.status === "success" ? IDLE_FORM : state} />
          </div>
        </div>
      </form>
    </OutlineContainer>
  );
}

// ---- Link personalizado (LNK-02, decisão 69) ----

type SlugState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "result"; availability: SlugAvailability }
  | { kind: "unknown" };

export const SLUG_CHECK_DEBOUNCE_MS = 400;

export function SlugSection({
  action,
  checkSlug,
  initial,
  origin,
}: {
  action: SettingsAction;
  checkSlug: SlugCheck;
  initial: Pick<OwnerStoreSettings, "slug" | "storeUrl">;
  origin: string;
}) {
  const [value, setValue] = useState(initial.slug);
  const [check, setCheck] = useState<SlugState>({ kind: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function onSlugChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.currentTarget.value.toLowerCase();
    event.currentTarget.value = raw;
    setValue(raw);
    if (timer.current) clearTimeout(timer.current);
    const { slug, issue } = slugFormatIssue(raw);
    if (!slug || slug === initial.slug) {
      setCheck({ kind: "idle" });
      return;
    }
    if (issue) {
      setCheck({ kind: "result", availability: { slug, available: false, reason: issue } });
      return;
    }
    setCheck({ kind: "checking" });
    const id = (requestId.current += 1);
    timer.current = setTimeout(() => {
      void checkSlug(slug).then((availability) => {
        if (id !== requestId.current) return;
        setCheck(availability ? { kind: "result", availability } : { kind: "unknown" });
      });
    }, SLUG_CHECK_DEBOUNCE_MS);
  }

  const preview = storePublicUrl(slugFormatIssue(value).slug || initial.slug, origin);
  const unavailable =
    check.kind === "result" && !check.availability.available ? check.availability.reason : null;
  const liveError =
    unavailable === "taken"
      ? SLUG_TAKEN_MESSAGE
      : unavailable === "reserved"
        ? SLUG_RESERVED_MESSAGE
        : unavailable === "invalid"
          ? SLUG_FORMAT_MESSAGE
          : undefined;
  const liveHint =
    check.kind === "checking"
      ? "Verificando disponibilidade..."
      : check.kind === "unknown"
        ? "Não deu para verificar agora; a gravação confere de novo."
        : check.kind === "result" && check.availability.available
          ? "Disponível."
          : unavailable === "current"
            ? "Este já é o seu link."
            : "Só letras minúsculas, números e hífen (3 a 63).";

  return (
    <EditSection
      action={action}
      description="O endereço da sua Loja para divulgar e imprimir no QR Code."
      id="link"
      title="Link personalizado"
    >
      {({ errors, onChange }) => (
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            id="slug"
            name="slug"
            label="Link personalizado"
            defaultValue={initial.slug}
            maxLength={63}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            error={errors.slug ?? liveError}
            hint={errors.slug || liveError ? undefined : liveHint}
            onChange={(event) => {
              onSlugChange(event);
              onChange();
            }}
          />
          <div>
            <p className="text-sm font-bold text-[var(--color-ink)]">Seu link ficará</p>
            <p
              aria-live="polite"
              className="mt-2 break-all rounded-xl border border-[var(--color-hairline)] px-4 py-3 text-base text-[var(--color-ink)]"
            >
              {preview}
            </p>
            <p className="mt-1.5 text-sm text-[var(--color-muted)]">
              Seus links e QR antigos continuam funcionando.
            </p>
          </div>
        </div>
      )}
    </EditSection>
  );
}

// ---- Contato (CFG-04) ----

export function ContactSection({
  action,
  initial,
}: {
  action: SettingsAction;
  initial: Pick<OwnerStoreSettings, "whatsapp" | "instagram">;
}) {
  return (
    <EditSection
      action={action}
      description="Como o cliente fala com a Loja."
      id="contato"
      title="Contato"
    >
      {({ errors, onChange }) => (
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            id="whatsapp"
            name="whatsapp"
            label="WhatsApp da Loja"
            defaultValue={initial.whatsapp ? maskPhoneBr(initial.whatsapp) : ""}
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 91234-5678"
            hint="Celular com DDD; aparece no Cardápio e na página do Pedido."
            error={errors.whatsapp}
            onChange={(event) => {
              masked(maskPhoneBr)(event);
              onChange();
            }}
          />
          <Field
            id="instagram"
            name="instagram"
            label="Instagram (opcional)"
            defaultValue={initial.instagram ?? ""}
            autoCapitalize="none"
            autoComplete="off"
            placeholder="sualoja"
            hint="Só o usuário, sem @."
            error={errors.instagram}
            onChange={onChange}
          />
        </div>
      )}
    </EditSection>
  );
}

// ---- Endereço (P-CFG-4) ----

export type CepData = {
  street: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};
export type CepFetch = (cep: string) => Promise<CepData | null>;

/** ViaCEP, depois BrasilAPI; qualquer falha é silenciosa (os campos seguem editáveis). */
export async function lookupStoreCep(
  cepDigits: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<CepData | null> {
  if (!/^\d{8}$/u.test(cepDigits)) return null;
  const providers: Array<{
    url: string;
    parse: (data: Record<string, unknown>) => CepData | null;
  }> = [
    {
      url: `https://viacep.com.br/ws/${cepDigits}/json/`,
      parse: (data) =>
        data.erro
          ? null
          : {
              street: typeof data.logradouro === "string" ? data.logradouro : null,
              district: typeof data.bairro === "string" ? data.bairro : null,
              city: typeof data.localidade === "string" ? data.localidade : null,
              state: typeof data.uf === "string" ? data.uf : null,
            },
    },
    {
      url: `https://brasilapi.com.br/api/cep/v1/${cepDigits}`,
      parse: (data) => ({
        street: typeof data.street === "string" ? data.street : null,
        district: typeof data.neighborhood === "string" ? data.neighborhood : null,
        city: typeof data.city === "string" ? data.city : null,
        state: typeof data.state === "string" ? data.state : null,
      }),
    },
  ];
  for (const provider of providers) {
    try {
      const response = await fetchImpl(provider.url, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) continue;
      const result = provider.parse((await response.json()) as Record<string, unknown>);
      if (result && (result.street || result.city)) return result;
    } catch {
      // próximo provedor
    }
  }
  return null;
}

export function AddressSection({
  action,
  cepLookup = lookupStoreCep,
  initial,
}: {
  action: SettingsAction;
  cepLookup?: CepFetch;
  initial: OwnerStoreSettings["address"];
}) {
  const refs = {
    street: useRef<HTMLInputElement>(null),
    district: useRef<HTMLInputElement>(null),
    city: useRef<HTMLInputElement>(null),
    state: useRef<HTMLSelectElement>(null),
  };
  const [looking, setLooking] = useState(false);

  async function onCep(cep: string, onChange: () => void) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLooking(true);
    try {
      const data = await cepLookup(digits);
      if (!data) return;
      if (refs.street.current && data.street) refs.street.current.value = data.street;
      if (refs.district.current && data.district) refs.district.current.value = data.district;
      if (refs.city.current && data.city) refs.city.current.value = data.city;
      if (refs.state.current && data.state) refs.state.current.value = data.state;
      onChange();
    } finally {
      setLooking(false);
    }
  }

  return (
    <EditSection
      action={action}
      description="Endereço de Retirada, mostrado no Cardápio quando a Retirada está ligada."
      id="endereco"
      title="Endereço"
    >
      {({ errors, onChange }) => (
        <div className="grid gap-5 md:grid-cols-6">
          <div className="md:col-span-2">
            <Field
              id="address.postalCode"
              name="address.postalCode"
              label="CEP"
              defaultValue={initial ? formatCep(initial.postalCode) : ""}
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="00000-000"
              hint={
                looking
                  ? "Buscando endereço..."
                  : "Preenche rua, bairro e cidade; você pode ajustar."
              }
              error={errors["address.postalCode"]}
              onChange={(event) => {
                masked(maskCep)(event);
                onChange();
                void onCep(event.currentTarget.value, onChange);
              }}
            />
          </div>
          <div className="md:col-span-4">
            <Field
              ref={refs.street}
              id="address.street"
              name="address.street"
              label="Rua"
              defaultValue={initial?.street ?? ""}
              maxLength={160}
              autoComplete="address-line1"
              error={errors["address.street"]}
              onChange={onChange}
            />
          </div>
          <div className="md:col-span-2">
            <Field
              id="address.number"
              name="address.number"
              label="Número"
              defaultValue={initial?.number ?? ""}
              maxLength={20}
              error={errors["address.number"]}
              onChange={onChange}
            />
          </div>
          <div className="md:col-span-4">
            <Field
              id="address.complement"
              name="address.complement"
              label="Complemento (opcional)"
              defaultValue={initial?.complement ?? ""}
              maxLength={80}
              autoComplete="address-line2"
              error={errors["address.complement"]}
              onChange={onChange}
            />
          </div>
          <div className="md:col-span-2">
            <Field
              ref={refs.district}
              id="address.district"
              name="address.district"
              label="Bairro"
              defaultValue={initial?.district ?? ""}
              maxLength={80}
              error={errors["address.district"]}
              onChange={onChange}
            />
          </div>
          <div className="md:col-span-3">
            <Field
              ref={refs.city}
              id="address.city"
              name="address.city"
              label="Cidade"
              defaultValue={initial?.city ?? ""}
              maxLength={80}
              autoComplete="address-level2"
              error={errors["address.city"]}
              onChange={onChange}
            />
          </div>
          <div className="md:col-span-1">
            <SelectField
              ref={refs.state}
              id="address.state"
              name="address.state"
              label="UF"
              defaultValue={initial?.state ?? ""}
              autoComplete="address-level1"
              error={errors["address.state"]}
              onChange={onChange}
            >
              <option value="">—</option>
              {BRAZIL_STATES.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
      )}
    </EditSection>
  );
}

// ---- Vitrine (P-VIS-1..3) ----

export function ShowcaseSection({
  action,
  initial,
  upload,
}: {
  action: SettingsAction;
  initial: Pick<
    OwnerStoreSettings,
    "description" | "logoObjectKey" | "logoUrl" | "coverObjectKey" | "coverUrl"
  >;
  upload: (formData: FormData) => Promise<BrandUploadResult>;
}) {
  const [length, setLength] = useState(initial.description?.length ?? 0);
  const over = length > STORE_DESCRIPTION_MAX;
  return (
    <EditSection
      action={action}
      description="Logo, capa e descrição curta, como o cliente vê no Cardápio."
      id="vitrine"
      title="Vitrine"
    >
      {({ errors, onChange }) => (
        <div className="space-y-5">
          <TextareaField
            id="description"
            name="description"
            label="Descrição curta"
            defaultValue={initial.description ?? ""}
            maxLength={STORE_DESCRIPTION_MAX * 2}
            rows={3}
            hint={`${length} de ${STORE_DESCRIPTION_MAX} caracteres. Aparece no cabeçalho, em "Sobre a Loja" e nos buscadores.`}
            error={
              errors.description ??
              (over ? `A descrição tem no máximo ${STORE_DESCRIPTION_MAX} caracteres.` : undefined)
            }
            onChange={(event) => {
              setLength(event.currentTarget.value.trim().length);
              onChange();
            }}
          />
          <BrandImageField
            initialKey={initial.logoObjectKey}
            initialUrl={initial.logoUrl}
            kind="logo"
            onChange={onChange}
            upload={upload}
          />
          <BrandImageField
            initialKey={initial.coverObjectKey}
            initialUrl={initial.coverUrl}
            kind="cover"
            onChange={onChange}
            upload={upload}
          />
        </div>
      )}
    </EditSection>
  );
}

// ---- Cadastro do Ops: só leitura (CFG-04) ----

export function RegistrationFacts({
  name,
  registration,
}: {
  name: string;
  registration: OwnerStoreSettings["registration"];
}) {
  return (
    <OutlineContainer as="section" aria-labelledby="cadastro-title" className="p-5 md:p-7">
      <SectionHeading id="cadastro-title" description="Para alterar, fale com a equipe Foode.">
        Cadastro na Foode
      </SectionHeading>
      <div className="mt-5">
        <Facts
          items={[
            { label: "Nome da Loja", value: name },
            { label: "CNPJ", value: registration ? formatCnpj(registration.cnpj) : "—" },
            {
              label: "Chave Pix do Repasse",
              value: registration
                ? `${PIX_KEY_TYPE_LABEL[registration.payoutPixKeyType]} · ${registration.payoutPixKey}`
                : "—",
            },
            { label: "Titular", value: registration?.payoutHolderName ?? "—" },
          ]}
        />
      </div>
    </OutlineContainer>
  );
}
