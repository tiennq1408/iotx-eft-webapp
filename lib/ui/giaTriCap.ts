import type { IotxCapability } from "@/lib/iotx/contracts";
import { coSo, doSo } from "@/lib/iotx/giaTri";

/**
 * Thông số số học của một capability, dùng chung cho mọi bộ vẽ (khuôn chi tiết, lưới
 * `ui.boCuc`, thẻ ngoài danh sách). Trước đây mỗi nơi tự suy một kiểu và đã lệch nhau:
 * một bên nhận cả bước âm từ catalog.
 */

/** Đơn vị kèm khoảng trắng đứng trước nếu catalog khai `unitSpace`. */
export function donVi(cap: IotxCapability): string {
  return cap.unit ? `${cap.unitSpace ? " " : ""}${cap.unit}` : "";
}

/** Khoảng và bước của capability kiểu `level`; bước không hợp lệ (≤ 0) thì lấy 1. */
export function thongSoMuc(cap: IotxCapability) {
  const min = Number(cap.min ?? 0);
  const max = Number(cap.max ?? 100);
  const step = Number(cap.step);
  const buoc = step > 0 ? step : 1;
  return { min, max, buoc, kep: (x: number) => Math.min(max, Math.max(min, x)) };
}

/** "18.3°C", hoặc "—" khi máy chưa báo số. */
export function chuSoCap(cap: IotxCapability, v: unknown): string {
  return coSo(v) ? `${doSo(v, 0)}${donVi(cap)}` : "—";
}
