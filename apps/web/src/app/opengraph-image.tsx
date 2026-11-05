// OG padrão (1200×630) na estética outline: canvas branco, borda primary, título. Gerado
// no build pelo `ImageResponse` (satori); as páginas que não definem imagem própria herdam.
import { ImageResponse } from "next/og";

import { SITE_NAME } from "../content/site";

export const alt = `${SITE_NAME} — cardápio digital e pedidos sem comissão`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: "#ffffff",
        color: "#222222",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          fontSize: 40,
          fontWeight: 700,
          color: "#d63a3a",
        }}
      >
        <div style={{ width: 28, height: 28, borderRadius: 999, background: "#f35050" }} />
        Foode Delivery
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2 }}>
          Organize seu delivery, sem comissão por pedido
        </div>
        <div style={{ fontSize: 32, color: "#3f3f3f" }}>
          Cardápio digital, pedidos e pagamento online para o seu negócio
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          inset: 24,
          border: "2px solid #f35050",
          borderRadius: 40,
        }}
      />
    </div>,
    size,
  );
}
