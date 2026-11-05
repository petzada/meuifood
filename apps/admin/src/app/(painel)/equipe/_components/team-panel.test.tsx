// Equipe do Dono (item 9; EQP-01): lista, convite de Operador com Turnstile e remoção com
// confirmação que nomeia a pessoa e a consequência. Actions entram como vi.fn() (sem rede).
import type { StoreMemberView } from "@foode/shared";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { formError, formSuccess, type FormState } from "../../../../lib/ops-forms";
import { render } from "../../../../test/render";
import { TeamPanel } from "./team-panel";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

// Turnstile real carrega script externo: no teste ele entrega um token na hora.
vi.mock("../../../../components/turnstile", async () => {
  const { useEffect } = await import("react");
  return {
    Turnstile: ({ onToken }: { onToken: (token: string) => void }) => {
      useEffect(() => onToken("token-ok"), [onToken]);
      return null;
    },
  };
});

const MEMBERS: StoreMemberView[] = [
  { membershipId: "m1", userId: "u1", email: "dono@ze.com", name: "Zé", role: "owner" },
  { membershipId: "m2", userId: "u2", email: "ana@ze.com", name: "Ana", role: "operator" },
];

function setup(invite: Action = vi.fn<Action>(), remove: Action = vi.fn<Action>()) {
  const user = userEvent.setup();
  render(
    <TeamPanel currentUserId="u1" invite={invite} members={MEMBERS} remove={remove} siteKey="k" />,
  );
  return { user };
}

describe("TeamPanel (Equipe)", () => {
  it("lista a equipe com papel e não oferece remover a si mesmo", () => {
    setup();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Dono")).toBeInTheDocument();
    expect(within(items[0]!).getByText("(você)")).toBeInTheDocument();
    expect(within(items[0]!).queryByRole("button")).not.toBeInTheDocument();
    expect(within(items[1]!).getByText("Operador")).toBeInTheDocument();
    expect(
      within(items[1]!).getByRole("button", { name: "Remover acesso de Ana" }),
    ).toBeInTheDocument();
  });

  it("convida Operador com o token do Turnstile e avisa no Toast", async () => {
    const invite = vi.fn<Action>(async () => formSuccess("Convite enviado para bia@ze.com."));
    const { user } = setup(invite);
    await user.type(screen.getByLabelText("E-mail"), "bia@ze.com");
    await user.click(screen.getByRole("button", { name: "Convidar Operador" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Convite enviado para bia@ze.com.");
    const sent = invite.mock.calls[0]?.[1];
    expect(sent?.get("email")).toBe("bia@ze.com");
    expect(sent?.get("turnstileToken")).toBe("token-ok");
  });

  it("e-mail inválido fica no campo, mantém o digitado e recebe o foco", async () => {
    const invite = vi.fn<Action>(async () => formError({ email: "Informe um e-mail válido." }));
    const { user } = setup(invite);
    await user.type(screen.getByLabelText("Nome (opcional)"), "Bia");
    await user.type(screen.getByLabelText("E-mail"), "bia@");
    await user.click(screen.getByRole("button", { name: "Convidar Operador" }));
    const email = screen.getByLabelText("E-mail");
    expect(await screen.findByText("Informe um e-mail válido.")).toBeInTheDocument();
    expect(email).toHaveFocus();
    expect(email).toHaveValue("bia@");
    expect(screen.getByLabelText("Nome (opcional)")).toHaveValue("Bia");
  });

  it("remover pede confirmação nomeando a pessoa e a consequência", async () => {
    const remove = vi.fn<Action>(async () => formSuccess("Ana não tem mais acesso à Loja."));
    const { user } = setup(undefined, remove);
    await user.click(screen.getByRole("button", { name: "Remover acesso de Ana" }));
    const dialog = screen.getByRole("dialog", { name: "Remover o acesso de Ana?" });
    expect(dialog).toHaveTextContent("deixa de entrar no Painel desta Loja");

    await user.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remover acesso de Ana" }));
    await user.click(screen.getByRole("button", { name: "Remover acesso" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Ana não tem mais acesso");
    expect(remove.mock.calls[0]?.[1].get("membershipId")).toBe("m2");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
