"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Tuỳ chọn hiển thị của MÁY NÀY — giao diện, cỡ chữ, chấm báo thông báo.
 *
 * `/v1` không có cửa lưu tuỳ chọn người dùng, nên giữ ở localStorage: đổi máy là về mặc định.
 * Đọc/ghi đều bọc try/catch — chế độ riêng tư hay chặn bộ nhớ thì app vẫn chạy với mặc định.
 */

export type GiaoDien = "sang" | "toi" | "heThong";
export type CoChu = "vua" | "lon" | "ratLon";

export type CaiDat = {
  giaoDien: GiaoDien;
  coChu: CoChu;
  /** Chấm đỏ và số chưa đọc trên nút chuông. Bản web chưa có thông báo đẩy (`/push` chỉ nhận android/ios). */
  thongBao: boolean;
};

export const CAI_DAT_MAC_DINH: CaiDat = { giaoDien: "sang", coChu: "vua", thongBao: true };

export const DS_GIAO_DIEN: GiaoDien[] = ["sang", "toi", "heThong"];
/**
 * Không có cỡ nhỏ hơn "vừa": thu nhỏ là kéo vùng chạm xuống dưới 44px. Cỡ lớn nhất dừng ở
 * 120% để khổ 320px không tràn ngang.
 */
export const DS_CO_CHU: CoChu[] = ["vua", "lon", "ratLon"];
export const TI_LE_CO_CHU: Record<CoChu, number> = { vua: 1, lon: 1.1, ratLon: 1.2 };

const KHOA = "livotec-cai-dat";

function hopLe(x: unknown): Partial<CaiDat> {
  if (!x || typeof x !== "object") return {};
  const o = x as Record<string, unknown>;
  const ra: Partial<CaiDat> = {};
  if (DS_GIAO_DIEN.includes(o.giaoDien as GiaoDien)) ra.giaoDien = o.giaoDien as GiaoDien;
  if (DS_CO_CHU.includes(o.coChu as CoChu)) ra.coChu = o.coChu as CoChu;
  if (typeof o.thongBao === "boolean") ra.thongBao = o.thongBao;
  return ra;
}

export function docCaiDat(): CaiDat {
  try {
    const tho = localStorage.getItem(KHOA);
    return { ...CAI_DAT_MAC_DINH, ...(tho ? hopLe(JSON.parse(tho)) : {}) };
  } catch { return CAI_DAT_MAC_DINH; }
}

function ghiCaiDat(caiDat: CaiDat) {
  try { localStorage.setItem(KHOA, JSON.stringify(caiDat)); } catch { /* bộ nhớ bị chặn: chỉ giữ trong phiên */ }
}

/** Tối thật sự hay không — "theo hệ thống" thì hỏi trình duyệt. */
function laToi(giaoDien: GiaoDien): boolean {
  if (giaoDien !== "heThong") return giaoDien === "toi";
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Gắn tuỳ chọn lên `<html>` để CSS đọc. Chỉ áp khi đã đăng nhập (`apDung`): màn đăng nhập có
 * bảng màu riêng trên ảnh nền, không theo giao diện tối hay cỡ chữ.
 */
function ganLenTrang(caiDat: CaiDat, apDung: boolean) {
  const html = document.documentElement;
  if (!apDung) {
    delete html.dataset.giaoDien;
    delete html.dataset.coChu;
    return;
  }
  html.dataset.giaoDien = laToi(caiDat.giaoDien) ? "toi" : "sang";
  html.dataset.coChu = caiDat.coChu;
}

/**
 * Tuỳ chọn hiển thị + hàm sửa. Đọc localStorage sau khi gắn (không đọc lúc render) để HTML
 * máy chủ dựng và lần vẽ đầu ở trình duyệt khớp nhau.
 */
export function useCaiDat(apDung: boolean) {
  const [caiDat, setCaiDat] = useState<CaiDat>(CAI_DAT_MAC_DINH);

  useEffect(() => {
    // Đọc một lần sau khi gắn: localStorage không có ở máy chủ nên không đọc lúc render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCaiDat(docCaiDat());
  }, []);

  useEffect(() => {
    ganLenTrang(caiDat, apDung);
    if (!apDung || caiDat.giaoDien !== "heThong" || typeof matchMedia !== "function") return;
    // Theo hệ thống: máy đổi sáng/tối giữa chừng thì app đổi theo ngay.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const doi = () => ganLenTrang(caiDat, apDung);
    mq.addEventListener("change", doi);
    return () => mq.removeEventListener("change", doi);
  }, [caiDat, apDung]);

  const sua = useCallback((patch: Partial<CaiDat>) => {
    setCaiDat(cu => {
      const moi = { ...cu, ...patch };
      ghiCaiDat(moi);
      return moi;
    });
  }, []);

  return [caiDat, sua] as const;
}
