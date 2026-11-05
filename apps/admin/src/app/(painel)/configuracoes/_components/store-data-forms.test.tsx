// Componente (decisão 67): Link personalizado verificado enquanto digita com o link resultante
// visível e o aviso de que links antigos continuam funcionando; vitrine com contador da
// descrição e upload de logo que recusa tipo/tamanho no cliente antes de enviar.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSetSlug } from "../../../../lib/onboarding-forms";
import { formError, formSuccess, type FormState } from "../../../../lib/ops-forms";
import { BrandImageField } from "./brand-image-field";
import { ShowcaseSection, SlugSection, type SlugCheck } from "./store-data-forms";

async function saveSlugAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseSetSlug(formData);
  if (!parsed.ok) return formError(parsed.errors);
  return formSuccess(
    `Link personalizado salvo: https://foodedelivery.com.br/loja/${parsed.data.slug}`,
  );
}

const ORIGIN = "https://foodedelivery.com.br";

describe("SlugSection", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mostra o link resultante enquanto digita, verifica no servidor e salva", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const checkSlug = vi.fn<SlugCheck>(
      async (slug) =>
        ({
          slug,
          available: slug !== "pizzaria-do-joao",
          ...(slug !== "pizzaria-do-joao"
            ? { url: `${ORIGIN}/loja/${slug}` }
            : { reason: "taken" as const }),
        }) as Awaited<ReturnType<SlugCheck>>,
    );
    render(
      <SlugSection
        action={saveSlugAction}
        checkSlug={checkSlug}
        initial={{ slug: "ze", storeUrl: `${ORIGIN}/loja/ze` }}
        origin={ORIGIN}
      />,
    );
    const input = screen.getByLabelText("Link personalizado", { selector: "input" });
    expect(screen.getByText("Seus links e QR antigos continuam funcionando.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeDisabled();

    await user.clear(input);
    await user.type(input, "pizzaria-do-joao");
    expect(screen.getByText(`${ORIGIN}/loja/pizzaria-do-joao`)).toBeVisible();
    await vi.advanceTimersByTimeAsync(500);
    expect(checkSlug).toHaveBeenCalledWith("pizzaria-do-joao");
    expect(await screen.findByText("Este link já é de outra Loja. Escolha outro.")).toBeVisible();
    expect(input).toHaveAttribute("aria-invalid", "true");

    await user.clear(input);
    await user.type(input, "Lanchonete-ZE");
    expect(input).toHaveValue("lanchonete-ze");
    await vi.advanceTimersByTimeAsync(500);
    expect(await screen.findByText("Disponível.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      `Link personalizado salvo: ${ORIGIN}/loja/lanchonete-ze`,
    );
  });

  it("formato inválido ou reservado é dito sem chamar o servidor", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const checkSlug = vi.fn<SlugCheck>(async () => null);
    render(
      <SlugSection
        action={saveSlugAction}
        checkSlug={checkSlug}
        initial={{ slug: "ze", storeUrl: `${ORIGIN}/loja/ze` }}
        origin={ORIGIN}
      />,
    );
    const input = screen.getByLabelText("Link personalizado", { selector: "input" });
    await user.clear(input);
    await user.type(input, "admin");
    expect(screen.getByText("Este nome é reservado. Escolha outro.")).toBeVisible();
    await user.clear(input);
    await user.type(input, "a b");
    expect(screen.getByText("Use 3 a 63 letras minúsculas, números ou hífen.")).toBeVisible();
    await vi.advanceTimersByTimeAsync(600);
    expect(checkSlug).not.toHaveBeenCalled();
  });
});

describe("BrandImageField", () => {
  it("recusa tipo e tamanho no cliente e envia o válido pelos bytes", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const upload = vi.fn(async (formData: FormData) => ({
      ok: true as const,
      objectKey: `stores/s1/brand/${formData.get("kind")}.png`,
      imageUrl: "https://media.example/logo.png",
    }));
    const { container } = render(
      <BrandImageField initialKey={null} initialUrl={null} kind="logo" upload={upload} />,
    );
    const input = screen.getByLabelText("Logo", { selector: "input[type=file]" });

    await user.upload(input, new File(["x"], "logo.gif", { type: "image/gif" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Formato não aceito");
    expect(upload).not.toHaveBeenCalled();

    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    await user.upload(input, big);
    expect(await screen.findByRole("alert")).toHaveTextContent("passa de 5 MB");
    expect(upload).not.toHaveBeenCalled();

    await user.upload(input, new File(["ok"], "logo.png", { type: "image/png" }));
    expect(upload).toHaveBeenCalledTimes(1);
    const sent = upload.mock.calls[0]![0];
    expect(sent.get("kind")).toBe("logo");
    expect(sent.get("file")).toBeInstanceOf(File);
    expect(await screen.findByRole("img", { name: "Prévia do logo da Loja" })).toHaveAttribute(
      "src",
      "https://media.example/logo.png",
    );
    expect(container.querySelector('input[name="logoObjectKey"]')).toHaveValue(
      "stores/s1/brand/logo.png",
    );
  });
});

describe("ShowcaseSection", () => {
  it("conta a descrição e aponta o excesso de 160", async () => {
    const user = userEvent.setup();
    render(
      <ShowcaseSection
        action={async () => formSuccess("ok")}
        initial={{
          description: null,
          logoObjectKey: null,
          logoUrl: null,
          coverObjectKey: null,
          coverUrl: null,
        }}
        upload={vi.fn()}
      />,
    );
    const field = screen.getByLabelText("Descrição curta");
    expect(screen.getByText(/^0 de 160 caracteres/u)).toBeVisible();
    await user.type(field, "Hambúrguer artesanal");
    expect(screen.getByText(/^20 de 160 caracteres/u)).toBeVisible();
    await user.type(field, "x".repeat(141));
    expect(screen.getByText("A descrição tem no máximo 160 caracteres.")).toBeVisible();
    expect(field).toHaveAttribute("aria-invalid", "true");
  });
});
