"use client";

import { useCallback, useRef, useState } from "react";
import {
  boChuRong, docI18n, docNgonNguDaChon, docTheme, ghiI18n, ghiNgonNguDaChon, ghiTheme, iotxClient, isIotxMode, iotxConfig,
} from "@/lib/iotx";
import type { BoChu } from "@/lib/iotx";
import type { IotxTheme } from "@/lib/iotx/contracts";
import { apDungTheme } from "@/lib/newui/theme";

/**
 * Ngôn ngữ đang chọn, bảng chữ `/i18n` và theme của hãng. Cả hai cửa đều công khai và có
 * nhãn phiên bản trong `/bootstrap`: khớp nhãn thì dùng bản đang giữ, không tải lại.
 */
export function useBoChuVaTheme() {
  const [boChu, setBoChu] = useState<BoChu>(boChuRong);
  const [theme, setTheme] = useState<IotxTheme | null>(null);
  const [lang, setLang] = useState(iotxConfig.lang);
  /** Bản đọc được từ callback đồng bộ mà không phải đưa `lang` vào phụ thuộc của chúng. */
  const langRef = useRef(iotxConfig.lang);

  const taiBoChu = useCallback(async (ma: string, nhan?: string) => {
    const dangGiu = docI18n(ma, nhan);
    if (dangGiu) {
      setBoChu(dangGiu);
      if (nhan !== undefined) return;
    }
    // Chế độ mock không có máy chủ nào để hỏi: gọi `/i18n` chỉ tạo một request 403/404 vô
    // nghĩa trong console. Bảng chữ trong mã đã đủ cho cả ba ngôn ngữ.
    if (!isIotxMode) return;
    try {
      const moi = await iotxClient.i18n(ma);
      ghiI18n(ma, nhan, moi);
      // Người dùng đã bấm sang ngôn ngữ khác trong lúc chờ: bản này về muộn, không được thắng.
      if (ma !== langRef.current) return;
      setBoChu(moi);
    } catch { /* mất mạng: giữ bản đang có, app vẫn chạy bằng bảng chữ trong mã */ }
  }, []);

  /**
   * Theme của hãng. Cửa này công khai nên gọi được từ trước đăng nhập — màn chào có đúng
   * màu và logo ngay. Sau `/bootstrap` thì so nhãn `phienBan.theme`: khớp thì thôi tải lại.
   */
  const taiTheme = useCallback(async (nhan?: string) => {
    const dangGiu = docTheme(nhan);
    if (dangGiu) {
      setTheme(dangGiu);
      apDungTheme(dangGiu);
      if (nhan !== undefined) return;
    }
    if (!isIotxMode) return;
    try {
      const moi = await iotxClient.theme();
      ghiTheme(nhan, moi);
      setTheme(moi);
      apDungTheme(moi);
    } catch { /* mất mạng: giữ bảng màu trong CSS */ }
  }, []);

  const datNgonNgu = useCallback((ma: string) => {
    setLang(ma);
    langRef.current = ma;
  }, []);

  const doiNgonNgu = useCallback((ma: string) => {
    datNgonNgu(ma);
    ghiNgonNguDaChon(ma);
    void taiBoChu(ma);
  }, [datNgonNgu, taiBoChu]);

  /** Lúc mở app: ngôn ngữ người dùng đã chọn lần trước, rồi bảng chữ và theme theo nó. */
  const khoiDong = useCallback(() => {
    const ngonNgu = docNgonNguDaChon();
    datNgonNgu(ngonNgu);
    void taiBoChu(ngonNgu);
    void taiTheme();
  }, [datNgonNgu, taiBoChu, taiTheme]);

  /** Sau `/bootstrap`: tải lại những gì có nhãn phiên bản mới. */
  const theoPhienBan = useCallback((phienBan?: { i18n?: string; theme?: string }) => {
    void taiBoChu(langRef.current, phienBan?.i18n);
    void taiTheme(phienBan?.theme);
  }, [taiBoChu, taiTheme]);

  /** Ngôn ngữ đang chọn, đọc được từ callback mà không phải đưa `lang` vào phụ thuộc. */
  const langHienTai = useCallback(() => langRef.current, []);

  return { boChu, theme, lang, doiNgonNgu, khoiDong, theoPhienBan, langHienTai };
}
