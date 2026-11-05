import { describe, expect, it } from "vitest";

import {
  brandImageObjectKey,
  buildFunnelReport,
  buildOwnerChecklist,
  EMPTY_STOREFRONT_SHOWCASE,
  funnelDay,
  funnelEventRequestSchema,
  funnelReportInputSchema,
  isStoreBrandImageKey,
  movedStorePath,
  storefrontSlugMovedSchema,
  type OwnerChecklistFacts,
  ownerProfileInputSchema,
  slugFormatIssue,
  storeContactInputSchema,
  storefrontShowcaseSchema,
  storePixelsInputSchema,
  storePublicUrl,
  storeShowcaseInputSchema,
  storeSlugInputSchema,
  storeUploadBrandImageInputSchema,
} from "./index.js";

const STORE = "4f0c2a8e-6a51-4c3b-9d0e-1b2c3d4e5f60";
const OTHER = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const OBJECT = "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

describe("perfil do Dono (P-ONB-4)", () => {
  it("opção fechada descarta o texto de Outro", () => {
    expect(
      ownerProfileInputSchema.parse({
        cuisine: { value: "pizza", other: "ignorado" },
        goal: { value: "start_delivery" },
      }),
    ).toEqual({
      cuisine: { value: "pizza", other: null },
      goal: { value: "start_delivery", other: null },
    });
  });

  it("Outro exige texto; opção fora da lista é recusada", () => {
    expect(
      ownerProfileInputSchema.safeParse({
        cuisine: { value: "other" },
        goal: { value: "sell_more" },
      }).success,
    ).toBe(false);
    expect(
      ownerProfileInputSchema.parse({
        cuisine: { value: "other", other: "  Pastelaria " },
        goal: { value: "other", other: "Testar" },
      }).cuisine,
    ).toEqual({ value: "other", other: "Pastelaria" });
    expect(
      ownerProfileInputSchema.safeParse({
        cuisine: { value: "churrasco" },
        goal: { value: "sell_more" },
      }).success,
    ).toBe(false);
  });
});

describe("Slug e link (LNK-01, LNK-02)", () => {
  it("normaliza e valida formato e reservados", () => {
    expect(storeSlugInputSchema.parse({ slug: " Pizzaria-Do-Ze " })).toEqual({
      slug: "pizzaria-do-ze",
    });
    expect(storeSlugInputSchema.safeParse({ slug: "-ruim" }).success).toBe(false);
    expect(storeSlugInputSchema.safeParse({ slug: "admin" }).success).toBe(false);
  });

  it("classifica o problema do Slug sem banco", () => {
    expect(slugFormatIssue("Minha-Loja")).toEqual({ slug: "minha-loja", issue: null });
    expect(slugFormatIssue("painel")).toEqual({ slug: "painel", issue: "reserved" });
    expect(slugFormatIssue("a_b")).toEqual({ slug: "a_b", issue: "invalid" });
    expect(slugFormatIssue("ab").issue).toBe("invalid");
  });

  it("link público para copiar e para o QR (gerado no cliente)", () => {
    expect(storePublicUrl("pizzaria-do-ze")).toBe(
      "https://foodedelivery.com.br/loja/pizzaria-do-ze",
    );
    expect(storePublicUrl("x-y-z", "https://web.test/")).toBe("https://web.test/loja/x-y-z");
  });
});

describe("contato (CFG-04)", () => {
  it("WhatsApp em E.164 e Instagram sem @ nem URL", () => {
    expect(
      storeContactInputSchema.parse({
        whatsapp: "(11) 98765-4321",
        instagram: "https://www.instagram.com/Pizzaria.Ze/",
      }),
    ).toEqual({ whatsapp: "5511987654321", instagram: "pizzaria.ze" });
    expect(storeContactInputSchema.parse({ instagram: "@ze_lanches" }).instagram).toBe(
      "ze_lanches",
    );
    expect(storeContactInputSchema.parse({ instagram: null }).instagram).toBeNull();
  });

  it("recusa vazio, WhatsApp fixo e Instagram inválido", () => {
    expect(storeContactInputSchema.safeParse({}).success).toBe(false);
    expect(storeContactInputSchema.safeParse({ whatsapp: "1133334444" }).success).toBe(false);
    expect(storeContactInputSchema.safeParse({ instagram: "nome com espaço" }).success).toBe(false);
    expect(storeContactInputSchema.safeParse({ instagram: "a..b" }).success).toBe(false);
  });
});

describe("Pixel (LNK-03)", () => {
  it("aceita IDs válidos e vazio = null", () => {
    expect(
      storePixelsInputSchema.parse({ metaPixelId: "123456789012345", googleTagId: "g-abc1234" }),
    ).toEqual({ metaPixelId: "123456789012345", googleTagId: "G-ABC1234" });
    expect(storePixelsInputSchema.parse({ metaPixelId: "", googleTagId: null })).toEqual({
      metaPixelId: null,
      googleTagId: null,
    });
    expect(
      storePixelsInputSchema.parse({ metaPixelId: null, googleTagId: "AW-123456789" }),
    ).toEqual({ metaPixelId: null, googleTagId: "AW-123456789" });
  });

  it.each([
    { metaPixelId: "12345", googleTagId: null },
    { metaPixelId: "12345678901234a", googleTagId: null },
    { metaPixelId: null, googleTagId: "UA-1234-1" },
    { metaPixelId: null, googleTagId: "G-" },
  ])("recusa formato inválido %o", (input) => {
    expect(storePixelsInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("vitrine (P-VIS-1..3)", () => {
  it("descrição até 160; acima é recusada; vazia = null", () => {
    expect(
      storeShowcaseInputSchema.parse({ description: "a".repeat(160) }).description,
    ).toHaveLength(160);
    expect(storeShowcaseInputSchema.safeParse({ description: "a".repeat(161) }).success).toBe(
      false,
    );
    expect(storeShowcaseInputSchema.parse({ description: "  " }).description).toBeNull();
    expect(storeShowcaseInputSchema.safeParse({}).success).toBe(false);
  });

  it("upload: tipo pela assinatura, ≤ 5 MiB, nunca o header declarado", () => {
    expect(
      storeUploadBrandImageInputSchema.safeParse({
        kind: "logo",
        contentType: "image/png",
        bytes: PNG,
      }).success,
    ).toBe(true);
    expect(
      storeUploadBrandImageInputSchema.safeParse({
        kind: "cover",
        contentType: "image/png",
        bytes: JPEG,
      }).success,
    ).toBe(false);
    expect(
      storeUploadBrandImageInputSchema.safeParse({
        kind: "logo",
        contentType: "image/gif",
        bytes: Uint8Array.from([0x47, 0x49, 0x46]),
      }).success,
    ).toBe(false);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    expect(
      storeUploadBrandImageInputSchema.safeParse({
        kind: "logo",
        contentType: "image/png",
        bytes: big,
      }).success,
    ).toBe(false);
  });

  it("chave do logo/capa só da própria Loja", () => {
    const key = brandImageObjectKey(STORE, "image/webp", OBJECT);
    expect(key).toBe(`stores/${STORE}/brand/${OBJECT}.webp`);
    expect(isStoreBrandImageKey(STORE, key)).toBe(true);
    expect(isStoreBrandImageKey(OTHER, key)).toBe(false);
    expect(isStoreBrandImageKey(STORE, `stores/${STORE}/menu/${OBJECT}.webp`)).toBe(false);
    expect(isStoreBrandImageKey(STORE, `stores/${STORE}/brand/../x.png`)).toBe(false);
  });

  it("vitrine pública vazia é válida e não tem campo interno", () => {
    expect(storefrontShowcaseSchema.parse(EMPTY_STOREFRONT_SHOWCASE)).toEqual(
      EMPTY_STOREFRONT_SHOWCASE,
    );
    expect(Object.keys(EMPTY_STOREFRONT_SHOWCASE).sort()).toEqual([
      "coverUrl",
      "description",
      "instagram",
      "logoUrl",
      "pixels",
    ]);
  });
});

describe("checklist do Dono (ONB-01, ONB-02, ONB-04)", () => {
  const complete: OwnerChecklistFacts = {
    hasWhatsapp: true,
    openingPeriods: 2,
    pickupEnabled: false,
    deliveryConfigured: true,
    availableMenuItems: 1,
    planActive: true,
    readyAcknowledged: false,
  };

  it("Loja nova: tudo pendente, só Plano não acionável, sem ordem forçada", () => {
    const checklist = buildOwnerChecklist({
      hasWhatsapp: false,
      openingPeriods: 0,
      pickupEnabled: false,
      deliveryConfigured: false,
      availableMenuItems: 0,
      planActive: false,
      readyAcknowledged: false,
    });
    expect(checklist.items.map((entry) => entry.item)).toEqual([
      "contact",
      "hours",
      "fulfillment",
      "menu",
      "plan",
    ]);
    expect(checklist.pendingCount).toBe(5);
    expect(checklist.items.filter((entry) => !entry.actionable).map((entry) => entry.item)).toEqual(
      ["plan"],
    );
    expect(checklist.complete).toBe(false);
    expect(checklist.showReadyMessage).toBe(false);
  });

  it("itens independentes: Cardápio feito sem horários", () => {
    const checklist = buildOwnerChecklist({ ...complete, openingPeriods: 0 });
    expect(checklist.items.find((entry) => entry.item === "menu")?.done).toBe(true);
    expect(checklist.items.find((entry) => entry.item === "hours")?.done).toBe(false);
    expect(checklist.pendingCount).toBe(1);
  });

  it("Retirada sozinha conta como Fulfillment; Plano depende da Foode", () => {
    const checklist = buildOwnerChecklist({
      ...complete,
      pickupEnabled: true,
      deliveryConfigured: false,
      planActive: false,
    });
    expect(checklist.items.find((entry) => entry.item === "fulfillment")?.done).toBe(true);
    expect(checklist.complete).toBe(false);
  });

  it("concluído mostra a mensagem de pronto uma vez", () => {
    expect(buildOwnerChecklist(complete)).toMatchObject({ complete: true, showReadyMessage: true });
    expect(buildOwnerChecklist({ ...complete, readyAcknowledged: true }).showReadyMessage).toBe(
      false,
    );
  });
});

describe("funil próprio (P-REL-4)", () => {
  it("corpo só com o evento: qualquer outro campo (dado pessoal) é recusado", () => {
    expect(funnelEventRequestSchema.parse({ event: "visit" })).toEqual({ event: "visit" });
    expect(
      funnelEventRequestSchema.safeParse({ event: "visit", phone: "11987654321" }).success,
    ).toBe(false);
    expect(funnelEventRequestSchema.safeParse({ event: "visit", consumerId: "x" }).success).toBe(
      false,
    );
    // `order` é contado pela api na criação do Pedido, não pelo navegador.
    expect(funnelEventRequestSchema.safeParse({ event: "order" }).success).toBe(false);
  });

  it("dia civil de São Paulo (UTC−3)", () => {
    expect(funnelDay(Date.parse("2026-11-05T02:59:59.000Z"))).toBe("2026-11-04");
    expect(funnelDay(Date.parse("2026-11-05T03:00:00.000Z"))).toBe("2026-11-05");
  });

  it("período do relatório: ordem, data válida e até 92 dias", () => {
    expect(
      funnelReportInputSchema.safeParse({ from: "2026-11-01", to: "2026-11-30" }).success,
    ).toBe(true);
    expect(
      funnelReportInputSchema.safeParse({ from: "2026-11-30", to: "2026-11-01" }).success,
    ).toBe(false);
    expect(
      funnelReportInputSchema.safeParse({ from: "2026-02-30", to: "2026-03-01" }).success,
    ).toBe(false);
    expect(
      funnelReportInputSchema.safeParse({ from: "2026-01-01", to: "2026-12-31" }).success,
    ).toBe(false);
  });

  it("agrega por dia com zeros, totais e conversão por passo", () => {
    const report = buildFunnelReport("2026-11-01", "2026-11-03", [
      { day: "2026-11-01", event: "visit", count: 100 },
      { day: "2026-11-01", event: "item_view", count: 40 },
      { day: "2026-11-03", event: "visit", count: 100 },
      { day: "2026-11-03", event: "item_view", count: 10 },
      { day: "2026-11-03", event: "add_to_cart", count: 25 },
      { day: "2026-11-03", event: "checkout_start", count: 10 },
      { day: "2026-11-03", event: "order", count: 5 },
      { day: "2026-10-31", event: "visit", count: 999 },
    ]);
    expect(report.days.map((row) => row.day)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(report.days[1]).toEqual({
      day: "2026-11-02",
      visit: 0,
      item_view: 0,
      add_to_cart: 0,
      checkout_start: 0,
      order: 0,
    });
    expect(report.totals).toEqual({
      visit: 200,
      item_view: 50,
      add_to_cart: 25,
      checkout_start: 10,
      order: 5,
    });
    expect(report.stepConversionBps).toEqual({
      item_view: 2500,
      add_to_cart: 5000,
      checkout_start: 4000,
      order: 5000,
    });
  });

  it("passo anterior zero = conversão null", () => {
    expect(
      buildFunnelReport("2026-11-01", "2026-11-01", []).stepConversionBps.item_view,
    ).toBeNull();
  });
});

describe("link antigo → atual (decisão 69)", () => {
  it("troca só o slug e preserva subcaminho e query", () => {
    expect(movedStorePath("/loja/antigo/pedido/abc?utm_source=qr", "atual")).toBe(
      "/loja/atual/pedido/abc?utm_source=qr",
    );
    expect(movedStorePath("/loja/antigo?item=x", "atual")).toBe("/loja/atual?item=x");
    expect(movedStorePath("/loja/antigo", "atual")).toBe("/loja/atual");
  });

  it("corpo do 308", () => {
    expect(storefrontSlugMovedSchema.parse({ error: "slug_moved", currentSlug: "atual" })).toEqual({
      error: "slug_moved",
      currentSlug: "atual",
    });
    expect(
      storefrontSlugMovedSchema.safeParse({ error: "slug_moved", currentSlug: "A" }).success,
    ).toBe(false);
  });
});
