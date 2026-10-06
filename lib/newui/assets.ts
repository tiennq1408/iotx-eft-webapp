/**
 * Ảnh của prototype được bóc khỏi HTML (bản gốc nhúng ~1,3MB base64 vào mã chạy) và để
 * trong `public/images/livotec/`. Nhờ vậy bundle JS không phình và trình duyệt cache được
 * từng ảnh.
 */
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
 * Ảnh sản phẩm CHỈ đến từ catalog (`product.ui.image` — URL, data URI hoặc emoji).
 *
 * Bản trước còn ba bảng cắm cứng (`HERO`, `PRODUCT_PHOTOS`, `MODEL_PHOTOS`) tra theo
 * renderer và mã model. Đã bỏ hẳn: ảnh mà app tự gắn cho một sản phẩm không phải dữ liệu
 * của sản phẩm đó, và nó che mất việc catalog đang thiếu `ui.image`. Catalog không gửi ảnh
 * thì màn không vẽ ảnh — thấy thiếu là biết ngay phải bổ sung ở đâu.
 *
 * Các tệp ảnh cũ vẫn nằm trong `public/images/livotec/` để bên máy chủ dùng làm nguồn nạp
 * vào catalog; app không tham chiếu tới chúng nữa.
 */
export function anhSanPham(product?: { ui?: { image?: string } | null } | null): string | null {
  const anh = product?.ui?.image?.trim();
  if (!anh) return null;
  // Emoji hay chuỗi ngắn không phải đường dẫn — nơi gọi tự quyết vẽ chữ to thay vì <img>.
  return /^(https?:|data:|\/)/i.test(anh) ? anh : null;
}
