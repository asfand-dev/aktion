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
/** Encode `text` (UTF-8 byte mode) into a QR module matrix. */
export declare function encodeQr(text: string, ecc?: Ecc): boolean[][];
