import type { Device } from "@/lib/types";
import { apGiaTri } from "./mappers";

/**
 * Giá trị vừa bấm được giữ tạm cho tới khi máy chủ báo lại đúng nó.
 *
 * Nhịp hỏi lại có thể về TRƯỚC khi mạch kịp báo giá trị mới. Cứ thế ghi đè thì người dùng
 * bấm công tắc, thấy nó bật, rồi một giây sau tự tắt — tệ hơn hẳn bệnh đang chữa. Trong
 * cửa sổ này giá trị vừa bấm thắng; quá hạn thì nhường, vì khi đó máy chủ mới là bên nói
 * đúng (lệnh có thể đã trượt mà không ai báo).
 */
const CHO_PHAN_HOI_MS = 6_000;

type MucCho = { gt: unknown; hetHan: number };

/** Sổ lệnh đang chờ máy chủ xác nhận: thiết bị → capability → giá trị vừa đặt. */
export class SoLenhCho {
  private readonly so = new Map<string, Map<string, MucCho>>();

  ghi(deviceId: string, key: string, gt: unknown) {
    let theoMay = this.so.get(deviceId);
    if (!theoMay) this.so.set(deviceId, theoMay = new Map());
    theoMay.set(key, { gt, hetHan: Date.now() + CHO_PHAN_HOI_MS });
  }

  /** Lệnh trượt, hoặc máy chủ đã nói — thôi giữ, để dữ liệu hỏi về được quyền sửa lại. */
  bo(deviceId: string, key: string) {
    const theoMay = this.so.get(deviceId);
    theoMay?.delete(key);
    if (theoMay?.size === 0) this.so.delete(deviceId);
  }

  /** Dán lại những giá trị vừa bấm mà máy chủ chưa kịp xác nhận, lên dữ liệu vừa hỏi về. */
  apLen(device: Device): Device {
    const theoMay = this.so.get(device.id);
    if (!theoMay) return device;
    const bay = Date.now();
    const goc = device.lastValues ?? {};
    const giu: Record<string, unknown> = {};
    for (const [key, muc] of theoMay) {
      // Hết hạn, hoặc máy chủ đã trả về đúng giá trị đó — không cần giữ nữa.
      if (muc.hetHan <= bay || String(goc[key] ?? "") === String(muc.gt ?? "")) {
        this.bo(device.id, key);
        continue;
      }
      giu[key] = muc.gt;
    }
    return Object.keys(giu).length ? apGiaTri(device, giu) : device;
  }
}
