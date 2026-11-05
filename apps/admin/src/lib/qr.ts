// Gerador mínimo de QR Code (ISO/IEC 18004) para o link da Loja (LNK-01), sem dependência
// nova no workspace: modo byte, correção M, versões 1 a 10 (até 213 bytes: a URL pública da
// Loja tem no máximo ~100). Puro e testável: devolve a matriz de módulos; o SVG sai daqui e o
// PNG é desenhado no `<canvas>` pelo componente. Decodificação básica no teste (`qr.test.ts`).

export type QrMatrix = {
  size: number;
  /** `modules[y][x]` = módulo escuro. */
  modules: boolean[][];
  version: number;
  mask: number;
};

// ---- Tabelas (só nível M) ---------------------------------------------------------------

type VersionSpec = {
  ecPerBlock: number;
  /** [quantidade de blocos, codewords de dados por bloco] por grupo. */
  groups: Array<[blocks: number, dataCodewords: number]>;
  alignment: number[];
};

const VERSIONS: Record<number, VersionSpec> = {
  1: { ecPerBlock: 10, groups: [[1, 16]], alignment: [] },
  2: { ecPerBlock: 16, groups: [[1, 28]], alignment: [6, 18] },
  3: { ecPerBlock: 26, groups: [[1, 44]], alignment: [6, 22] },
  4: { ecPerBlock: 18, groups: [[2, 32]], alignment: [6, 26] },
  5: { ecPerBlock: 24, groups: [[2, 43]], alignment: [6, 30] },
  6: { ecPerBlock: 16, groups: [[4, 27]], alignment: [6, 34] },
  7: { ecPerBlock: 18, groups: [[4, 31]], alignment: [6, 22, 38] },
  8: {
    ecPerBlock: 22,
    groups: [
      [2, 38],
      [2, 39],
    ],
    alignment: [6, 24, 42],
  },
  9: {
    ecPerBlock: 22,
    groups: [
      [3, 36],
      [2, 37],
    ],
    alignment: [6, 26, 46],
  },
  10: {
    ecPerBlock: 26,
    groups: [
      [4, 43],
      [1, 44],
    ],
    alignment: [6, 28, 50],
  },
};

export const QR_MAX_VERSION = 10;

function dataCapacity(version: number): number {
  return VERSIONS[version]!.groups.reduce((sum, [blocks, cw]) => sum + blocks * cw, 0);
}

function byteCapacity(version: number): number {
  const countBits = version >= 10 ? 16 : 8;
  return Math.floor((dataCapacity(version) * 8 - 4 - countBits) / 8);
}

/** Menor versão (1–10) que cabe `length` bytes em modo byte, nível M; null se não couber. */
export function qrVersionFor(length: number): number | null {
  for (let version = 1; version <= QR_MAX_VERSION; version += 1) {
    if (byteCapacity(version) >= length) return version;
  }
  return null;
}

// ---- GF(256) e Reed-Solomon ------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]!;
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!]!;
}

function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j]! ^= poly[j]!;
      next[j + 1]! ^= gfMul(poly[j]!, EXP[i]!);
    }
    poly = next;
  }
  return poly;
}

/** Codewords de correção (Reed-Solomon) de um bloco de dados. */
export function rsEncode(data: readonly number[], degree: number): number[] {
  const generator = rsGenerator(degree);
  const remainder = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder.shift()!;
    remainder.push(0);
    for (let i = 0; i < degree; i += 1) {
      remainder[i]! ^= gfMul(generator[i + 1]!, factor);
    }
  }
  return remainder;
}

// ---- Bits, codewords e intercalação ----------------------------------------------------

class BitBuffer {
  bits: number[] = [];
  push(value: number, length: number) {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >>> i) & 1);
  }
}

function encodeBytes(bytes: Uint8Array, version: number): number[] {
  const buffer = new BitBuffer();
  const capacityBits = dataCapacity(version) * 8;
  buffer.push(0b0100, 4);
  buffer.push(bytes.length, version >= 10 ? 16 : 8);
  for (const byte of bytes) buffer.push(byte, 8);
  const terminator = Math.min(4, capacityBits - buffer.bits.length);
  buffer.push(0, terminator);
  while (buffer.bits.length % 8 !== 0) buffer.bits.push(0);
  const codewords: number[] = [];
  for (let i = 0; i < buffer.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | buffer.bits[i + j]!;
    codewords.push(byte);
  }
  for (let pad = 0xec; codewords.length < dataCapacity(version); pad ^= 0xec ^ 0x11) {
    codewords.push(pad);
  }
  return codewords;
}

/** Divide os codewords de dados nos blocos da versão (ordem do padrão). */
export function splitBlocks(data: readonly number[], version: number): number[][] {
  const blocks: number[][] = [];
  let offset = 0;
  for (const [count, size] of VERSIONS[version]!.groups) {
    for (let i = 0; i < count; i += 1) {
      blocks.push(data.slice(offset, offset + size));
      offset += size;
    }
  }
  return blocks;
}

function interleave(dataBlocks: number[][], ecBlocks: number[][]): number[] {
  const out: number[] = [];
  const maxData = Math.max(...dataBlocks.map((block) => block.length));
  for (let i = 0; i < maxData; i += 1) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]!);
  }
  const maxEc = Math.max(...ecBlocks.map((block) => block.length));
  for (let i = 0; i < maxEc; i += 1) {
    for (const block of ecBlocks) if (i < block.length) out.push(block[i]!);
  }
  return out;
}

// ---- Matriz: padrões de função ----------------------------------------------------------

function grid(size: number, fill = false): boolean[][] {
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(fill));
}

/** Módulos ocupados por padrões de função (finder, timing, alinhamento, formato, versão). */
export function functionMask(version: number): boolean[][] {
  const size = version * 4 + 17;
  const mask = grid(size);
  const fill = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        if (x >= 0 && y >= 0 && x < size && y < size) mask[y]![x] = true;
      }
    }
  };
  // Finder + separador (9×9) e áreas de formato.
  fill(0, 0, 9, 9);
  fill(size - 8, 0, 8, 9);
  fill(0, size - 8, 9, 8);
  // Timing.
  for (let i = 0; i < size; i += 1) {
    mask[6]![i] = true;
    mask[i]![6] = true;
  }
  // Alinhamento.
  const positions = VERSIONS[version]!.alignment;
  for (const cy of positions) {
    for (const cx of positions) {
      const nearFinder =
        (cx < 9 && cy < 9) || (cx > size - 10 && cy < 9) || (cx < 9 && cy > size - 10);
      if (!nearFinder) fill(cx - 2, cy - 2, 5, 5);
    }
  }
  // Versão (v ≥ 7).
  if (version >= 7) {
    fill(size - 11, 0, 3, 6);
    fill(0, size - 11, 6, 3);
  }
  return mask;
}

function drawFinder(modules: boolean[][], x0: number, y0: number) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const xx = x0 + x;
      const yy = y0 + y;
      if (xx < 0 || yy < 0 || xx >= modules.length || yy >= modules.length) continue;
      const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      modules[yy]![xx] = ring === 2 || ring === 4 ? false : ring <= 3;
    }
  }
}

function drawFunctionPatterns(modules: boolean[][], version: number) {
  const size = modules.length;
  drawFinder(modules, 0, 0);
  drawFinder(modules, size - 7, 0);
  drawFinder(modules, 0, size - 7);
  for (let i = 8; i < size - 8; i += 1) {
    modules[6]![i] = i % 2 === 0;
    modules[i]![6] = i % 2 === 0;
  }
  const positions = VERSIONS[version]!.alignment;
  for (const cy of positions) {
    for (const cx of positions) {
      const nearFinder =
        (cx < 9 && cy < 9) || (cx > size - 10 && cy < 9) || (cx < 9 && cy > size - 10);
      if (nearFinder) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const ring = Math.max(Math.abs(dx), Math.abs(dy));
          modules[cy + dy]![cx + dx] = ring !== 1;
        }
      }
    }
  }
  // Módulo escuro fixo.
  modules[size - 8]![8] = true;
}

// ---- Formato e versão (BCH) -------------------------------------------------------------

function bch(value: number, bits: number, generator: number, generatorDegree: number): number {
  let remainder = value << generatorDegree;
  for (let i = bits + generatorDegree - 1; i >= generatorDegree; i -= 1) {
    if (remainder & (1 << i)) remainder ^= generator << (i - generatorDegree);
  }
  return (value << generatorDegree) | remainder;
}

/** 15 bits de formato: nível M (`00`) + máscara, BCH(15,5) e máscara fixa 0x5412. */
export function formatBits(mask: number): number {
  return bch((0b00 << 3) | mask, 5, 0b10100110111, 10) ^ 0x5412;
}

export function versionBits(version: number): number {
  return bch(version, 6, 0b1111100100101, 12);
}

function drawFormat(modules: boolean[][], mask: number) {
  const size = modules.length;
  const bits = formatBits(mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  // Em volta do finder superior esquerdo.
  for (let i = 0; i <= 5; i += 1) modules[8]![i] = bit(i);
  modules[8]![7] = bit(6);
  modules[8]![8] = bit(7);
  modules[7]![8] = bit(8);
  for (let i = 9; i < 15; i += 1) modules[14 - i]![8] = bit(i);
  // Cópia: coluna 8 embaixo e linha 8 à direita.
  for (let i = 0; i < 7; i += 1) modules[size - 1 - i]![8] = bit(i);
  for (let i = 7; i < 15; i += 1) modules[8]![size - 15 + i] = bit(i);
}

function drawVersion(modules: boolean[][], version: number) {
  if (version < 7) return;
  const size = modules.length;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i += 1) {
    const bit = ((bits >>> i) & 1) === 1;
    const a = Math.floor(i / 3);
    const b = size - 11 + (i % 3);
    modules[a]![b] = bit;
    modules[b]![a] = bit;
  }
}

// ---- Colocação dos dados e máscaras ---------------------------------------------------

/** Ordem de leitura/escrita dos módulos de dados (zigue-zague do padrão), fora das funções. */
export function dataModuleOrder(version: number): Array<[x: number, y: number]> {
  const size = version * 4 + 17;
  const reserved = functionMask(version);
  const order: Array<[number, number]> = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      const y = upward ? size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (!reserved[y]![x]) order.push([x, y]);
      }
    }
    upward = !upward;
  }
  return order;
}

export function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function penalty(modules: boolean[][]): number {
  const size = modules.length;
  let score = 0;
  // Regra 1: sequências ≥ 5 na linha e na coluna.
  for (let i = 0; i < size; i += 1) {
    let runRow = 1;
    let runCol = 1;
    for (let j = 1; j < size; j += 1) {
      if (modules[i]![j] === modules[i]![j - 1]) {
        runRow += 1;
        if (runRow === 5) score += 3;
        else if (runRow > 5) score += 1;
      } else runRow = 1;
      if (modules[j]![i] === modules[j - 1]![i]) {
        runCol += 1;
        if (runCol === 5) score += 3;
        else if (runCol > 5) score += 1;
      } else runCol = 1;
    }
  }
  // Regra 2: blocos 2×2.
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const v = modules[y]![x];
      if (v === modules[y]![x + 1] && v === modules[y + 1]![x] && v === modules[y + 1]![x + 1]) {
        score += 3;
      }
    }
  }
  // Regra 3: padrão 1011101 com 4 claros de um lado.
  const pattern = [true, false, true, true, true, false, true];
  const hasPattern = (get: (i: number) => boolean | undefined, start: number) => {
    for (let k = 0; k < 7; k += 1) if (get(start + k) !== pattern[k]) return false;
    let before = true;
    let after = true;
    for (let k = 1; k <= 4; k += 1) {
      if (get(start - k) !== false) before = false;
      if (get(start + 6 + k) !== false) after = false;
    }
    return before || after;
  };
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j <= size - 7; j += 1) {
      if (hasPattern((k) => modules[i]?.[k], j)) score += 40;
      if (hasPattern((k) => modules[k]?.[i], j)) score += 40;
    }
  }
  // Regra 4: proporção de escuros.
  let dark = 0;
  for (const row of modules) for (const module of row) if (module) dark += 1;
  const percent = (dark * 100) / (size * size);
  const previous = Math.floor(percent / 5) * 5;
  score += (Math.min(Math.abs(previous - 50), Math.abs(previous + 5 - 50)) / 5) * 10;
  return score;
}

// ---- API --------------------------------------------------------------------------------

/** Codifica `text` (UTF-8) num QR nível M; null se passar da versão 10. */
export function encodeQr(text: string): QrMatrix | null {
  const bytes = new TextEncoder().encode(text);
  const version = qrVersionFor(bytes.length);
  if (version === null) return null;
  const spec = VERSIONS[version]!;
  const dataBlocks = splitBlocks(encodeBytes(bytes, version), version);
  const ecBlocks = dataBlocks.map((block) => rsEncode(block, spec.ecPerBlock));
  const codewords = interleave(dataBlocks, ecBlocks);

  const size = version * 4 + 17;
  const base = grid(size);
  drawFunctionPatterns(base, version);
  drawVersion(base, version);
  const order = dataModuleOrder(version);
  const bits: boolean[] = [];
  for (const codeword of codewords) {
    for (let i = 7; i >= 0; i -= 1) bits.push(((codeword >>> i) & 1) === 1);
  }

  let best: { modules: boolean[][]; mask: number; score: number } | null = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const modules = base.map((row) => [...row]);
    order.forEach(([x, y], index) => {
      modules[y]![x] = (bits[index] ?? false) !== maskBit(mask, x, y);
    });
    drawFormat(modules, mask);
    const score = penalty(modules);
    if (!best || score < best.score) best = { modules, mask, score };
  }
  return { size, modules: best!.modules, version, mask: best!.mask };
}

/** SVG do QR (módulos escuros em `path`), com margem silenciosa de 4 módulos. */
export function qrToSvg(qr: QrMatrix, { margin = 4, scale = 8 } = {}): string {
  const total = qr.size + margin * 2;
  let path = "";
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (qr.modules[y]![x]) path += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
  }
  const px = total * scale;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR Code">` +
    `<rect width="${total}" height="${total}" fill="#fff"/>` +
    `<path d="${path}" fill="#000"/></svg>`
  );
}

/** Desenha o QR num canvas 2D (para exportar PNG no navegador). */
export function drawQrOnCanvas(
  qr: QrMatrix,
  canvas: {
    width: number;
    height: number;
    getContext(kind: "2d"): CanvasRenderingContext2D | null;
  },
  { margin = 4, scale = 8 } = {},
): boolean {
  const total = qr.size + margin * 2;
  canvas.width = total * scale;
  canvas.height = total * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (qr.modules[y]![x]) ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
    }
  }
  return true;
}
