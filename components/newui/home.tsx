"use client";

import Image from "next/image";
import { memo, useEffect, useState } from "react";
import Icon from "./Icon";
import { useChu, type HamChu } from "./chu";
import { IMG, anhDaiDienSanPham } from "@/lib/newui/assets";
import { capNguonCua, phanGiaiSanPham } from "@/lib/newui/khuon";
import { nhanCap, nhanGiaTriCap } from "@/lib/newui/nhanCap";
import { laBat, rong } from "@/lib/iotx/giaTri";
import { donVi } from "@/lib/newui/giaTriCap";
import { TAT_CA, type BoLoc, type LoaiLoc } from "@/lib/newui/boLoc";
import type { IotxCapability } from "@/lib/iotx/contracts";
import type { Device } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Banner                                                             */
/* ------------------------------------------------------------------ */

/** `alt`/`title`/`sub` là KHÓA chữ; dịch lúc vẽ. */
type BannerMuc = { src?: string; alt?: string; grad?: string; icon?: string; title?: string; sub?: string };

const BANNERS: BannerMuc[] = [
  { src: IMG.bannerAircon, alt: "banner_aircon" },
  { src: IMG.bannerCooktop, alt: "banner_cooktop" },
  { grad: "linear-gradient(135deg,#1e6f8f,#123a4d)", icon: "drop", title: "banner_water_title", sub: "banner_water_sub" },
];

export function BannerCarousel() {
  const { t } = useChu();
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
            <Image unoptimized src={muc.src} alt={muc.alt ? t(muc.alt) : ""} width={400} height={120} />
          </div>
        )
        : (
          <div key={i} className={`banner-slide grad${i === chiSo ? " active" : ""}`} style={{ background: muc.grad }} aria-hidden={i !== chiSo}>
            <span className="bicn"><Icon name={muc.icon || "drop"} /></span>
            <span>
              <span className="btitle">{muc.title && t(muc.title)}</span>
              <span className="bsub">{muc.sub && t(muc.sub)}</span>
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
 * Nút mắt cuối hàng lọc ra các thiết bị ĐÃ ẨN (bấm lần nữa để trở lại danh sách thường).
 */
export function FilterRow({ boLoc, xemDaAn, onChon, onXemDaAn }: {
  boLoc: BoLoc;
  xemDaAn: boolean;
  onChon: (loai: LoaiLoc) => void;
  onXemDaAn: () => void;
}) {
  const { t } = useChu();
  const { nha, phong, nhom } = boLoc;
  const lop = (dangLoc: boolean) => `filter-pill${dangLoc ? " active" : ""}`;
  // Chưa lọc thì nút chỉ mang tên loại ("Nhà"), lọc rồi thì mang tên đang chọn. Không để
  // chữ "Tất cả" trên nút: nó chiếm chỗ mà không nói thêm gì so với trạng thái không lọc.
  return (
    <div className="filter-row">
      <button className={lop(nha !== TAT_CA)} onClick={() => onChon("nha")}>
        <Icon name="house" /> <span className="fp-ten">{nha === TAT_CA ? t("loc_nha") : nha}</span> <Icon name="chevDown" />
      </button>
      <button className={lop(phong !== TAT_CA)} onClick={() => onChon("phong")}>
        <Icon name="box" /> <span className="fp-ten">{phong === TAT_CA ? t("loc_phong") : phong}</span> <Icon name="chevDown" />
      </button>
      <button className={lop(nhom !== TAT_CA)} onClick={() => onChon("nhom")}>
        <span className="fp-ten">{nhom === TAT_CA ? t("loc_nhom") : nhom}</span> <Icon name="chevDown" />
      </button>
      <button className={`filter-pill eye${xemDaAn ? " active" : ""}`} aria-label={t("loc_da_an")} title={t("loc_da_an")} aria-pressed={xemDaAn} onClick={onXemDaAn}>
        <Icon name="eye" />
      </button>
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
  const kq = phanGiaiSanPham(device.product);
  const oTheoThuTu = kq
    ? [kq.veHero, kq.veNguon, ...kq.veStatus, ...kq.veSecondary, ...kq.veMore].filter(Boolean)
    : [];
  const doc = (cap: IotxCapability) => {
    const giaTri = device.lastValues?.[cap.key];
    return rong(giaTri) ? null : giaTri;
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
    const dv = donVi(cap);
    manh.push(dv ? `${giaTri}${dv}` : `${nhanCap(cap, t)} ${giaTri}`);
  }

  return [...dau, batTat, ...manh].join(" · ");
}

/* ------------------------------------------------------------------ */
/* Thẻ thiết bị                                                        */
/* ------------------------------------------------------------------ */

export type HanhDongThietBi = {
  onMo: (id: string) => void;
  onNguon: (id: string) => void;
  onGhim: (id: string) => void;
};

/**
 * `memo`: nhịp đồng bộ giữ nguyên đối tượng thiết bị không đổi (`giuThietBiCu`) và hành động
 * là một bộ ổn định, nên chỉ thẻ nào thật sự đổi mới vẽ lại.
 */
export const DeviceCard = memo(function DeviceCard({ device, hanhDong }: {
  device: Device;
  hanhDong: HanhDongThietBi;
}) {
  const { t } = useChu();
  // Ảnh chỉ đến từ catalog (`product.ui.image`); không gửi thì thẻ vẽ vòng tròn trống chứ
  // app không tự gán ảnh cho sản phẩm. Công tắc chỉ vẽ khi catalog khai nguồn có `rpc`.
  const anh = anhDaiDienSanPham(device.product);
  // Nút nguồn trên thẻ: dò capability nguồn theo `variant: "power01"` của catalog, và KHÔNG
  // đòi thiết bị phải online — bản tham chiếu cũng cho bấm khi máy đang ngoại tuyến.
  const capNguon = capNguonCua(device.product);
  const choBam = Boolean(capNguon?.rpc) && device.perms?.control !== false;

  return (
    <div className="device-card">
      {/* Một nút phủ kín thẻ làm vùng chạm mở chi tiết (rộng hơn 44px mọi phía); ngôi sao
          và công tắc nằm trên nó nên không bị nuốt mất và cũng không lồng nút trong nút. */}
      <button className="card-hit" aria-label={device.name} onClick={() => hanhDong.onMo(device.id)} />
      <div className="dcard-top">
        <p className="dname">{device.name}</p>
        <button className="star-btn" aria-label={device.fav ? t("unpin") : t("pin")} aria-pressed={Boolean(device.fav)} onClick={() => hanhDong.onGhim(device.id)}>
          <Icon name="star" className={`star-icn${device.fav ? " fav" : ""}`} filled={Boolean(device.fav)} />
        </button>
      </div>
      <div className="dstatus-row">
        <span className={`status-dot${device.online && device.on ? "" : " off"}`} />
        {/* Nhà/phòng vẫn hiện khi máy ngoại tuyến — nơi đặt máy không đổi vì mất kết nối.
            Lọc chuỗi rỗng để nhà chưa gán không để lại dấu " · " cụt đầu dòng. */}
        <span className="droom">{[device.house, device.room || t("unassigned_room")].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="dvisual">
        {/* Ảnh của catalog nằm ở máy chủ media của hãng, địa chỉ chỉ biết lúc chạy, nên
            dùng <img> thường thay cho next/image — khỏi phải khai trước tên miền. */}
        {anh.kieu === "anh"
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={anh.src} alt="" />
          : <span className="dvisual-bt" aria-hidden="true">{anh.chu}</span>}
      </div>
      <div className="dcard-bottom">
        <span className="dline">{dongTrangThai(device, t)}</span>
        {capNguon && (
          <button className="switch-hit" role="switch" aria-label={nhanCap(capNguon, t)} aria-checked={device.on} disabled={!choBam} onClick={() => hanhDong.onNguon(device.id)}>
            <span className={`switch${device.on ? " on" : ""}`} />
          </button>
        )}
      </div>
    </div>
  );
});
