// Componente (decisão 67): perguntas de perfil (opções fechadas, "Outro" exige texto, aviso
// de uso interno) e checklist do Dono (contagem, Feito/Pendente, "Plano ativo" sem ação,
// mensagem "Loja pronta" com Copiar link e QR Code).
import { buildOwnerChecklist, type OwnerChecklistFacts } from "@foode/shared/onboarding";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { parseAnswerProfile } from "../../../../lib/onboarding-forms";
import { formError, formSuccess, type FormState } from "../../../../lib/ops-forms";
import { OwnerChecklistCard } from "./owner-checklist";
import { ProfileQuestions } from "./profile-questions";

const answered: Array<{ cuisine: unknown; goal: unknown }> = [];
/** Igual à server action: valida com o parser do contrato. */
async function answerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseAnswerProfile(formData);
  if (!parsed.ok) return formError(parsed.errors, "Confira as respostas destacadas.");
  answered.push(parsed.data);
  return formSuccess("Obrigado!");
}

describe("ProfileQuestions", () => {
  it("avisa que as respostas são internas e exige texto em Outro", async () => {
    const user = userEvent.setup();
    render(<ProfileQuestions action={answerAction} storeName="Lanchonete do Zé" />);
    expect(screen.getByText(/uso interno da Foode/u)).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "Pizzaria" }));
    await user.click(
      within(screen.getByRole("group", { name: /O que você mais quer/u })).getByRole("radio", {
        name: "Outro",
      }),
    );
    expect(screen.getByLabelText("Conte para a gente")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Confira as respostas");
    expect(screen.getByLabelText("Conte para a gente")).toHaveAttribute("aria-invalid", "true");
    expect(answered).toHaveLength(0);

    await user.type(screen.getByLabelText("Conte para a gente"), "Vender no bairro");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Obrigado!");
    expect(answered).toEqual([
      {
        cuisine: { value: "pizza", other: null },
        goal: { value: "other", other: "Vender no bairro" },
      },
    ]);
  });
});

const facts: OwnerChecklistFacts = {
  hasWhatsapp: true,
  slugConfirmed: false,
  openingPeriods: 0,
  pickupEnabled: true,
  deliveryConfigured: false,
  availableMenuItems: 2,
  planActive: false,
  readyAcknowledged: false,
};

describe("OwnerChecklistCard", () => {
  it("conta os pendentes, liga Configurar só ao acionável e deixa Plano sem ação", () => {
    render(
      <OwnerChecklistCard
        checklist={buildOwnerChecklist(facts)}
        slug="ze"
        storeUrl="https://foodedelivery.com.br/loja/ze"
      />,
    );
    expect(screen.getByRole("heading", { name: /Faltam 3 passos/u })).toBeVisible();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(6);
    const configure = screen.getAllByRole("link", { name: /^Configurar/u });
    expect(configure.map((link) => link.getAttribute("href"))).toEqual([
      "/configuracoes/loja#link",
      "/configuracoes/horarios",
    ]);
    const plan = items.find((item) => within(item).queryByText("Plano ativo"))!;
    expect(within(plan).getByText("Pendente")).toBeVisible();
    expect(within(plan).queryByRole("link")).not.toBeInTheDocument();
    expect(within(plan).getByText(/equipe Foode ativa/u)).toBeVisible();
    expect(screen.getByRole("link", { name: "Pixel Meta e Google" })).toBeVisible();
  });

  it("concluído: mostra 'Loja pronta' uma vez com Copiar link e QR, e some depois de visto", async () => {
    const user = userEvent.setup();
    const ack = vi.fn(async () => {});
    const ready = buildOwnerChecklist({
      ...facts,
      slugConfirmed: true,
      openingPeriods: 1,
      planActive: true,
    });
    const { rerender } = render(
      <OwnerChecklistCard
        acknowledgeReady={ack}
        checklist={ready}
        slug="ze"
        storeUrl="https://foodedelivery.com.br/loja/ze"
      />,
    );
    expect(screen.getByRole("heading", { name: /Sua Loja está pronta/u })).toBeVisible();
    expect(screen.getByRole("button", { name: "Copiar link" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Baixar QR Code (PNG)" })).toBeVisible();
    expect(screen.getByRole("img", { name: /QR Code do link/u })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Entendi" }));
    expect(ack).toHaveBeenCalledTimes(1);

    rerender(
      <OwnerChecklistCard
        checklist={buildOwnerChecklist({
          ...facts,
          slugConfirmed: true,
          openingPeriods: 1,
          planActive: true,
          readyAcknowledged: true,
        })}
        slug="ze"
        storeUrl="https://foodedelivery.com.br/loja/ze"
      />,
    );
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
