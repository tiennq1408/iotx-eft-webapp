/**
 * Đọc giá trị thô từ máy chủ.
 *
 * Đo trên DEV: `lastValues` trả về CHUỖI cho mọi thứ — `"true"`, `"false"`, `"12"`,
 * `"18.3"`. So bằng `=== true` hay cộng thẳng vào số đều sai, và đã từng sai thật: công
 * tắc phụ trên thẻ không bao giờ sáng vì `"true" !== true`.
 *
 * Trước đây mỗi nơi tự viết một bản ép kiểu — ba bản trong ba tệp, lệch nhau ở chỗ có
 * `trim()` hay không. Đây là bản duy nhất.
 */

export function laBat(v: unknown): boolean {
  if (typeof v === "string") return ["true", "1", "on"].includes(v.trim().toLowerCase());
  if (typeof v === "number") return v === 1;
  return v === true;
}

/** Số, chấp nhận cả dấu phẩy thập phân. Không đọc được thì trả `macDinh`. */
export function doSo(v: unknown, macDinh: number): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : macDinh;
}

/** Có đọc được thành số không — rỗng và `null` là "chưa biết", không phải 0. */
export function coSo(v: unknown): boolean {
  return v !== undefined && v !== null && v !== "" && Number.isFinite(doSo(v, NaN));
}
