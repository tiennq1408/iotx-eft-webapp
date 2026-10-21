"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { BoChu } from "@/lib/iotx";
import { CHU, laMaNgonNgu, type MaNgonNgu } from "@/lib/ui/strings";
import { KHOA_MAY_CHU } from "@/lib/ui/khoaMayChu";

export type HamChu = (khoa: string, thamSo?: Record<string, string | number>) => string;

const NguCanh = createContext<{ t: HamChu }>({
  t: khoa => CHU.vi[khoa] ?? khoa,
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
 * Chữ máy chủ dùng được: có, không rỗng, và không phải chính cái khoá (máy chủ có ánh xạ
 * `cap.power → "cap.power"` — hiện ra là người dùng thấy khoá kỹ thuật).
 */
function chuMayChu(strings: Record<string, string>, khoa: string | undefined): string | undefined {
  if (!khoa) return undefined;
  const v = strings[khoa];
  return typeof v === "string" && v.trim() !== "" && v !== khoa ? v : undefined;
}

/**
 * Thứ tự tra chữ — chữ MÁY CHỦ là nguồn chính, như web.dev (21/10/2026):
 *   1. máy chủ `/i18n`, theo khoá máy chủ tương ứng (`KHOA_MAY_CHU`) rồi theo chính tên khoá;
 *   2. bảng chữ trong mã theo đúng ngôn ngữ đang chọn;
 *   3. bảng tiếng Việt; 4. chính khoá.
 * Sửa chữ trên sadmin là app đổi theo, không build lại; bảng trong mã đi sau để màn hình không
 * bao giờ trống chữ khi máy chủ chưa có câu đó (hoặc chưa dịch sang ngôn ngữ đang chọn).
 */
export function ChuProvider({ lang, boChu, children }: { lang: string; boChu: BoChu; children: ReactNode }) {
  const giaTri = useMemo(() => {
    const ma: MaNgonNgu = laMaNgonNgu(lang) ? lang : "vi";
    const s = boChu.strings;
    const t: HamChu = (khoa, thamSo) =>
      thay(chuMayChu(s, KHOA_MAY_CHU[khoa]) ?? chuMayChu(s, khoa) ?? CHU[ma][khoa] ?? CHU.vi[khoa] ?? khoa, thamSo);
    return { t };
  }, [lang, boChu]);
  return <NguCanh.Provider value={giaTri}>{children}</NguCanh.Provider>;
}

export function useChu() {
  return useContext(NguCanh);
}
