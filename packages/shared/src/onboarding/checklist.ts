// Checklist do Dono no Painel (Ticket 28; ONB-01, ONB-02, ONB-04). Calculado NO SERVIDOR a
// partir do estado gravado (a api lê os fatos e chama `buildOwnerChecklist`); o admin só exibe.
// Sem ordem forçada: qualquer item pendente é acionável, menos "Plano ativo", que a Foode faz.
// Sem item de Link personalizado (decisão 72): o link que o Ops define já vale; trocar é opcional
// em Configurações.
// Diferente do checklist de ativação do Ops (`ONBOARDING_CHECKS` de @foode/shared/ops).

export const OWNER_CHECKLIST_ITEMS = ["contact", "hours", "fulfillment", "menu", "plan"] as const;
export type OwnerChecklistItem = (typeof OWNER_CHECKLIST_ITEMS)[number];

/** Itens que o Dono não aciona (ONB-02): o Plano é ativado pela equipe Foode. */
export const OWNER_CHECKLIST_NOT_ACTIONABLE: readonly OwnerChecklistItem[] = ["plan"];

/** Fatos lidos do D1 para a Loja ativa. */
export type OwnerChecklistFacts = {
  /** WhatsApp da Loja gravado. */
  hasWhatsapp: boolean;
  /** Pelo menos um período de funcionamento. */
  openingPeriods: number;
  /** Retirada ligada ou Delivery configurado (Taxa fixa ou bairro ativo). */
  pickupEnabled: boolean;
  deliveryConfigured: boolean;
  /** Itens disponíveis no Cardápio (sem item fictício: P-ONB-3). */
  availableMenuItems: number;
  /** Plano vigente agora (Ops). */
  planActive: boolean;
  /** O Dono já viu "Sua Loja está pronta para receber Pedidos". */
  readyAcknowledged: boolean;
};

export type OwnerChecklistEntry = {
  item: OwnerChecklistItem;
  done: boolean;
  actionable: boolean;
};

export type OwnerChecklist = {
  items: OwnerChecklistEntry[];
  pendingCount: number;
  complete: boolean;
  /** Checklist concluído e a mensagem de pronto ainda não vista (aparece uma vez, ONB-04). */
  showReadyMessage: boolean;
};

export function buildOwnerChecklist(facts: OwnerChecklistFacts): OwnerChecklist {
  const done: Record<OwnerChecklistItem, boolean> = {
    contact: facts.hasWhatsapp,
    hours: facts.openingPeriods > 0,
    fulfillment: facts.pickupEnabled || facts.deliveryConfigured,
    menu: facts.availableMenuItems > 0,
    plan: facts.planActive,
  };
  const items = OWNER_CHECKLIST_ITEMS.map((item) => ({
    item,
    done: done[item],
    actionable: !OWNER_CHECKLIST_NOT_ACTIONABLE.includes(item),
  }));
  const pendingCount = items.filter((entry) => !entry.done).length;
  const complete = pendingCount === 0;
  return {
    items,
    pendingCount,
    complete,
    showReadyMessage: complete && !facts.readyAcknowledged,
  };
}
