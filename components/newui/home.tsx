"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Icon from "./Icon";
import { FlagRow } from "./shell";
import { useChu, type HamChu } from "./chu";
import { IMG, anhSanPham } from "@/lib/newui/assets";
import { capNguonCua, phanGiai } from "@/lib/newui/khuon";
import { nhanCap, nhanGiaTriCap } from "@/lib/newui/nhanCap";
import { laBat } from "@/lib/iotx/giaTri";
import type { IotxCapability } from "@/lib/iotx/contracts";
import type { Device } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Banner                                                             */
/* ------------------------------------------------------------------ */

type BannerMuc = { src?: string; alt?: string; grad?: string; icon?: string; title?: string; sub?: string };

const BANNERS: BannerMuc[] = [
  { src: IMG.bannerAircon, alt: "Công nghệ i-Boost — Điều hòa I30J" },
  { src: IMG.bannerCooktop, alt: "Bếp Điện Từ Đôi LIO-888VT" },
  { grad: "linear-gradient(135deg,#1e6f8f,#123a4d)", icon: "drop", title: "Máy Lọc Nước 886i", sub: "Công nghệ I-Vision thông minh" },
];

export function BannerCarousel() {
  const [chiSo, setChiSo] = useState(0);
  useEffect(() => {
    const dong = window.setInterval(() => setChiSo(truoc => (truoc + 1) % BANNERS.length), 3000);
    return () => window.clearInterval(dong);
  }, []);
  return (
    <div className="banner-carousel">
      {BANNERS.map((muc, i) => muc.src
        ? (
          <div key={i} className={`banner-slide${i === chiSo ? " active" : ""}`} aria-hidden={i !== chiSo}>
            <Image unoptimized src={muc.src} alt={muc.alt || ""} width={400} height={120} />
          </div>
        )
        : (
          <div key={i} className={`banner-slide grad${i === chiSo ? " active" : ""}`} style={{ background: muc.grad }} aria-hidden={i !== chiSo}>
            <span className="bicn"><Icon name={muc.icon || "drop"} /></span>
            <span>
              <span className="btitle">{muc.title}</span>
              <span className="bsub">{muc.sub}</span>
            </span>
          </div>
        ))}
      <div className="banner-dots">
        {BANNERS.map((_, i) => <span key={i} className={`bd${i === chiSo ? " active" : ""}`} />)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hàng lọc                                                           */
/* ------------------------------------------------------------------ */

/**
 * Ba bộ lọc độc lập: nhà, phòng, nhóm. Mỗi cái mở một danh sách chọn thật (không còn toast
 * "sắp ra mắt"), và nút nào đang lọc thì sáng lên để người dùng biết vì sao danh sách ngắn.
 */
export function FilterRow({ nha, phong, nhom, lang, gonGang, onLang, onChonNha, onChonPhong, onChonNhom, onGonGang }: {
  nha: string;
  phong: string;
  nhom: string;
  lang: string;
  gonGang: boolean;
  onLang: (ma: string) => void;
  onChonNha: () => void;
  onChonPhong: () => void;
  onChonNhom: () => void;
  onGonGang: () => void;
}) {
  const { t } = useChu();
  const lop = (dangLoc: boolean) => `filter-pill${dangLoc ? " active" : ""}`;
  return (
    <div className="filter-row">
      <button className={lop(nha !== "all")} onClick={onChonNha}>
        <Icon name="house" /> {nha === "all" ? t("all_houses") : nha} <Icon name="chevDown" />
      </button>
      <button className={lop(phong !== "all")} onClick={onChonPhong}>
        <Icon name="box" /> {phong === "all" ? t("all_rooms") : phong} <Icon name="chevDown" />
      </button>
      <button className={lop(nhom !== "all")} onClick={onChonNhom}>
        {nhom === "all" ? t("all_groups") : nhom} <Icon name="chevDown" />
      </button>
      <button className="filter-pill eye" aria-label={t("nav_devices")} aria-pressed={gonGang} onClick={onGonGang}>
        <Icon name="eye" />
      </button>
      <FlagRow lang={lang} onLang={onLang} className="inline" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dòng trạng thái trên thẻ                                            */
/* ------------------------------------------------------------------ */

/**
 * Câu trạng thái trên thẻ, dựng từ chính bố cục mà catalog mô tả — cùng một nguồn sự thật
 * với màn chi tiết. Không có một nhánh `if` nào theo loại máy: thứ tự ưu tiên là thứ tự
 * `controls`/`gauges` của hãng, và thiết bị chưa có số đo chỉ hiện bật/tắt thay vì bịa số.
 */
function dongTrangThai(device: Device, t: HamChu): string {
  // Ngoại tuyến KHÔNG xóa sạch dòng này: số cuối cùng máy báo vẫn là thông tin có ích,
  // chỉ cần nói trước rằng nó đã cũ. Trước đây thẻ chỉ còn mỗi chữ "Ngoại tuyến".
  const dau = device.online ? [] : [t("offline")];
  const batTat = device.on ? t("on") : t("off");
  if (!device.on) return [...dau, batTat].join(" · ");

  // Dùng chính bộ dựng của màn chi tiết, nên thẻ và màn luôn ưu tiên giống nhau.
  const kq = phanGiai(device.product, device.product?.capabilities ?? []);
  const oTheoThuTu = kq
    ? [kq.veHero, kq.veNguon, ...kq.veStatus, ...kq.veSecondary, ...kq.veMore].filter(Boolean)
    : [];
  const doc = (cap: IotxCapability) => {
    const giaTri = device.lastValues?.[cap.key];
    return giaTri === undefined || giaTri === null || giaTri === "" ? null : giaTri;
  };

  // Nút nguồn đã nói bằng chữ "Bật/Tắt" ở đầu dòng — nhắc lại tên nó là thừa.
  const khoaNguon = capNguonCua(device.product)?.key;
  const manh: string[] = [];
  for (const o of oTheoThuTu) {
    if (manh.length >= 2) break;
    const cap = o!.cap;
    if (cap.kind === "list" || cap.key === khoaNguon) continue;
    const giaTri = doc(cap);
    if (giaTri === null) continue;
    if (cap.kind === "onoff") {
      // Máy chủ trả CHUỖI ("true"/"false"), không phải boolean — so bằng === thì công tắc
      // phụ nào cũng bị coi là tắt và không bao giờ hiện lên thẻ.
      if (laBat(giaTri)) manh.push(nhanCap(cap, t));
      continue;
    }
    if (cap.kind === "enum") { manh.push(nhanGiaTriCap(cap, String(giaTri), t)); continue; }
    // Có đơn vị thì con số tự nói lên nó là gì (18.3°C); không có thì phải kèm nhãn, nếu
    // không thẻ chỉ hiện trơ một con "12" chẳng biết của cái gì.
    const donVi = cap.unit ? `${cap.unitSpace ? " " : ""}${cap.unit}` : "";
    manh.push(donVi ? `${giaTri}${donVi}` : `${nhanCap(cap, t)} ${giaTri}`);
  }

  return [...dau, batTat, ...manh].join(" · ");
}

/* ------------------------------------------------------------------ */
/* Thẻ thiết bị                                                        */
/* ------------------------------------------------------------------ */

export function DeviceCard({ device, onOpen, onToggle, onFav }: {
  device: Device;
  onOpen: () => void;
  onToggle: () => void;
  onFav: () => void;
}) {
  const { t } = useChu();
  // Ảnh chỉ đến từ catalog (`product.ui.image`); không gửi thì thẻ vẽ vòng tròn trống chứ
  // app không tự gán ảnh cho sản phẩm. Công tắc chỉ vẽ khi catalog khai nguồn có `rpc`.
  const anh = anhSanPham(device.product);
  // Nút nguồn trên thẻ: dò capability nguồn theo `variant: "power01"` của catalog, và KHÔNG
  // đòi thiết bị phải online — bản tham chiếu cũng cho bấm khi máy đang ngoại tuyến.
  const capNguon = capNguonCua(device.product);
  const choBam = Boolean(capNguon?.rpc) && device.perms?.control !== false;

  return (
    <div className="device-card">
      {/* Một nút phủ kín thẻ làm vùng chạm mở chi tiết (rộng hơn 44px mọi phía); ngôi sao
          và công tắc nằm trên nó nên không bị nuốt mất và cũng không lồng nút trong nút. */}
      <button className="card-hit" aria-label={device.name} onClick={onOpen} />
      <div className="dcard-top">
        <p className="dname">{device.name}</p>
        <button className="star-btn" aria-label={device.fav ? "Bỏ ghim" : "Ghim"} aria-pressed={Boolean(device.fav)} onClick={onFav}>
          <svg className={`star-icn${device.fav ? " fav" : ""}`} viewBox="0 0 24 24" fill={device.fav ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path d="M12 2l3.1 6.6 7.2.8-5.4 5 1.5 7.2-6.4-3.6-6.4 3.6 1.5-7.2-5.4-5 7.2-.8z" />
          </svg>
        </button>
      </div>
      <div className="dstatus-row">
        <span className={`status-dot${device.online && device.on ? "" : " off"}`} />
        {/* Nhà/phòng vẫn hiện khi máy ngoại tuyến — nơi đặt máy không đổi vì mất kết nối.
            Lọc chuỗi rỗng để nhà chưa gán không để lại dấu " · " cụt đầu dòng. */}
        <span className="droom">{[device.house, device.room || t("unassigned_room")].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="dvisual">
        {anh ? <Image unoptimized src={anh} alt="" width={120} height={72} /> : <span className="ring" />}
      </div>
      <div className="dcard-bottom">
        <span className="dline">{dongTrangThai(device, t)}</span>
        {capNguon && (
          <button className="switch-hit" aria-label={device.on ? t("off") : t("on")} aria-pressed={device.on} disabled={!choBam} onClick={onToggle}>
            <span className={`switch${device.on ? " on" : ""}`} />
          </button>
        )}
      </div>
    </div>
  );
}
