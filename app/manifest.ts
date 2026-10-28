import type { MetadataRoute } from "next";

/**
 * Manifest cho PWA. Next phục vụ tệp này tại /manifest.webmanifest.
 *
 * NHƯNG nó KHÔNG tự chèn <link rel="manifest"> vào <head> — phải khai tay ở layout,
 * xem mục 2.2b. Thiếu thẻ đó là trình duyệt không bao giờ tìm thấy manifest.
 *
 * `id` đặt tường minh ngay từ đầu: mặc định nó lấy theo `start_url`, nên sau này đổi
 * `start_url` là máy coi như một app KHÁC — người dùng có hai biểu tượng.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Livotec Home",
    short_name: "Livotec",
    description: "Điều khiển ngôi nhà thông minh Livotec",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Nền màn chờ lúc mở app. Lấy mép trên màn đăng nhập, khớp `themeColor` ở layout.
    background_color: "#fadcbe",
    theme_color: "#fadcbe",
    orientation: "portrait",
    lang: "vi",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
