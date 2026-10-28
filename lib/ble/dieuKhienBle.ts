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
 * mở/đóng phiên, `guiLenh` trong `LivotecApp` chuyển lệnh sang đây khi có phiên, và nhịp
 * đồng bộ với máy chủ phải dán giá trị Bluetooth lên dữ liệu (máy chủ đang mất liên lạc với
 * thiết bị nên giá trị của nó cũ).
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
  bluetooth?: { requestDevice(opt: { filters: Array<{ services?: string[]; name?: string }>; optionalServices?: string[] }): Promise<ThietBiBle> };
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
};
const loi = (ma: string) => new LoiBle(ma, CAU_LOI[ma] ?? `Thiết bị báo lỗi: ${ma}`);

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
  ) {}

  /**
   * Chọn thiết bị (hộp chọn của trình duyệt — phải gọi từ một cú bấm), kết nối, xác thực.
   * `serial` có thì so với INFO để không điều khiển nhầm máy nhà bên.
   */
  static async ketNoi(deviceId: string, maTem: string, serial?: string): Promise<PhienBle> {
    const bt = (navigator as NavCoBle).bluetooth;
    if (!bt) throw loi("khong_ho_tro");
    const thietBi = await bt.requestDevice({ filters: [{ services: [BLE_GATT.service] }], optionalServices: [BLE_GATT.service] });
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

      const phien = new PhienBle(deviceId, thietBi.name || thongTin.sn || "", thongTin, mayChu, cmd);
      evt.addEventListener("characteristicvaluechanged", () => { if (evt.value) phien.nhan(evt.value); });
      await evt.startNotifications();
      thietBi.addEventListener("gattserverdisconnected", () => phien.dong());

      const mac = await hmacHex(maTem, await nonce.readValue());
      await phien.gui("auth", { mac });
      dangKy(phien);
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

  private dong() {
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
  PHIEN.get(phien.deviceId)?.ngat();
  PHIEN.set(phien.deviceId, phien);
  baoNghe(phien.deviceId, {});
}
function baoNghe(deviceId: string, gt: Record<string, unknown> | null) {
  for (const f of NGHE) f(deviceId, gt);
}

export const phienBle = (deviceId: string) => PHIEN.get(deviceId);

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

/* ----------------- nhớ mã tem trên máy này để lần sau khỏi gõ lại ----------------- */

const khoaMaTem = (deviceId: string) => `livotec-ble-ma:${deviceId}`;
export function docMaTem(deviceId: string): string {
  try { return localStorage.getItem(khoaMaTem(deviceId)) ?? ""; } catch { return ""; }
}
export function nhoMaTem(deviceId: string, ma: string) {
  try { localStorage.setItem(khoaMaTem(deviceId), ma); } catch { /* chế độ riêng tư — lần sau gõ lại */ }
}
