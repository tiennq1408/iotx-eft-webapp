import type { Metadata, Viewport } from "next";
import { preload } from "react-dom";
import DangKySW from "@/components/DangKySW";
import "./globals.css";

export const metadata: Metadata = {
  title: "Livotec Home",
  description: "Điều khiển ngôi nhà thông minh Livotec",
  // Next phục vụ app/manifest.ts ở đây nhưng KHÔNG tự chèn <link rel="manifest"> — thiếu dòng
  // này là Chrome im lặng không cho cài (docs/viec-pwa.md 2.2b).
  manifest: "/manifest.webmanifest",
  // "Thêm vào Màn hình chính" trên iPhone: chạy như app, thanh trạng thái TRONG SUỐT để nền vẽ lên
  // dưới tai thỏ. Nội dung tự lùi xuống bằng env(safe-area-inset-top) trong globals.css.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Livotec Home" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Màu khởi đầu = mép trên màn đăng nhập; sau khi chạy, LivotecApp đổi theo màn (lib/ui/mauDinh.ts).
  themeColor: "#fadcbe",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Không có @font-face nào nằm trong HTML, nên trình duyệt chỉ biết cần phông sau khi tải và
  // đọc xong CSS. Nạp sớm hai tệp hay dùng nhất cho tải song song, bớt một nhịp chữ nhảy cỡ.
  // Dùng `preload` của react-dom (Next khuyên vậy): viết tay `<link>` thì React kéo lên
  // <head> một bản và giữ thêm bản gốc, mỗi tệp bị khai hai lần.
  for (const tep of ["carlito-latin-400-normal", "carlito-vietnamese-400-normal"]) {
    preload(`/fonts/${tep}.woff2`, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        {children}
        <DangKySW />
      </body>
    </html>
  );
}
