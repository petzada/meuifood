"use client";

// Cadastros do Cardápio em modal (decisão 74): "Criar categoria", "Adicionar item" (etapas
// Dados → Complementos → Adicionais, as duas últimas puláveis) e a edição do item (as mesmas
// etapas como abas). Ao concluir, o modal fecha, o Cardápio abre a categoria do item e o Toast
// confirma. O estado de qual modal está aberto vive aqui (abrir é instantâneo, sem ida ao
// servidor); a URL `?novo=item|categoria` / `?item=<id>` só abre um modal na chegada (links
// antigos de `/cardapio/itens/...` e do checklist) e é limpa ao fechar.
import type { AdminMenu, AdminMenuItem } from "@foode/shared/menu";
import { Badge, useToast } from "@foode/ui";
import { formatBRL } from "@foode/shared/money";
import { useRouter } from "next/navigation";
import {
  createContext,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ActionForm } from "../../../../components/action-form";
import {
  CadastroFooter,
  CadastroModal,
  CadastroTabs,
  StepIndicator,
  StepNavButton,
  StepPanel,
  useSteps,
  type CadastroStep,
} from "../../../../components/cadastro-modal";
import { Field } from "../../../../components/form";
import type { UploadResult } from "../../../../lib/menu-forms";
import { IDLE_FORM, type FormState } from "../../../../lib/ops-forms";
import { ActionNotice } from "../../ops/_components/fields";
import { SubmitButton } from "../../ops/_components/submit-button";
import type { CreatedState, MenuAction } from "../actions";
import { AdditionalsSection, type AdditionalActions } from "./additionals";
import {
  ComplementGroupsSection,
  type ComplementActions,
  type CopySource,
} from "./complement-groups";
import { ItemForm } from "./item-form";
import { ConfirmDialogForm } from "./quick-actions";

export type CardapioCadastroActions = ComplementActions &
  AdditionalActions & {
    createCategory: MenuAction;
    deleteItem: MenuAction;
    saveItemDraft: MenuAction;
    uploadMenuImage: (formData: FormData) => Promise<UploadResult>;
  };

export type CardapioModal =
  | { kind: "new-category" }
  | { kind: "new-item"; categoryId: string | null }
  | { kind: "edit-item"; itemId: string }
  | null;

type Ctx = { open: (modal: Exclude<CardapioModal, null>) => void };

const CadastrosContext = createContext<Ctx>({ open: () => undefined });

/** Abre um cadastro do Cardápio (dentro de `CardapioCadastros`). */
export function useCardapioCadastros(): Ctx {
  return useContext(CadastrosContext);
}

/** Botão que abre um cadastro; o foco volta para ele quando o modal fecha. */
export function OpenCadastroButton({
  children,
  className,
  modal,
  variant = "primary",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  modal: Exclude<CardapioModal, null>;
  variant?: "primary" | "secondary" | "link";
  "aria-label"?: string;
}) {
  const { open } = useCardapioCadastros();
  const classes =
    variant === "link"
      ? "text-left font-bold text-[var(--color-ink)] underline-offset-4 hover:underline focus-visible:underline"
      : `foode-button foode-button--${variant}`;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => open(modal)}
      className={[classes, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

function findItem(menu: AdminMenu, itemId: string | null) {
  if (!itemId) return null;
  for (const category of menu.categories) {
    const item = category.items.find((candidate) => candidate.id === itemId);
    if (item) return { category, item };
  }
  return null;
}

function copySources(menu: AdminMenu, itemId: string): CopySource[] {
  return menu.categories.flatMap((category) =>
    category.items
      .filter((other) => other.id !== itemId)
      .map((other) => ({
        id: other.id,
        name: other.name,
        complementGroups: other.complementGroups,
        categoryName: category.name,
      })),
  );
}

/** URL do Cardápio sem os parâmetros de modal (mantém a categoria aberta). */
function cleanUrl(categoryId: string | null): string {
  return categoryId ? `/cardapio?categoria=${categoryId}` : "/cardapio";
}

export function CardapioCadastros({
  actions,
  children,
  initial,
  menu,
  selectedCategoryId,
}: {
  actions: CardapioCadastroActions;
  children: ReactNode;
  initial: CardapioModal;
  menu: AdminMenu;
  selectedCategoryId: string | null;
}) {
  const [modal, setModal] = useState<CardapioModal>(initial);
  const router = useRouter();
  const toast = useToast();

  const open = useCallback((next: Exclude<CardapioModal, null>) => setModal(next), []);
  const ctx = useMemo(() => ({ open }), [open]);

  const close = useCallback(() => {
    setModal(null);
    // Chegou por `?novo=`/`?item=`: tira o parâmetro sem ida ao servidor.
    if (typeof window !== "undefined" && /[?&](novo|item)=/u.test(window.location.search)) {
      window.history.replaceState(null, "", cleanUrl(selectedCategoryId));
    }
  }, [selectedCategoryId]);

  /** Fecha e abre a categoria (nova ou do item) com o Toast de confirmação. */
  const finish = useCallback(
    (message: string, categoryId: string | null | undefined) => {
      setModal(null);
      toast.success(message);
      if (categoryId && categoryId !== selectedCategoryId) {
        router.replace(cleanUrl(categoryId), { scroll: false });
      } else if (
        typeof window !== "undefined" &&
        /[?&](novo|item)=/u.test(window.location.search)
      ) {
        window.history.replaceState(null, "", cleanUrl(selectedCategoryId));
      }
    },
    [router, selectedCategoryId, toast],
  );

  return (
    <CadastrosContext.Provider value={ctx}>
      {children}
      {modal?.kind === "new-category" ? (
        <NewCategoryModal
          action={actions.createCategory}
          onClose={close}
          onCreated={(state) =>
            finish(state.message ?? "Categoria criada.", state.categoryId ?? null)
          }
        />
      ) : null}
      {modal?.kind === "new-item" ? (
        <NewItemModal
          actions={actions}
          categoryId={modal.categoryId ?? selectedCategoryId}
          menu={menu}
          onClose={close}
          onDone={(item) => finish(`${item.name} adicionado ao Cardápio.`, item.categoryId)}
        />
      ) : null}
      {modal?.kind === "edit-item" ? (
        <EditItemModal actions={actions} itemId={modal.itemId} menu={menu} onClose={close} />
      ) : null}
    </CadastrosContext.Provider>
  );
}

// ---- Categoria ----

function NewCategoryModal({
  action,
  onClose,
  onCreated,
}: {
  action: MenuAction;
  onClose: () => void;
  onCreated: (state: CreatedState) => void;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, IDLE_FORM);
  const [dirty, setDirty] = useState(false);
  const id = useId();
  useEffect(() => {
    if (state.status === "success") onCreated(state as CreatedState);
  }, [onCreated, state]);
  return (
    <CadastroModal
      open
      size="md"
      title="Nova categoria"
      description="Categorias organizam o Cardápio no Storefront (ex.: Lanches, Bebidas, Sobremesas)."
      dirty={dirty}
      onClose={onClose}
    >
      <ActionForm
        action={formAction}
        state={state}
        resetOnSuccess={false}
        onChange={(event) =>
          setDirty((event.currentTarget as HTMLFormElement).querySelector("input")?.value !== "")
        }
        className="space-y-5"
      >
        <Field
          id={`${id}-name`}
          name="name"
          label="Nome da categoria"
          placeholder="Ex.: Lanches"
          maxLength={120}
          autoComplete="off"
          autoFocus
          error={state.errors.name}
        />
        <ActionNotice state={state.status === "success" ? IDLE_FORM : state} />
        <CadastroFooter>
          <StepNavButton variant="text" onClick={onClose}>
            Cancelar
          </StepNavButton>
          <SubmitButton pendingLabel="Criando...">Criar categoria</SubmitButton>
        </CadastroFooter>
      </ActionForm>
    </CadastroModal>
  );
}

// ---- Item: cadastro em etapas ----

const ITEM_STEPS: CadastroStep[] = [
  { id: "dados", label: "Dados" },
  { id: "complementos", label: "Complementos", optional: true },
  { id: "adicionais", label: "Adicionais", optional: true },
];

function StepWaiting() {
  return (
    <p role="status" className="text-sm text-[var(--color-muted)]">
      Carregando o item...
    </p>
  );
}

function NewItemModal({
  actions,
  categoryId,
  menu,
  onClose,
  onDone,
}: {
  actions: CardapioCadastroActions;
  categoryId: string | null;
  menu: AdminMenu;
  onClose: () => void;
  onDone: (item: Pick<AdminMenuItem, "name" | "categoryId">) => void;
}) {
  const steps = useSteps(ITEM_STEPS);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const found = findItem(menu, draftId);
  const item = found?.item ?? null;

  const onSaved = useCallback(
    (state: CreatedState) => {
      if (state.itemId) setDraftId(state.itemId);
      if (state.categoryId) setDraftCategory(state.categoryId);
      steps.next();
    },
    // `steps.next` usa setState funcional: a versão do 1º render serve para sempre.
    [],
  );

  // Concluir (ou fechar depois que o item já existe): o item fica no Cardápio e o Toast confirma.
  const conclude = () =>
    onDone({
      name: item?.name ?? draftName,
      categoryId: item?.categoryId ?? draftCategory ?? categoryId ?? "",
    });

  const optionalFooter = (last: boolean) => (
    <CadastroFooter>
      <span className="mr-auto">
        <StepNavButton onClick={steps.back}>Voltar</StepNavButton>
      </span>
      <StepNavButton variant="text" onClick={last ? conclude : steps.next}>
        Pular
      </StepNavButton>
      <StepNavButton variant="primary" onClick={last ? conclude : steps.next}>
        {last ? "Concluir" : "Continuar"}
      </StepNavButton>
    </CadastroFooter>
  );

  return (
    <CadastroModal
      open
      title={draftId && item ? `Novo item: ${item.name}` : "Novo item"}
      description="Primeiro os dados; Complementos e Adicionais são opcionais e dá para montar depois."
      dirty={dirty}
      onClose={draftId ? conclude : onClose}
      toolbar={<StepIndicator current={steps.current} steps={ITEM_STEPS} />}
    >
      <StepPanel active={steps.current === 0} label="Dados">
        <div
          onInput={(event) => {
            const target = event.target as HTMLInputElement;
            if (target.name === "name") setDraftName(target.value);
          }}
        >
          <ItemForm
            action={actions.saveItemDraft}
            categories={menu.categories}
            categoryId={categoryId}
            draftItemId={draftId}
            featuredCount={menu.featuredCount}
            item={null}
            onDirtyChange={setDirty}
            onSaved={onSaved}
            upload={actions.uploadMenuImage}
            variant="wizard"
          />
        </div>
      </StepPanel>
      <StepPanel active={steps.current === 1} label="Complementos">
        {item ? (
          <ComplementGroupsSection
            actions={actions}
            item={item}
            sources={copySources(menu, item.id)}
          />
        ) : (
          <StepWaiting />
        )}
        {optionalFooter(false)}
      </StepPanel>
      <StepPanel active={steps.current === 2} label="Adicionais">
        {item ? <AdditionalsSection actions={actions} item={item} /> : <StepWaiting />}
        {optionalFooter(true)}
      </StepPanel>
    </CadastroModal>
  );
}

// ---- Item: edição em abas ----

function EditItemModal({
  actions,
  itemId,
  menu,
  onClose,
}: {
  actions: CardapioCadastroActions;
  itemId: string;
  menu: AdminMenu;
  onClose: () => void;
}) {
  const found = findItem(menu, itemId);
  const [dirty, setDirty] = useState(false);

  // Item apagado (aqui ou em outra aba): o modal fecha sozinho.
  useEffect(() => {
    if (!found) onClose();
  }, [found, onClose]);
  if (!found) return null;
  const { category, item } = found;

  return (
    <CadastroModal
      open
      title={item.name}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <span>{formatBRL(item.priceCents)}</span>
          <span aria-hidden="true">·</span>
          <span>{category.name}</span>
          {item.featured ? <Badge tone="accent">Destaque</Badge> : null}
          <Badge tone={item.available ? "success" : "error"}>
            {item.available ? "Disponível" : "Esgotado"}
          </Badge>
        </span>
      }
      dirty={dirty}
      onClose={onClose}
    >
      <CadastroTabs
        label={`Seções de ${item.name}`}
        tabs={[
          {
            id: "dados",
            label: "Dados",
            content: (
              <ItemForm
                action={actions.saveItemDraft}
                categories={menu.categories}
                categoryId={category.id}
                extraActions={
                  <ConfirmDialogForm
                    action={actions.deleteItem}
                    confirmLabel="Apagar item"
                    description={
                      <p>
                        <strong>{item.name}</strong> sai de {category.name} com todos os
                        Complementos, Adicionais e a foto. Pedidos já feitos não mudam. Para só
                        tirar da venda hoje, use Esgotado.
                      </p>
                    }
                    hidden={{ itemId: item.id, categoryId: category.id }}
                    title={`Apagar ${item.name}?`}
                    trigger="Apagar item"
                  />
                }
                featuredCount={menu.featuredCount}
                item={item}
                onDirtyChange={setDirty}
                upload={actions.uploadMenuImage}
                variant="tab"
              />
            ),
          },
          {
            id: "complementos",
            label: `Complementos (${item.complementGroups.length})`,
            content: (
              <ComplementGroupsSection
                actions={actions}
                item={item}
                sources={copySources(menu, item.id)}
              />
            ),
          },
          {
            id: "adicionais",
            label: `Adicionais (${item.additionals.length})`,
            content: <AdditionalsSection actions={actions} item={item} />,
          },
        ]}
      />
    </CadastroModal>
  );
}
