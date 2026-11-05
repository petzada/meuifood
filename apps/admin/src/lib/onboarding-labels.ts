// Rótulos PT-BR do checklist do Dono (ONB-01): título, uma linha de porquê e o link direto à
// seção. "Plano ativo" não é acionável (ONB-02). Puro.
import type { OwnerChecklistItem } from "@foode/shared/onboarding";

export type ChecklistLabel = { title: string; why: string; href: string | null };

export const OWNER_CHECKLIST_LABEL: Record<OwnerChecklistItem, ChecklistLabel> = {
  contact: {
    title: "Dados de contato",
    why: "O WhatsApp da Loja aparece para o cliente falar com você.",
    href: "/configuracoes/loja#contato",
  },
  hours: {
    title: "Horários",
    why: "Sem horário, o Cardápio aparece sempre fechado.",
    href: "/configuracoes/horarios",
  },
  fulfillment: {
    title: "Entrega ou Retirada",
    why: "Ligue a Retirada ou configure o Delivery por bairro ou Taxa fixa.",
    href: "/configuracoes/entrega",
  },
  menu: {
    title: "Cardápio com item disponível",
    why: "Cadastre pelo menos um item disponível para receber Pedidos.",
    href: "/cardapio",
  },
  plan: {
    title: "Plano ativo",
    why: "A equipe Foode ativa seu Plano depois da contratação.",
    href: null,
  },
};
