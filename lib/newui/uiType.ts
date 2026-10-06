import type { Device } from "@/lib/types";
import { khuonCua } from "./khuon";

/**
 * Còn đúng một việc: quyết định thiết bị thuộc nhóm nào trên trang chủ.
 *
 * Trước đây tệp này giữ một bảng từ khóa dài để đoán "loại giao diện", rồi cả chín màn điều
 * khiển tra capability qua một bảng tên khóa cắm cứng. Toàn bộ phần đó đã chuyển sang
 * `lib/newui/khuon.ts`, nơi màn dựng theo `ui.archetype`/`ui.slots` của catalog.
 */

/** Nhóm dự phòng khi catalog không khai gì — suy từ renderer, chỉ để không bỏ trống. */
const NHOM_THEO_RENDERER: Array<[RegExp, string]> = [
  [/aircon|dieu_hoa|may_lanh|fan|quat/, "nhom_lam_mat"],
  [/cooktop|hob|induction|bep|hood|hut_mui|rice|noi_com/, "nhom_bep"],
  [/water|nuoc|purifier|heater|nong_lanh/, "nhom_nuoc"],
];

/**
 * Nhóm hiển thị trên trang chủ. Máy chủ là nguồn sự thật: `product.category` trước, rồi
 * `grp` của chính thiết bị, cuối cùng mới suy từ renderer.
 */
export function nhomCuaThietBi(device: Pick<Device, "model" | "name" | "product" | "group">): string {
  const khai = device.product?.category?.trim();
  if (khai) return khai;
  if (device.group?.trim()) return device.group.trim();
  const renderer = khuonCua(device.product) ?? "";
  for (const [mau, nhom] of NHOM_THEO_RENDERER) {
    if (mau.test(renderer)) return nhom;
  }
  return "nhom_khac";
}
