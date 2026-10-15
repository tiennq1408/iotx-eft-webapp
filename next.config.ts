import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Gói sẵn server và đúng phần node_modules cần thiết: ảnh Docker nhỏ hơn nhiều và
  // tầng runner không phải cài lại phụ thuộc lần hai.
  output: "standalone",
  // Không khai rewrites() cho /v1 ở đây: hàm đó chạy lúc build nên địa chỉ IBS sẽ bị
  // nướng vào ảnh. Proxy nằm ở app/v1/[...path]/route.ts và đọc biến môi trường mỗi request.

  // `next dev` chỉ phục vụ bó mã `/_next/*` cho origin `localhost`; mọi origin khác bị trả
  // thẳng 403. Trang chủ vẫn dựng được từ máy chủ nên người dùng THẤY màn "Đang khởi động",
  // nhưng JS không tải nổi, React không hydrate, và nó đứng ở đó mãi — mở bằng IP LAN trên
  // điện thoại hay qua tunnel đều dính. Khai các origin đó ở đây để mở app dev từ máy khác.
  //
  // Chỉ có tác dụng lúc `next dev`. Bản dựng (`next build` + `next start`) KHÔNG kiểm tra
  // này, nên link gửi cho người ngoài thì chạy bản dựng chứ đừng mở cổng dev ra ngoài:
  // chế độ dev chậm, kèm source map và bộ gỡ lỗi.
  //
  // Mẫu khớp theo từng đoạn ngăn bởi dấu chấm: `*` ăn một đoạn, nên `192.168.*.*` phủ cả
  // dải LAN dù DHCP có đổi số, và `*.trycloudflare.com` phủ mọi lần dựng tunnel mới.
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    // Dải riêng 172.16.0.0/12. Mẫu khớp theo từng đoạn nên `172.*.*.*` sẽ mở nhầm cả
    // 172.0–15 và 172.32–255 vốn là địa chỉ công cộng; liệt kê đủ 16 dải con.
    "172.16.*.*", "172.17.*.*", "172.18.*.*", "172.19.*.*",
    "172.20.*.*", "172.21.*.*", "172.22.*.*", "172.23.*.*",
    "172.24.*.*", "172.25.*.*", "172.26.*.*", "172.27.*.*",
    "172.28.*.*", "172.29.*.*", "172.30.*.*", "172.31.*.*",
    "*.trycloudflare.com",
    "*.ngrok-free.app",
  ],
};

export default nextConfig;
