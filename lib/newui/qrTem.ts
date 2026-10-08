/**
 * Đọc nội dung mã QR trên tem thiết bị (xem `Ket_noi_thiet_bi_WiFi_Bluetooth.md` §3.2).
 *
 * Tem có HAI mã:
 *   ① Wi-Fi của mạch — `WIFI:T:WPA;S:PROV_A1B2C3;P:…;;` — để điện thoại vào Wi-Fi mạch, không
 *     phải mã để thêm thiết bị.
 *   ② Thêm vào Livotec — `https://<webapp>/them-thiet-bi#sn=<serial>&c=<mã claim>&p=…` — phần
 *     sau `#` không bao giờ lên máy chủ. `p=` dành cho app di động, webapp bỏ qua.
 *
 * `/claim` đòi `name` là TÊN in trên tem (kiểu `fan81029`); mã ② hiện chưa có cột tên (đã ghi
 * nhận cần bổ sung), nên đọc thêm `n`/`name`/`ten` khi có. Ngoài hai dạng chuẩn còn nhận JSON
 * và chuỗi rời để tem in tay vẫn quét được.
 */
export type NoiDungTem = {
  /** Tên in trên tem — `name` của `/claim`. */
  ten?: string;
  /** Mã claim 5 số — `secret` của `/claim`. */
  maSo?: string;
  /** Serial in trên vỏ — `/claim-mach-that`. */
  serial?: string;
  /** Tên quảng bá BLE của mạch (`PROV_…`), có trong mã ①. */
  bleTen?: string;
  /** Đây là mã ① (Wi-Fi) chứ không phải mã ② — hãy quét mã còn lại. */
  laMaWifi?: boolean;
};

const LA_MA_SO = /^\d{5}$/;
const LA_SERIAL = /^[A-Z0-9][A-Z0-9-]{5,}$/i;
const LA_TEN = /^[a-z][a-z0-9_]{2,}$/i;

function layThamSo(chuoi: string): Record<string, string> {
  const ra: Record<string, string> = {};
  for (const cap of chuoi.split(/[&;]/)) {
    const [k, ...v] = cap.split("=");
    if (k && v.length) ra[decodeURIComponent(k.trim()).toLowerCase()] = decodeURIComponent(v.join("=").trim());
  }
  return ra;
}

function tuThamSo(ts: Record<string, string>): NoiDungTem {
  const lay = (...khoa: string[]) => khoa.map(k => ts[k]).find(v => v !== undefined && v !== "");
  return {
    ten: lay("n", "name", "ten"),
    maSo: lay("c", "code", "secret", "ma", "maso"),
    serial: lay("sn", "serial", "s"),
  };
}

export function docTem(text: string): NoiDungTem {
  const chuoi = text.trim();
  if (!chuoi) return {};

  // ① WIFI:T:WPA;S:<ssid>;P:<pw>;; — dấu `\` thoát `\ ; , : "`.
  if (/^WIFI:/i.test(chuoi)) {
    const ssid = /(?:^|;)S:((?:\\.|[^;])*)/i.exec(chuoi.slice(5))?.[1]?.replace(/\\(.)/g, "$1");
    return { laMaWifi: true, bleTen: ssid || undefined };
  }

  // ② Địa chỉ webapp: tham số nằm sau `#` (hoặc `?` nếu tem in sai).
  if (/^https?:\/\//i.test(chuoi)) {
    try {
      const u = new URL(chuoi);
      return tuThamSo({ ...layThamSo(u.search.slice(1)), ...layThamSo(u.hash.slice(1)) });
    } catch { /* không phải URL hợp lệ — rơi xuống đọc rời */ }
  }

  // JSON: {"name":"fan81029","secret":"12345","serial":"LV-…"}
  if (chuoi.startsWith("{")) {
    try {
      const o = JSON.parse(chuoi) as Record<string, unknown>;
      const ts: Record<string, string> = {};
      for (const [k, v] of Object.entries(o)) if (typeof v === "string" || typeof v === "number") ts[k.toLowerCase()] = String(v);
      return tuThamSo(ts);
    } catch { /* không phải JSON — rơi xuống */ }
  }

  // Dạng khoá=giá trị rời: `sn=…&c=…` / `name=fan81029;c=12345`
  if (/^[a-z]+=/i.test(chuoi)) return tuThamSo(layThamSo(chuoi));

  // Chuỗi rời: `fan81029 12345`, `fan81029:12345`, `LV-FAN-000123 48213`…
  const ra: NoiDungTem = {};
  for (const tok of chuoi.split(/[\s,;:|/]+/).filter(Boolean)) {
    if (!ra.maSo && LA_MA_SO.test(tok)) ra.maSo = tok;
    else if (!ra.ten && LA_TEN.test(tok)) ra.ten = tok;
    else if (!ra.serial && LA_SERIAL.test(tok)) ra.serial = tok;
  }
  // Một chuỗi duy nhất không rõ là gì: coi là serial nếu trông giống serial, không thì là tên.
  if (!ra.ten && !ra.maSo && !ra.serial) {
    if (LA_SERIAL.test(chuoi) && /[-\d]/.test(chuoi)) ra.serial = chuoi; else ra.ten = chuoi;
  }
  return ra;
}
