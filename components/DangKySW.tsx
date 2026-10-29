"use client";
import { useEffect } from "react";

/**
 * Chỉ đăng ký ở bản dựng thật. `next dev` thay bó mã liên tục, service worker giữ bản cũ
 * rồi phục vụ mã đã chết — mất hàng giờ mới nghĩ ra đó là thủ phạm.
 */
export default function DangKySW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => { /* không chặn app */ });
  }, []);
  return null;
}
