import { laBat } from "@/lib/iotx/giaTri";
import type { IotxCapability } from "@/lib/iotx/contracts";

/**
 * `product.ui.khongDung` — "đang thế này thì không dùng được thế kia" (web.dev 23/10/2026).
 *
 *   { ac_power_status: { off: ["ac_eco_mode", "ac_fan_speed:Mid", …] },
 *     ac_ope_mode:     { Dry: ["ac_eco_mode", "ac_fan_speed:High", …] } }
 *
 * Khoá ngoài: capability nguồn (`onoff` hoặc `enum`). Khoá trong: giá trị của nó — `"on"`/`"off"`
 * với onoff, giá trị gốc với enum. Danh sách đích: `"cap"` khoá cả ô, `"cap:giaTri"` chỉ khoá một
 * giá trị enum, `"*"` khoá mọi capability. Nguồn không bao giờ tự khoá chính nó.
 *
 * Chỉ là gợi ý giao diện để người dùng khỏi bấm vào chỗ máy không nhận — luật thật vẫn ở thiết bị.
 * Khoá KHÔNG đổi giá trị: không bao giờ tự gửi lệnh tắt khối bị khoá. Đặc tả phía sadmin:
 * docs/dac-ta-ma-tran-khong-dung-chung.md.
 */
export type KhongDung = Record<string, Record<string, unknown>>;

export const KD_TAT_CA = "*";

function tachDich(dich: string): [string, string | null] {
  const i = dich.indexOf(":");
  return i < 0 ? [dich, null] : [dich.slice(0, i), dich.slice(i + 1)];
}

/**
 * Đích bị khoá ứng với giá trị hiện tại: `"cap"` hoặc `"cap:giaTri"`. Như `capBiKhoa` của web.dev,
 * thêm một chốt: `capNguon` (nút nguồn điện) không bao giờ bị khoá — đặc tả 5.1b bắt sadmin chặn
 * luật đó, nhưng lọt qua thì người dùng không tắt được máy, nên app chặn thêm lần nữa.
 */
export function capBiKhoa(kd: unknown, giaTri: Record<string, unknown> | undefined, caps: IotxCapability[], capNguon?: string): Set<string> {
  const khoa = new Set<string>();
  if (!kd || typeof kd !== "object" || Array.isArray(kd)) return khoa;
  const theoKhoa = new Map(caps.map(c => [c.key, c]));
  for (const [nguon, bang] of Object.entries(kd as KhongDung)) {
    const v = giaTri?.[nguon];
    if (v === undefined || v === null || v === "" || !bang || typeof bang !== "object") continue;
    const gt = theoKhoa.get(nguon)?.kind === "onoff" ? (laBat(v) ? "on" : "off") : String(v);
    const ds = (bang as Record<string, unknown>)[gt];
    if (!Array.isArray(ds)) continue;
    for (const dich of ds[0] === KD_TAT_CA ? [...theoKhoa.keys()] : ds.map(String)) {
      const dau = tachDich(dich)[0];
      if (dau !== nguon && dau !== capNguon) khoa.add(dich);
    }
  }
  return khoa;
}

export function biKhoaGt(khoa: Set<string>, cap: string, gt: unknown): boolean {
  return khoa.has(cap) || khoa.has(`${cap}:${String(gt)}`);
}

/** Cả ô bị khoá: khoá thẳng tên, hoặc enum mà MỌI giá trị đều bị khoá. */
export function biKhoaO(khoa: Set<string>, cap: IotxCapability): boolean {
  if (khoa.has(cap.key)) return true;
  const ds = cap.kind === "enum" ? cap.values ?? [] : [];
  return ds.length > 0 && ds.every(gt => biKhoaGt(khoa, cap.key, gt));
}
