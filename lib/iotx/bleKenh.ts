/**
 * Tầng hỏi–đáp trên hai characteristic `cmd` (ghi) / `resp` (notify) — docs/yeu-cau-firmware-ble.md
 * mục 2. Tách khỏi `ble.ts` và KHÔNG import gì: không đụng Web Bluetooth, nên thử được bằng một
 * hàm `gui` giả (tests/ble-kenh.mjs) mà không cần mạch.
 *
 * BLE không có khái niệm "trả lời": mỗi yêu cầu mang một `id` tăng dần, mạch trả lại nguyên `id`
 * trong `resp`, ở đây tra `Map<id, …>` để giải đúng lời hứa.
 */

export type ThuTraLoi = { id?: number; ok?: boolean; loi?: string; op?: string; [k: string]: unknown };

/** Lỗi của tầng kênh; `ble.ts` đổi sang lỗi có câu cho người dùng. */
export class LoiKenh extends Error {
  constructor(public ma: "het_gio" | "thieu_manh" | "ngat" | "tu_choi" | "hong_json", public chiTiet?: string) {
    super(chiTiet ? `${ma}: ${chiTiet}` : ma);
    this.name = "LoiKenh";
  }
}

type DangCho = {
  giai: (t: ThuTraLoi) => void;
  tuChoi: (e: unknown) => void;
  hen: ReturnType<typeof setTimeout>;
  /** Yêu cầu trả theo mảnh (`op:"state"`): payload từng mảnh theo `manh`. */
  manh?: string[];
  thoiGian: number;
};

export const HOI_DAP_MS = 5_000;

export class KenhBle {
  private soId = 0;
  private readonly dangCho = new Map<number, DangCho>();
  /** Thư không có `id` (nonce, kết quả bắt tay) — ai đang chờ thì nhận. */
  private choThuLe: { nhan: (t: ThuTraLoi) => void; tuChoi: (e: unknown) => void } | null = null;

  constructor(private readonly gui: (thu: Record<string, unknown>) => Promise<void>) {}

  /** Một gói `resp` vừa tới (chuỗi JSON). */
  nhan(text: string) {
    let thu: ThuTraLoi;
    try { thu = JSON.parse(text) as ThuTraLoi; } catch { return; }
    if (typeof thu.id !== "number") { this.choThuLe?.nhan(thu); return; }
    const cho = this.dangCho.get(thu.id);
    if (!cho) return;   // về muộn sau khi đã quá giờ: bỏ
    if (thu.ok === false) { this.xong(thu.id); cho.tuChoi(new LoiKenh("tu_choi", thu.loi)); return; }
    if (typeof thu.manh !== "number") { this.xong(thu.id); cho.giai(thu); return; }

    // Ghép mảnh: nối `payload` theo `manh` tới khi `cuoi`. Mỗi mảnh tới là gia hạn thêm một
    // khoảng chờ — "thiếu mảnh quá 5 giây" tính từ mảnh gần nhất, không phải từ lúc hỏi.
    cho.manh ??= [];
    cho.manh[thu.manh] = String(thu.payload ?? "");
    clearTimeout(cho.hen);
    cho.hen = setTimeout(() => { this.xong(thu.id!); cho.tuChoi(new LoiKenh("thieu_manh")); }, cho.thoiGian);
    if (thu.cuoi !== true) return;
    // `Array.from` biến ô trống thành undefined — `every` trên mảng thưa bỏ qua ô trống, sẽ lọt.
    const du = cho.manh.length === thu.manh + 1 && Array.from(cho.manh).every(x => typeof x === "string");
    this.xong(thu.id);
    if (!du) { cho.tuChoi(new LoiKenh("thieu_manh")); return; }
    try { cho.giai({ id: thu.id, ok: true, ...JSON.parse(cho.manh.join("")) }); }
    catch { cho.tuChoi(new LoiKenh("hong_json")); }
  }

  /** Gửi một thư không chờ trả lời theo `id` (bắt tay `op:"auth"`). */
  guiThu(thu: Record<string, unknown>): Promise<void> {
    return this.gui(thu);
  }

  /** Gửi một yêu cầu có `id`, chờ đúng thư trả lời. */
  hoi(yeuCau: Record<string, unknown>, thoiGian = HOI_DAP_MS): Promise<ThuTraLoi> {
    const id = ++this.soId;
    return new Promise((giai, tuChoi) => {
      const hen = setTimeout(() => { this.xong(id); tuChoi(new LoiKenh("het_gio")); }, thoiGian);
      this.dangCho.set(id, { giai, tuChoi, hen, thoiGian });
      this.gui({ ...yeuCau, id }).catch(e => { this.xong(id); tuChoi(e); });
    });
  }

  /** Chờ thư KHÔNG có `id` thoả `dk` (nonce, kết quả bắt tay). */
  choThu(dk: (t: ThuTraLoi) => boolean, thoiGian: number): Promise<ThuTraLoi> {
    return new Promise((giai, tuChoi) => {
      const hen = setTimeout(() => { this.choThuLe = null; tuChoi(new LoiKenh("het_gio")); }, thoiGian);
      this.choThuLe = {
        nhan: t => { if (!dk(t)) return; clearTimeout(hen); this.choThuLe = null; giai(t); },
        tuChoi: e => { clearTimeout(hen); this.choThuLe = null; tuChoi(e); },
      };
    });
  }

  /** Đường truyền đứt: mọi lời hứa đang treo hỏng ngay, đừng để ai chờ 5 giây vô ích. */
  dut() {
    for (const [id, cho] of this.dangCho) { this.xong(id); cho.tuChoi(new LoiKenh("ngat")); }
    this.choThuLe?.tuChoi(new LoiKenh("ngat"));
  }

  private xong(id: number) {
    const cho = this.dangCho.get(id);
    if (cho) clearTimeout(cho.hen);
    this.dangCho.delete(id);
  }
}

/** Bí mật trên tem → 16 byte. Nhận hex 32 ký tự, base64/base64url, hoặc JSON có `biMat`/`k`. */
export function docBiMatTem(text: string): Uint8Array | null {
  let s = text.trim();
  try {
    const j = JSON.parse(s) as Record<string, unknown>;
    if (j && typeof j === "object") s = String(j.biMat ?? j.k ?? j.secret ?? "");
  } catch { /* không phải JSON */ }
  if (/^[0-9a-f]{32}$/i.test(s)) return Uint8Array.from(s.match(/../g)!.map(h => parseInt(h, 16)));
  try {
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
    if (b.length === 16) return Uint8Array.from(b, c => c.charCodeAt(0));
  } catch { /* không phải base64 */ }
  return null;
}

export function base64(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b));
}

export function tuBase64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
