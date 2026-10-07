import type { IotxCapability, IotxProduct } from "@/lib/iotx/contracts";

/**
 * Bố cục lưới kiểu bảng tính (`product.ui.boCuc`) — bản dựng lại từ bộ vẽ của
 * `web.dev.happibot.net`, trích ngày 06/10/2026.
 *
 * Catalog đặt từng capability vào một ô `col/row/w/h` trên lưới 4 cột, kèm kiểu vẽ, căn
 * lề và icon theo giá trị. Đây là hợp đồng THỨ HAI: sản phẩm nào có `boCuc` thì nó quyết
 * toàn bộ màn, sản phẩm nào chưa có vẫn đi đường `slots`/`uuTien` cũ (xem `khuon.ts`).
 *
 * Mọi hằng số dưới đây lấy đúng số của bản tham chiếu, không tự đặt lại.
 */

/** Chiều cao một hàng; catalog chỉ được chọn một trong ba. */
const CAO_HANG = [56, 64, 72];
export const CAO_HANG_MAC = 64;

/** Số cột cố định của lưới. */
export const SO_COT = 4;

/** Kiểu vẽ hợp lệ theo `kind` — khai sai thì rơi về mặc định của kind. */
const VARIANT_THEO_KIND: Record<string, string[]> = {
  onoff: ["switch01", "power01"],
  level: ["slider01", "dial01", "step01"],
  enum: ["chips01"],
  sensor: ["readout01", "gauge01", "state01", "alarm01"],
  list: ["filterlist01"],
};

/** Control tự giãn hết chiều ngang ô: thân xếp DỌC, nhãn nằm trên. */
const DAY_NGANG = ["switch01", "slider01", "step01", "chips01", "filterlist01"];

/** Control tự in nhãn của mình, nên ô không in thêm lần nữa. */
const TU_CO_NHAN = ["switch01", "step01", "power01"];

export const CAN_NGANG: Record<string, string> = { trai: "flex-start", giua: "center", phai: "flex-end" };
export const CAN_DOC: Record<string, string> = { tren: "flex-start", giua: "center", duoi: "flex-end" };
export const CAN_CHU: Record<string, string> = { trai: "left", giua: "center", phai: "right" };

export type OBoCuc = {
  key: string;
  col: number; row: number; w: number; h: number;
  variant?: string;
  canN?: string; canD?: string;
  moiHang?: number;
  coNut?: string; rongNut?: string;
  nhan?: { can?: string; co?: string; dam?: boolean; nghieng?: boolean };
  gtIco?: Record<string, string>;
  nenAnh?: string;
};

export type BoCuc = {
  cot?: number;
  caoHang?: number;
  donHang?: boolean;
  skin?: string;
  nenAnh?: string;
  alarm?: { key?: string };
  o?: OBoCuc[];
};

export function boCucCua(product?: IotxProduct | null): BoCuc | null {
  const bc = (product?.ui as { boCuc?: BoCuc } | null | undefined)?.boCuc;
  return bc && Array.isArray(bc.o) ? bc : null;
}

/** Kiểu vẽ của một ô: tôn trọng khai báo nếu hợp lệ, không thì mặc định theo `kind`. */
export function variantO(cap: IotxCapability, khai?: string): string {
  const choPhep = VARIANT_THEO_KIND[cap.kind] ?? [];
  if (khai && choPhep.includes(khai)) return khai;
  if (cap.kind === "onoff") return cap.key === "power" ? "power01" : "switch01";
  if (cap.kind === "level") return "slider01";
  if (cap.kind === "enum") return "chips01";
  if (cap.kind === "sensor") return cap.values?.length ? "state01" : "readout01";
  return choPhep[0] ?? "";
}

export const dayNgang = (variant: string) => DAY_NGANG.includes(variant);
export const tuCoNhan = (variant: string) => TU_CO_NHAN.includes(variant);

/**
 * Số cột chip khi catalog không khai `moiHang`: chia sao cho số hàng ít nhất mà mỗi hàng
 * không quá 4 (ô rộng 4), 3 (rộng 3) hay 2 (hẹp hơn).
 */
export function cotChipTuDong(soGiaTri: number, rongO: number): number {
  const toiDa = rongO >= 4 ? 4 : rongO >= 3 ? 3 : 2;
  const soHang = Math.max(1, Math.ceil(soGiaTri / toiDa));
  return Math.max(1, Math.ceil(soGiaTri / soHang));
}

/**
 * Vị trí cột của một chip trong lưới `2 × số cột`.
 *
 * Nhân đôi số cột để hàng cuối thiếu chip vẫn căn giữa được: hàng đầy thì mỗi chip
 * `span 2`, hàng cuối lệch đi nửa ô cho cân.
 */
export function cotChip(soGiaTri: number, soCot: number, i: number): string {
  const cot = Math.max(1, soCot | 0);
  const du = soGiaTri % cot;
  const hetHangDay = soGiaTri - du;
  if (du === 0 || i < hetHangDay) return "span 2";
  return `${cot - du + 2 * (i - hetHangDay) + 1} / span 2`;
}

/**
 * Hàng nào có ô thì được một dòng trên lưới, hàng trống bị dồn mất.
 *
 * Trả về bảng đổi "số hàng catalog khai" → "số hàng thật trên màn". Catalog đánh số thưa
 * (hàng 1, 4, 6, 13…) để dành chỗ sửa về sau; app mà vẽ đúng số đó thì màn đầy khoảng
 * trống. Đặt `donHang: false` thì giữ nguyên mọi hàng.
 */
export function hangHienThi(o: OBoCuc[], donHang = true): { map: Record<number, number>; soHang: number } {
  const coO = new Set<number>();
  let cuoi = 0;
  for (const muc of o) {
    for (let h = muc.row; h < muc.row + muc.h; h++) coO.add(h);
    cuoi = Math.max(cuoi, muc.row + muc.h - 1);
  }
  const map: Record<number, number> = {};
  let n = 0;
  for (let h = 1; h <= cuoi; h++) {
    if (coO.has(h) || donHang === false) map[h] = ++n;
  }
  return { map, soHang: n };
}

export type OdaDung = OBoCuc & { cap: IotxCapability; variant: string };

/** Lọc bỏ ô trỏ tới capability không có trong sản phẩm, và chốt kiểu vẽ cho từng ô. */
export function phanGiaiBoCuc(bc: BoCuc, caps: IotxCapability[]) {
  const theoKhoa = new Map(caps.map(c => [c.key, c]));
  const o: OdaDung[] = [];
  for (const muc of bc.o ?? []) {
    const cap = theoKhoa.get(muc.key);
    if (!cap) continue;
    o.push({ ...muc, cap, variant: variantO(cap, muc.variant) });
  }
  const caoHang = CAO_HANG.includes(Number(bc.caoHang)) ? Number(bc.caoHang) : CAO_HANG_MAC;
  const { map, soHang } = hangHienThi(o, bc.donHang !== false);
  const capBao = bc.alarm?.key ? theoKhoa.get(bc.alarm.key) ?? null : null;
  return { o, map, soHang, caoHang, soCot: Number(bc.cot) || SO_COT, skin: bc.skin ?? null, capBao, nenAnh: bc.nenAnh ?? null };
}

/**
 * Mã lỗi từ một giá trị thô: mảng, chuỗi ngăn cách, hay một giá trị đơn. "0"/"false"/rỗng
 * nghĩa là KHÔNG có lỗi — hợp đồng nói rõ, đừng hiện chúng thành một dòng lỗi tên "0".
 */
export function maLoi(giaTri: unknown): string[] {
  if (giaTri === null || giaTri === undefined || giaTri === false) return [];
  const nguon = Array.isArray(giaTri) ? giaTri : typeof giaTri === "string" ? giaTri.split(/[,;|\s]+/) : [giaTri];
  const ra: string[] = [];
  for (const x of nguon) {
    const s = String(x ?? "").trim();
    if (s === "" || s === "0" || s === "false" || ra.includes(s)) continue;
    ra.push(s);
  }
  return ra;
}

/** Mã lỗi ghép với tên lỗi nếu catalog có bảng `labels`; mã lạ giữ nguyên mã. */
export function danhSachLoi(cap: IotxCapability, giaTri: unknown): Array<{ ma: string; chu: string }> {
  const choPhep = (cap.values ?? []).map(v => String(v ?? "").trim()).filter(Boolean);
  const ten = cap.labels ?? {};
  return maLoi(giaTri)
    .filter(ma => !choPhep.length || choPhep.includes(ma))
    .map(ma => ({ ma, chu: ten[ma] || ma }));
}
