/**
 * Điều khiển thiết bị thẳng qua Bluetooth (Web Bluetooth), không qua Internet.
 * Việc: docs/viec-ble-webapp.md · Hợp đồng GATT: docs/yeu-cau-firmware-ble.md mục 2–3.
 *
 * Chỉ Chrome/Edge (Android, máy tính) có `navigator.bluetooth`; iPhone và Firefox không có — giao
 * diện ẩn hẳn nút nối khi `coHoTro()` sai. Không dùng thư viện BLE nào.
 *
 * `rpc` cùng chữ ký với `IotxClient.rpc`, nên chỗ gửi lệnh chỉ cần chọn đường (`rpcTheoDuong`):
 * cập nhật lạc quan, sổ lệnh chờ và trả trạng thái cũ khi hỏng dùng lại nguyên vẹn.
 */
import { iotxClient, khoaMotLan } from "./client";
import { KenhBle, LoiKenh, base64 } from "./bleKenh";

const UUID_DUOI = "b77b-8b45-4e98-8517-ab86cddd0995";
export const BLE_SERVICE = `0000${UUID_DUOI}`;
const DAC_TINH = { info: `0001${UUID_DUOI}`, state: `0002${UUID_DUOI}`, cmd: `0003${UUID_DUOI}`, resp: `0004${UUID_DUOI}` } as const;
/** Mã hãng của Manufacturer Data. 0xFFFF là mã dành cho thử nghiệm — chưa chốt với firmware (mục 10.1). */
const MA_HANG = 0xffff;
const TIEN_TO_TEN = "LIVOTEC-";
const BAT_TAY_MS = 10_000;

/* ---- Phần Web Bluetooth dùng tới: lib DOM của TypeScript chưa có, khai đúng phần cần. ---- */
type DacTinh = EventTarget & {
  value?: DataView;
  readValue(): Promise<DataView>;
  writeValueWithoutResponse(v: BufferSource): Promise<void>;
  startNotifications(): Promise<DacTinh>;
};
type MayBle = EventTarget & {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{ getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<DacTinh> }> }>;
    disconnect(): void;
  };
};
type BoLoc = { namePrefix?: string; manufacturerData?: Array<{ companyIdentifier: number; dataPrefix?: BufferSource }> };
type WebBluetooth = { requestDevice(o: { filters: BoLoc[]; optionalServices: string[] }): Promise<MayBle> };
const bluetooth = () => (typeof navigator === "undefined" ? undefined : (navigator as Navigator & { bluetooth?: WebBluetooth }).bluetooth);

export type ThongTinMach = { serial: string; model: string; label: string | null; fw: string };

export type MaLoiBle = "khong_ho_tro" | "huy" | "sai_may" | "ma_sai" | "khong_bat_tay" | "het_gio" | "ngat" | "tu_choi" | "chua_noi" | "loi";

const CAU: Record<MaLoiBle, string> = {
  khong_ho_tro: "Trình duyệt này không hỗ trợ Bluetooth.",
  huy: "Đã huỷ chọn thiết bị.",
  sai_may: "Đã chọn nhầm thiết bị khác.",
  ma_sai: "Mã trên tem không đúng.",
  khong_bat_tay: "Thiết bị không phản hồi bắt tay. Đứng gần thiết bị hơn rồi thử lại.",
  het_gio: "Thiết bị không trả lời qua Bluetooth.",
  ngat: "Mất kết nối Bluetooth.",
  tu_choi: "Thiết bị từ chối lệnh.",
  chua_noi: "Chưa kết nối Bluetooth với thiết bị này.",
  loi: "Không kết nối được qua Bluetooth.",
};

/** Lỗi có câu cho người dùng — `moTaLoi` hiện thẳng `message`. */
export class BleLoi extends Error {
  constructor(public ma: MaLoiBle, chiTiet?: string) {
    super(CAU[ma] + (chiTiet && ma === "tu_choi" ? ` (${chiTiet})` : ""));
    this.name = "BleLoi";
  }
}

const doiLoi = (e: unknown): BleLoi => {
  if (e instanceof BleLoi) return e;
  if (e instanceof LoiKenh) return new BleLoi(e.ma === "tu_choi" ? "tu_choi" : e.ma === "ngat" ? "ngat" : "het_gio", e.chiTiet);
  return new BleLoi("loi");
};

/* ---- Trạng thái nối, dùng chung cho mọi màn (useSyncExternalStore) ---- */

export type TrangThaiBle =
  | { loai: "nghi" }
  | { loai: "dangNoi"; deviceId: string }
  | { loai: "daNoi"; deviceId: string; info: ThongTinMach }
  /** Đứt giữa chừng (đi xa, mạch tắt) — KHÔNG phải người dùng bấm Ngắt. Giao diện hiện băng vàng. */
  | { loai: "mat"; deviceId: string };

let trangThai: TrangThaiBle = { loai: "nghi" };
const nguoiNghe = new Set<() => void>();
function datTrangThai(moi: TrangThaiBle) { trangThai = moi; nguoiNghe.forEach(f => f()); }
export function docTrangThaiBle(): TrangThaiBle { return trangThai; }
export function ngheTrangThaiBle(f: () => void): () => void { nguoiNghe.add(f); return () => { nguoiNghe.delete(f); }; }

/** Thiết bị này đang nối và đã bắt tay xong — lệnh của nó đi BLE. */
export function bleDangNoi(id: string): boolean {
  return trangThai.loai === "daNoi" && trangThai.deviceId === id;
}

/* ---- Kết nối đang mở ---- */

type KetNoi = { may: MayBle; kenh: KenhBle; nguoiDungNgat: boolean };
let ketNoi: KetNoi | null = null;
const ngheNgat = new Set<() => void>();
const ngheTrangThai = new Set<(key: string, gt: unknown, seq: number) => void>();

const giaiMa = (v?: DataView) => (v ? new TextDecoder().decode(v) : "");

/**
 * Hộp chọn thiết bị của Chrome. Lọc theo serial trong Manufacturer Data để hộp chỉ hiện đúng một
 * máy; các bộ lọc là HOẶC nên kèm luôn `namePrefix` — firmware chưa kịp phát serial thì vẫn thấy
 * máy theo tên, và `info` đọc sau sẽ đối chiếu. Không gọi lần hai sau khi bị huỷ: `requestDevice`
 * chỉ chạy trong cú bấm của người dùng, lần thứ hai đã mất quyền đó.
 */
async function chonMay(serial: string): Promise<MayBle> {
  const bt = bluetooth();
  if (!bt) throw new BleLoi("khong_ho_tro");
  const tenLoc = { namePrefix: TIEN_TO_TEN };
  try {
    return await bt.requestDevice({
      filters: [{ manufacturerData: [{ companyIdentifier: MA_HANG, dataPrefix: new TextEncoder().encode(serial) }] }, tenLoc],
      optionalServices: [BLE_SERVICE],
    });
  } catch (e) {
    // Trình duyệt chưa hiểu bộ lọc manufacturerData → TypeError ngay, hộp chưa kịp hiện.
    if (e instanceof TypeError) return bt.requestDevice({ filters: [tenLoc], optionalServices: [BLE_SERVICE] }).catch(e2 => { throw loiChon(e2); });
    throw loiChon(e);
  }
}
const loiChon = (e: unknown) => (e instanceof DOMException && e.name === "NotFoundError" ? new BleLoi("huy") : doiLoi(e));

/** Bắt tay HMAC-SHA256 (hợp đồng mục 3): mạch đẩy nonce, ký bằng bí mật trên tem, mạch so. */
async function batTay(kenh: KenhBle, biMat: Uint8Array, cho: Promise<{ op?: string; giaTri?: unknown }>) {
  const nonce = await cho.catch(() => { throw new BleLoi("khong_bat_tay"); });
  const khoa = await crypto.subtle.importKey("raw", biMat as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const raw = Uint8Array.from(atob(String(nonce.giaTri ?? "")), c => c.charCodeAt(0));
  const chuKy = new Uint8Array(await crypto.subtle.sign("HMAC", khoa, raw));
  const ketQua = kenh.choThu(t => t.op !== "nonce" && "ok" in t, BAT_TAY_MS);
  // Mạch tính lại và so; sai thì nó NGẮT luôn — `dut()` làm lời hứa này hỏng với mã `ngat`.
  await kenh.guiThu({ op: "auth", chuKy: base64(chuKy) });
  const tl = await ketQua.catch(e => {
    throw e instanceof LoiKenh && e.ma === "het_gio" ? new BleLoi("khong_bat_tay") : new BleLoi("ma_sai");
  });
  if (tl.ok !== true) throw new BleLoi("ma_sai");
}

export const bleClient = {
  coHoTro(): boolean {
    return Boolean(bluetooth());
  },

  /**
   * Chọn máy, nối GATT, bắt tay. `deviceId` là id thiết bị ở /v1 — để `bleDangNoi(id)` chọn đường.
   * Gọi NGAY trong cú bấm, đừng `await` gì trước: Chrome đòi `requestDevice` nằm trong cú bấm.
   */
  async noi(serial: string, biMat: Uint8Array, deviceId = serial): Promise<ThongTinMach> {
    bleClient.ngat();
    datTrangThai({ loai: "dangNoi", deviceId });
    let may: MayBle | null = null;
    let kenh: KenhBle | null = null;
    try {
      may = await chonMay(serial);
      const gatt = await may.gatt!.connect();
      const sv = await gatt.getPrimaryService(BLE_SERVICE);
      const [info, cmd, resp, state] = await Promise.all(
        (["info", "cmd", "resp", "state"] as const).map(k => sv.getCharacteristic(DAC_TINH[k])),
      );
      const k = new KenhBle(thu => cmd.writeValueWithoutResponse(new TextEncoder().encode(JSON.stringify(thu))));
      kenh = k;
      // Nghe `resp` TRƯỚC mọi thứ khác: mạch đẩy nonce ngay khi nối.
      const choNonce = k.choThu(t => t.op === "nonce", BAT_TAY_MS);
      resp.addEventListener("characteristicvaluechanged", e => k.nhan(giaiMa((e.target as DacTinh).value)));
      await resp.startNotifications();
      // Đứt lúc còn bắt tay (mạch ngắt khi chữ ký sai) thì chỉ cần làm hỏng các lời hứa đang chờ.
      const mayNay = may;
      mayNay.addEventListener("gattserverdisconnected", () => { if (ketNoi?.may === mayNay) khiDut(mayNay); else k.dut(); });

      const tt = JSON.parse(giaiMa(await info.readValue())) as ThongTinMach;
      if (tt.serial !== serial) throw new BleLoi("sai_may");

      await batTay(k, biMat, choNonce);

      state.addEventListener("characteristicvaluechanged", e => {
        try {
          const thu = JSON.parse(giaiMa((e.target as DacTinh).value)) as { seq?: number; v?: Record<string, unknown> };
          for (const [key, gt] of Object.entries(thu.v ?? {})) ngheTrangThai.forEach(f => f(key, gt, Number(thu.seq ?? 0)));
        } catch { /* gói hỏng: bỏ, gói sau chở giá trị mới */ }
      });
      await state.startNotifications().catch(() => undefined);

      ketNoi = { may, kenh: k, nguoiDungNgat: false };
      datTrangThai({ loai: "daNoi", deviceId, info: tt });
      return tt;
    } catch (e) {
      kenh?.dut();
      if (may?.gatt?.connected) may.gatt.disconnect();
      datTrangThai({ loai: "nghi" });
      throw doiLoi(e);
    }
  },

  /** Cùng chữ ký với `IotxClient.rpc`. `khoa` (Idempotency-Key) nằm trong THÂN — BLE không có header. */
  async rpc(id: string, method: string, params: Record<string, unknown>, idempotencyKey = khoaMotLan()): Promise<{ ok: boolean }> {
    if (!ketNoi || !bleDangNoi(id)) throw new BleLoi("chua_noi");
    try {
      await ketNoi.kenh.hoi({ op: "rpc", khoa: idempotencyKey, method, params });
      return { ok: true };
    } catch (e) { throw doiLoi(e); }
  },

  /** Trạng thái đầy đủ (`op:"state"`, `ac_1` về 2 mảnh). Thiếu mảnh quá 5 giây: bỏ cả khối, xin lại một lần. */
  async xinTrangThai(): Promise<Record<string, unknown>> {
    if (!ketNoi) throw new BleLoi("chua_noi");
    const xin = () => ketNoi!.kenh.hoi({ op: "state", offset: 0 });
    const tl = await xin().catch(e => {
      if (e instanceof LoiKenh && e.ma === "thieu_manh" && ketNoi) return xin();
      throw e;
    }).catch(e => { throw doiLoi(e); });
    return (tl.v as Record<string, unknown>) ?? {};
  },

  /** Người dùng bấm Ngắt: về trạng thái nghỉ, không hiện băng vàng. */
  ngat() {
    const kn = ketNoi;
    ketNoi = null;
    if (kn) { kn.nguoiDungNgat = true; kn.kenh.dut(); if (kn.may.gatt?.connected) kn.may.gatt.disconnect(); }
    if (trangThai.loai !== "nghi") datTrangThai({ loai: "nghi" });
  },

  khiTrangThaiDoi(cb: (key: string, gt: unknown, seq: number) => void): () => void {
    ngheTrangThai.add(cb);
    return () => { ngheTrangThai.delete(cb); };
  },

  khiNgat(cb: () => void): () => void {
    ngheNgat.add(cb);
    return () => { ngheNgat.delete(cb); };
  },
};

/** Đứt sóng giữa chừng: lệnh đang treo hỏng ngay, đường lệnh tự quay về /v1, giao diện báo vàng. */
function khiDut(may: MayBle) {
  if (!ketNoi || ketNoi.may !== may || ketNoi.nguoiDungNgat) return;
  const deviceId = trangThai.loai === "daNoi" ? trangThai.deviceId : null;
  ketNoi.kenh.dut();
  ketNoi = null;
  datTrangThai(deviceId ? { loai: "mat", deviceId } : { loai: "nghi" });
  ngheNgat.forEach(f => f());
}

/**
 * Phiên kết thúc (đăng xuất, hết hạn): ngắt BLE. Bí mật trên tem thì giữ (thuộc về cái máy),
 * nhưng kết nối đang mở thuộc về phiên — người đăng nhập kế tiếp không được thừa hưởng nó.
 */
if (typeof window !== "undefined") iotxClient.onHetPhien(() => bleClient.ngat());

/** Bỏ băng vàng / về nghỉ. */
export function boBaoBle() {
  if (trangThai.loai === "mat") datTrangThai({ loai: "nghi" });
}

/**
 * Lớp chọn đường cho lệnh điều khiển (LivotecApp `guiLenh`): thiết bị đang nối BLE thì đi BLE,
 * còn lại đi /v1. BLE đứt hoặc không trả lời giữa lệnh thì gửi lại qua /v1 với CÙNG khoá — mạch
 * nhớ 16 khoá gần nhất (hợp đồng 5.2) nên lệnh đã chạy qua BLE không chạy lần hai.
 */
export async function rpcTheoDuong(id: string, method: string, params: Record<string, unknown>): Promise<{ ok: boolean }> {
  if (!bleDangNoi(id)) return iotxClient.rpc(id, method, params);
  const khoa = khoaMotLan();
  try { return await bleClient.rpc(id, method, params, khoa); }
  catch (e) {
    if (e instanceof BleLoi && (e.ma === "ngat" || e.ma === "het_gio" || e.ma === "chua_noi")) return iotxClient.rpc(id, method, params, khoa);
    throw e;
  }
}
