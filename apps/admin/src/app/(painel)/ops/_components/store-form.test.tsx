// Componente: cadastro de Loja na área Ops (OPS-03). Validação no envio com o parser real
// do formulário, Slug verificado enquanto digita (taken/invalid) e conflito de Slug vindo
// da RPC no campo certo. A RPC é mocada: a action falsa reproduz `createStore` sem a api.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { formError, parseCreateStore, type FormState } from "../../../../lib/ops-forms";
import { CreateStoreForm } from "./store-form";

type SlugCheck = (
  slug: string,
  currentStoreId: string | null,
) => Promise<"available" | "taken" | "invalid" | "unknown">;

const rpcCreate = vi.fn<(data: unknown) => Promise<{ ok: boolean }>>();

/** Igual à server action: valida com o parser do contrato e traduz o conflito para o Slug. */
async function createStoreAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseCreateStore(formData);
  if (!parsed.ok) return formError(parsed.errors, "Confira os campos destacados.");
  const result = await rpcCreate(parsed.data);
  if (!result.ok) return formError({ slug: "Este link já pertence a outra Loja." });
  return { errors: {}, message: "Loja criada.", status: "success" };
}

function setup(checkSlug: SlugCheck = vi.fn<SlugCheck>(async () => "available")) {
  const user = userEvent.setup();
  render(<CreateStoreForm action={createStoreAction} checkSlug={checkSlug} />);
  return { checkSlug, user };
}

async function fillValidStore(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nome da Loja"), "Lanchonete do Zé");
  await user.type(screen.getByLabelText("Link personalizado"), "lanchonete-do-ze");
  await user.type(screen.getByLabelText("CNPJ"), "11222333000181");
  await user.type(screen.getByLabelText("WhatsApp da Loja"), "11912345678");
  await user.type(screen.getByLabelText("CEP"), "01001000");
  await user.type(screen.getByLabelText("Rua"), "Praça da Sé");
  await user.type(screen.getByLabelText("Número"), "100");
  await user.type(screen.getByLabelText("Bairro"), "Sé");
  await user.type(screen.getByLabelText("Cidade"), "São Paulo");
  await user.selectOptions(screen.getByLabelText("UF"), "SP");
  await user.type(screen.getByLabelText("Chave Pix"), "11222333000181");
  await user.type(screen.getByLabelText("Titular da conta"), "Zé Lanches LTDA");
  await user.type(screen.getByLabelText("CPF ou CNPJ do titular"), "11222333000181");
}

describe("CreateStoreForm (Ops: nova Loja)", () => {
  it("envio vazio destaca os campos obrigatórios e não chama a RPC", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Cadastrar Loja" }));

    expect(await screen.findByText("Confira os campos destacados.")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(screen.getByLabelText("Nome da Loja")).toHaveAccessibleDescription(
      "Informe o nome da Loja.",
    );
    expect(screen.getByLabelText("Link personalizado")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Rua")).toHaveAccessibleDescription("Informe a rua.");
    expect(screen.getByLabelText("UF")).toHaveAccessibleDescription("Escolha o estado.");
    expect(screen.getByLabelText("Titular da conta")).toHaveAccessibleDescription(
      "Informe o nome do titular.",
    );
    expect(rpcCreate).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("aplica as máscaras de CNPJ e WhatsApp enquanto digita", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { user } = setup();
    await user.type(screen.getByLabelText("CNPJ"), "11222333000181");
    await user.type(screen.getByLabelText("WhatsApp da Loja"), "11912345678");
    expect(screen.getByLabelText("CNPJ")).toHaveValue("11.222.333/0001-81");
    expect(screen.getByLabelText("WhatsApp da Loja")).toHaveValue("(11) 91234-5678");
    vi.unstubAllGlobals();
  });

  it("Slug em uso aparece como erro no campo enquanto digita", async () => {
    const checkSlug = vi.fn<SlugCheck>(async () => "taken");
    const { user } = setup(checkSlug);
    await user.type(screen.getByLabelText("Link personalizado"), "pizzaria");

    const slug = screen.getByLabelText("Link personalizado");
    await vi.waitFor(() => expect(slug).toHaveAttribute("aria-invalid", "true"), { timeout: 2000 });
    expect(slug).toHaveAccessibleDescription("Este link já pertence a outra Loja.");
    // Debounce: uma verificação só, com o texto final.
    expect(checkSlug).toHaveBeenCalledTimes(1);
    expect(checkSlug).toHaveBeenCalledWith("pizzaria", null);
  });

  it("Slug inválido ou disponível vira dica, não erro", async () => {
    const checkSlug = vi.fn<SlugCheck>(async (slug) => (slug === "ab" ? "invalid" : "available"));
    const { user } = setup(checkSlug);
    const slug = screen.getByLabelText("Link personalizado");
    await user.type(slug, "ab");
    await screen.findByText(/Use 3 a 63 letras minúsculas/u, undefined, { timeout: 2000 });
    expect(slug).not.toHaveAttribute("aria-invalid");

    await user.type(slug, "c");
    expect(await screen.findByText("Link disponível.", undefined, { timeout: 2000 })).toBeVisible();
  });

  it("conflito de Slug na RPC volta no campo Slug", async () => {
    const viaCep = vi.fn(async () => Response.json({ erro: true }));
    vi.stubGlobal("fetch", viaCep);
    rpcCreate.mockResolvedValueOnce({ ok: false });
    const { user } = setup();
    await fillValidStore(user);
    await user.click(screen.getByRole("button", { name: "Cadastrar Loja" }));

    const slug = screen.getByLabelText("Link personalizado");
    await vi.waitFor(() => expect(slug).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText("Este link já pertence a outra Loja.")).toBeInTheDocument();
    expect(rpcCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Lanchonete do Zé", slug: "lanchonete-do-ze" }),
    );
    expect(viaCep).toHaveBeenCalledWith("https://viacep.com.br/ws/01001000/json/");
    vi.unstubAllGlobals();
  });
});
