/**
 * Real device link over the Web Serial API, plus the Link interface that the
 * simulator also implements, so the UI can treat both identically.
 */

export interface LinkSignals {
  cts: boolean;
  dsr: boolean;
  dcd: boolean;
}

export interface Link {
  /** Open at the given baud rate; onChunk fires for every received chunk. */
  open(baud: number, onChunk: (bytes: Uint8Array) => void): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  setSignals(signals: { dtr?: boolean; rts?: boolean }): Promise<void>;
  getSignals(): Promise<LinkSignals>;
  close(): Promise<void>;
  /** Human-readable port label for the status bar. */
  describe(): string;
}

export function serialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

/** Human label from SerialPort.getInfo(): USB ids or Bluetooth service. */
export function describePort(port: SerialPort): string {
  const info = port.getInfo() as {
    usbVendorId?: number;
    usbProductId?: number;
    bluetoothServiceClassId?: number | string;
  };
  if (info.usbVendorId !== undefined) {
    return `USB ${hex4(info.usbVendorId)}:${hex4(info.usbProductId ?? 0)}`;
  }
  if (info.bluetoothServiceClassId !== undefined) {
    const id = String(info.bluetoothServiceClassId);
    return `Bluetooth ${id.length > 8 ? id.slice(0, 8) + "…" : id}`;
  }
  return "Serial port";
}

function hex4(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, "0");
}

/** Ask the user to pick a port (must run inside a user gesture). */
export async function pickPort(): Promise<SerialPort> {
  return navigator.serial.requestPort({});
}

/** Ports the user already granted in earlier sessions (for one-click reconnect). */
export async function grantedPorts(): Promise<SerialPort[]> {
  return navigator.serial.getPorts();
}

export class SerialLink implements Link {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private closing = false;

  constructor(readonly port: SerialPort) {}

  async open(baud: number, onChunk: (bytes: Uint8Array) => void): Promise<void> {
    await this.port.open({ baudRate: baud });
    this.startReader(onChunk);
    this.writer = this.port.writable?.getWriter() ?? null;
  }

  private startReader(onChunk: (bytes: Uint8Array) => void): void {
    const read = async () => {
      while (this.port.readable && !this.closing) {
        this.reader = this.port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.reader.read();
            if (done) break;
            if (value && value.length > 0) onChunk(value);
          }
        } catch {
          break; // port unplugged or cancelled during close
        } finally {
          this.reader.releaseLock();
          this.reader = null;
        }
      }
    };
    void read();
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error("port not open");
    await this.writer.write(bytes);
  }

  async setSignals(signals: { dtr?: boolean; rts?: boolean }): Promise<void> {
    await this.port.setSignals(signals as SerialOutputSignals);
  }

  async getSignals(): Promise<LinkSignals> {
    const s = await this.port.getSignals();
    return { cts: s.clearToSend, dsr: s.dataSetReady, dcd: s.dataCarrierDetect };
  }

  async close(): Promise<void> {
    this.closing = true;
    try {
      await this.reader?.cancel();
    } catch {
      /* reader may already be gone */
    }
    try {
      this.writer && (await this.writer.close());
    } catch {
      /* ignore flush errors on disconnect */
    }
    this.writer = null;
    if (this.port.readable !== null) {
      // give the read loop a moment to release, then close
      await new Promise((r) => setTimeout(r, 50));
    }
    try {
      await this.port.close();
    } catch {
      /* already closed by unplug */
    }
  }

  describe(): string {
    return describePort(this.port);
  }
}
