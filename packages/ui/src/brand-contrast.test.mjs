// P-DS-1 (decisão 63): fundo com texto usa --color-primary-strong, com contraste AA (≥ 4,5:1)
// com o texto branco; o Button primário usa o token, não o #f35050 da marca. Em .mjs porque o
// tsconfig do pacote não carrega tipos do Node.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const brand = readFileSync(join(here, "../../shared/src/brand.css"), "utf8");
const styles = readFileSync(join(here, "styles.css"), "utf8");

/** @param {string} name */
function token(name) {
  const value = brand.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  if (!value) throw new Error(`token ${name} ausente`);
  return value;
}

/** @param {string} hex */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** @param {string} a @param {string} b */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("--color-primary-strong (P-DS-1)", () => {
  it.each(["color-primary-strong", "color-primary-strong-active"])(
    "%s tem contraste ≥ 4,5:1 com o texto sobre o primário",
    (name) => {
      expect(contrast(token(name), token("color-on-primary"))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("o primário da marca sozinho não passa (por isso o token existe)", () => {
    expect(contrast(token("color-primary"), token("color-on-primary"))).toBeLessThan(4.5);
  });

  it("Button primário usa o token forte no fundo", () => {
    const rule = styles.match(/\.foode-button--primary \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("background: var(--color-primary-strong)");
  });
});
