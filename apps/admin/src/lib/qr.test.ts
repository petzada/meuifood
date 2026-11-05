// Gerador de QR (LNK-01): estrutura (finders, timing, formato BCH) e decodificação básica —
// lê a máscara do formato, desmascara, percorre o zigue-zague, desintercala os blocos,
// confere o Reed-Solomon e recupera o texto em modo byte.
import { describe, expect, it } from "vitest";

import {
  dataModuleOrder,
  drawQrOnCanvas,
  encodeQr,
  formatBits,
  maskBit,
  qrToSvg,
  qrVersionFor,
  rsEncode,
  splitBlocks,
  versionBits,
  type QrMatrix,
} from "./qr";

function readFormat(qr: QrMatrix): { ecLevel: number; mask: number } {
  const m = qr.modules;
  const bits: number[] = [];
  for (let i = 0; i <= 5; i += 1) bits.push(m[8]![i] ? 1 : 0);
  bits.push(m[8]![7] ? 1 : 0, m[8]![8] ? 1 : 0, m[7]![8] ? 1 : 0);
  for (let i = 9; i < 15; i += 1) bits.push(m[14 - i]![8] ? 1 : 0);
  let value = 0;
  bits.forEach((bit, i) => {
    value |= bit << i;
  });
  value ^= 0x5412;
  return { ecLevel: (value >> 13) & 0b11, mask: (value >> 10) & 0b111 };
}

function decode(qr: QrMatrix): string {
  const { ecLevel, mask } = readFormat(qr);
  expect(ecLevel).toBe(0b00); // nível M
  expect(mask).toBe(qr.mask);
  const order = dataModuleOrder(qr.version);
  const bits: number[] = order.map(([x, y]) => (qr.modules[y]![x] !== maskBit(mask, x, y) ? 1 : 0));
  const codewords: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce<number>((acc, bit) => (acc << 1) | bit, 0));
  }
  // Desintercala: tamanhos dos blocos de dados vêm de `splitBlocks` com dummies.
  const shapes = splitBlocks(
    Array.from({ length: 1000 }, (_, i) => i),
    qr.version,
  ).map((b) => b.length);
  const totalData = shapes.reduce((a, b) => a + b, 0);
  const ecPerBlock = (codewords.length - totalData) / shapes.length;
  expect(Number.isInteger(ecPerBlock)).toBe(true);
  const dataBlocks: number[][] = shapes.map(() => []);
  let cursor = 0;
  for (let i = 0; i < Math.max(...shapes); i += 1) {
    shapes.forEach((size, b) => {
      if (i < size) dataBlocks[b]!.push(codewords[cursor++]!);
    });
  }
  const ecBlocks: number[][] = shapes.map(() => []);
  for (let i = 0; i < ecPerBlock; i += 1) {
    shapes.forEach((_, b) => {
      ecBlocks[b]!.push(codewords[cursor++]!);
    });
  }
  dataBlocks.forEach((block, b) => {
    expect(rsEncode(block, ecPerBlock)).toEqual(ecBlocks[b]);
  });
  const data = dataBlocks.flat();
  const stream: number[] = data.flatMap((byte) =>
    Array.from({ length: 8 }, (_, i) => (byte >> (7 - i)) & 1),
  );
  const take = (n: number) => stream.splice(0, n).reduce<number>((acc, bit) => (acc << 1) | bit, 0);
  expect(take(4)).toBe(0b0100);
  const length = take(qr.version >= 10 ? 16 : 8);
  const bytes = Uint8Array.from({ length }, () => take(8));
  return new TextDecoder().decode(bytes);
}

describe("qr", () => {
  it("escolhe a menor versão que cabe", () => {
    expect(qrVersionFor(10)).toBe(1);
    expect(qrVersionFor(17)).toBe(2);
    expect(qrVersionFor(99)).toBe(6);
    expect(qrVersionFor(500)).toBeNull();
  });

  it("formato e versão seguem o BCH do padrão", () => {
    // Vetores conhecidos (ISO 18004): M + máscara 0 = 101010000010010; versão 7 = 000111110010010100.
    expect(formatBits(0).toString(2).padStart(15, "0")).toBe("101010000010010");
    expect(versionBits(7).toString(2).padStart(18, "0")).toBe("000111110010010100");
  });

  it("tem os três finders, o timing e o módulo escuro", () => {
    const qr = encodeQr("https://foodedelivery.com.br/loja/ze")!;
    expect(qr.size).toBe(qr.version * 4 + 17);
    const finder = (x0: number, y0: number) => {
      for (let y = 0; y < 7; y += 1) {
        for (let x = 0; x < 7; x += 1) {
          const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
          expect(qr.modules[y0 + y]![x0 + x]).toBe(ring !== 2);
        }
      }
    };
    finder(0, 0);
    finder(qr.size - 7, 0);
    finder(0, qr.size - 7);
    for (let i = 8; i < qr.size - 8; i += 1) {
      expect(qr.modules[6]![i]).toBe(i % 2 === 0);
      expect(qr.modules[i]![6]).toBe(i % 2 === 0);
    }
    expect(qr.modules[qr.size - 8]![8]).toBe(true);
  });

  it.each([
    "https://foodedelivery.com.br/loja/ze",
    "https://foodedelivery.com.br/loja/lanchonete-do-ze-centro",
    "https://foodedelivery.com.br/loja/" + "a".repeat(63),
    "Olá, açaí!",
    "x".repeat(200),
  ])("codifica e decodifica %s", (text) => {
    const qr = encodeQr(text)!;
    expect(decode(qr)).toBe(text);
  });

  it("gera SVG com os módulos e desenha no canvas", () => {
    const qr = encodeQr("foode")!;
    const svg = qrToSvg(qr, { margin: 4, scale: 8 });
    expect(svg).toContain(`viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`);
    expect(svg).toContain('role="img"');
    const calls: Array<[number, number, number, number]> = [];
    const canvas = {
      width: 0,
      height: 0,
      getContext: () =>
        ({
          fillStyle: "",
          fillRect: (...args: [number, number, number, number]) => calls.push(args),
        }) as unknown as CanvasRenderingContext2D,
    };
    expect(drawQrOnCanvas(qr, canvas, { margin: 4, scale: 8 })).toBe(true);
    expect(canvas.width).toBe((qr.size + 8) * 8);
    const dark = qr.modules.flat().filter(Boolean).length;
    expect(calls).toHaveLength(dark + 1);
  });
});
