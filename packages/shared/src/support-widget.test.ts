import { describe, expect, it } from "vitest";

import { supportWidgetConfig } from "./support-widget";

const SRC = "https://widget.agentes.chat/loader.js";

describe("supportWidgetConfig (widget de suporte, Ticket 30)", () => {
  it("sem configuração = desligado", () => {
    expect(supportWidgetConfig({ src: undefined, widgetId: undefined })).toBeNull();
    expect(supportWidgetConfig({ src: SRC, widgetId: undefined })).toBeNull();
    expect(supportWidgetConfig({ src: undefined, widgetId: "foode" })).toBeNull();
    expect(supportWidgetConfig({ src: "  ", widgetId: " " })).toBeNull();
  });

  it("com script https e id válido = ativo", () => {
    expect(supportWidgetConfig({ src: ` ${SRC} `, widgetId: " foode-suporte_1 " })).toEqual({
      src: SRC,
      widgetId: "foode-suporte_1",
    });
  });

  it("recusa http, URL inválida, credencial na URL e id estranho", () => {
    const off = (src: string, widgetId = "a") => supportWidgetConfig({ src, widgetId });
    expect(off("http://widget.agentes.chat/x.js")).toBeNull();
    expect(off("não é url")).toBeNull();
    expect(off("https://u:p@widget.agentes.chat/x.js")).toBeNull();
    expect(off(SRC, "<script>")).toBeNull();
    expect(off(SRC, "x".repeat(129))).toBeNull();
  });

  it("nunca wa.me nem WhatsApp como suporte (decisão 64)", () => {
    for (const src of [
      "https://wa.me/5511999999999",
      "https://api.whatsapp.com/send?phone=1",
      "https://web.whatsapp.com/",
      "https://chat.whatsapp.com/abc",
    ]) {
      expect(supportWidgetConfig({ src, widgetId: "a" })).toBeNull();
    }
  });
});
