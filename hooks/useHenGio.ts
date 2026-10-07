"use client";

import { useCallback, useEffect, useState } from "react";
import { iotxClient, isIotxMode, moTaLoi } from "@/lib/iotx";
import type { IotxHenGioTongQuan } from "@/lib/iotx/contracts";

/**
 * Tổng quan hẹn giờ của một thiết bị (`GET /devices/{id}/hen-gio`), dùng chung cho thanh
 * ghim trên màn chi tiết và cho màn hẹn giờ. Chế độ mock không có máy chủ nên không tải.
 */
export function useHenGio(deviceId: string) {
  const [tongQuan, setTongQuan] = useState<IotxHenGioTongQuan | null>(null);
  // Khởi tạo theo chế độ chạy: bản mock không gọi gì nên không có gì để "đang tải", và
  // nhờ vậy effect nạp lần đầu không phải setState đồng bộ.
  const [dangTai, setDangTai] = useState(isIotxMode);
  const [loi, setLoi] = useState("");

  const tai = useCallback(async () => {
    if (!isIotxMode) return;
    try {
      setTongQuan(await iotxClient.xemHenGio(deviceId));
      setLoi("");
    } catch (error) { setLoi(moTaLoi(error)); }
    finally { setDangTai(false); }
  }, [deviceId]);

  // Nạp lần đầu. Quy tắc set-state-in-effect nhắm vào setState ĐỒNG BỘ trong thân effect;
  // ở đây mọi setState đều nằm sau `await`, đúng kiểu "đăng ký nhận dữ liệu từ hệ ngoài".
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void tai(); }, [tai]);

  return { tongQuan, dangTai, loi, setLoi, tai };
}
