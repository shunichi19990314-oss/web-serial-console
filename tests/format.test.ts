import { describe, expect, it } from "vitest";
import { hexdumpRow, parseHex, toAscii, toHex } from "../src/core/format";
import { SessionLog } from "../src/core/log";

const enc = (s: string) => new TextEncoder().encode(s);

describe("format", () => {
  it("toHex formats uppercase, space-separated hex", () => {
    expect(toHex(new Uint8Array([0x01, 0xa7, 0xff]))).toBe("01 A7 FF");
    expect(toHex(new Uint8Array())).toBe("");
  });

  it("parseHex accepts common input styles", () => {
    expect(parseHex("01 a7 FF")).toEqual(new Uint8Array([0x01, 0xa7, 0xff]));
    expect(parseHex("01a7ff")).toEqual(new Uint8Array([0x01, 0xa7, 0xff]));
    expect(parseHex("0x01, 0xA7")).toEqual(new Uint8Array([0x01, 0xa7]));
  });

  it("parseHex rejects invalid input", () => {
    expect(parseHex("abc")).toBeNull(); // non-hex
    expect(parseHex("123")).toBeNull(); // odd nibble count
    expect(parseHex("zz")).toBeNull();
    expect(parseHex("")).toBeNull();
  });

  it("round-trips through toHex and parseHex", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 254, 255]);
    expect(parseHex(toHex(bytes))).toEqual(bytes);
  });

  it("toAscii keeps printable chars and dots control chars", () => {
    expect(toAscii(enc("Hello!"))).toBe("Hello!");
    expect(toAscii(new Uint8Array([0x00, 0x0a, 0x41]))).toBe("··A");
  });

  it("hexdumpRow renders offset, hex and ascii gutter", () => {
    const row = hexdumpRow(0, enc("Hello World!!!!!"));
    expect(row.startsWith("000000")).toBe(true);
    expect(row).toContain("48 65 6C 6C 6F 20 57 6F");
    expect(row).toContain("|Hello World!!!!!|");
    // partial rows pad with blanks but keep the gutter closed
    const short = hexdumpRow(16, new Uint8Array([0xaa]));
    expect(short.startsWith("000010")).toBe(true);
    expect(short).toContain("AA");
  });
});

describe("SessionLog", () => {
  it("renders text chunks per direction and applies filters", () => {
    const log = new SessionLog();
    log.append({ ts: 1, dir: "rx", bytes: enc("hello sensor") });
    log.append({ ts: 2, dir: "tx", bytes: enc("who?") });
    log.append({ ts: 3, dir: "info", bytes: new Uint8Array(0), text: "info line" });

    const all = log.renderText("");
    expect(all.map((l) => l.dir)).toEqual(["rx", "tx", "info"]);
    expect(all[0]!.text).toBe("hello sensor");

    const filtered = log.renderText("hello");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.dir).toBe("rx");

    // hex bytes are searchable in text view too
    expect(log.renderText("77 68 6f")).toHaveLength(1);
  });

  it("groups hexdump rows by direction", () => {
    const log = new SessionLog();
    log.append({ ts: 1, dir: "rx", bytes: new Uint8Array(20).fill(0x41) }); // 16 + 4
    log.append({ ts: 2, dir: "tx", bytes: new Uint8Array(3).fill(0x42) });
    const rows = log.renderHexdump("");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.dir)).toEqual(["rx", "rx", "tx"]);
    expect(rows[0]!.text).toContain("41 41 41 41");
    expect(rows[1]!.text.startsWith("000010")).toBe(true);
    expect(rows[2]!.text).toContain("42");
  });

  it("exports csv with header and quoted fields", () => {
    const log = new SessionLog();
    log.append({ ts: 0, dir: "rx", bytes: enc('a"b') });
    const csv = log.exportCsv();
    expect(csv.split("\r\n")[0]).toBe("timestamp,direction,ascii,hex");
    expect(csv).toContain('"a""b"');
    expect(csv).toContain("61 22 62");
  });

  it("exports json with app metadata", () => {
    const log = new SessionLog();
    log.append({ ts: 5, dir: "tx", bytes: enc("ping") });
    const parsed = JSON.parse(log.exportJson());
    expect(parsed.app).toBe("web-serial-console");
    expect(parsed.chunks[0].hex).toBe("70 69 6E 67");
  });
});
