/** Macro presets: named snippets persisted in localStorage. */

export interface Macro {
  id: string;
  name: string;
  data: string;
  hex: boolean;
}

const KEY = "wsc.macros.v1";

export function loadMacros(): Macro[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultMacros();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultMacros();
    return parsed.filter(
      (m): m is Macro =>
        typeof m === "object" && m !== null &&
        typeof (m as Macro).name === "string" && typeof (m as Macro).data === "string",
    );
  } catch {
    return defaultMacros();
  }
}

export function saveMacros(macros: Macro[]): void {
  localStorage.setItem(KEY, JSON.stringify(macros));
}

function defaultMacros(): Macro[] {
  return [
    { id: crypto.randomUUID(), name: "help", data: "help", hex: false },
    { id: crypto.randomUUID(), name: "version", data: "version", hex: false },
    { id: crypto.randomUUID(), name: "DTR ON", data: "01 01", hex: true },
  ];
}
