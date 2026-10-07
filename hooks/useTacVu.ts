"use client";

import { useCallback, useState } from "react";
import { moTaLoi } from "@/lib/iotx";

/**
 * Trạng thái của một thao tác gọi máy chủ: đang bận và câu lỗi. `chay` xoá lỗi cũ, bật cờ
 * bận, chạy việc, rồi trả `true` nếu thành công — để nơi gọi tự quyết có đóng ô sửa hay không.
 */
export function useTacVu() {
  const [loi, setLoi] = useState("");
  const [dangLam, setDangLam] = useState(false);

  const chay = useCallback(async (viec: () => Promise<unknown>) => {
    setLoi(""); setDangLam(true);
    try { await viec(); return true; }
    catch (error) { setLoi(moTaLoi(error)); return false; }
    finally { setDangLam(false); }
  }, []);

  return { loi, setLoi, dangLam, chay };
}
