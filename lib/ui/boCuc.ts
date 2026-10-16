import type { IotxCapability, IotxProduct } from "@/lib/iotx/contracts";
import { VARIANT_THEO_KIND, capNguonTrong } from "./khuon";

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

const CAO_HANG_MAC = 64;
/** Khoảng chiều cao hàng chấp nhận được. KHÔNG chốt vào vài giá trị cố định: sadmin đang
 *  gửi 48 cho ô vòng xoay của Smart Fan 314, và sẽ còn gửi số khác. Chỉ chặn số rác. */
const CAO_HANG_MIN = 24, CAO_HANG_MAX = 240;
const soCaoHang = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= CAO_HANG_MIN && n <= CAO_HANG_MAX ? Math.round(n) : null;
};

/** Số cột cố định của lưới. */
const SO_COT = 4;

/** Control tự giãn hết chiều ngang ô: thân xếp DỌC, nhãn nằm trên. */
const DAY_NGANG = ["switch01", "slider01", "step01", "chips01", "filterlist01"];

/** Control tự in nhãn của mình, nên ô không in thêm lần nữa. */
const TU_CO_NHAN = ["switch01", "step01", "power01"];

export const CAN_NGANG: Record<string, string> = { trai: "flex-start", giua: "center", phai: "flex-end" };
export const CAN_DOC: Record<string, string> = { tren: "flex-start", giua: "center", duoi: "flex-end" };
export const CAN_CHU: Record<string, string> = { trai: "left", giua: "center", phai: "right" };
/** `o.rongNut`: bề rộng tối thiểu của chip (px), đúng bảng của bản tham chiếu. */
export const RONG_NUT: Record<string, number> = { nho: 64, vua: 80, lon: 96 };

export type OBoCuc = {
  key: string;
  col: number; row: number; w: number; h: number;
  variant?: string;
  canN?: string; canD?: string;
  moiHang?: number;
  coNut?: string; rongNut?: string;
  /** `mau`: `"skin"` (màu nhấn) hoặc mã hex. */
  nhan?: { can?: string; co?: string; dam?: boolean; nghieng?: boolean; mau?: string };
  gtIco?: Record<string, string>;
  /** Icon CỐ ĐỊNH của ô (`@eco`…), khác `gtIco` theo từng giá trị. */
  ico?: string;
  /** Vị trí icon trong chip, áp cho cả khối: `tren` | `duoi` | `trai` | `phai`. */
  vtIco?: string;
  /** Vị trí icon riêng cho một giá trị, đè `vtIco`: `{ "Auto": "trai" }`. */
  gtVt?: Record<string, string>;
  /** Màu nhấn riêng của ô (mã hex) — đè `--brand`, `--brand-deep`, `--brand-soft`. */
  mauCtl?: string;
  /** `"skin"`: viền 2px màu nhấn. */
  vien?: string;
  /** `"vien"`: mục đang chọn tô viền thay vì nền đặc. */
  hlChon?: string;
  nenAnh?: string;
  /**
   * Chiều cao MỖI HÀNG mà ô này phủ lên (px), đè `caoHang` của lưới.
   * Ô `h: 3` khai `caoHang: 48` thì ba hàng đều 48px, tổng 3×48 + 2×8 = 160px.
   * Không khai thì hàng lấy `caoHang` của lưới.
   */
  caoHang?: number;
};

/** Bốn vị trí icon bản tham chiếu biết; giá trị lạ bị bỏ, không thành class rác. */
export const VI_TRI_ICO = ["tren", "duoi", "trai", "phai"];
export const lopViTri = (vt?: string) => (vt && VI_TRI_ICO.includes(vt) ? `vt-${vt}` : "");

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
function variantO(cap: IotxCapability, laNguon: boolean, khai?: string): string {
  const choPhep = VARIANT_THEO_KIND[cap.kind] ?? [];
  if (khai && choPhep.includes(khai)) return khai;
  if (cap.kind === "onoff") return laNguon ? "power01" : "switch01";
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
 * Hàng nào có ô thì được một dòng trên lưới, hàng trống bị dồn mất.
 *
 * Trả về bảng đổi "số hàng catalog khai" → "số hàng thật trên màn". Catalog đánh số thưa
 * (hàng 1, 4, 6, 13…) để dành chỗ sửa về sau; app mà vẽ đúng số đó thì màn đầy khoảng
 * trống. Đặt `donHang: false` thì giữ nguyên mọi hàng.
 */
function hangHienThi(o: OBoCuc[], donHang = true): { map: Record<number, number>; soHang: number } {
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

/**
 * Lọc bỏ ô trỏ tới capability không có trong sản phẩm, và chốt kiểu vẽ cho từng ô.
 * `khoaNguon`: nút nguồn theo luật chung của sản phẩm (`capNguonCua`); không truyền thì suy
 * từ chính danh sách capability.
 */
export function phanGiaiBoCuc(bc: BoCuc, caps: IotxCapability[], khoaNguon: string | undefined = capNguonTrong(caps)?.key) {
  const theoKhoa = new Map(caps.map(c => [c.key, c]));
  const o: OdaDung[] = [];
  for (const muc of bc.o ?? []) {
    const cap = theoKhoa.get(muc.key);
    if (!cap) continue;
    o.push({ ...muc, cap, variant: variantO(cap, cap.key === khoaNguon, muc.variant) });
  }
  const caoHang = soCaoHang(bc.caoHang) ?? CAO_HANG_MAC;
  const { map, soHang } = hangHienThi(o, bc.donHang !== false);

  /**
   * Chiều cao của TỪNG hàng, không phải một số dùng chung.
   *
   * Luật đo được trên web.dev: hàng nào bị một ô có `o.caoHang` phủ lên thì lấy số của ô đó;
   * hàng không có ô nào khai thì lấy `caoHang` của lưới. Số của ô ĐÈ số của lưới, kể cả khi
   * nhỏ hơn — ô vòng xoay của Smart Fan 314 khai 48 trong khi lưới khai 72, và web.dev vẽ 48.
   *
   * Hai ô cùng phủ một hàng mà khai khác nhau thì lấy số LỚN hơn, để không ô nào bị cắt.
   * Trường hợp này chưa gặp trên DEV; đặt luật trước cho khỏi vỡ.
   */
  const caoMoiHang: number[] = Array(soHang).fill(caoHang);
  const daKhai: boolean[] = Array(soHang).fill(false);
  for (const muc of o) {
    const cao = soCaoHang(muc.caoHang);
    if (cao === null) continue;
    for (let h = muc.row; h < muc.row + muc.h; h++) {
      const r = map[h];                       // số hàng thật sau khi dồn hàng trống
      if (r === undefined) continue;
      const i = r - 1;
      caoMoiHang[i] = daKhai[i] ? Math.max(caoMoiHang[i], cao) : cao;
      daKhai[i] = true;
    }
  }

  const capBao = bc.alarm?.key ? theoKhoa.get(bc.alarm.key) ?? null : null;
  return { o, map, soHang, caoHang, caoMoiHang, soCot: Number(bc.cot) || SO_COT, capBao };
}

/**
 * Mã lỗi từ một giá trị thô: mảng, chuỗi ngăn cách, hay một giá trị đơn. "0"/"false"/rỗng
 * nghĩa là KHÔNG có lỗi — hợp đồng nói rõ, đừng hiện chúng thành một dòng lỗi tên "0".
 */
function maLoi(giaTri: unknown): string[] {
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
