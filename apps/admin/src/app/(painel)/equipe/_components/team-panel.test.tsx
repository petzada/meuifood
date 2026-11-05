// Equipe do Dono (item 9; EQP-01): lista com a situação de cada membro, convite de Operador com
// Turnstile, reenvio do convite e remoção com confirmação que nomeia a pessoa e a consequência.
// Actions entram como vi.fn() (sem rede).
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
  {
    membershipId: "m1",
    userId: "u1",
    email: "dono@ze.com",
    name: "Zé",
    role: "owner",
    status: "active",
  },
  {
    membershipId: "m2",
    userId: "u2",
    email: "ana@ze.com",
    name: "Ana",
    role: "operator",
    status: "active",
  },
  {
    membershipId: "m3",
    userId: "u3",
    email: "bia@ze.com",
    name: "Bia",
    role: "operator",
    status: "invited",
  },
];

function setup(
  invite: Action = vi.fn<Action>(),
  remove: Action = vi.fn<Action>(),
  resend: Action = vi.fn<Action>(),
) {
  const user = userEvent.setup();
  render(
    <TeamPanel
      currentUserId="u1"
      invite={invite}
      members={MEMBERS}
      remove={remove}
      resend={resend}
      siteKey="k"
    />,
  );
  return { user };
}

describe("TeamPanel (Equipe)", () => {
  it("lista a equipe com papel e não oferece remover a si mesmo", () => {
    setup();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByText("Dono")).toBeInTheDocument();
    expect(within(items[0]!).getByText("(você)")).toBeInTheDocument();
    expect(within(items[0]!).queryByRole("button")).not.toBeInTheDocument();
    expect(within(items[1]!).getByText("Operador")).toBeInTheDocument();
    expect(
      within(items[1]!).getByRole("button", { name: "Remover acesso de Ana" }),
    ).toBeInTheDocument();
  });

  it("convida Operador no modal com o token do Turnstile, fecha e avisa no Toast", async () => {
    const invite = vi.fn<Action>(async () => formSuccess("Convite enviado para bia@ze.com."));
    const { user } = setup(invite);
    expect(screen.queryByLabelText("E-mail")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Convidar Operador" }));
    const dialog = screen.getByRole("dialog", { name: "Convidar Operador" });
    await user.type(within(dialog).getByLabelText("E-mail"), "bia@ze.com");
    await user.click(within(dialog).getByRole("button", { name: "Enviar convite" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Convite enviado para bia@ze.com.");
    expect(screen.queryByRole("dialog", { name: "Convidar Operador" })).not.toBeInTheDocument();
    const sent = invite.mock.calls[0]?.[1];
    expect(sent?.get("email")).toBe("bia@ze.com");
    expect(sent?.get("turnstileToken")).toBe("token-ok");
  });

  it("e-mail inválido fica no campo, mantém o digitado e recebe o foco", async () => {
    const invite = vi.fn<Action>(async () => formError({ email: "Informe um e-mail válido." }));
    const { user } = setup(invite);
    await user.click(screen.getByRole("button", { name: "Convidar Operador" }));
    await user.type(screen.getByLabelText("Nome (opcional)"), "Bia");
    await user.type(screen.getByLabelText("E-mail"), "bia@");
    await user.click(screen.getByRole("button", { name: "Enviar convite" }));
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

  it("mostra a situação de cada membro e só oferece reenviar a quem não aceitou", () => {
    setup();
    const [owner, ana, bia] = screen.getAllByRole("listitem");
    expect(within(owner!).getByText("Ativo")).toBeInTheDocument();
    expect(within(ana!).getByText("Ativo")).toBeInTheDocument();
    expect(
      within(ana!).queryByRole("button", { name: /Reenviar convite/ }),
    ).not.toBeInTheDocument();
    expect(within(bia!).getByText("Convite enviado")).toBeInTheDocument();
    expect(
      within(bia!).getByRole("button", { name: "Reenviar convite para Bia" }),
    ).toBeInTheDocument();
  });

  it("reenviar convite chama a action com o membro e confirma no Toast", async () => {
    const resend = vi.fn<Action>(async () => formSuccess("Convite reenviado para Bia."));
    const { user } = setup(undefined, undefined, resend);
    await user.click(screen.getByRole("button", { name: "Reenviar convite para Bia" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Convite reenviado para Bia.");
    expect(resend).toHaveBeenCalledTimes(1);
    const sent = resend.mock.calls[0]?.[1];
    expect(sent?.get("membershipId")).toBe("m3");
    expect(sent?.get("name")).toBe("Bia");
  });

  it("reenvio recusado (rate limit) avisa o erro no Toast", async () => {
    const resend = vi.fn<Action>(async () =>
      formError({}, "Convite reenviado há pouco. Aguarde alguns minutos para reenviar de novo."),
    );
    const { user } = setup(undefined, undefined, resend);
    await user.click(screen.getByRole("button", { name: "Reenviar convite para Bia" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Aguarde alguns minutos");
  });
});
