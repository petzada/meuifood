"use client";

// Cadastro e edição da Loja (OPS-03): uma página com seções Loja, Endereço e Repasse.
// Criação = um formulário, botão sempre habilitado, valida no envio. Edição = cada seção
// salva sozinha (T-07) e só habilita "Salvar alterações" com mudança (T-06). Máscaras com
// `inputMode` numérico; o Zod do contrato aplica o dígito verificador. CEP opcional
// preenche o endereço (ViaCEP, falha silenciosa; decisão 63 P-CFG-4).
import { BRAZIL_STATES, PIX_KEY_TYPES, type OpsStoreDetail } from "@foode/shared/ops";
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
  formatCep,
  maskCep,
  maskCnpj,
  maskCpfOrCnpj,
  maskPhoneBr,
} from "../../../../lib/ops-format";
import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { PIX_KEY_TYPE_LABEL } from "../../../../lib/ops-labels";
import { SubmitButton } from "./submit-button";
import { ActionNotice, SectionHeading, SelectField } from "./fields";
import { useDirtyForm } from "./use-dirty-form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
type SlugCheck = (
  slug: string,
  currentStoreId: string | null,
) => Promise<"available" | "taken" | "invalid" | "unknown">;

type Initial = Pick<
  OpsStoreDetail,
  "id" | "slug" | "name" | "cnpj" | "whatsapp" | "address" | "payout"
>;

function masked(mask: (value: string) => string) {
  return (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    input.value = mask(input.value);
  };
}

function pixKeyMask(type: string): ((value: string) => string) | null {
  if (type === "cpf" || type === "cnpj") return maskCpfOrCnpj;
  if (type === "phone") return maskPhoneBr;
  return null;
}

// ---- Seções ----

function ProfileFields({
  checkSlug,
  errors,
  initial,
  onChange,
}: {
  checkSlug: SlugCheck;
  errors: Record<string, string>;
  initial: Initial | null;
  onChange?: () => void;
}) {
  const [slugState, setSlugState] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid" | "unknown"
  >("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onSlugChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.currentTarget.value.trim().toLowerCase();
    if (timer.current) clearTimeout(timer.current);
    if (!value || value === initial?.slug) {
      setSlugState("idle");
      return;
    }
    setSlugState("checking");
    timer.current = setTimeout(() => {
      void checkSlug(value, initial?.id ?? null).then(setSlugState);
    }, 400);
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const slugHint =
    slugState === "checking"
      ? "Verificando disponibilidade..."
      : slugState === "available"
        ? "Link disponível."
        : slugState === "taken"
          ? "Este link já pertence a outra Loja."
          : slugState === "invalid"
            ? "Use 3 a 63 letras minúsculas, números ou hífen; alguns nomes são reservados."
            : "Endereço público da Loja: foodedelivery.com.br/loja/<link>. Só minúsculas, números e hífen.";

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Field
        id="name"
        name="name"
        label="Nome da Loja"
        defaultValue={initial?.name ?? ""}
        maxLength={120}
        autoComplete="organization"
        error={errors.name}
        onChange={onChange}
      />
      <div>
        <Field
          id="slug"
          name="slug"
          label="Link personalizado"
          defaultValue={initial?.slug ?? ""}
          maxLength={63}
          autoCapitalize="none"
          spellCheck={false}
          error={errors.slug ?? (slugState === "taken" ? slugHint : undefined)}
          hint={slugState === "taken" ? undefined : slugHint}
          onChange={(event) => {
            onSlugChange(event);
            onChange?.();
          }}
        />
      </div>
      <Field
        id="cnpj"
        name="cnpj"
        label="CNPJ"
        defaultValue={initial?.cnpj ? maskCnpj(initial.cnpj) : ""}
        inputMode="numeric"
        autoComplete="off"
        placeholder="00.000.000/0000-00"
        error={errors.cnpj}
        onChange={(event) => {
          masked(maskCnpj)(event);
          onChange?.();
        }}
      />
      <Field
        id="whatsapp"
        name="whatsapp"
        label="WhatsApp da Loja"
        defaultValue={initial?.whatsapp ? maskPhoneBr(initial.whatsapp) : ""}
        inputMode="tel"
        autoComplete="tel"
        placeholder="(11) 91234-5678"
        hint="Celular com DDD; recebe o contato dos clientes."
        error={errors.whatsapp}
        onChange={(event) => {
          masked(maskPhoneBr)(event);
          onChange?.();
        }}
      />
    </div>
  );
}

type ViaCep = {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

function AddressFields({
  errors,
  initial,
  onChange,
}: {
  errors: Record<string, string>;
  initial: Initial["address"] | null;
  onChange?: () => void;
}) {
  const refs = {
    street: useRef<HTMLInputElement>(null),
    district: useRef<HTMLInputElement>(null),
    city: useRef<HTMLInputElement>(null),
    state: useRef<HTMLSelectElement>(null),
  };
  const [looking, setLooking] = useState(false);

  async function lookupCep(cep: string) {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLooking(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!response.ok) return;
      const data = (await response.json()) as ViaCep;
      if (data.erro) return;
      if (refs.street.current && data.logradouro) refs.street.current.value = data.logradouro;
      if (refs.district.current && data.bairro) refs.district.current.value = data.bairro;
      if (refs.city.current && data.localidade) refs.city.current.value = data.localidade;
      if (refs.state.current && data.uf) refs.state.current.value = data.uf;
      onChange?.();
    } catch {
      // Falha silenciosa (P-CFG-4): os campos continuam editáveis à mão.
    } finally {
      setLooking(false);
    }
  }

  return (
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
            looking ? "Buscando endereço..." : "Preenche rua, bairro e cidade; você pode ajustar."
          }
          error={errors["address.postalCode"]}
          onChange={(event) => {
            masked(maskCep)(event);
            onChange?.();
            void lookupCep(event.currentTarget.value);
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
  );
}

function PayoutFields({
  errors,
  initial,
  onChange,
}: {
  errors: Record<string, string>;
  initial: Initial["payout"] | null;
  onChange?: () => void;
}) {
  const [keyType, setKeyType] = useState<string>(initial?.pixKeyType ?? "cnpj");
  const mask = pixKeyMask(keyType);
  const keyInputMode = keyType === "email" ? "email" : keyType === "random" ? "text" : "numeric";
  const keyPlaceholder =
    keyType === "cpf"
      ? "000.000.000-00"
      : keyType === "cnpj"
        ? "00.000.000/0000-00"
        : keyType === "phone"
          ? "(11) 91234-5678"
          : keyType === "email"
            ? "financeiro@loja.com.br"
            : "chave aleatória (UUID)";

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <SelectField
        id="payout.pixKey.type"
        name="payout.pixKey.type"
        label="Tipo da chave Pix"
        defaultValue={keyType}
        error={errors["payout.pixKey.type"]}
        onChange={(event) => {
          setKeyType(event.currentTarget.value);
          onChange?.();
        }}
      >
        {PIX_KEY_TYPES.map((type) => (
          <option key={type} value={type}>
            {PIX_KEY_TYPE_LABEL[type]}
          </option>
        ))}
      </SelectField>
      <Field
        key={keyType}
        id="payout.pixKey.value"
        name="payout.pixKey.value"
        label="Chave Pix"
        defaultValue={
          initial && initial.pixKeyType === keyType ? initial.pixKey.replace(/^\+/, "") : ""
        }
        inputMode={keyInputMode}
        autoComplete="off"
        placeholder={keyPlaceholder}
        error={errors["payout.pixKey.value"] ?? errors["payout.pixKey"]}
        onChange={(event) => {
          if (mask) masked(mask)(event);
          onChange?.();
        }}
      />
      <Field
        id="payout.holderName"
        name="payout.holderName"
        label="Titular da conta"
        defaultValue={initial?.holderName ?? ""}
        maxLength={120}
        autoComplete="off"
        error={errors["payout.holderName"]}
        onChange={onChange}
      />
      <Field
        id="payout.holderDocument"
        name="payout.holderDocument"
        label="CPF ou CNPJ do titular"
        defaultValue={initial ? maskCpfOrCnpj(initial.holderDocument) : ""}
        inputMode="numeric"
        autoComplete="off"
        error={errors["payout.holderDocument"]}
        onChange={(event) => {
          masked(maskCpfOrCnpj)(event);
          onChange?.();
        }}
      />
    </div>
  );
}

// ---- Criação: um formulário, seções empilhadas ----

export function CreateStoreForm({ action, checkSlug }: { action: Action; checkSlug: SlugCheck }) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  return (
    <form action={formAction} noValidate className="space-y-10">
      <section aria-labelledby="sec-loja" className="space-y-5">
        <SectionHeading
          id="sec-loja"
          description="Como a Loja aparece para o cliente e para a Foode."
        >
          Loja
        </SectionHeading>
        <ProfileFields checkSlug={checkSlug} errors={state.errors} initial={null} />
      </section>
      <section aria-labelledby="sec-endereco" className="space-y-5">
        <SectionHeading id="sec-endereco" description="Endereço de Retirada e do cadastro fiscal.">
          Endereço
        </SectionHeading>
        <AddressFields errors={state.errors} initial={null} />
      </section>
      <section aria-labelledby="sec-repasse" className="space-y-5">
        <SectionHeading
          id="sec-repasse"
          description="Conta que recebe o Repasse dos Pedidos pagos online (lote diário por Pix)."
        >
          Repasse
        </SectionHeading>
        <PayoutFields errors={state.errors} initial={null} />
      </section>
      <div className="space-y-4 border-t border-[var(--color-hairline-soft)] pt-6">
        <ActionNotice state={state} />
        <p className="text-sm text-[var(--color-body)]">
          A Loja nasce <strong>em configuração</strong>. Depois, convide o Dono, defina o Plano e
          ative na página da Loja.
        </p>
        <SubmitButton>Cadastrar Loja</SubmitButton>
      </div>
    </form>
  );
}

// ---- Edição: cada seção é um formulário próprio ----

function EditSection({
  action,
  children,
  description,
  id,
  section,
  storeId,
  title,
}: {
  action: Action;
  children: (args: { errors: Record<string, string>; onChange: () => void }) => ReactNode;
  description: string;
  id: string;
  section: "profile" | "address" | "payout";
  storeId: string;
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
    <section aria-labelledby={headingId} id={id} className="scroll-mt-8">
      <form ref={ref} action={formAction} onChange={onChange} noValidate className="space-y-5">
        <input type="hidden" name="storeId" value={storeId} />
        <input type="hidden" name="sections" value={section} />
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
    </section>
  );
}

export function EditStoreForms({
  action,
  checkSlug,
  store,
}: {
  action: Action;
  checkSlug: SlugCheck;
  store: Initial;
}) {
  return (
    <div className="space-y-10">
      <EditSection
        action={action}
        description="Nome, Link personalizado, CNPJ e WhatsApp."
        id="loja"
        section="profile"
        storeId={store.id}
        title="Loja"
      >
        {({ errors, onChange }) => (
          <ProfileFields
            checkSlug={checkSlug}
            errors={errors}
            initial={store}
            onChange={onChange}
          />
        )}
      </EditSection>
      <EditSection
        action={action}
        description="Endereço de Retirada e do cadastro fiscal."
        id="endereco"
        section="address"
        storeId={store.id}
        title="Endereço"
      >
        {({ errors, onChange }) => (
          <AddressFields errors={errors} initial={store.address} onChange={onChange} />
        )}
      </EditSection>
      <EditSection
        action={action}
        description="Conta que recebe o Repasse dos Pedidos pagos online."
        id="repasse"
        section="payout"
        storeId={store.id}
        title="Repasse"
      >
        {({ errors, onChange }) => (
          <PayoutFields errors={errors} initial={store.payout} onChange={onChange} />
        )}
      </EditSection>
    </div>
  );
}
