"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { BoChu } from "@/lib/iotx";
import { CHU, laMaNgonNgu, type MaNgonNgu } from "@/lib/newui/strings";

export type HamChu = (khoa: string, thamSo?: Record<string, string | number>) => string;

const NguCanh = createContext<{ t: HamChu; lang: string }>({
  t: khoa => CHU.vi[khoa] ?? khoa,
  lang: "vi",
});

function thay(chuoi: string, thamSo?: Record<string, string | number>) {
  if (!thamSo) return chuoi;
  let ketQua = chuoi;
  for (const [ten, giaTri] of Object.entries(thamSo)) {
    ketQua = ketQua.split(`{${ten}}`).join(String(giaTri));
  }
  return ketQua;
}

/**
 * Thứ tự tra chữ: máy chủ `/i18n` → bảng chữ trong mã theo đúng ngôn ngữ đang chọn →
 * bảng tiếng Việt → chính khóa. Máy chủ đi trước để hãng đổi chữ được mà không build lại;
 * bảng trong mã đi sau để màn hình không bao giờ trống chữ.
 */
export function ChuProvider({ lang, boChu, children }: { lang: string; boChu: BoChu; children: ReactNode }) {
  const giaTri = useMemo(() => {
    const ma: MaNgonNgu = laMaNgonNgu(lang) ? lang : "vi";
    const t: HamChu = (khoa, thamSo) => thay(boChu.strings[khoa] ?? CHU[ma][khoa] ?? CHU.vi[khoa] ?? khoa, thamSo);
    return { t, lang: ma };
  }, [lang, boChu]);
  return <NguCanh.Provider value={giaTri}>{children}</NguCanh.Provider>;
}

export function useChu() {
  return useContext(NguCanh);
}
