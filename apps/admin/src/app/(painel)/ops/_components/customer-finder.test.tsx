// Componente (decisão 67): busca da conta do Consumidor no Ops e troca de telefone em duas
// etapas com a consequência nomeada (Ticket 13, decisão 65). Actions falsas reproduzem a
// validação da server action com os parsers do contrato; a RPC é mocada.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseCustomerChangePhone, parseCustomerFind } from "../../../../lib/customer-forms";
import { formError, formSuccess, type FormState } from "../../../../lib/ops-forms";
import { CustomerFinder, type CustomerFindState, type FindCustomerAction } from "./customer-finder";

const customer = {
  accountId: "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f",
  cpfMasked: "***.456.789-**",
  createdAt: "2026-11-01T12:00:00.000Z",
  name: "Ana Lima",
  phone: "5511987654321",
};

const rpcFind = vi.fn<(input: unknown) => Promise<boolean>>();
const rpcChange = vi.fn<(input: unknown) => Promise<boolean>>();

const find: FindCustomerAction = async (_prev, formData): Promise<CustomerFindState> => {
  const parsed = parseCustomerFind(formData);
  if (!parsed.ok) return { ...formError(parsed.errors), customer: null };
  const found = await rpcFind(parsed.data);
  if (!found) return { ...formError({}, "Nenhuma conta com esse dado."), customer: null };
  return { customer, errors: {}, status: "success" };
};

async function changePhone(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseCustomerChangePhone(formData);
  if (!parsed.ok) return formError(parsed.errors);
  const ok = await rpcChange(parsed.data);
  if (!ok) return formError({ phone: "Esse número já pertence a outra conta ou é o atual." });
  return formSuccess("Telefone trocado. As sessões abertas dessa conta foram encerradas.");
}

beforeEach(() => {
  rpcFind.mockReset();
  rpcChange.mockReset();
});

describe("CustomerFinder (Ops)", () => {
  it("telefone inválido não chama a RPC; conta inexistente avisa sem revelar nada", async () => {
    rpcFind.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<CustomerFinder changePhone={changePhone} find={find} />);
    await user.type(screen.getByLabelText("WhatsApp do Consumidor"), "123");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByText(/Use um celular com DDD/u)).toBeInTheDocument();
    expect(rpcFind).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("WhatsApp do Consumidor"));
    await user.type(screen.getByLabelText("WhatsApp do Consumidor"), "11987654321");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nenhuma conta com esse dado.");
    expect(rpcFind).toHaveBeenCalledWith({ phone: "5511987654321" });
  });

  it("busca por CPF mostra a ficha mascarada e a troca de telefone pede confirmação nomeando a consequência", async () => {
    rpcFind.mockResolvedValue(true);
    rpcChange.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<CustomerFinder changePhone={changePhone} find={find} />);
    await user.click(screen.getByRole("radio", { name: "CPF" }));
    await user.type(screen.getByLabelText("CPF do Consumidor"), "52998224725");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    expect(rpcFind).toHaveBeenCalledWith({ cpf: "52998224725" });
    expect(await screen.findByRole("heading", { name: "Ana Lima" })).toBeInTheDocument();
    expect(screen.getByText("***.456.789-**")).toBeInTheDocument();
    expect(screen.getByText("(11) 98765-4321")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Novo WhatsApp"), "11911112222");
    await user.click(screen.getByRole("button", { name: "Trocar telefone" }));
    // 1ª etapa: nada gravado ainda; a consequência está escrita.
    expect(rpcChange).not.toHaveBeenCalled();
    const confirm = screen.getByRole("status");
    expect(confirm).toHaveTextContent("Trocar o WhatsApp de Ana Lima");
    expect(confirm).toHaveTextContent("(11) *****-4321");
    expect(confirm).toHaveTextContent("(11) 91111-2222");
    expect(confirm).toHaveTextContent("as sessões abertas caem");
    expect(confirm).toHaveTextContent("fica registrada com quem fez");

    await user.click(screen.getByRole("button", { name: "Voltar e ajustar" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(rpcChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Trocar telefone" }));
    await user.click(screen.getByRole("button", { name: "Confirmar troca" }));
    expect(await screen.findByText(/Telefone trocado/u)).toBeInTheDocument();
    expect(rpcChange).toHaveBeenCalledWith({
      accountId: customer.accountId,
      phone: "5511911112222",
    });
  });

  it("número de outra conta volta como erro no campo", async () => {
    rpcFind.mockResolvedValue(true);
    rpcChange.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<CustomerFinder changePhone={changePhone} find={find} />);
    await user.type(screen.getByLabelText("WhatsApp do Consumidor"), "11987654321");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await screen.findByRole("heading", { name: "Ana Lima" });
    await user.type(screen.getByLabelText("Novo WhatsApp"), "11911112222");
    await user.click(screen.getByRole("button", { name: "Trocar telefone" }));
    await user.click(screen.getByRole("button", { name: "Confirmar troca" }));
    expect(await screen.findByText(/já pertence a outra conta/u)).toBeInTheDocument();
    expect(screen.getByLabelText("Novo WhatsApp")).toHaveAttribute("aria-invalid", "true");
  });
});
