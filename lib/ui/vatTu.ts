import type { IotxCapability, IotxMucVatTu } from "@/lib/iotx/contracts";
import type { Device } from "@/lib/types";
import { rong } from "@/lib/iotx/giaTri";

/** Đọc mục vật tư (`capability.kind === "list"`) — hình dạng do máy chủ gộp mạch + máy chủ. */

/** Hợp đồng để mở cho từng mục nên đọc phòng thủ, không đòi đúng một tên trường. */
export function danhSachMuc(device: Device, cap: IotxCapability): IotxMucVatTu[] {
  const giaTri = device.lastValues?.[cap.key];
  return Array.isArray(giaTri) ? giaTri as IotxMucVatTu[] : [];
}

export function tenMuc(muc: IotxMucVatTu) {
  return String(muc.ten || muc.name || muc.sanPham || muc.serial || muc.id || "—");
}

/** Đọc một số từ mục vật tư theo nhiều tên trường có thể gặp; không có thì trả undefined. */
export function docSo(muc: IotxMucVatTu, ungVien: string[]): number | undefined {
  const ban = muc as Record<string, unknown>;
  for (const ten of ungVien) {
    const giaTri = ban[ten];
    if (rong(giaTri)) continue;
    const so = typeof giaTri === "number" ? giaTri : Number(giaTri);
    if (Number.isFinite(so)) return so;
  }
  return undefined;
}

/** Phần trăm còn lại: máy chủ có thể trả sẵn `phanTram`, hoặc `conLai`/`tuoiTho` để tự tính. */
export function phanTramConLai(muc: IotxMucVatTu): number | null {
  const pct = docSo(muc, ["phanTram", "percent", "remainPercent"]);
  if (pct !== undefined) return Math.round(pct);
  const conLai = docSo(muc, ["conLai", "ngayConLai", "daysLeft", "remainDays"]);
  const tuoiTho = docSo(muc, ["tuoiTho", "life", "lifeDays"]);
  if (conLai !== undefined && tuoiTho !== undefined && tuoiTho > 0) {
    return Math.round((conLai / tuoiTho) * 100);
  }
  return null;
}
