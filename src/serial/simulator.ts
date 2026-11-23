/**
 * SimBridge: a virtual device with the same Link interface as a real serial
 * port. It answers commands, echoes lines, and streams fake telemetry, so the
 * whole UI (and the hosted demo) is usable without any hardware.
 */
import type { Link, LinkSignals } from "./connection";
import { toAscii } from "../core/format";

const TELEM_PERIOD_MS = 1000;

export class SimLink implements Link {
  private timer: ReturnType<typeof setInterval> | null = null;
  private onChunk: ((bytes: Uint8Array) => void) | null = null;
  private seq = 0;
  private phase = 0;

  async open(baud: number, onChunk: (bytes: Uint8Array) => void): Promise<void> {
    void baud; // virtual device: baud rate is cosmetic
    this.onChunk = onChunk;
    this.emit([
      "SimBridge v1.0 — Web Serial Console virtual device",
      `Ready at ${new Date().toLocaleTimeString()} (baud setting is cosmetic here).`,
      'Type "help" for commands. Telemetry every 1 s.',
    ]);
    this.timer = setInterval(() => {
      const t = 23.0 + Math.sin(this.phase / 8) * 2.5 + jitter(0.15);
      const h = 46.0 + Math.cos(this.phase / 11) * 4 + jitter(0.4);
      this.emit([`{"seq":${++this.seq},"temp_c":${t.toFixed(2)},"rh_pct":${h.toFixed(2)}}`]);
      this.phase++;
    }, TELEM_PERIOD_MS);
  }

  async write(bytes: Uint8Array): Promise<void> {
    const text = toAscii(bytes).replace(/·/g, "").trim();
    if (/^01 01/.test([...bytes].map((b) => b.toString(16).padStart(2, "0")).join(" "))) {
      this.emit([bytes[1] === 1 ? "DTR line set ON" : "DTR line set OFF"]);
      return;
    }
    if (text === "help") {
      this.emit([
        "SimBridge commands:",
        "  help                this text",
        "  version             firmware string",
        "  sample              one telemetry reading",
        "  echo <text>         echoes the text back",
        "  (anything else)     echoed with a prefix",
        "Hex frames starting with 01 toggle the virtual DTR line.",
      ]);
      return;
    }
    if (text === "version") {
      this.emit(["SimBridge v1.0 (virtual) — built for the Web Serial Console demo"]);
      return;
    }
    if (text === "sample") {
      this.emit([`{"seq":${++this.seq},"temp_c":${(22.5 + jitter(1.2)).toFixed(2)},"rh_pct":${(45 + jitter(3)).toFixed(2)}}`]);
      return;
    }
    this.emit(text.length > 0 ? [`echo: ${text}`] : ["(empty line)"]);
  }

  async setSignals(): Promise<void> {
    /* virtual lines: nothing to do */
  }

  async getSignals(): Promise<LinkSignals> {
    return { cts: true, dsr: true, dcd: true };
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.onChunk = null;
  }

  describe(): string {
    return "SimBridge (virtual)";
  }

  private emit(lines: string[]): void {
    if (!this.onChunk) return;
    this.onChunk(new TextEncoder().encode(lines.join("\n") + "\n"));
  }
}

function jitter(scale: number): number {
  return (Math.random() - 0.5) * 2 * scale;
}
