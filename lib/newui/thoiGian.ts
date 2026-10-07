const DINH_DANG_LUC = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

/** "22:00 07/10" — một kiểu hiển thị mốc thời gian cho hẹn giờ, luật, thông báo. */
export function dinhDangLuc(luc: number | string | Date): string {
  return DINH_DANG_LUC.format(luc instanceof Date ? luc : new Date(luc));
}
