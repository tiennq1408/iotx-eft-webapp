/**
 * Ảnh của prototype được bóc khỏi HTML (bản gốc nhúng ~1,3MB base64 vào mã chạy) và để
 * trong `public/images/livotec/`. Nhờ vậy bundle JS không phình và trình duyệt cache được
 * từng ảnh.
 */
import { iotxConfig } from "@/lib/iotx/config";

const BASE = "/images/livotec";

export const IMG = {
  avatar: `${BASE}/avatar.png`,
  logoIcon: `${BASE}/logo-icon.png`,
  logoWordmark: `${BASE}/logo-wordmark.png`,
  bannerAircon: `${BASE}/banner-aircon.jpg`,
  bannerCooktop: `${BASE}/banner-cooktop.jpg`,
  promoAircon: `${BASE}/promo-aircon.jpg`,
  promoWaterHeater: `${BASE}/promo-wh.jpg`,
  flagVi: `${BASE}/flag-vn.png`,
  flagEn: `${BASE}/flag-uk.png`,
  flagFil: `${BASE}/flag-ph.png`,
  navHouse: `${BASE}/nav-house.png`,
  navCpu: `${BASE}/nav-cpu.png`,
  navBrain: `${BASE}/nav-brain.png`,
  navHeadset: `${BASE}/nav-headset.png`,
  navGlobe: `${BASE}/nav-globe.png`,
} as const;

/**
 * Ảnh đại diện của sản phẩm, do catalog quyết.
 *
 * Đo trên DEV 06/10: máy chủ để ảnh ở `product.icon` — CÙNG một trường vừa có thể là
 * emoji ("❄️", "🌀") vừa có thể là URL ảnh thật (sản phẩm nào đã tải ảnh lên sadmin).
 * `ui.image` thì rỗng ở mọi sản phẩm. Vì vậy phải phân loại theo NỘI DUNG chứ không theo
 * tên trường, nếu không màn hình in nguyên cái URL ra thay cho ảnh.
 *
 * Trả về một trong hai dạng để nơi gọi biết phải vẽ `<img>` hay vẽ chữ — không để nơi gọi
 * tự đoán, vì đoán sai một lần là cả ba màn cùng sai.
 */
export type AnhDaiDien = { kieu: "anh"; src: string } | { kieu: "chu"; chu: string };

const LA_DUONG_DAN = /^(https?:|data:image|\/)/i;

/** Chuỗi là địa chỉ ảnh (http, data: hay đường dẫn tuyệt đối), không phải emoji/chữ. */
export const laDuongDan = (v: string) => LA_DUONG_DAN.test(v);

export function anhDaiDienSanPham(
  product?: { icon?: string; ui?: { image?: string | null } | null } | null,
): AnhDaiDien {
  for (const ungVien of [product?.ui?.image, product?.icon]) {
    const v = ungVien?.trim();
    if (v && LA_DUONG_DAN.test(v)) return { kieu: "anh", src: v };
  }
  const bt = product?.icon?.trim();
  return { kieu: "chu", chu: bt && !LA_DUONG_DAN.test(bt) ? bt : "\u{1F4E6}" };
}

/**
 * Icon do catalog chỉ định, dùng trong `gtIco` của lưới `ui.boCuc`.
 *
 * Ba dạng sadmin có thể trả, phân loại theo NỘI DUNG chứ không theo trường:
 *   "❄️"             — emoji, vẽ thẳng ra chữ
 *   "https://…" "/…" — địa chỉ ảnh, vẽ bằng <img>
 *   "@wind"          — tham chiếu KHO ICON của sadmin → `/v1/icons/wind`
 *
 * Dạng `@` là cái webapp từng bỏ qua hoàn toàn, nên chuyển sang kho icon là mọi nút chọn
 * mất sạch biểu tượng. Kho trả SVG hoặc PNG tuỳ icon, không cần đăng nhập.
 *
 * Tên chỉ nhận chữ–số–gạch: giá trị này đến từ máy chủ, đừng để nó bẻ được đường dẫn.
 */
const TEN_ICON = /^[a-z0-9][a-z0-9_-]*$/i;

export function diaChiIcon(ico?: string): string | null {
  const v = ico?.trim();
  if (!v) return null;
  if (!v.startsWith("@")) return v;
  const ten = v.slice(1);
  return TEN_ICON.test(ten) ? `${iotxConfig.apiBase}/icons/${encodeURIComponent(ten)}` : null;
}
