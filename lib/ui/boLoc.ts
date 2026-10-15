import type { Device } from "@/lib/types";
import { khuonCua } from "./khuon";

/** Giá trị "không lọc" của mỗi bộ lọc. */
export const TAT_CA = "all";

export type LoaiLoc = "nha" | "phong" | "nhom";
export type BoLoc = Record<LoaiLoc, string>;

export const BO_LOC_DAU: BoLoc = { nha: TAT_CA, phong: TAT_CA, nhom: TAT_CA };

/**
 * Ba bộ lọc cộng dồn. Nhóm lấy từ `product.category` của catalog chứ không suy ra từ loại
 * giao diện, nên hãng đổi cách xếp nhóm là danh sách đổi theo mà không phải sửa mã.
 */
export function locThietBi(devices: Device[], boLoc: BoLoc): Device[] {
  return devices.filter(device =>
    (boLoc.nha === TAT_CA || device.house === boLoc.nha) &&
    (boLoc.phong === TAT_CA || device.room === boLoc.phong) &&
    (boLoc.nhom === TAT_CA || nhomCuaThietBi(device) === boLoc.nhom));
}

/** Danh sách nhóm dựng từ chính thiết bị đang có, hợp với danh sách khai trong spaces. */
export function cacNhomCua(devices: Device[], nhomKhai: string[] = []): string[] {
  const bo = new Set<string>(nhomKhai);
  devices.forEach(device => bo.add(nhomCuaThietBi(device)));
  return [...bo].filter(Boolean).sort((a, b) => a.localeCompare(b, "vi"));
}

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
export function nhomCuaThietBi(device: Pick<Device, "product" | "group">): string {
  const khai = device.product?.category?.trim();
  if (khai) return khai;
  if (device.group?.trim()) return device.group.trim();
  const renderer = khuonCua(device.product) ?? "";
  for (const [mau, nhom] of NHOM_THEO_RENDERER) {
    if (mau.test(renderer)) return nhom;
  }
  return "nhom_khac";
}
