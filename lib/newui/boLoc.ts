import type { Device } from "@/lib/types";
import { nhomCuaThietBi } from "./uiType";

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
