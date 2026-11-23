/**
 * Session log: a capped list of raw chunks with per-view rendering and exporters.
 * Chunks keep direction and bytes; text/hexdump views are derived so switching
 * views never loses data and filters can be applied without touching the log.
 */
import { hexdumpRow, toAscii, toHex } from "./format";

export type Dir = "rx" | "tx" | "info";

export interface Chunk {
  ts: number;
  dir: Dir;
  bytes: Uint8Array;
  /** For info chunks (connection messages) a plain text payload. */
  text?: string;
}

const MAX_CHUNKS = 5000;

export interface RenderedLine {
  ts: number;
  dir: Dir;
  text: string;
}

export class SessionLog {
  private chunks: Chunk[] = [];
  private dropped = 0;

  append(chunk: Chunk): void {
    this.chunks.push(chunk);
    if (this.chunks.length > MAX_CHUNKS) {
      const overflow = this.chunks.length - MAX_CHUNKS;
      this.chunks.splice(0, overflow);
      this.dropped += overflow;
    }
  }

  get size(): number {
    return this.chunks.length;
  }

  clear(): void {
    this.chunks = [];
    this.dropped = 0;
  }

  /** Text view: chunks decoded per-direction with newline splitting kept natural. */
  renderText(filter: string): RenderedLine[] {
    return this.renderChunks(filter, (c) => c.text ?? toAscii(c.bytes));
  }

  /** Hexdump view: consecutive same-direction bytes grouped into 16-byte rows. */
  renderHexdump(filter: string): RenderedLine[] {
    const rows: RenderedLine[] = [];
    let buf: number[] = [];
    let curTs = 0;
    let curDir: Dir | null = null;
    let offset = 0;

    const flush = () => {
      if (buf.length === 0) return;
      rows.push({
        ts: curTs,
        dir: curDir!,
        text: hexdumpRow(offset, new Uint8Array(buf)),
      });
      offset += buf.length;
      buf = [];
    };

    for (const c of this.chunks) {
      if (c.dir === "info") {
        flush();
        offset = 0;
        curDir = null;
        if (this.matches(c.text ?? "", filter)) {
          rows.push({ ts: c.ts, dir: "info", text: c.text ?? "" });
        }
        continue;
      }
      if (c.dir !== curDir) {
        flush();
        curDir = c.dir;
        curTs = c.ts;
        offset = 0;
      }
      const text = toAscii(c.bytes);
      if (filter && !this.matches(`${toHex(c.bytes)} ${text}`, filter)) continue;
      buf.push(...c.bytes);
      while (buf.length >= 16) {
        rows.push({ ts: curTs, dir: curDir!, text: hexdumpRow(offset, new Uint8Array(buf.slice(0, 16))) });
        offset += 16;
        buf = buf.slice(16);
      }
    }
    flush();
    return rows;
  }

  private matches(haystack: string, filter: string): boolean {
    return !filter || haystack.toLowerCase().includes(filter.toLowerCase());
  }

  private renderChunks(filter: string, decode: (c: Chunk) => string): RenderedLine[] {
    const out: RenderedLine[] = [];
    for (const c of this.chunks) {
      const text = decode(c);
      if (!this.matches(c.dir === "info" ? text : `${toHex(c.bytes)} ${text}`, filter)) continue;
      out.push({ ts: c.ts, dir: c.dir, text });
    }
    return out;
  }

  /** .txt export: one line per chunk with optional timestamps. */
  exportTxt(): string {
    return this.chunks
      .map((c) => `${c.dir === "tx" ? ">>" : c.dir === "rx" ? "<<" : "--"} ${c.text ?? toAscii(c.bytes)}`)
      .join("\n") + "\n";
  }

  /** .csv export: timestamp, direction, ascii, hex per chunk (Excel friendly). */
  exportCsv(): string {
    const esc = (s: string) => `"${s.replaceAll('"', '""')}"`;
    const rows = ["timestamp,direction,ascii,hex"];
    for (const c of this.chunks) {
      const ascii = c.dir === "info" ? (c.text ?? "") : toAscii(c.bytes);
      rows.push(
        [new Date(c.ts).toISOString(), c.dir, esc(ascii), esc(toHex(c.bytes))].join(","),
      );
    }
    return rows.join("\r\n") + "\r\n";
  }

  /** .json export: full fidelity, bytes as hex strings. */
  exportJson(): string {
    return JSON.stringify(
      {
        app: "web-serial-console",
        version: 1,
        droppedChunks: this.dropped,
        chunks: this.chunks.map((c) => ({
          ts: c.ts,
          dir: c.dir,
          text: c.text ?? toAscii(c.bytes),
          hex: c.dir === "info" ? "" : toHex(c.bytes),
        })),
      },
      null,
      2,
    ) + "\n";
  }
}
