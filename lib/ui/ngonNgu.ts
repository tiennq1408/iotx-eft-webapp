/**
 * Tên và cờ của một mã ngôn ngữ — dùng chung cho màn đăng nhập và menu. Danh sách mã luôn
 * lấy từ `langs` máy chủ trả, không viết cứng ở đây.
 */
import { IMG } from "@/lib/ui/assets";

/** Tên ngôn ngữ viết bằng chính ngôn ngữ đó ("Tiếng Việt", "ไทย"); không có thì để mã. */
export function tenNgonNgu(ma: string): string {
  try {
    const ten = new Intl.DisplayNames([ma], { type: "language" }).of(ma);
    return ten && ten !== ma ? ten : ma.toUpperCase();
  } catch { return ma.toUpperCase(); }
}

/**
 * Cờ đứng trước tên ngôn ngữ. Suy vùng từ chính mã ngôn ngữ (`vi`→VN, `th`→TH, `fil`→PH,
 * `en`→US) rồi đổi sang emoji cờ — không viết cứng danh sách, máy chủ thêm ngôn ngữ là có cờ.
 * <option> không chứa được ảnh nên dùng emoji; không suy được vùng thì dùng 🌐.
 */
export function coNgonNgu(ma: string): string {
  try {
    const vung = new Intl.Locale(ma).maximize().region;
    if (vung && /^[A-Z]{2}$/.test(vung)) return [...vung].map(c => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("");
  } catch { /* mã lạ */ }
  return "🌐";
}

/**
 * Ảnh cờ cho một mã ngôn ngữ.
 *
 * Không dùng emoji cờ: Windows cố ý không có glyph cờ quốc gia nào (Segoe UI Emoji bỏ hẳn bộ
 * này), nên emoji cờ hiện ra thành hai chữ cái "VN", "US". Ảnh PNG thì máy nào cũng như nhau.
 *
 * Chỉ có ba lá cờ trong repo. Máy chủ thêm ngôn ngữ mới mà chưa có ảnh thì trả null, nơi gọi
 * vẽ icon quả cầu thay thế — KHÔNG rơi về emoji.
 */
const CO_ANH: Record<string, string> = { vi: IMG.flagVi, en: IMG.flagEn, fil: IMG.flagFil };

export function anhCoNgonNgu(ma: string): string | null {
  return CO_ANH[ma] ?? CO_ANH[ma.split("-")[0]] ?? null;
}

/** Danh sách để dựng ô chọn: ngôn ngữ đang dùng mà máy chủ không liệt kê vẫn phải có mặt. */
export function dsNgonNgu(lang: string | undefined, langs: string[]): string[] {
  return lang && !langs.includes(lang) ? [lang, ...langs] : langs;
}

/** Mật khẩu tối thiểu theo chính sách sadmin (08/10/2026) — dùng ở đăng ký và đổi mật khẩu. */
export const MAT_KHAU_TOI_THIEU = 8;
