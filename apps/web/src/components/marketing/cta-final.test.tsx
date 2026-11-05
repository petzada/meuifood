import { describe, expect, it } from "vitest";

import { CTA_FINAL_BG, CTA_FINAL_INK } from "./cta-final";

// Pedido do Dono: texto escuro no CTA final, fundo vermelho mais suave até passar WCAG AA.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe("CTA final", () => {
  it("ink sobre o fundo suave da primary passa WCAG AA (>= 4,5:1) com folga", () => {
    const ratio = contrast(CTA_FINAL_BG, CTA_FINAL_INK);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    // Registro: #222222 × #ffd1d1 ≈ 11,8:1.
    expect(ratio).toBeGreaterThan(11);
  });
});
