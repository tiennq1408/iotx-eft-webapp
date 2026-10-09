"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import Icon from "./Icon";
import RuleCard from "./RuleCard";
import { useChu } from "./chu";
import { BannerCarousel, DeviceCard, type HanhDongThietBi } from "./home";

export type { HanhDongThietBi };
import { IMG } from "@/lib/newui/assets";
import type { IotxRule, IotxRules } from "@/lib/iotx/contracts";
import type { Device } from "@/lib/types";

/**
 * Năm màn chính dưới thanh điều hướng. Mỗi màn chỉ nhận đúng thứ nó dùng; `LivotecApp`
 * giữ state và chọn màn.
 */

export type HanhDongLuat = {
  batTat: (rule: IotxRule) => void;
  xoa: (rule: IotxRule) => void;
  chay: (rule: IotxRule) => void;
  dung: (rule: IotxRule) => void;
};

function LuoiThietBi({ danhSach, xemDaAn, hanhDong }: { danhSach: Device[]; xemDaAn?: boolean; hanhDong: HanhDongThietBi }) {
  const { t } = useChu();
  if (danhSach.length === 0) {
    return xemDaAn
      ? <div className="empty-state"><Icon name="eye" /><strong>{t("da_an_trong")}</strong><span>{t("da_an_goi_y")}</span></div>
      : <div className="empty-state"><Icon name="search" /><strong>{t("no_device")}</strong><span>{t("no_device_hint")}</span></div>;
  }
  return (
    <div className="device-grid">
      {danhSach.map(device => (
        <DeviceCard key={device.id} device={device} hanhDong={hanhDong} />
      ))}
    </div>
  );
}

/**
 * Trang chủ hiện hàng lọc nhưng lưới là TOÀN BỘ thiết bị: chọn một bộ lọc thì app chuyển
 * sang màn Thiết bị, nơi danh sách mới được lọc.
 */
export function ManTrangChu({ devices, hangLoc, hanhDong }: {
  devices: Device[];
  hangLoc: ReactNode;
  hanhDong: HanhDongThietBi;
}) {
  return (
    <div className="app-scroll">
      <BannerCarousel />
      {hangLoc}
      <LuoiThietBi danhSach={devices} hanhDong={hanhDong} />
    </div>
  );
}

/** `xemDaAn`: nút mắt trên hàng lọc đang bật — danh sách là các thiết bị đã ẩn. */
export function ManThietBi({ devices, hangLoc, xemDaAn, hanhDong, onThem }: {
  devices: Device[];
  hangLoc: ReactNode;
  xemDaAn: boolean;
  hanhDong: HanhDongThietBi;
  onThem: () => void;
}) {
  const { t } = useChu();
  return (
    <div className="app-scroll">
      <button className="add-device-btn" onClick={onThem}><Icon name="plus" /> {t("add_device")}</button>
      {hangLoc}
      {xemDaAn && <p className="da-an-ghi-chu" role="status">{t("da_an_dang_xem")}</p>}
      <LuoiThietBi danhSach={devices} xemDaAn={xemDaAn} hanhDong={hanhDong} />
    </div>
  );
}

export function ManTuDong({ luat, luatTuThietBi, tranLuat, hanhDong, onTaoNeuThi, onTaoTheoGio }: {
  luat: IotxRule[];
  luatTuThietBi: IotxRules["tuThietBi"];
  /** Trần luật của hãng (`theme.quotas.rules`) — đầy thì khoá nút tạo, không để máy chủ từ chối sau. */
  tranLuat: number;
  hanhDong: HanhDongLuat;
  onTaoNeuThi: () => void;
  onTaoTheoGio: () => void;
}) {
  const { t } = useChu();
  // Hẹn giờ theo thiết bị không tính vào hạn mức luật, nên nút "Theo thời gian" không khoá.
  const dayLuat = luat.length >= tranLuat;
  return (
    <div className="app-scroll">
      <div className="auto-btn-row">
        <button className="auto-btn primary" disabled={dayLuat} onClick={onTaoNeuThi}><Icon name="plus" /> {t("auto_if")}</button>
        <button className="auto-btn secondary" onClick={onTaoTheoGio}><Icon name="clock" /> {t("auto_time")}</button>
      </div>
      {dayLuat && <p className="hint" role="status">{t("auto_quota_full", { n: tranLuat })}</p>}
      {luat.length === 0 && luatTuThietBi.length === 0 && (
        <div className="empty-card">
          {t("auto_empty").split("<br>").map((dong, i) => <span key={i} className="empty-line">{dong}</span>)}
        </div>
      )}
      {luat.map(rule => (
        <RuleCard
          key={rule.id}
          rule={rule}
          onBatTat={() => hanhDong.batTat(rule)}
          onChay={() => hanhDong.chay(rule)}
          onXoa={() => hanhDong.xoa(rule)}
          onDung={() => hanhDong.dung(rule)}
        />
      ))}
      {luatTuThietBi.length > 0 && (
        <>
          <div className="section-title"><h2>{t("auto_from_device")}</h2><span>{luatTuThietBi.length}</span></div>
          {luatTuThietBi.map(muc => (
            <div className="auto-card" key={`${muc.deviceId}-${muc.tenCT}`}>
              <div className="auto-card-top"><span className="an">{muc.tenCT}</span></div>
              <p className="auto-line">{muc.tenThietBi}</p>
            </div>
          ))}
          <p className="hint">{t("auto_from_device_hint")}</p>
        </>
      )}
    </div>
  );
}

const DICH_VU = [
  { icon: "wrench", nhan: "svc_maintenance" },
  { icon: "shield", nhan: "svc_warranty" },
  { icon: "checkCircle", nhan: "svc_activate" },
  { icon: "cart", nhan: "svc_shop" },
];
// Lưới thứ hai của bản thiết kế: các hội nhóm người dùng, viền và chữ theo màu hãng.
const HOI = ["club_kitchen", "club_aircon", "club_water", "club_fan"];

export function ManDichVu({ onPlaceholder }: { onPlaceholder: (tieuDe: string) => void }) {
  const { t } = useChu();
  return (
    <div className="app-scroll">
      <div className="service-grid">
        {DICH_VU.map(muc => (
          <button className="service-card" key={muc.nhan} onClick={() => onPlaceholder(t(muc.nhan))}>
            <span className="sicn"><Icon name={muc.icon} /></span>
            <span className="slabel">{t(muc.nhan)}</span>
          </button>
        ))}
      </div>
      <div className="service-grid club-grid">
        {HOI.map(nhan => (
          <button className="service-card club-card" key={nhan} onClick={() => onPlaceholder(t(nhan))}>
            <span className="sicn club-icn"><Icon name="heart" /></span>
            <span className="slabel club-label">{t(nhan)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ManKhamPha({ logoUrl }: { logoUrl: string | null }) {
  const { t } = useChu();
  return (
    <div className="app-scroll">
      <a className="discover-hero" href="https://livotec.com/" target="_blank" rel="noreferrer noopener">
        {/* Hãng có logo riêng thì dùng logo đó; chưa khai thì vẽ giọt nước trắng của
            bản thiết kế, đặt thẳng trên nền chứ không bọc trong ô sáng. */}
        {logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="dh-logo" src={logoUrl} alt="" width={60} height={60} />
          : <span className="dh-swirl-icon" aria-hidden="true">
              <svg viewBox="0 0 100 100" fill="none">
                <path d="M50 8 A42 42 0 0 1 92 50" stroke="#fff" strokeWidth={9} strokeLinecap="round" />
                <path d="M50 92 A42 42 0 0 1 8 50" stroke="#fff" strokeWidth={9} strokeLinecap="round" />
                <path d="M50 30 C 38 46, 34 56, 42 66 C 48 73, 58 71, 61 63 C 64 55, 58 48, 50 30 Z" fill="#fff" />
              </svg>
            </span>}
        <span className="dh-title">{t("dh_title")}</span>
        <span className="dh-sub">{t("dh_sub")}</span>
        <span className="dh-btn">{t("dh_btn")} <Icon name="externalLink" /></span>
      </a>
      {/* Bản thiết kế xếp hai ảnh khuyến mãi chồng nhau, KHÔNG phải băng chạy: đây là
          trang để đọc, ảnh tự đổi làm người dùng mất chỗ đang xem. */}
      <div className="discover-promo-stack">
        <Image unoptimized className="discover-promo-img" src={IMG.promoAircon} alt={t("promo_aircon")} width={360} height={150} />
        <Image unoptimized className="discover-promo-img" src={IMG.promoWaterHeater} alt={t("promo_wh")} width={360} height={150} />
      </div>
    </div>
  );
}
