/**
 * App wiring: owns the active Link (real port or simulator), feeds the session
 * log, renders the terminal, and updates counters / signals / status bar.
 */
import { SessionLog, type Dir } from "./core/log";
import { formatTs, humanBytes, parseHex } from "./core/format";
import { loadMacros, saveMacros, type Macro } from "./core/macros";
import { SerialLink, grantedPorts, pickPort, serialSupported, describePort, type Link } from "./serial/connection";
import { SimLink } from "./serial/simulator";
import { detectLang, t, type Lang } from "./ui/i18n";
import { cycleTheme, initTheme } from "./ui/theme";
import "./style.css";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const el = {
  baud: $<HTMLSelectElement>("baud"),
  btnConnect: $<HTMLButtonElement>("btn-connect"),
  btnReconnect: $<HTMLButtonElement>("btn-reconnect"),
  btnSim: $<HTMLButtonElement>("btn-sim"),
  btnDisconnect: $<HTMLButtonElement>("btn-disconnect"),
  btnLang: $<HTMLButtonElement>("btn-lang"),
  btnTheme: $<HTMLButtonElement>("btn-theme"),
  banner: $<HTMLElement>("support-banner"),
  info: $<HTMLElement>("info-banner"),
  view: $<HTMLSelectElement>("view"),
  ts: $<HTMLInputElement>("ts"),
  autoscroll: $<HTMLInputElement>("autoscroll"),
  filter: $<HTMLInputElement>("filter"),
  btnClear: $<HTMLButtonElement>("btn-clear"),
  exportSel: $<HTMLSelectElement>("export"),
  rates: $<HTMLElement>("rates"),
  macroList: $<HTMLElement>("macro-list"),
  btnAddMacro: $<HTMLButtonElement>("btn-add-macro"),
  terminal: $<HTMLElement>("terminal"),
  txInput: $<HTMLInputElement>("tx-input"),
  ending: $<HTMLSelectElement>("ending"),
  hexTx: $<HTMLInputElement>("hex-tx"),
  btnSend: $<HTMLButtonElement>("btn-send"),
  stDot: $<HTMLElement>("st-dot"),
  stState: $<HTMLElement>("st-state"),
  stPort: $<HTMLElement>("st-port"),
  stSignals: $<HTMLElement>("st-signals"),
  stCounters: $<HTMLElement>("st-counters"),
  stTime: $<HTMLElement>("st-time"),
  dialog: $<HTMLDialogElement>("macro-dialog"),
  macroName: $<HTMLInputElement>("macro-name"),
  macroData: $<HTMLInputElement>("macro-data"),
  macroHex: $<HTMLInputElement>("macro-hex"),
  macroDelete: $<HTMLButtonElement>("macro-delete"),
};

const log = new SessionLog();
const encoder = new TextEncoder();

let lang: Lang = detectLang();
let link: Link | null = null;
let currentPort: SerialPort | null = null;
let simActive = false;
let openSince: number | null = null;
let rxTotal = 0;
let txTotal = 0;
let rxWindow = 0;
let txWindow = 0;
let macros = loadMacros();
let editingMacro: Macro | null = null;
let signalsTimer: ReturnType<typeof setInterval> | null = null;

// ---------- i18n ----------
function applyI18n(): void {
  document.documentElement.lang = lang;
  for (const node of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    node.textContent = t(lang, node.dataset.i18n!);
  }
  for (const node of document.querySelectorAll<HTMLOptionElement>("[data-i18n-opt]")) {
    node.textContent = t(lang, node.dataset.i18nOpt!);
  }
  for (const node of document.querySelectorAll<HTMLInputElement>("[data-i18n-ph]")) {
    node.placeholder = t(lang, node.dataset.i18nPh!);
  }
  for (const node of document.querySelectorAll<HTMLElement>("[data-i18n-html]")) {
    node.innerHTML = t(lang, node.dataset.i18nHtml!);
  }
  el.macroName.placeholder = t(lang, "macroName");
  el.macroData.placeholder = "LED ON / 01 A7 FF";
  el.btnLang.title = lang === "ja" ? "Switch to English" : "日本語に切り替える";
  renderStatus();
  renderMacros();
}

// ---------- terminal rendering ----------
const RENDER_CAP = 1500;
let dirty = false;
let renderedKey = "";
let renderedCount = 0;
let rafId = 0;

function lineNodes(): { key: string; lines: { ts: number; dir: Dir; text: string }[] } {
  const filter = el.filter.value.trim();
  const key = `${el.view.value}|${filter}`;
  const lines = el.view.value === "hexdump" ? log.renderHexdump(filter) : log.renderText(filter);
  return { key, lines };
}

function scheduleRender(): void {
  dirty = true;
  if (!rafId) rafId = requestAnimationFrame(render);
}

function render(): void {
  rafId = 0;
  if (!dirty) return;
  dirty = false;
  const { key, lines } = lineNodes();
  if (key !== renderedKey) {
    el.terminal.replaceChildren(...buildLines(lines, 0));
    renderedKey = key;
  } else if (lines.length > renderedCount) {
    el.terminal.append(...buildLines(lines, renderedCount));
    trimDom();
  }
  renderedCount = lines.length;
  if (el.autoscroll.checked) el.terminal.scrollTop = el.terminal.scrollHeight;
}

function buildLines(lines: { ts: number; dir: Dir; text: string }[], from: number): Node[] {
  const frag: Node[] = [];
  for (let i = from; i < lines.length; i++) {
    const ln = lines[i]!;
    const div = document.createElement("div");
    div.className = `line dir-${ln.dir}`;
    if (el.ts.checked) {
      const ts = document.createElement("span");
      ts.className = "ts";
      ts.textContent = formatTs(ln.ts);
      div.append(ts);
    }
    const text = document.createElement("span");
    text.className = "text";
    text.textContent = ln.text;
    div.append(text);
    frag.push(div);
  }
  return frag;
}

/** Keep the DOM light: drop leading nodes beyond the cap. */
function trimDom(): void {
  while (el.terminal.childElementCount > RENDER_CAP) {
    el.terminal.firstElementChild?.remove();
  }
}

// ---------- log feeds ----------
function appendChunk(dir: Dir, bytes: Uint8Array): void {
  log.append({ ts: Date.now(), dir, bytes });
  scheduleRender();
}

function appendInfo(key: string): void {
  log.append({ ts: Date.now(), dir: "info", bytes: new Uint8Array(0), text: t(lang, key) });
  scheduleRender();
}

// ---------- connection ----------
async function openLink(target: Link, baud: number): Promise<void> {
  await target.open(baud, (bytes) => {
    rxTotal += bytes.length;
    rxWindow += bytes.length;
    appendChunk("rx", bytes);
  });
  link = target;
  simActive = target instanceof SimLink;
  currentPort = target instanceof SerialLink ? target.port : null;
  openSince = Date.now();
  setConnectedUi(true);
  appendInfo(simActive ? "simInfo" : "openedInfo");
  signalsTimer = setInterval(() => void pollSignals(), 500);
  void pollSignals();
}

async function pollSignals(): Promise<void> {
  if (!link) return;
  try {
    const s = await link.getSignals();
    el.stSignals.textContent = `CTS ${s.cts ? "✓" : "–"} · DSR ${s.dsr ? "✓" : "–"} · CD ${s.dcd ? "✓" : "–"}`;
  } catch {
    el.stSignals.textContent = "CTS – · DSR – · CD –";
  }
}

async function closeLink(infoKey = "closedInfo"): Promise<void> {
  const current = link;
  link = null;
  currentPort = null;
  simActive = false;
  openSince = null;
  if (signalsTimer) clearInterval(signalsTimer);
  signalsTimer = null;
  if (current) await current.close();
  setConnectedUi(false);
  appendInfo(infoKey);
  void refreshReconnect();
}

function setConnectedUi(on: boolean): void {
  el.btnDisconnect.classList.toggle("hidden", !on);
  el.btnConnect.disabled = on;
  el.btnSim.disabled = on;
  el.btnReconnect.classList.toggle("hidden", on || el.btnReconnect.dataset.label === "");
  el.stDot.classList.toggle("on", on);
  renderStatus();
}

function renderStatus(): void {
  el.stState.textContent = link
    ? t(lang, simActive ? "stateSim" : "stateOpen")
    : t(lang, "stateClosed");
  el.stPort.textContent = link ? `${link.describe()} @ ${el.baud.value}` : "—";
  el.stSignals.textContent = link ? el.stSignals.textContent : "CTS – · DSR – · CD –";
}

// ---------- TX ----------
function lineEnding(): string {
  const raw = el.ending.value;
  return raw === "\\r\\n" ? "\r\n" : raw === "\\n" ? "\n" : raw === "\\r" ? "\r" : "";
}

async function sendTx(): Promise<void> {
  const input = el.txInput.value;
  if (!input || !link) return;
  const bytes = el.hexTx.checked ? parseHex(input) : encoder.encode(input + lineEnding());
  if (!bytes) {
    showInfo(lang === "ja" ? "Hex形式が正しくありません(例: 01 A7 FF)" : "Invalid hex (try: 01 A7 FF)");
    return;
  }
  try {
    await link.write(bytes);
    txTotal += bytes.length;
    txWindow += bytes.length;
    appendChunk("tx", bytes);
    el.txInput.value = "";
  } catch (e) {
    showInfo(`${e instanceof Error ? e.message : String(e)}`);
  }
}

async function sendMacro(m: Macro): Promise<void> {
  if (!link) return;
  const bytes = m.hex ? parseHex(m.data) : encoder.encode(m.data + lineEnding());
  if (!bytes) return;
  try {
    await link.write(bytes);
    txTotal += bytes.length;
    txWindow += bytes.length;
    appendChunk("tx", bytes);
  } catch (e) {
    showInfo(`${e instanceof Error ? e.message : String(e)}`);
  }
}

// ---------- macros ----------
function renderMacros(): void {
  el.macroList.replaceChildren();
  for (const m of macros) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "macro-btn";
    btn.textContent = m.name;
    btn.title = `${m.data}${m.hex ? " (hex)" : ""} — ${t(lang, "sendHint")}`;
    btn.addEventListener("click", () => void sendMacro(m));
    btn.addEventListener("dblclick", () => openMacroDialog(m));
    el.macroList.append(btn);
  }
}

function openMacroDialog(macro: Macro | null): void {
  editingMacro = macro;
  el.macroName.value = macro?.name ?? "";
  el.macroData.value = macro?.data ?? "";
  el.macroHex.checked = macro?.hex ?? false;
  el.macroDelete.classList.toggle("hidden", !macro);
  el.dialog.showModal();
}

function saveMacroFromDialog(): void {
  const name = el.macroName.value.trim();
  const data = el.macroData.value;
  if (!name || !data) return;
  if (editingMacro) {
    editingMacro.name = name;
    editingMacro.data = data;
    editingMacro.hex = el.macroHex.checked;
  } else {
    macros.push({ id: crypto.randomUUID(), name, data, hex: el.macroHex.checked });
  }
  saveMacros(macros);
  renderMacros();
}

// ---------- export ----------
function exportLog(kind: string): void {
  if (log.size === 0) {
    showInfo(t(lang, "nothingToExport"));
    return;
  }
  const map: Record<string, () => string> = {
    txt: () => log.exportTxt(),
    csv: () => log.exportCsv(),
    json: () => log.exportJson(),
  };
  const content = map[kind]?.();
  if (!content) return;
  const blob = new Blob([content], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `serial-log-${new Date().toISOString().slice(0, 19).replaceAll(":", "")}.${kind}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- transient info banner ----------
let infoTimer: ReturnType<typeof setTimeout> | null = null;
function showInfo(message: string): void {
  el.info.textContent = message;
  el.info.classList.remove("hidden");
  if (infoTimer) clearTimeout(infoTimer);
  infoTimer = setTimeout(() => el.info.classList.add("hidden"), 3000);
}

// ---------- counters ----------
function tickCounters(): void {
  el.rates.textContent = `⬇ ${humanBytes(rxWindow)}/s ⬆ ${humanBytes(txWindow)}/s`;
  rxWindow = 0;
  txWindow = 0;
  el.stCounters.textContent = `⬇ ${humanBytes(rxTotal)} ⬆ ${humanBytes(txTotal)}`;
  if (openSince) {
    const sec = Math.floor((Date.now() - openSince) / 1000);
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    el.stTime.textContent = `${mm}:${ss}`;
  } else {
    el.stTime.textContent = "00:00";
  }
}

// ---------- wiring ----------
function wire(): void {
  el.btnConnect.addEventListener("click", async () => {
    if (!serialSupported()) return;
    try {
      const port = await pickPort();
      await openLink(new SerialLink(port), Number(el.baud.value));
    } catch (e) {
      if (e instanceof Error && e.name !== "NotFoundError") showInfo(e.message);
    }
  });

  el.btnSim.addEventListener("click", () => void openLink(new SimLink(), Number(el.baud.value)));

  el.btnDisconnect.addEventListener("click", () => void closeLink());

  el.btnReconnect.addEventListener("click", async () => {
    if (!serialSupported()) return;
    const [port] = await grantedPorts();
    if (port) await openLink(new SerialLink(port), Number(el.baud.value));
  });

  el.btnLang.addEventListener("click", () => {
    lang = lang === "en" ? "ja" : "en";
    localStorage.setItem("wsc.lang", lang);
    applyI18n();
  });

  el.btnTheme.addEventListener("click", () => cycleTheme(nextTheme()));

  el.btnSend.addEventListener("click", () => void sendTx());
  el.txInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void sendTx();
    }
  });
  el.txInput.title = t(lang, "sendHint");

  el.view.addEventListener("change", scheduleRender);
  el.ts.addEventListener("change", scheduleRender);
  el.filter.addEventListener("input", scheduleRender);
  el.btnClear.addEventListener("click", () => {
    log.clear();
    el.terminal.replaceChildren();
    renderedKey = "";
    renderedCount = 0;
  });
  el.exportSel.addEventListener("change", () => {
    if (el.exportSel.value) {
      exportLog(el.exportSel.value);
      el.exportSel.value = "";
    }
  });

  el.btnAddMacro.addEventListener("click", () => openMacroDialog(null));
  el.macroDelete.addEventListener("click", () => {
    if (editingMacro) {
      macros = macros.filter((m) => m.id !== editingMacro!.id);
      saveMacros(macros);
      renderMacros();
    }
    el.dialog.close();
  });
  el.dialog.addEventListener("close", () => {
    if (el.dialog.returnValue === "ok") saveMacroFromDialog();
  });

  if (serialSupported()) {
    navigator.serial.addEventListener("disconnect", (e) => {
      if (currentPort && e.target === currentPort) void closeLink();
    });
    void refreshReconnect();
  } else {
    el.banner.classList.remove("hidden");
  }

  window.addEventListener("beforeunload", () => void link?.close());
  setInterval(tickCounters, 1000);
}

async function refreshReconnect(): Promise<void> {
  const ports = await grantedPorts();
  const label = ports.length > 0 ? describePort(ports[0]!) : "";
  el.btnReconnect.dataset.label = label;
  el.btnReconnect.textContent = `${t(lang, "reconnect")}${label ? ` (${label})` : ""}`;
  el.btnReconnect.classList.toggle("hidden", !!link || !label);
}

// theme button handler comes from initTheme (closure over the cycle order)
let nextTheme: () => import("./ui/theme").ThemeChoice = () => "auto";

function main(): void {
  nextTheme = initTheme(() => undefined);
  wire();
  applyI18n();
  tickCounters();
  log.append({
    ts: Date.now(),
    dir: "info",
    bytes: new Uint8Array(0),
    text: "Web Serial Console ready — " + (serialSupported() ? "connect a device or start the simulator." : "Web Serial unavailable in this browser; start the simulator."),
  });
  scheduleRender();
}

main();
