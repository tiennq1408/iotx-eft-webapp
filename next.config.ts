import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Gói sẵn server và đúng phần node_modules cần thiết: ảnh Docker nhỏ hơn nhiều và
  // tầng runner không phải cài lại phụ thuộc lần hai.
  output: "standalone",
  // Không khai rewrites() cho /v1 ở đây: hàm đó chạy lúc build nên địa chỉ IBS sẽ bị
  // nướng vào ảnh. Proxy nằm ở app/v1/[...path]/route.ts và đọc biến môi trường mỗi request.
};

export default nextConfig;
