/**
 * Tên và cờ của một mã ngôn ngữ — dùng chung cho màn đăng nhập và menu. Danh sách mã luôn
 * lấy từ `langs` máy chủ trả, không viết cứng ở đây.
 */

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

/** Danh sách để dựng ô chọn: ngôn ngữ đang dùng mà máy chủ không liệt kê vẫn phải có mặt. */
export function dsNgonNgu(lang: string | undefined, langs: string[]): string[] {
  return lang && !langs.includes(lang) ? [lang, ...langs] : langs;
}

/** Mật khẩu tối thiểu theo chính sách sadmin (08/10/2026) — dùng ở đăng ký và đổi mật khẩu. */
export const MAT_KHAU_TOI_THIEU = 8;
