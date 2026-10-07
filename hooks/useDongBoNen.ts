"use client";

import { useEffect } from "react";
import { iotxClient, isIotxMode, laHetPhien } from "@/lib/iotx";
import type { IotxStreamEvent } from "@/lib/iotx/contracts";

/**
 * Nhịp hỏi lại trạng thái.
 *
 * SSE là đường nhanh nhưng KHÔNG đủ làm nguồn sự thật. Hợp đồng nói rõ luồng không phát
 * lại sự kiện đã lỡ, nên mỗi lần nối lại — token hết hạn, mạng chớp, máy ngủ — là một
 * khoảng trống không ai bù. Nặng hơn nữa: nếu mạch không nhả telemetry thì chẳng có sự
 * kiện nào để mà lỡ, và màn chi tiết đang mở sẽ đứng ở ảnh cũ vô thời hạn.
 *
 * Đo trên bản tham chiếu web.dev (07/10/2026): nó KHÔNG mở EventSource lần nào, không gọi
 * `/stream` lần nào, mà hỏi lại `/bootstrap` đúng mỗi 2,5 giây. Đó là toàn bộ lý do nó
 * luôn trông đúng. Ở đây giữ cả hai đường: SSE cho phản hồi tức thì, nhịp hỏi lại làm
 * lưới an toàn — hơn hẳn việc chỉ có một trong hai.
 */
const NHIP_XEM_KY_MS = 2_500;    // đang mở màn chi tiết: người dùng nhìn chằm chằm vào một máy
const NHIP_THUONG_MS = 10_000;   // đang ở danh sách: thưa hơn cho đỡ tốn

/**
 * Ba đường giữ dữ liệu thiết bị tươi khi đã đăng nhập ở chế độ IoTX: luồng SSE, đồng bộ
 * khi quay lại tab / có mạng lại, và nhịp hỏi định kỳ.
 */
export function useDongBoNen({ signedIn, xemKy, dongBoNhip, onSuKien, onHetPhien }: {
  signedIn: boolean;
  /** Đang mở màn chi tiết: hỏi dày hơn. */
  xemKy: boolean;
  dongBoNhip: () => Promise<void>;
  onSuKien: (event: IotxStreamEvent) => void;
  onHetPhien: () => void;
}) {
  useEffect(() => {
    if (!isIotxMode || !signedIn) return;
    const controller = new AbortController();
    void iotxClient.subscribe(onSuKien, {
      signal: controller.signal,
      onReconnect: () => { void dongBoNhip().catch(() => undefined); },
    }).catch(error => { if (laHetPhien(error)) onHetPhien(); });
    return () => controller.abort();
  }, [signedIn, dongBoNhip, onSuKien, onHetPhien]);

  /**
   * Đồng bộ lại khi người dùng quay lại tab, và khi máy có mạng trở lại.
   *
   * Luồng SSE không phát lại sự kiện đã lỡ (hợp đồng nói rõ: không hỗ trợ Last-Event-ID).
   * Mà trình duyệt thì bóp nghẹt tab chạy nền — đổi trạng thái ở một tab khác, hoặc ở
   * web quản trị, xong quay lại đây thì màn hình vẫn là ảnh cũ cho tới lần tải lại trang.
   * Chặn nhịp 2 giây để chuyển tab qua lại không thành một tràng request.
   */
  useEffect(() => {
    if (!isIotxMode || !signedIn) return;
    let lanCuoi = 0;
    const dongBoLai = () => {
      if (document.visibilityState !== "visible") return;
      const gio = Date.now();
      if (gio - lanCuoi < 2000) return;
      lanCuoi = gio;
      void dongBoNhip().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", dongBoLai);
    window.addEventListener("focus", dongBoLai);
    window.addEventListener("online", dongBoLai);
    return () => {
      document.removeEventListener("visibilitychange", dongBoLai);
      window.removeEventListener("focus", dongBoLai);
      window.removeEventListener("online", dongBoLai);
    };
  }, [signedIn, dongBoNhip]);

  /**
   * Nhịp hỏi lại — lưới an toàn cho SSE (xem chú thích ở đầu tệp).
   *
   * Hẹn giờ nối đuôi chứ không dùng setInterval: máy chủ trả chậm thì các request sẽ chồng
   * lên nhau thành một tràng, và càng chậm càng chồng dày.
   */
  useEffect(() => {
    if (!isIotxMode || !signedIn) return;
    let dungLai = false;
    let hen: ReturnType<typeof setTimeout>;
    const nhip = () => (xemKy ? NHIP_XEM_KY_MS : NHIP_THUONG_MS);
    const vong = async () => {
      if (dungLai) return;
      // Tab chạy nền thì không hỏi: trình duyệt bóp nghẹt hẹn giờ, và đã có lần đồng bộ
      // ngay khi người dùng quay lại (effect ở trên) lo phần đó rồi.
      if (document.visibilityState === "visible") await dongBoNhip().catch(() => undefined);
      if (dungLai) return;
      hen = setTimeout(vong, nhip());
    };
    hen = setTimeout(vong, nhip());
    return () => { dungLai = true; clearTimeout(hen); };
  }, [signedIn, dongBoNhip, xemKy]);
}
