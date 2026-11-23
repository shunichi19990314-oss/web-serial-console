/** EN / JA interface strings. Keys mirror data-i18n attributes in index.html. */

export type Lang = "en" | "ja";

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    baud: "Baud",
    connect: "🔌 Connect device",
    reconnect: "↻ Reconnect",
    simulator: "▶ Simulator",
    disconnect: "⏹ Disconnect",
    view: "View",
    viewText: "Text",
    viewHex: "Hex dump",
    timestamps: "Timestamps",
    autoscroll: "Auto-scroll",
    filterPh: "Filter lines…",
    clear: "Clear",
    export: "⬇ Export",
    addMacro: "＋ Macro",
    txPh: "Type a line to send…",
    hexMode: "Hex",
    send: "Send",
    stateClosed: "Closed",
    stateOpen: "Connected",
    stateSim: "Simulator running",
    macroTitle: "Macro",
    macroName: "Name",
    macroData: "Data",
    delete: "Delete",
    cancel: "Cancel",
    save: "Save",
    supportBanner:
      "⚠️ This browser does not support the Web Serial API. Use Chrome/Edge 117+ (desktop) or Chrome 138+ (Android) to talk to real hardware — the simulator still works everywhere.",
    openedInfo: "— connected",
    closedInfo: "— disconnected",
    simInfo: "— simulator started (virtual device)",
    sendHint: "Enter text, or hex like “01 A7 FF” with Hex checked",
    nothingToExport: "Nothing to export yet",
  },
  ja: {
    baud: "ボーレート",
    connect: "🔌 接続",
    reconnect: "↻ 再接続",
    simulator: "▶ シミュレーター",
    disconnect: "⏹ 切断",
    view: "表示",
    viewText: "テキスト",
    viewHex: "Hexダンプ",
    timestamps: "タイムスタンプ",
    autoscroll: "自動スクロール",
    filterPh: "行をフィルタ…",
    clear: "クリア",
    export: "⬇ エクスポート",
    addMacro: "＋ マクロ",
    txPh: "送信する行を入力…",
    hexMode: "Hex",
    send: "送信",
    stateClosed: "未接続",
    stateOpen: "接続中",
    stateSim: "シミュレーター稼働中",
    macroTitle: "マクロ",
    macroName: "名前",
    macroData: "データ",
    delete: "削除",
    cancel: "キャンセル",
    save: "保存",
    supportBanner:
      "⚠️ このブラウザは Web Serial API 非対応です。実機との通信には Chrome/Edge 117+(デスクトップ)または Chrome 138+(Android)をご利用ください。シミュレーターはどのブラウザでも動きます。",
    openedInfo: "— 接続しました",
    closedInfo: "— 切断しました",
    simInfo: "— シミュレーターを開始(仮想デバイス)",
    sendHint: "テキスト、またはHexチェック時に「01 A7 FF」形式",
    nothingToExport: "エクスポートするログがありません",
  },
};

export function detectLang(): Lang {
  const saved = localStorage.getItem("wsc.lang");
  if (saved === "en" || saved === "ja") return saved;
  return navigator.language?.toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function t(lang: Lang, key: string): string {
  return STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
}
