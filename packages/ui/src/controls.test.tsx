import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge, Card, Checkbox, Field, Input, Price, Radio, Select, Textarea } from "./index.js";

describe("controles de formulário da marca", () => {
  it("Field liga rótulo, dica e erro ao controle por id e aria", () => {
    const html = renderToStaticMarkup(
      <Field error="Informe o nome." hint="Como aparece no Cardápio." id="nome" label="Nome">
        {(a11y) => <Input {...a11y} name="name" />}
      </Field>,
    );
    expect(html).toContain('<label class="foode-field__label" for="nome">Nome</label>');
    expect(html).toContain('id="nome"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="nome-error nome-hint"');
    expect(html).toContain('id="nome-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("foode-field--error");
  });

  it("Field gera id quando não recebe um", () => {
    const html = renderToStaticMarkup(
      <Field label="Preço">{(a11y) => <Input {...a11y} inputMode="decimal" name="price" />}</Field>,
    );
    const forId = /for="([^"]+)"/u.exec(html)?.[1];
    expect(forId).toBeTruthy();
    expect(html).toContain(`id="${forId}"`);
    expect(html).not.toContain("aria-invalid");
  });

  it("Input, Textarea e Select usam a classe base outline e aceitam invalid", () => {
    const input = renderToStaticMarkup(<Input invalid name="a" />);
    expect(input).toContain('class="foode-control foode-input"');
    expect(input).toContain('aria-invalid="true"');
    expect(renderToStaticMarkup(<Textarea name="d" />)).toContain("foode-textarea");
    const select = renderToStaticMarkup(
      <Select name="s">
        <option value="1">Um</option>
      </Select>,
    );
    expect(select).toContain("foode-select");
    expect(select).toContain('<option value="1">Um</option>');
  });

  it("Checkbox e Radio envolvem o input num label clicável com trailing", () => {
    const checkbox = renderToStaticMarkup(
      <Checkbox name="additional" trailing="+ R$ 3,00" value="bacon">
        Bacon
      </Checkbox>,
    );
    expect(checkbox).toContain('<label class="foode-choice foode-choice--checkbox">');
    expect(checkbox).toContain('type="checkbox"');
    expect(checkbox).toContain('<span class="foode-choice__label">Bacon</span>');
    expect(checkbox).toContain('<span class="foode-choice__trailing">+ R$ 3,00</span>');

    const radio = renderToStaticMarkup(
      <Radio disabled name="steak" value="rare">
        Mal passado
      </Radio>,
    );
    expect(radio).toContain('type="radio"');
    expect(radio).toContain("foode-choice--disabled");
    expect(radio).toContain("disabled");
  });
});

describe("superfícies da marca", () => {
  it("Card é outline com padding e tag configurável", () => {
    const html = renderToStaticMarkup(
      <Card as="article" padding="compact" selected>
        Item
      </Card>,
    );
    expect(html).toContain(
      '<article class="foode-outline foode-card foode-card--compact foode-card--selected">',
    );
  });

  it("Badge varia o tom e é neutro por padrão", () => {
    expect(renderToStaticMarkup(<Badge>Obrigatório</Badge>)).toContain(
      'class="foode-badge foode-badge--neutral"',
    );
    expect(renderToStaticMarkup(<Badge tone="error">Indisponível</Badge>)).toContain(
      "foode-badge--error",
    );
  });

  it("Price é <data> em centavos com formatação BRL e aceita format injetado", () => {
    const html = renderToStaticMarkup(<Price cents={1250} />);
    expect(html).toContain('<data class="foode-price foode-price--default" value="1250">');
    expect(html.replace(new RegExp(String.fromCharCode(0xa0), "gu"), " ")).toContain("R$ 12,50");

    const custom = renderToStaticMarkup(
      <Price cents={300} format={(c) => `${c}c`} prefix="+" size="small" strike />,
    );
    expect(custom).toContain("foode-price--small");
    expect(custom).toContain("foode-price--strike");
    expect(custom).toContain('<span class="foode-price__prefix">+</span>300c');
  });

  it("Price recusa centavos não inteiros", () => {
    expect(() => renderToStaticMarkup(<Price cents={12.5} />)).toThrow(RangeError);
  });
});
