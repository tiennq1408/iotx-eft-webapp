import type { Device } from "@/lib/types";
import { apGiaTri } from "@/lib/iotx/mappers";

/**
 * Điều khiển GẦN qua Bluetooth (Web Bluetooth) — đường dự phòng khi mất mạng, cho quạt và
 * điều hoà (xem `coDuongBle`).
 *
 * Đặc tả phía firmware ESP32-C3: `docs/viec-ble.md`. Tóm tắt:
 *   - Một GATT service riêng, bốn characteristic: INFO (đọc), NONCE (đọc), CMD (ghi), EVT (notify).
 *   - Lệnh ghi vào CMD là JSON CÙNG HÌNH với RPC qua `/v1`: `{ id, method, params }`, tên lệnh
 *     và tham số lấy thẳng từ capability của catalog (`setPower`, `setSpeed`, `setMode`…), nên
 *     firmware dùng chung một bộ xử lý cho lệnh tới từ ThingsBoard và từ Bluetooth.
 *   - Xác thực bằng mã 5 số trên tem: app gửi HMAC-SHA256(mã, NONCE), mã không đi qua sóng.
 *
 * Chỉ Chrome/Edge (Android, máy tính) có Web Bluetooth, và chỉ trên HTTPS hoặc localhost.
 * iPhone/iPad không có — giao diện ẩn hẳn phần này ở đó.
 *
 * Phiên sống ở mức mô-đun (không trong state React) vì nhiều nơi cần tới nó: màn chi tiết
 * mở/đóng phiên, `guiLenh` trong `LivotecApp` hỏi `kenhDung` để chọn đường, và nhịp
 * đồng bộ với máy chủ phải dán giá trị Bluetooth lên dữ liệu (máy chủ đang mất liên lạc với
 * thiết bị nên giá trị của nó cũ).
 *
 * Chỉ nối khi người dùng bấm: mỗi lần là hộp chọn của trình duyệt rồi nhập mã tem. App không tự nối
 * trong mọi trường hợp (kể cả mất Wi-Fi) và không nhớ mã: phiên Bluetooth nối vào lúc mạch còn Wi-Fi
 * làm rớt MQTT (đo trên điều hoà thật, docs/viec-ble.md mục 18).
 */

/** UUID cố định — phải khớp đúng với firmware (bảng trong `docs/viec-ble.md`). */
export const BLE_GATT = {
  service: "19800001-eb16-4e87-a18d-16008870c454",
  info: "19800002-eb16-4e87-a18d-16008870c454",
  nonce: "19800003-eb16-4e87-a18d-16008870c454",
  cmd: "19800004-eb16-4e87-a18d-16008870c454",
  evt: "19800005-eb16-4e87-a18d-16008870c454",
} as const;

/** Thiết bị không trả lời trong khoảng này thì coi lệnh là trượt. */
const CHO_TRA_LOI_MS = 4_000;

/* ----- Web Bluetooth chưa có trong lib DOM của TypeScript; chỉ khai đúng phần dùng tới. ----- */
type DacTinh = EventTarget & {
  value?: DataView;
  readValue(): Promise<DataView>;
  writeValueWithResponse(v: BufferSource): Promise<void>;
  startNotifications(): Promise<unknown>;
};
type DichVu = { getCharacteristic(uuid: string): Promise<DacTinh> };
type MayChu = { connected: boolean; connect(): Promise<MayChu>; disconnect(): void; getPrimaryService(uuid: string): Promise<DichVu> };
type ThietBiBle = EventTarget & { name?: string; gatt?: MayChu };
type NavCoBle = Navigator & {
  bluetooth?: {
    requestDevice(opt: { filters: Array<{ services?: string[]; name?: string }>; optionalServices?: string[] }): Promise<ThietBiBle>;
  };
};

export const coWebBluetooth = () => typeof navigator !== "undefined" && Boolean((navigator as NavCoBle).bluetooth);

/** Nhóm sản phẩm có firmware điều khiển qua Bluetooth: quạt và điều hoà. */
const NHOM_BLE = new Set(["fan", "ac"]);

/**
 * Thiết bị nào có đường Bluetooth: `productGroup` là `fan`/`ac` — catalog thật có quạt, điều
 * hoà không khai `ui` gì cả — hoặc renderer của catalog (`fan`, `fan_ac`, `fan_bldc`, `aircon`…).
 * Không dựa vào `ui.archetype`: đó là khuôn vẽ, máy hút mùi cũng mượn khuôn `fan`.
 */
export function coDuongBle(device: Device): boolean {
  if (device.virtual) return false;
  const p = device.product;
  return NHOM_BLE.has(p?.productGroup ?? "") || /^(fan|aircon)(_|$)/.test(String(p?.ui?.renderer ?? ""));
}

/** Lỗi của đường Bluetooth. `ma` là mã firmware trả về, hoặc mã do app đặt (`timeout`, `ngat`…). */
export class LoiBle extends Error {
  constructor(public ma: string, message: string) {
    super(message);
    this.name = "LoiBle";
  }
}

const CAU_LOI: Record<string, string> = {
  auth: "Sai mã trên tem — kiểm tra lại 5 số in trên tem thiết bị.",
  locked: "Nhập sai quá nhiều lần, thiết bị tạm khoá Bluetooth 60 giây.",
  bad_method: "Thiết bị chưa hỗ trợ lệnh này qua Bluetooth.",
  bad_params: "Thiết bị từ chối giá trị này.",
  busy: "Thiết bị đang bận, thử lại sau giây lát.",
  timeout: "Thiết bị không trả lời qua Bluetooth. Đứng gần hơn rồi thử lại.",
  ngat: "Đã mất kết nối Bluetooth với thiết bị.",
  sai_may: "Máy vừa chọn không phải thiết bị này (serial khác).",
  no_code: "Thiết bị chưa được cài mã tem nên chưa điều khiển qua Bluetooth được.",
  khong_ho_tro: "Trình duyệt này không có Web Bluetooth.",
  busy_wifi: "Thiết bị đang dùng Wi-Fi.",
  khong_phan_hoi: "Thiết bị không phản hồi qua Wi-Fi. Chạm \"Điều khiển gần qua Bluetooth\" để chuyển sang Bluetooth.",
};
const loi = (ma: string) => new LoiBle(ma, CAU_LOI[ma] ?? `Thiết bị báo lỗi: ${ma}`);
/** Lỗi Bluetooth theo mã, kèm câu tiếng Việt (giao diện dịch lại theo khoá `ble_loi_<mã>`). */
export const loiBle = loi;

type TraLoi = { id?: number; ok?: boolean; err?: string; t?: Record<string, unknown> };
type ChoTraLoi = { xong: (v: TraLoi) => void; hong: (e: Error) => void; hen: ReturnType<typeof setTimeout> };

const maHoa = new TextEncoder();
const giaiMa = new TextDecoder();

async function hmacHex(khoa: string, thongDiep: DataView): Promise<string> {
  const k = await crypto.subtle.importKey("raw", maHoa.encode(khoa), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const chuKy = new Uint8Array(await crypto.subtle.sign("HMAC", k, new Uint8Array(thongDiep.buffer, thongDiep.byteOffset, thongDiep.byteLength).slice()));
  return Array.from(chuKy, b => b.toString(16).padStart(2, "0")).join("");
}

export type ThongTinMay = { v?: number; sn?: string; model?: string; fw?: string };

/** Một kết nối đã xác thực với một thiết bị (quạt, điều hoà). */
export class PhienBle {
  private soLenh = 0;
  private readonly cho = new Map<number, ChoTraLoi>();
  /** Giá trị cuối thiết bị báo qua EVT — dán lên dữ liệu máy chủ khi đồng bộ (xem `apTrangThaiBle`). */
  readonly giaTri: Record<string, unknown> = {};

  private constructor(
    readonly deviceId: string,
    readonly ten: string,
    readonly thongTin: ThongTinMay,
    private readonly mayChu: MayChu,
    private readonly cmd: DacTinh,
    private readonly nonce: DacTinh,
  ) {}

  /**
   * Bước 1 (phải gọi từ một cú bấm): hộp chọn → nối → so serial với INFO để không điều khiển nhầm máy
   * nhà bên. Phiên trả về CHƯA xác thực, chưa vào sổ — người dùng thấy đã nối được máy rồi mới nhập mã
   * tem (`xacThuc`). Bỏ ngang thì `ngat()`.
   */
  static async chonMay(deviceId: string, serial?: string): Promise<PhienBle> {
    const bt = (navigator as NavCoBle).bluetooth;
    if (!bt) throw loi("khong_ho_tro");
    const thietBi = await bt.requestDevice({ filters: [{ services: [BLE_GATT.service] }], optionalServices: [BLE_GATT.service] });
    return PhienBle.noi(thietBi, deviceId, serial);
  }

  /**
   * Bước 2: xác thực bằng mã tem (NONCE đọc mới mỗi lần). Sai mã thì kết nối vẫn giữ để nhập lại.
   * `chon: true` = người dùng đã chọn Bluetooth: firmware (≥ 1.1.5) tắt Wi-Fi để mỗi lúc một đường.
   */
  async xacThuc(maTem: string): Promise<void> {
    const mac = await hmacHex(maTem, await this.nonce.readValue());
    await this.gui("auth", { mac, chon: true });
    dangKy(this);
  }

  /** Nối GATT, lấy bốn characteristic, so serial, bật notify. Chưa xác thực. */
  private static async noi(thietBi: ThietBiBle, deviceId: string, serial: string | undefined): Promise<PhienBle> {
    const mayChu = await thietBi.gatt!.connect();
    try {
      const dv = await mayChu.getPrimaryService(BLE_GATT.service);
      const [info, nonce, cmd, evt] = await Promise.all([
        dv.getCharacteristic(BLE_GATT.info), dv.getCharacteristic(BLE_GATT.nonce),
        dv.getCharacteristic(BLE_GATT.cmd), dv.getCharacteristic(BLE_GATT.evt),
      ]);
      let thongTin: ThongTinMay = {};
      try { thongTin = JSON.parse(giaiMa.decode(await info.readValue())) as ThongTinMay; } catch { /* INFO hỏng thì bỏ qua so serial */ }
      if (serial && thongTin.sn && thongTin.sn.toLowerCase() !== serial.toLowerCase()) throw loi("sai_may");

      const phien = new PhienBle(deviceId, thietBi.name || thongTin.sn || "", thongTin, mayChu, cmd, nonce);
      evt.addEventListener("characteristicvaluechanged", () => { if (evt.value) phien.nhan(evt.value); });
      await evt.startNotifications();
      thietBi.addEventListener("gattserverdisconnected", () => phien.dong());
      return phien;
    } catch (e) {
      mayChu.disconnect();
      throw e;
    }
  }

  /** Gửi một lệnh; trả về khi thiết bị nói `ok`, ném `LoiBle` khi thiết bị từ chối hoặc im lặng. */
  async gui(method: string, params: Record<string, unknown>): Promise<void> {
    if (!this.mayChu.connected) throw loi("ngat");
    const id = ++this.soLenh;
    const traLoi = new Promise<TraLoi>((xong, hong) => {
      const hen = setTimeout(() => { this.cho.delete(id); hong(loi("timeout")); }, CHO_TRA_LOI_MS);
      this.cho.set(id, { xong, hong, hen });
    });
    try { await this.cmd.writeValueWithResponse(maHoa.encode(JSON.stringify({ id, method, params }))); }
    catch (e) {
      const c = this.cho.get(id);
      if (c) { clearTimeout(c.hen); this.cho.delete(id); }
      throw e;
    }
    const kq = await traLoi;
    if (!kq.ok) throw loi(kq.err || "loi");
  }

  /** Một thông điệp từ EVT: trả lời cho lệnh (`id`) và/hoặc trạng thái mới (`t`). */
  private nhan(v: DataView) {
    let tl: TraLoi;
    try { tl = JSON.parse(giaiMa.decode(v)) as TraLoi; } catch { return; }
    if (tl.t && typeof tl.t === "object") {
      Object.assign(this.giaTri, tl.t);
      baoNghe(this.deviceId, tl.t);
    }
    if (typeof tl.id === "number") {
      const c = this.cho.get(tl.id);
      if (!c) return;
      clearTimeout(c.hen);
      this.cho.delete(tl.id);
      c.xong(tl);
    }
  }

  ngat() { this.mayChu.disconnect(); this.dong(); }

  /** Hai phiên trên cùng một kết nối GATT — ngắt phiên này là ngắt luôn phiên kia. */
  cungKetNoi(khac: PhienBle) { return this.mayChu === khac.mayChu; }

  /** Thôi dùng phiên (lệnh đang chờ báo `ngat`); không đụng tới kết nối. */
  dong() {
    for (const c of this.cho.values()) { clearTimeout(c.hen); c.hong(loi("ngat")); }
    this.cho.clear();
    if (PHIEN.get(this.deviceId) === this) {
      PHIEN.delete(this.deviceId);
      baoNghe(this.deviceId, null);
    }
  }
}

/* ------------------------- sổ phiên dùng chung cả app ------------------------- */

const PHIEN = new Map<string, PhienBle>();
/** `gt = null` nghĩa là phiên của thiết bị đó vừa đóng. */
type Nghe = (deviceId: string, gt: Record<string, unknown> | null) => void;
const NGHE = new Set<Nghe>();

function dangKy(phien: PhienBle) {
  const cu = PHIEN.get(phien.deviceId);
  // Phiên cũ trên CÙNG kết nối (nối lại máy đã chọn): chỉ thay sổ, ngắt là ngắt luôn phiên mới.
  if (cu && cu.cungKetNoi(phien)) cu.dong(); else cu?.ngat();
  PHIEN.set(phien.deviceId, phien);
  baoNghe(phien.deviceId, {});
}
function baoNghe(deviceId: string, gt: Record<string, unknown> | null) {
  for (const f of NGHE) f(deviceId, gt);
}

export const phienBle = (deviceId: string) => PHIEN.get(deviceId);

/**
 * Máy chủ chậm vài phút mới biết mạch mất Wi-Fi (keepalive MQTT, rồi thời gian "không hoạt
 * động" của ThingsBoard). Nên app tự đánh dấu khi chính nó thấy: lệnh qua Wi-Fi không được
 * mạch báo lại trong `CHO_WIFI_MS`. Dấu tự hết hạn để lần bấm sau lại thử Wi-Fi, và bị gỡ
 * ngay khi máy chủ có tin mới từ mạch (`boMatWifi`).
 */
const MAT_WIFI = new Map<string, { het: number; chac: boolean }>();
const MAT_WIFI_GIU_MS = 2 * 60_000;
/** Đợi mạch báo lại lệnh vừa gửi qua Wi-Fi bao lâu trước khi chuyển Bluetooth. */
export const CHO_WIFI_MS = 3_000;

/**
 * `chac`: có bằng chứng (mạch mất nhịp tim, xem `soatNhipTim`) — được phép tự bật hộp chọn
 * Bluetooth. Không `chac` chỉ là nghi (mạch không báo lại một lệnh).
 */
export function danhDauMatWifi(deviceId: string, chac = false) {
  const cu = MAT_WIFI.get(deviceId);
  const moi = { het: Date.now() + MAT_WIFI_GIU_MS, chac: chac || Boolean(cu?.chac && cu.het > Date.now()) };
  MAT_WIFI.set(deviceId, moi);
  if (!cu || cu.chac !== moi.chac || cu.het <= Date.now()) baoNghe(deviceId, {});
}
export function boMatWifi(deviceId: string) {
  if (MAT_WIFI.delete(deviceId)) baoNghe(deviceId, {});
}
/**
 * Chính điện thoại/máy tính đang mất mạng (tắt router thì thường mất cả hai). Khi đó không lệnh nào
 * qua được máy chủ — chắc chắn phải đi Bluetooth.
 */
export const dienThoaiMatMang = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** App CHẮC lệnh không qua được Wi-Fi (không chỉ nghi): mạch mất nhịp tim, hoặc điện thoại mất mạng. */
export function matWifiChac(deviceId: string): boolean {
  if (dienThoaiMatMang()) return true;
  const m = MAT_WIFI.get(deviceId);
  return Boolean(m && m.chac && m.het > Date.now());
}

/**
 * Nhịp tim: firmware gửi `{"hb": <giây>}` mỗi 5 giây khi còn nối máy chủ (mqtt_app.c). App
 * ghi lại lúc cuối cùng NGHE thấy mạch (dữ liệu của nó trên máy chủ đổi, hoặc có sự kiện SSE).
 * Mạch có nhịp tim mà `NHIP_TIM_MAT_MS` không nghe gì → chắc mất Wi-Fi, khỏi đợi máy chủ vài
 * phút mới đổi cờ `online`. Mạch chưa có nhịp tim (firmware cũ) thì không xét theo cách này.
 *
 * Đo trên DEV thật (28/10/2026): `hb` chỉ tới qua luồng SSE — `/bootstrap` KHÔNG trả khoá này.
 * Nên "mạch có nhịp tim" phải nhớ riêng (`CO_NHIP_TIM`, cả sau khi tải lại trang), và chỉ tin
 * "im lặng" khi chính luồng SSE đang thông (`datLuongThong`): luồng đứt thì cái im là của luồng,
 * không phải của mạch.
 */
const NGHE_CUOI = new Map<string, number>();
export const NHIP_TIM_MAT_MS = 15_000;   // firmware bật Bluetooth sau 10 s mất Wi-Fi
const khoaCoNhipTim = (deviceId: string) => `livotec-co-hb:${deviceId}`;
const CO_NHIP_TIM = new Set<string>();
const coNhipTim = (deviceId: string) => {
  if (CO_NHIP_TIM.has(deviceId)) return true;
  try { if (localStorage.getItem(khoaCoNhipTim(deviceId)) === "1") CO_NHIP_TIM.add(deviceId); } catch { /* không đọc được: coi như chưa biết */ }
  return CO_NHIP_TIM.has(deviceId);
};
let luongThong = false;

/** Luồng SSE vừa thông / vừa đứt. Thông lại thì cho mọi mạch đủ một khoảng trước khi xét im lặng. */
export function datLuongThong(thong: boolean) {
  if (thong && !luongThong) for (const id of NGHE_CUOI.keys()) NGHE_CUOI.set(id, Date.now());
  luongThong = thong;
}

/** Vừa nghe thấy mạch (`key` là khoá vừa đổi, nếu biết). */
export function ghiNgheMach(deviceId: string, key?: string) {
  NGHE_CUOI.set(deviceId, Date.now());
  if (key === "hb" && !CO_NHIP_TIM.has(deviceId)) {
    CO_NHIP_TIM.add(deviceId);
    try { localStorage.setItem(khoaCoNhipTim(deviceId), "1"); } catch { /* chế độ riêng tư — lần sau học lại */ }
  }
  boMatWifi(deviceId);
}

/** Gọi sau mỗi lần có dữ liệu thiết bị mới (hỏi lại định kỳ). */
export function soatNhipTim(device: Pick<Device, "id" | "online" | "lastValues">) {
  if (device.lastValues?.hb !== undefined && !CO_NHIP_TIM.has(device.id)) ghiNgheMach(device.id, "hb");
  if (!device.online || !coNhipTim(device.id) || !luongThong) return;
  const cuoi = NGHE_CUOI.get(device.id);
  if (cuoi === undefined) { NGHE_CUOI.set(device.id, Date.now()); return; }   // vừa mở app: cho đủ một khoảng
  if (Date.now() - cuoi > NHIP_TIM_MAT_MS) danhDauMatWifi(device.id, true);
}

/**
 * Mạch đã từng báo lại một lệnh gửi qua Wi-Fi trên trình duyệt này. Chỉ với mạch như vậy, im lặng
 * mới là dấu hiệu mất Wi-Fi (xem `guiQuaKenh`). Nhớ lâu dài: mạch đã biết báo thì vẫn biết báo.
 */
const khoaBaoLai = (deviceId: string) => `livotec-bao-lai:${deviceId}`;
export function daBietBaoLai(deviceId: string): boolean {
  try { return localStorage.getItem(khoaBaoLai(deviceId)) === "1"; } catch { return false; }
}
export function nhoBaoLai(deviceId: string) {
  try { localStorage.setItem(khoaBaoLai(deviceId), "1"); } catch { /* chế độ riêng tư — lần sau học lại */ }
}

/** Thiết bị đang có Wi-Fi: máy chủ nói trực tuyến VÀ app chưa thấy nó im lặng. */
export function coWifi(device: Pick<Device, "id" | "online">): boolean {
  if (!device.online || dienThoaiMatMang()) return false;
  const m = MAT_WIFI.get(device.id);
  if (m === undefined) return true;
  if (m.het > Date.now()) return false;
  MAT_WIFI.delete(device.id);
  return true;
}

export type Kenh = "ble" | "wifi" | null;

/**
 * Lệnh của thiết bị đang đi kênh nào. Firmware chạy MỘT luồng điều khiển mỗi lúc: điện thoại nối
 * Bluetooth đúng mã thì mạch tắt Wi-Fi — nên có phiên Bluetooth là lệnh đi Bluetooth. Không có
 * phiên thì Wi-Fi; `null` khi không còn kênh nào.
 */
export function kenhDung(device: Pick<Device, "id" | "online">): Kenh {
  if (PHIEN.has(device.id)) return "ble";
  return coWifi(device) ? "wifi" : null;
}


/** Phiên Bluetooth nếu lệnh của thiết bị đang phải đi Bluetooth, không thì `undefined`. */
export const phienDung = (device: Pick<Device, "id" | "online">) => kenhDung(device) === "ble" ? PHIEN.get(device.id) : undefined;

/** Bluetooth rớt hoặc im lặng (không phải máy từ chối lệnh) — máy còn Wi-Fi thì nên gửi qua Wi-Fi. */
export const laLoiDuongBle = (error: unknown) => error instanceof LoiBle && (error.ma === "timeout" || error.ma === "ngat");

/** Nghe trạng thái thiết bị qua Bluetooth và việc phiên mở/đóng. Trả về hàm thôi nghe. */
export function ngheBle(f: Nghe): () => void {
  NGHE.add(f);
  return () => { NGHE.delete(f); };
}

/**
 * Đang có phiên Bluetooth thì giá trị thiết bị vừa báo thắng giá trị máy chủ — máy chủ mất liên
 * lạc với thiết bị nên dữ liệu của nó cũ, cứ ghi đè là công tắc vừa bật lại tự tắt.
 */
export function apTrangThaiBle(device: Device): Device {
  const p = PHIEN.get(device.id);
  return p && Object.keys(p.giaTri).length ? apGiaTri(device, p.giaTri) : device;
}

/** Bản trước nhớ mã tem trong trình duyệt để tự nối. Giờ lần nào cũng hỏi: xoá mã còn sót lại. */
export function xoaMaTemDaNho() {
  try {
    for (const khoa of Object.keys(localStorage)) if (khoa.startsWith("livotec-ble-ma:")) localStorage.removeItem(khoa);
  } catch { /* không đọc được: không có gì để xoá */ }
}
