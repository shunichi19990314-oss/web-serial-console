/** Byte formatting helpers shared by the terminal, exporters and tests. */

const HEX = "0123456789ABCDEF";

/** Uppercase, space-separated hex: [0x01, 0xa7] -> "01 A7". */
export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    if (i > 0) out += " ";
    out += HEX[bytes[i]! >> 4] + HEX[bytes[i]! & 0x0f];
  }
  return out;
}

/** Decode bytes as ASCII text; control characters become "·" so lines stay visible. */
export function toAscii(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "·";
  return out;
}

/** Classic hexdump row: offset, 16 hex bytes, ASCII gutter. */
export function hexdumpRow(offset: number, bytes: Uint8Array): string {
  const hexPart: string[] = [];
  const ascii: string[] = [];
  for (let i = 0; i < 16; i++) {
    const b = bytes[i];
    if (b === undefined) {
      hexPart.push("  ");
      ascii.push(" ");
    } else {
      hexPart.push(HEX[b >> 4]! + HEX[b & 0x0f]!);
      ascii.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "·");
    }
  }
  const left = hexPart.slice(0, 8).join(" ");
  const right = hexPart.slice(8).join(" ");
  return `${offset.toString(16).toUpperCase().padStart(6, "0")}  ${left}  ${right}  |${ascii.join("")}|`;
}

/**
 * Parse a hex string into bytes. Accepts "01 A7 FF", "01a7ff", "0x01,0xA7".
 * Returns null when the input contains non-hex characters or an odd nibble count.
 */
export function parseHex(input: string): Uint8Array | null {
  const cleaned = input.replace(/0[xX]/g, " ").replace(/[\s,;:]+/g, "");
  if (cleaned.length === 0 || cleaned.length % 2 !== 0) return null;
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    const hi = Number.parseInt(cleaned[i * 2]!, 16);
    const lo = Number.parseInt(cleaned[i * 2 + 1]!, 16);
    if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
    out[i] = (hi << 4) | lo;
  }
  return out;
}

/** Local timestamp "HH:MM:SS.mmm" for the timestamps gutter. */
export function formatTs(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/** Byte totals with human units: 1536 -> "1.5 KB". */
export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
