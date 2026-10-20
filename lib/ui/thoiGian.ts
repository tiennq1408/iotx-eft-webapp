const DINH_DANG_LUC = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

/** "22:00 07/10" — một kiểu hiển thị mốc thời gian cho hẹn giờ, luật, thông báo. */
export function dinhDangLuc(luc: number | string | Date): string {
  const ngay = luc instanceof Date ? luc : new Date(luc);
  // `format` ném RangeError với ngày hỏng — một thông báo thiếu `created_at` không được làm
  // hỏng cả lần đồng bộ.
  return Number.isNaN(ngay.getTime()) ? "—" : DINH_DANG_LUC.format(ngay);
}

const DINH_DANG_NGAY = new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "numeric", year: "numeric" });

/** Mốc epoch ms (hay chuỗi ISO có giờ) → "5/9/2026". Hỏng hoặc thiếu → "—". */
export function dinhDangNgay(luc?: number | string | Date | null): string {
  if (luc === null || luc === undefined) return "—";
  const d = luc instanceof Date ? luc : new Date(luc);
  return Number.isNaN(d.getTime()) ? "—" : DINH_DANG_NGAY.format(d);
}

/**
 * "2025-07-11" → "11/7/2025". KHÔNG đi qua `Date`: chuỗi đã theo giờ Việt Nam, mà `new Date`
 * hiểu nó là nửa đêm UTC — máy ở múi giờ âm sẽ hiện lệch về hôm trước. Chuỗi không đúng dạng thì
 * trả nguyên văn (đừng giấu dữ liệu lạ), rỗng thì "—".
 */
export function ngayISO(s?: string | null): string {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : s;
}
