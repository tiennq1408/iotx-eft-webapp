import { iotxConfig } from "./config";

export type BoChu = { lang: string; langs: string[]; strings: Record<string, string> };

export const boChuRong: BoChu = { lang: iotxConfig.lang, langs: [], strings: {} };


const KEY_NGON_NGU = "livotec-lang";

export function docNgonNguDaChon() {
  if (typeof window === "undefined") return iotxConfig.lang;
  try { return localStorage.getItem(KEY_NGON_NGU) || iotxConfig.lang; }
  catch { return iotxConfig.lang; }
}

export function ghiNgonNguDaChon(lang: string) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY_NGON_NGU, lang); } catch { /* trình duyệt chặn: bỏ qua */ }
}
