"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useChu, type HamChu } from "../chu";
import Icon from "../Icon";
import { IotxApiError, iotxClient, isIotxMode, type BaoHanhSerial } from "@/lib/iotx";
import { EMOJI_SANG_ICON, anhDaiDienSanPham } from "@/lib/ui/assets";
import { traSerialGia } from "@/lib/ui/serialGia";
import { dinhDangNgay, ngayISO } from "@/lib/ui/thoiGian";
import type { Device } from "@/lib/types";

/**
 * Bảng trượt từ phải ở màn chi tiết (docs/viec-bang-phai-thiet-bi.md), hai mục:
 *   1. Thông tin thiết bị — dữ liệu local, hiện ngay.
 *   2. Bảo hành — `GET /v1/serials/lookup` (S-Factory), gọi ngay khi bảng mở.
 *
 * Dùng lại `.drawer-overlay` + `.drawer` của menu phải: trượt từ phải và `position:absolute`
 * neo vào khung ứng dụng, nên ở màn rộng bảng nằm gọn trong khung (tests/khung.mjs).
 */

/**
 * Gặp 503 `not_configured` (Super Admin chưa khai S-Factory) thì nhớ cho cả phiên: màn chi tiết
 * không vẽ nút mở bảng nữa. Tải lại trang thì thử lại từ đầu.
 */
let chuaKhaiSFactory = false;
export const coTheTraSerial = () => !chuaKhaiSFactory;

const traSerial = (serial: string) => (isIotxMode ? iotxClient.traSerial(serial) : traSerialGia(serial));

type TrangThai =
  | { kieu: "dangTai" }
  | { kieu: "co"; kq: BaoHanhSerial }
  | { kieu: "loi"; chu: string; thuLai: boolean };

/**
 * Lỗi của mục bảo hành — bảng ánh xạ RIÊNG, KHÔNG dùng `moTaLoi()`: ở cửa này 502 nghĩa là IBS
 * không gọi được S-Factory, IoTX vẫn khoẻ. `moTaLoi` nói "Không kết nối được máy chủ" là chỉ sai
 * hướng — người dùng sẽ đi kiểm mạng của chính họ.
 *
 *   400 `invalid_serial`  hiện nguyên văn câu máy chủ (về lý thuyết không xảy ra: serial lấy từ
 *                         chính máy chủ; xảy ra là dữ liệu thiết bị có vấn đề — đừng nuốt)
 *   502 (timeout, unreachable, http_403, bad_response, graphql)  câu S-Factory + Thử lại
 *   503 `not_configured`  "Chưa khai S-Factory", nhớ cho cả phiên, không Thử lại
 *   401                   client đã tự làm mới vé; vẫn hỏng thì phiên đã hết, câu chung
 *   còn lại / mất mạng    câu chung + Thử lại
 */
function loiBaoHanh(error: unknown, t: HamChu): Extract<TrangThai, { kieu: "loi" }> {
  if (error instanceof IotxApiError) {
    if (error.status === 400) return { kieu: "loi", chu: error.message, thuLai: false };
    if (error.status === 502) return { kieu: "loi", chu: t("bh_loi_goi"), thuLai: true };
    if (error.status === 503) {
      chuaKhaiSFactory = true;
      return { kieu: "loi", chu: t("bh_chua_khai"), thuLai: false };
    }
    if (error.status === 401) return { kieu: "loi", chu: t("bh_loi_khac"), thuLai: false };
  }
  return { kieu: "loi", chu: t("bh_loi_khac"), thuLai: true };
}

function Dong({ nhan, children }: { nhan: string; children: ReactNode }) {
  return <div className="tt-dong"><dt>{nhan}</dt><dd>{children}</dd></div>;
}

export default function BangThietBi({ device, onClose }: { device: Device; onClose: () => void }) {
  const { t } = useChu();
  const serial = device.code ?? "";
  const [lan, setLan] = useState(0);
  const [tt, setTt] = useState<TrangThai>({ kieu: "dangTai" });

  useEffect(() => {
    let conMo = true;
    traSerial(serial)
      .then(kq => { if (conMo) setTt({ kieu: "co", kq }); })
      .catch(error => { if (conMo) setTt(loiBaoHanh(error, t)); });
    return () => { conMo = false; };
    // `t` đổi theo ngôn ngữ; đổi ngôn ngữ không cần tra lại serial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serial, lan]);

  const anh = anhDaiDienSanPham(device.product);
  const kq = tt.kieu === "co" ? tt.kq : null;
  const bh = kq?.warranty ?? null;
  /** Bốn dòng sản phẩm dưới Serial lấy từ lookup: đang tra thì "…", không có/lỗi thì "—". */
  const sp = (lay: (k: BaoHanhSerial) => string) => (tt.kieu === "dangTai" ? "…" : kq?.found ? lay(kq) : "—");

  return (
    <div className="drawer-overlay" role="dialog" aria-modal="true" aria-label={t("tt_tieu_de")}>
      <button className="modal-scrim" aria-label={t("close")} onClick={onClose} />
      <aside className="drawer tt">
        <button className="nut-dong-goc" aria-label={t("close")} onClick={onClose}><Icon name="close" /></button>
        <h3><Icon name="info" /> {t("tt_tieu_de")}</h3>
        <dl className="tt-ds">
          <Dong nhan={t("tt_ten")}>{device.name}</Dong>
          <Dong nhan={t("tt_loai")}>
            <span className="tt-loai">
              <span className="tt-anh" aria-hidden="true">
                {anh.kieu === "anh"
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={anh.src} alt="" />
                  : EMOJI_SANG_ICON[anh.chu] ? <Icon name={EMOJI_SANG_ICON[anh.chu]} /> : anh.chu}
              </span>
              {device.model || "—"}
            </span>
          </Dong>
          <Dong nhan={t("tt_serial")}>{serial || "—"}</Dong>
          {/* Thông tin sản phẩm theo serial (S-Factory), đặt ngay dưới Serial — yêu cầu 20/10/2026. */}
          <Dong nhan={t("bh_sp")}>{sp(k => k.product?.name || "—")}</Dong>
          <Dong nhan={t("bh_ma_sp")}>{sp(k => k.product?.code || "—")}</Dong>
          <Dong nhan={t("bh_ngay_mua")}>{sp(k => ngayISO(k.purchaseDate))}</Dong>
          <Dong nhan={t("bh_ngay_sx")}>{sp(k => ngayISO(k.manufactureDate))}</Dong>
          <Dong nhan={t("tt_ma")}>{device.id}</Dong>
          <Dong nhan={t("tt_ngay")}>{dinhDangNgay(device.createdTime)}</Dong>
        </dl>

        <h3 className="tt-muc">{t("bh_tieu_de")}</h3>
        {/* Chừa sẵn chiều cao để bảng không nhảy giật khi dữ liệu về. */}
        <div className="tt-bh" aria-live="polite" aria-busy={tt.kieu === "dangTai"}>
          {tt.kieu === "dangTai" && <p className="tt-chu">{t("bh_dang_tai")}</p>}
          {tt.kieu === "loi" && (
            <>
              <p className="tt-chu tt-loi" role="alert">{tt.chu}</p>
              {tt.thuLai && (
                <button className="tt-thu-lai" onClick={() => { setTt({ kieu: "dangTai" }); setLan(n => n + 1); }}>
                  {t("bh_thu_lai")}
                </button>
              )}
            </>
          )}
          {/* found:false KHÔNG phải lỗi — chữ thường, không tô đỏ. */}
          {kq && !kq.found && <p className="tt-chu">{t("bh_khong_co")}</p>}
          {kq?.found && bh && (
            <dl className="tt-ds">
              {/* Danh sách giá trị status chưa có (mới đo được "Inactive") — hiện nguyên văn, không đoán. */}
              <Dong nhan={t("bh_trang_thai")}>{bh.status || "—"}</Dong>
              <Dong nhan={t("bh_thang")}>{bh.months !== null && bh.months !== undefined ? t("bh_so_thang", { n: bh.months }) : "—"}</Dong>
              <Dong nhan={t("bh_kich_hoat")}>{ngayISO(bh.activatedAt)}</Dong>
              <Dong nhan={t("bh_het_han")}>{ngayISO(bh.expiredAt)}</Dong>
              <Dong nhan={t("bh_ma_bh")}>{bh.code || "—"}</Dong>
              <Dong nhan={t("bh_xuat_kho")}>{ngayISO(bh.exportedAt)}</Dong>
            </dl>
          )}
          {/* `warranty: null` nguyên khối → MỘT dòng, không phải sáu dòng rỗng. */}
          {kq?.found && !bh && <p className="tt-chu tt-khong-bh">{t("bh_khong_bh")}</p>}
        </div>
      </aside>
    </div>
  );
}
