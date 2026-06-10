/**
 * Compact, dependency-free QR Code generator (suggestions-global VIII.8).
 *
 * Byte-mode encoder with automatic version selection (1–40) and configurable
 * error-correction level. Adapted from the public-domain algorithm described
 * by Nayuki (https://www.nayuki.io/page/qr-code-generator-library), trimmed to
 * byte mode. Returns a square boolean matrix (`true` = dark module) that the
 * `QRCode` component renders as crisp SVG rects.
 */

export type Ecc = "L" | "M" | "Q" | "H";

const ECC_CODEWORDS_PER_BLOCK: Record<Ecc, number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

const NUM_ERROR_CORRECTION_BLOCKS: Record<Ecc, number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

const ALIGN_POSITIONS: number[][] = (() => {
  const out: number[][] = [[]];
  for (let v = 1; v <= 40; v += 1) {
    if (v === 1) { out.push([]); continue; }
    const numAlign = Math.floor(v / 7) + 2;
    const step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result: number[] = [6];
    for (let pos = v * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    out.push(result);
  }
  return out;
})();

/* Galois field arithmetic over GF(256) with the QR primitive polynomial. */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255]!;
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

function rsComputeDivisor(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMul(result[j]!, root);
      if (j + 1 < degree) result[j] = result[j]! ^ result[j + 1]!;
    }
    root = gfMul(root, 2);
  }
  return result;
}

function rsComputeRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const result = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ result[0]!;
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < result.length; i += 1) result[i] = result[i]! ^ gfMul(divisor[i]!, factor);
  }
  return result;
}

function getNumDataCodewords(version: number, ecc: Ecc): number {
  const totalCodewords = getNumRawDataModules(version) >>> 3;
  const blocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][version]!;
  const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[ecc][version]!;
  return totalCodewords - eccPerBlock * blocks;
}

function getNumRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

const ECC_FORMAT_BITS: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** Encode `text` (UTF-8 byte mode) into a QR module matrix. */
export function encodeQr(text: string, ecc: Ecc = "M"): boolean[][] {
  const bytes = utf8Bytes(text);
  // Pick the smallest version that fits.
  let version = 1;
  for (; version <= 40; version += 1) {
    const capacityBits = getNumDataCodewords(version, ecc) * 8;
    const charCountBits = version <= 9 ? 8 : 16;
    const usedBits = 4 + charCountBits + bytes.length * 8;
    if (usedBits <= capacityBits) break;
  }
  if (version > 40) throw new Error("Data too long for QR code");

  // Build the bit stream.
  const bits: number[] = [];
  const appendBits = (val: number, len: number): void => {
    for (let i = len - 1; i >= 0; i -= 1) bits.push((val >>> i) & 1);
  };
  appendBits(0b0100, 4); // byte mode
  appendBits(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) appendBits(b, 8);

  const dataCapacityBits = getNumDataCodewords(version, ecc) * 8;
  appendBits(0, Math.min(4, dataCapacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  for (let pad = 0xec; bits.length < dataCapacityBits; pad ^= 0xec ^ 0x11) appendBits(pad, 8);

  // Pack into data codewords.
  const dataCodewords = new Uint8Array(bits.length >>> 3);
  for (let i = 0; i < bits.length; i += 1) dataCodewords[i >>> 3] = dataCodewords[i >>> 3]! | (bits[i]! << (7 - (i & 7)));

  const allCodewords = addEccAndInterleave(dataCodewords, version, ecc);
  return buildMatrix(version, ecc, allCodewords);
}

function addEccAndInterleave(data: Uint8Array, version: number, ecc: Ecc): Uint8Array {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][version]!;
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecc][version]!;
  const rawCodewords = getNumRawDataModules(version) >>> 3;
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: Uint8Array[] = [];
  const divisor = rsComputeDivisor(blockEccLen);
  let k = 0;
  for (let i = 0; i < numBlocks; i += 1) {
    const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = data.slice(k, k + datLen);
    k += datLen;
    const eccBytes = rsComputeRemainder(dat, divisor);
    const block = new Uint8Array(shortBlockLen + 1);
    block.set(dat, 0);
    block.set(eccBytes, block.length - blockEccLen);
    blocks.push(block);
  }

  const result = new Uint8Array(rawCodewords);
  let idx = 0;
  for (let i = 0; i < blocks[0]!.length; i += 1) {
    for (let j = 0; j < blocks.length; j += 1) {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
        result[idx++] = blocks[j]![i]!;
      }
    }
  }
  return result;
}

function buildMatrix(version: number, ecc: Ecc, codewords: Uint8Array): boolean[][] {
  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const setFunc = (x: number, y: number, dark: boolean): void => {
    modules[y]![x] = dark;
    isFunction[y]![x] = true;
  };
  const drawFinder = (cx: number, cy: number): void => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFunc(x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  // Timing patterns.
  for (let i = 0; i < size; i += 1) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }
  drawFinder(3, 3); drawFinder(size - 4, 3); drawFinder(3, size - 4);

  // Alignment patterns.
  const align = ALIGN_POSITIONS[version]!;
  for (const ay of align) {
    for (const ax of align) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          setFunc(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve format + version areas (filled later).
  const reserveFormat = (): void => {
    for (let i = 0; i < 9; i += 1) { if (!isFunction[i]![8]) setFunc(8, i, false); if (!isFunction[8]![i]) setFunc(i, 8, false); }
    for (let i = 0; i < 8; i += 1) { setFunc(size - 1 - i, 8, false); setFunc(8, size - 1 - i, false); }
    setFunc(8, size - 8, true); // dark module
  };
  reserveFormat();
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const x = i % 3, y = Math.floor(i / 3);
      setFunc(size - 11 + x, y, false);
      setFunc(y, size - 11 + x, false);
    }
  }

  // Place data with zig-zag pattern.
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    const col = right === 6 ? 5 : right;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = col - j;
        const upward = ((col + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (isFunction[y]![x]) continue;
        let dark = false;
        if (bitIdx < totalBits) {
          dark = ((codewords[bitIdx >>> 3]! >>> (7 - (bitIdx & 7))) & 1) !== 0;
          bitIdx += 1;
        }
        modules[y]![x] = dark;
      }
    }
  }

  // Try all 8 masks, pick the lowest penalty.
  let bestMask = 0;
  let minPenalty = Infinity;
  let bestModules = modules;
  for (let mask = 0; mask < 8; mask += 1) {
    const trial = modules.map((row) => row.slice());
    applyMask(trial, isFunction, mask);
    drawFormatBits(trial, isFunction, ecc, mask, size);
    const penalty = penaltyScore(trial, size);
    if (penalty < minPenalty) { minPenalty = penalty; bestMask = mask; bestModules = trial; }
  }
  void bestMask;
  return bestModules;
}

function applyMask(modules: boolean[][], isFunction: boolean[][], mask: number): void {
  const size = modules.length;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (isFunction[y]![x]) continue;
      let invert = false;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
      }
      if (invert) modules[y]![x] = !modules[y]![x];
    }
  }
}

function drawFormatBits(modules: boolean[][], isFunction: boolean[][], ecc: Ecc, mask: number, size: number): void {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const get = (i: number): boolean => ((bits >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i += 1) modules[i]![8] = get(i);
  modules[7]![8] = get(6);
  modules[8]![8] = get(7);
  modules[8]![7] = get(8);
  for (let i = 9; i < 15; i += 1) modules[8]![14 - i] = get(i);
  for (let i = 0; i < 8; i += 1) modules[8]![size - 1 - i] = get(i);
  for (let i = 8; i < 15; i += 1) modules[size - 15 + i]![8] = get(i);
  modules[size - 8]![8] = true;
  void isFunction;
}

function penaltyScore(modules: boolean[][], size: number): number {
  let penalty = 0;
  // Rule 1: runs of 5+ same-colour in rows/cols.
  for (let y = 0; y < size; y += 1) {
    let runColor = modules[y]![0]!, runLen = 1;
    for (let x = 1; x < size; x += 1) {
      if (modules[y]![x] === runColor) { runLen += 1; if (runLen === 5) penalty += 3; else if (runLen > 5) penalty += 1; }
      else { runColor = modules[y]![x]!; runLen = 1; }
    }
  }
  for (let x = 0; x < size; x += 1) {
    let runColor = modules[0]![x]!, runLen = 1;
    for (let y = 1; y < size; y += 1) {
      if (modules[y]![x] === runColor) { runLen += 1; if (runLen === 5) penalty += 3; else if (runLen > 5) penalty += 1; }
      else { runColor = modules[y]![x]!; runLen = 1; }
    }
  }
  // Rule 2: 2x2 blocks.
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const c = modules[y]![x];
      if (c === modules[y]![x + 1] && c === modules[y + 1]![x] && c === modules[y + 1]![x + 1]) penalty += 3;
    }
  }
  return penalty;
}

function utf8Bytes(text: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return new Uint8Array(out);
}
