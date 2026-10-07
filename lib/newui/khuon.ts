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

const coKhuon = (ma: unknown): ma is string => typeof ma === "string" && Object.prototype.hasOwnProperty.call(KHUON, ma);

/* ------------------------------------------------------------------ */
/* Kiểu vẽ cho phép theo từng `kind`                                   */
/* ------------------------------------------------------------------ */

const CO_MOI = [1, 2, 3];

/** `co` là cỡ ô (1–3), không phải số cột lưới; mỗi kiểu vẽ chỉ nhận vài cỡ. */
const CONTROL: Record<IotxCapability["kind"], { mac: string; variant: Record<string, { co: number[] }> }> = {
  onoff: { mac: "switch01", variant: { switch01: { co: CO_MOI }, power01: { co: CO_MOI } } },
  level: { mac: "slider01", variant: { slider01: { co: CO_MOI }, dial01: { co: [2, 3] }, step01: { co: [1, 2] } } },
  enum: { mac: "chips01", variant: { chips01: { co: CO_MOI } } },
  sensor: { mac: "readout01", variant: { readout01: { co: CO_MOI }, gauge01: { co: [2, 3] }, state01: { co: CO_MOI }, alarm01: { co: CO_MOI } } },
  list: { mac: "filterlist01", variant: { filterlist01: { co: [2, 3] } } },
};

function variantMac(kind: IotxCapability["kind"], key: string, nhom: TenNhom, cap?: IotxCapability): string | null {
  if (kind === "onoff") return key === "power" ? "power01" : "switch01";
  if (kind === "level") return nhom === "hero" ? "dial01" : "slider01";
  if (kind === "sensor") {
    if (nhom === "alarm") return "alarm01";
    return cap?.values?.length ? "state01" : "readout01";
  }
  return CONTROL[kind]?.mac ?? null;
}

function variantCua(kind: IotxCapability["kind"], key: string, nhom: TenNhom, khai?: string, cap?: IotxCapability): string | null {
  const bang = CONTROL[kind];
  if (!bang) return null;
  // Kiểu lạ rơi về mặc định của `kind` thay vì làm vỡ màn.
  return khai && bang.variant[khai] ? khai : variantMac(kind, key, nhom, cap);
}

function coCua(kind: IotxCapability["kind"], variant: string | null, khai?: number): number {
  const cho = (variant && CONTROL[kind]?.variant[variant]?.co) || CO_MOI;
  const muon = Number(khai) || 2;
  if (cho.includes(muon)) return muon;
  return cho.reduce((a, b) => (Math.abs(b - muon) < Math.abs(a - muon) ? b : a), cho[0]);
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

const laDieuKhien = (c?: IotxCapability) => Boolean(c) && c!.kind !== "sensor";
const laNguon = (c?: IotxCapability) => Boolean(c) && c!.kind === "onoff" && c!.key === "power";
/** `ac_power_status`, `fan_power`, `nguon`… — tên có chứa "power"/"nguon" thành từ riêng. */
const laTenNguon = (c?: IotxCapability) =>
  Boolean(c) && c!.kind === "onoff" && /(^|_)(power|nguon)(_|$)/i.test(c!.key);

export function khuonCua(product?: IotxProduct | null): string | undefined {
  const a = product?.ui?.archetype;
  if (coKhuon(a)) return a;
  return product?.productGroup ?? undefined;
}

function uuTienCua(product?: IotxProduct | null): string[] {
  const u = (product?.ui as { uuTien?: unknown } | null | undefined)?.uuTien;
  return Array.isArray(u) ? u.filter((x): x is string => typeof x === "string") : [];
}

function ganMacDinh(caps: IotxCapability[], maKhuon?: string, uuTien: string[] = []): Record<string, TenNhom> {
  const ra: Record<string, TenNhom> = {};
  const khuon = maKhuon ? KHUON[maKhuon] : undefined;
  if (!khuon) { caps.forEach(c => { ra[c.key] = "more"; }); return ra; }

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

  // Nút nguồn dò theo tên như `capNguonCua`, KHÔNG lấy bừa công tắc đầu tiên: catalog
  // `ac` xếp `ac_IoT_status` trước `ac_power_status`, nên lấy bừa là app đưa "IoT Status"
  // lên làm nút bật/tắt máy.
  dat(caps.find(laNguon) || caps.find(laTenNguon) || caps.find(c => c.kind === "onoff"), "secondary");

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

export type O = { cap: IotxCapability; nhom: TenNhom; variant: string | null; co: number };

export type KetQua = {
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
 * Sản phẩm không có khuôn nhận ra được thì trả `null` — bản tham chiếu không vẽ màn nào cả
 * trong trường hợp đó, và app này làm y hệt để hai bên không lệch nhau.
 */
export function phanGiai(product: IotxProduct | null | undefined, caps: IotxCapability[]): KetQua | null {
  const maKhuon = khuonCua(product);
  if (!coKhuon(maKhuon)) return null;

  const slots = product?.ui?.slots ?? {};
  const uuTien = uuTienCua(product);
  const macDinh = ganMacDinh(caps, maKhuon, uuTien);

  const kq = {
    khuon: maKhuon,
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
    if (laNguon(cap) && nhom !== "more") { kq.nguon = cap; continue; }
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

  const ve = (cap: IotxCapability | null, nhom: TenNhom): O | null => {
    if (!cap) return null;
    const slot = slots[cap.key] ?? {};
    const variant = variantCua(cap.kind, cap.key, nhom, slot.variant, cap);
    return { cap, nhom, variant, co: coCua(cap.kind, variant, slot.co) };
  };

  return {
    khuon: kq.khuon,
    skin: kq.skin,
    canhBao: kq.canhBao,
    veBao: kq.bao.map(c => ve(c, "alarm")!),
    veStatus: kq.status.map(c => ve(c, "status")!),
    veHero: ve(kq.hero, "hero"),
    veNguon: ve(kq.nguon, "secondary"),
    veSecondary: kq.secondary.map(c => ve(c, "secondary")!),
    veMore: kq.more.map(c => ve(c, "more")!),
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

/**
 * Capability đóng vai nút nguồn của sản phẩm.
 *
 * KHÔNG dò theo tên khóa `power`: catalog thật đặt là `ac_power_status`, `fan_power`… Thứ
 * nói cho ta biết đâu là nguồn là `slots[key].variant === "power01"`. Chỉ khi catalog không
 * khai gì mới suy theo tên, và cuối cùng mới lấy công tắc đầu tiên.
 */
export function capNguonCua(product?: IotxProduct | null): IotxCapability | undefined {
  const caps = product?.capabilities ?? [];
  const slots = product?.ui?.slots ?? {};
  const theoSlot = caps.find(c => c.kind === "onoff" && slots[c.key]?.variant === "power01");
  if (theoSlot) return theoSlot;
  const theoTen = caps.find(c => c.kind === "onoff" && /(^|_)(power|nguon)(_|$)|^power$/i.test(c.key));
  if (theoTen) return theoTen;
  return caps.find(c => c.kind === "onoff");
}
