import { screen, waitFor } from "@testing-library/react";

import { render } from "../test/render";
import userEvent from "@testing-library/user-event";
import { useActionState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ActionNotice } from "../app/(painel)/ops/_components/fields";
import { SubmitButton } from "../app/(painel)/ops/_components/submit-button";
import { formError, formSuccess, IDLE_FORM, type FormState } from "../lib/ops-forms";
import { ActionForm } from "./action-form";
import { Field } from "./form";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

function Demo({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  return (
    <ActionForm action={formAction} state={state} noValidate>
      <Field id="nome" name="nome" label="Nome" error={state.errors.nome} />
      <Field id="email" name="email" label="E-mail" error={state.errors.email} />
      <Field id="cidade" name="cidade" label="Cidade" error={state.errors.cidade} />
      <ActionNotice state={state} />
      <SubmitButton pendingLabel="Salvando...">Salvar</SubmitButton>
    </ActionForm>
  );
}

describe("ActionForm (erro mantém o que foi digitado)", () => {
  it("em erro mantém os valores, marca o campo e dá foco no PRIMEIRO com erro, sem resumo", async () => {
    const user = userEvent.setup();
    const action = vi.fn<Action>(async () =>
      formError({ cidade: "Informe a cidade.", email: "E-mail inválido." }),
    );
    render(<Demo action={action} />);

    await user.type(screen.getByLabelText("Nome"), "Zé");
    await user.type(screen.getByLabelText("E-mail"), "ze@");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const email = screen.getByLabelText("E-mail");
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(email).toHaveFocus();
    expect(email).toHaveAccessibleDescription("E-mail inválido.");
    expect(screen.getByLabelText("Cidade")).toHaveAccessibleDescription("Informe a cidade.");
    expect(screen.getByLabelText("Nome")).toHaveValue("Zé");
    expect(email).toHaveValue("ze@");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(action.mock.calls[0]?.[1].get("nome")).toBe("Zé");
  });

  it("erro geral (sem campo) aparece no aviso; sucesso volta o formulário ao padrão", async () => {
    const user = userEvent.setup();
    const action = vi
      .fn<Action>()
      .mockResolvedValueOnce(formError({}, "A api não respondeu."))
      .mockResolvedValueOnce(formSuccess("Salvo."));
    render(<Demo action={action} />);

    await user.type(screen.getByLabelText("Nome"), "Zé");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A api não respondeu.");
    expect(screen.getByLabelText("Nome")).toHaveValue("Zé");

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Salvo.");
    expect(screen.getByLabelText("Nome")).toHaveValue("");
  });

  it("erro de campo que não está na tela não some: vira o aviso", async () => {
    const user = userEvent.setup();
    render(<Demo action={async () => formError({ "hours.0": "Período sobreposto." })} />);
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Período sobreposto.");
  });
});
