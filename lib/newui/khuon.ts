import type { IotxCapability, IotxProduct } from "@/lib/iotx/contracts";
import { rong } from "@/lib/iotx/giaTri";

/**
 * Bộ dựng màn chi tiết thiết bị — chép đúng mô hình của bản tham chiếu trên
 * `web.dev.happibot.net` (module `phanGiai`), để hai app cho ra cùng một màn với cùng một
 * dữ liệu API.
 *
 * Khác hẳn cách cũ của app này: catalog thật KHÔNG gửi `controls`/`gauges`. Nó gửi
 *
 *   ui.archetype   khuôn thiết bị: fan | light | ac | heater | purifier | waterfilter | sensor
 *   ui.skin        da: ocean | sunset | graphite
 *   ui.uuTien[]    thứ tự ưu tiên các khóa capability
 *   ui.slots{}     { nhom, variant, co } cho từng khóa
 *
 * `nhom` là một trong năm: alarm | status | hero | secondary | more. Mỗi nhóm có SỨC CHỨA
 * cố định — vượt thì phần thừa rơi xuống "more" chứ không nén lại, để màn không bao giờ dài
 * vô tận. Khóa nào `slots` không nói thì suy ra từ khuôn (`ganMacDinh`).
 */

/* ------------------------------------------------------------------ */
/* Khuôn thiết bị và sức chứa từng nhóm                                */
/* ------------------------------------------------------------------ */

type TenNhom = "alarm" | "status" | "hero" | "secondary" | "more";

const SUC_CHUA = { alarm: 2, status: 2, hero: 1, secondary: 3 } as const;

type Khuon = { heroUu: string[]; docUu: string[]; phuUu: string[]; baoUu?: string[]; chiDoc?: boolean };

const KHUON: Record<string, Khuon> = {
  fan: { heroUu: ["speed", "fanSpeed"], docUu: ["roomTemp", "roomHumid", "curSpeed"], phuUu: ["mode", "oscillate", "timerOff", "sleepSpeed", "autoMode"] },
  light: { heroUu: ["brightness", "level"], docUu: ["lux", "watt"], phuUu: ["colorTemp", "color", "mode", "timerOff"] },
  // Khóa `ac_*` là của catalog THẬT trên DEV (sản phẩm `ac`, 28 capability, không khai
  // `ui`). Thiếu chúng thì khối chính rơi vào capability đầu bảng chữ cái — đo được là
  // `ac_coil_temp` "Nhiệt độ giàn", còn băng số đọc hiện "Danh sách lỗi"/"Voltage".
  ac: { heroUu: ["ac_temp_setting", "tempTarget", "temp"], docUu: ["ac_room_temp", "roomTemp", "roomHumid"], phuUu: ["ac_ope_mode", "ac_fan_speed", "ac_swing_mode", "ac_timer_control", "mode", "fanSpeed", "swing", "timerOff"] },
  heater: { heroUu: ["tempTarget", "temp"], docUu: ["waterTemp", "roomTemp"], phuUu: ["mode", "timerOff", "eco"] },
  purifier: { heroUu: ["speed", "fanSpeed"], docUu: ["pm25", "aqi", "roomHumid"], phuUu: ["mode", "autoMode", "resetFilter", "timerOff"] },
  waterfilter: { heroUu: ["filters"], docUu: ["tdsIn", "tdsOut"], phuUu: [], baoUu: ["leak"] },
  sensor: { heroUu: [], docUu: [], phuUu: [], chiDoc: true },
};

/**
 * Khuôn CHUNG cho sản phẩm không khai (hoặc khai sai) archetype. Không ưu tiên khóa nào:
 * nguồn → nhóm phụ, số đọc → băng số đọc, điều khiển → khối chính và nhóm phụ, phần còn
 * lại gập vào "xem thêm". Luật dự án: không bao giờ để màn trống — bản tham chiếu web.dev
 * bỏ trống trường hợp này, app này cố ý KHÁC ở đúng điểm đó.
 */
const KHUON_CHUNG: Khuon = { heroUu: [], docUu: [], phuUu: [] };

const coKhuon = (ma: unknown): ma is string => typeof ma === "string" && Object.prototype.hasOwnProperty.call(KHUON, ma);

/* ------------------------------------------------------------------ */
/* Kiểu vẽ cho phép theo từng `kind`                                   */
/* ------------------------------------------------------------------ */

/** Kiểu vẽ mà mỗi `kind` chấp nhận; dùng chung với lưới `ui.boCuc` (xem `boCuc.ts`). */
export const VARIANT_THEO_KIND: Record<IotxCapability["kind"], readonly string[]> = {
  onoff: ["switch01", "power01"],
  level: ["slider01", "dial01", "step01"],
  enum: ["chips01"],
  sensor: ["readout01", "gauge01", "state01", "alarm01"],
  list: ["filterlist01"],
};

function variantMac(kind: IotxCapability["kind"], laNguon: boolean, nhom: TenNhom, cap?: IotxCapability): string | null {
  if (kind === "onoff") return laNguon ? "power01" : "switch01";
  if (kind === "level") return nhom === "hero" ? "dial01" : "slider01";
  if (kind === "sensor") {
    if (nhom === "alarm") return "alarm01";
    return cap?.values?.length ? "state01" : "readout01";
  }
  return VARIANT_THEO_KIND[kind]?.[0] ?? null;
}

function variantCua(kind: IotxCapability["kind"], laNguon: boolean, nhom: TenNhom, khai?: string, cap?: IotxCapability): string | null {
  const bang = VARIANT_THEO_KIND[kind];
  if (!bang) return null;
  // Kiểu lạ rơi về mặc định của `kind` thay vì làm vỡ màn.
  return khai && bang.includes(khai) ? khai : variantMac(kind, laNguon, nhom, cap);
}

/* ------------------------------------------------------------------ */
/* Da                                                                  */
/* ------------------------------------------------------------------ */

const SKIN: Record<string, { brand: string; deep: string; soft: string }> = {
  ocean: { brand: "#0284c7", deep: "#0369a1", soft: "#e0f2fe" },
  sunset: { brand: "#ea760b", deep: "#c2590a", soft: "#feecdc" },
  graphite: { brand: "#475569", deep: "#334155", soft: "#e2e8f0" },
};

export const mauSkin = (ma: unknown) => (typeof ma === "string" && SKIN[ma]) || null;

/* ------------------------------------------------------------------ */
/* Gán nhóm mặc định khi `slots` không nói                             */
/* ------------------------------------------------------------------ */

const laDieuKhien = (c?: IotxCapability): c is IotxCapability => c !== undefined && c.kind !== "sensor";
/** `power`, `ac_power_status`, `fan_power`, `nguon`… — "power"/"nguon" đứng thành từ riêng. */
const LA_TEN_NGUON = /(^|_)(power|nguon)(_|$)/i;
const laTenNguon = (c?: IotxCapability): c is IotxCapability => c !== undefined && c.kind === "onoff" && LA_TEN_NGUON.test(c.key);

/**
 * Capability đóng vai nút nguồn — MỘT luật cho cả app (thẻ, khuôn chi tiết, lưới, suy `on`).
 *
 * KHÔNG dò theo tên khóa `power`: catalog thật đặt là `ac_power_status`, `fan_power`… Thứ
 * nói cho ta biết đâu là nguồn là `slots[key].variant === "power01"`. Chỉ khi catalog không
 * khai gì mới suy theo tên, và cuối cùng mới lấy công tắc đầu tiên. Trước đây khuôn chi tiết
 * và lưới chỉ nhận đúng khóa `power`, nên `ac_power_status` được thẻ coi là nguồn mà trên
 * màn chi tiết lại vẽ thành công tắc thường.
 */
export function capNguonTrong(caps: IotxCapability[], slots: Record<string, { variant?: string } | undefined> = {}): IotxCapability | undefined {
  return caps.find(c => c.kind === "onoff" && slots[c.key]?.variant === "power01")
    ?? caps.find(laTenNguon)
    ?? caps.find(c => c.kind === "onoff");
}

export function khuonCua(product?: IotxProduct | null): string | undefined {
  const a = product?.ui?.archetype;
  if (coKhuon(a)) return a;
  return product?.productGroup ?? undefined;
}

function uuTienCua(product?: IotxProduct | null): string[] {
  const u = (product?.ui as { uuTien?: unknown } | null | undefined)?.uuTien;
  return Array.isArray(u) ? u.filter((x): x is string => typeof x === "string") : [];
}

function ganMacDinh(caps: IotxCapability[], khuon: Khuon, uuTien: string[], capNguon: IotxCapability | undefined): Record<string, TenNhom> {
  const ra: Record<string, TenNhom> = {};

  const conLai = new Set(caps.map(c => c.key));
  const lay = (key: string) => (conLai.has(key) ? caps.find(c => c.key === key) : undefined);
  const dat = (c: IotxCapability | undefined, nhom: TenNhom) => {
    if (c && conLai.has(c.key)) { ra[c.key] = nhom; conLai.delete(c.key); }
  };

  let nBao = 0;
  for (const key of khuon.baoUu ?? []) {
    if (nBao >= SUC_CHUA.alarm) break;
    const c = lay(key);
    if (c) { dat(c, "alarm"); nBao += 1; }
  }

  // Nút nguồn theo đúng một luật `capNguonTrong` — KHÔNG lấy bừa công tắc đầu tiên: catalog
  // `ac` xếp `ac_IoT_status` trước `ac_power_status`, nên lấy bừa là app đưa "IoT Status"
  // lên làm nút bật/tắt máy.
  dat(capNguon, "secondary");

  let hero: IotxCapability | undefined;
  for (const key of khuon.heroUu) if (!hero) hero = lay(key);
  if (!hero) hero = caps.find(c => conLai.has(c.key) && (khuon.chiDoc ? c.kind === "sensor" : laDieuKhien(c)));
  dat(hero, "hero");

  let nDoc = 0;
  for (const key of khuon.docUu) {
    if (nDoc >= SUC_CHUA.status) break;
    const c = lay(key);
    if (c && c.kind === "sensor") { dat(c, "status"); nDoc += 1; }
  }
  for (const c of caps) {
    if (nDoc >= SUC_CHUA.status) break;
    if (conLai.has(c.key) && c.kind === "sensor") { dat(c, "status"); nDoc += 1; }
  }

  let nPhu = 0;
  for (const key of [...uuTien, ...khuon.phuUu]) {
    if (nPhu >= SUC_CHUA.secondary) break;
    const c = lay(key);
    if (c && laDieuKhien(c)) { dat(c, "secondary"); nPhu += 1; }
  }
  for (const c of caps) {
    if (nPhu >= SUC_CHUA.secondary) break;
    if (conLai.has(c.key) && laDieuKhien(c)) { dat(c, "secondary"); nPhu += 1; }
  }

  caps.forEach(c => { if (conLai.has(c.key)) ra[c.key] = "more"; });
  return ra;
}

/* ------------------------------------------------------------------ */
/* Kết quả dựng màn                                                    */
/* ------------------------------------------------------------------ */

export type O = { cap: IotxCapability; nhom: TenNhom; variant: string | null };

export type KetQua = {
  /** Mã khuôn đã dùng; `"chung"` khi sản phẩm không khai archetype nhận ra được. */
  khuon: string;
  skin: string | null;
  veBao: O[];
  veStatus: O[];
  veHero: O | null;
  veNguon: O | null;
  veSecondary: O[];
  veMore: O[];
  /** Những khai báo bị từ chối và vì sao — hiện cho người dựng catalog thấy, không cho người dùng. */
  canhBao: Array<{ key: string; vi: string }>;
};

/**
 * Chỉ trả `null` khi sản phẩm không có capability nào để vẽ. Không nhận ra khuôn thì dùng
 * `KHUON_CHUNG` — người dùng vẫn có màn điều khiển đầy đủ, chỉ thiếu thứ tự ưu tiên của hãng.
 */
export function phanGiai(product: IotxProduct | null | undefined, caps: IotxCapability[]): KetQua | null {
  if (caps.length === 0) return null;
  const maKhuon = khuonCua(product);
  const khuon = coKhuon(maKhuon) ? KHUON[maKhuon] : KHUON_CHUNG;

  const slots = product?.ui?.slots ?? {};
  const uuTien = uuTienCua(product);
  const capNguon = capNguonTrong(caps, slots);
  const macDinh = ganMacDinh(caps, khuon, uuTien, capNguon);

  const kq = {
    khuon: coKhuon(maKhuon) ? maKhuon : "chung",
    skin: mauSkin(product?.ui?.skin) ? String(product?.ui?.skin) : null,
    bao: [] as IotxCapability[],
    status: [] as IotxCapability[],
    hero: null as IotxCapability | null,
    nguon: null as IotxCapability | null,
    secondary: [] as IotxCapability[],
    more: [] as IotxCapability[],
    canhBao: [] as Array<{ key: string; vi: string }>,
  };
  const guiXuong = (c: IotxCapability, vi: string) => { kq.more.push(c); kq.canhBao.push({ key: c.key, vi }); };

  for (const cap of caps) {
    const nhom = (slots[cap.key]?.nhom as TenNhom | undefined) || macDinh[cap.key] || "more";

    if (nhom === "alarm") {
      if (cap.kind !== "sensor") { guiXuong(cap, "Băng báo động chỉ nhận SỐ ĐỌC"); continue; }
      if (kq.bao.length >= SUC_CHUA.alarm) { guiXuong(cap, `Băng báo động tối đa ${SUC_CHUA.alarm}`); continue; }
      kq.bao.push(cap); continue;
    }
    if (cap === capNguon && nhom !== "more") { kq.nguon = cap; continue; }
    if (nhom === "status") {
      if (cap.kind !== "sensor") { guiXuong(cap, "Nhóm số đọc chỉ nhận SỐ ĐỌC — cái này bấm được"); continue; }
      if (kq.status.length >= SUC_CHUA.status) { guiXuong(cap, `Nhóm số đọc đã đủ ${SUC_CHUA.status} — phần thừa GẬP`); continue; }
      kq.status.push(cap); continue;
    }
    if (nhom === "hero") {
      if (kq.hero) { guiXuong(cap, "Khối chính chỉ có ĐÚNG MỘT chỗ"); continue; }
      kq.hero = cap; continue;
    }
    if (nhom === "secondary") {
      if (!laDieuKhien(cap)) { guiXuong(cap, "Nhóm phụ chỉ nhận thứ BẤM ĐƯỢC"); continue; }
      if (kq.secondary.length >= SUC_CHUA.secondary) { guiXuong(cap, `Nhóm phụ đã đủ ${SUC_CHUA.secondary} — phần thừa GẬP`); continue; }
      kq.secondary.push(cap); continue;
    }
    kq.more.push(cap);
  }

  if (uuTien.length) {
    const hang = (c: IotxCapability) => { const i = uuTien.indexOf(c.key); return i < 0 ? uuTien.length : i; };
    kq.secondary.sort((a, b) => hang(a) - hang(b));
    kq.more.sort((a, b) => hang(a) - hang(b));
  }

  const ve = (cap: IotxCapability, nhom: TenNhom): O => ({
    cap, nhom, variant: variantCua(cap.kind, cap === capNguon, nhom, slots[cap.key]?.variant, cap),
  });

  return {
    khuon: kq.khuon,
    skin: kq.skin,
    canhBao: kq.canhBao,
    veBao: kq.bao.map(c => ve(c, "alarm")),
    veStatus: kq.status.map(c => ve(c, "status")),
    veHero: kq.hero ? ve(kq.hero, "hero") : null,
    veNguon: kq.nguon ? ve(kq.nguon, "secondary") : null,
    veSecondary: kq.secondary.map(c => ve(c, "secondary")),
    veMore: kq.more.map(c => ve(c, "more")),
  };
}

/**
 * Băng báo động chỉ nổi lên khi thật sự có sự cố; lúc bình thường nó tụt xuống "xem thêm"
 * dưới dạng dòng trạng thái, đúng như bản tham chiếu.
 */
export function baoDangKeu(cap: IotxCapability, giaTri: unknown): boolean {
  if (rong(giaTri)) return false;
  if (typeof giaTri === "number") return giaTri !== 0;
  if (typeof giaTri === "boolean") return giaTri;
  const s = String(giaTri).trim().toLowerCase();
  if (!s || s === "0" || s === "false" || s === "off" || s === "ok" || s === "normal" || s === "none") return false;
  return true;
}

/** Nút nguồn của một sản phẩm — xem `capNguonTrong`. */
export function capNguonCua(product?: IotxProduct | null): IotxCapability | undefined {
  return capNguonTrong(product?.capabilities ?? [], product?.ui?.slots ?? {});
}

/**
 * `phanGiai` cho cả sản phẩm, nhớ theo đối tượng sản phẩm. Catalog giữ nguyên tham chiếu
 * tới lần tải catalog sau, nên mỗi thẻ ngoài danh sách không phải dựng lại bố cục ở mỗi
 * nhịp đồng bộ hay mỗi sự kiện SSE.
 */
const BO_NHO_PHAN_GIAI = new WeakMap<IotxProduct, KetQua | null>();

export function phanGiaiSanPham(product: IotxProduct | null | undefined): KetQua | null {
  if (!product) return null;
  if (!BO_NHO_PHAN_GIAI.has(product)) BO_NHO_PHAN_GIAI.set(product, phanGiai(product, product.capabilities ?? []));
  return BO_NHO_PHAN_GIAI.get(product) ?? null;
}
