"use client";

import { useMemo } from "react";
import { useChu, type HamChu } from "../chu";
import { VatTuBlock, type GuiVatTu } from "./VatTu";
import { nhanCap, nhanGiaTriCap } from "@/lib/newui/nhanCap";
import { capNguonCua } from "@/lib/newui/khuon";
import { diaChiIcon, laDuongDan } from "@/lib/newui/assets";
import { phimKichHoat } from "@/lib/newui/phim";
import { coSo, doSo, laBat, rong } from "@/lib/iotx/giaTri";
import { chuSoCap, thongSoMuc } from "@/lib/newui/giaTriCap";
import {
  CAN_CHU, CAN_DOC, CAN_NGANG, cotChip, cotChipTuDong, danhSachLoi, dayNgang,
  phanGiaiBoCuc, tuCoNhan, type BoCuc, type OdaDung,
} from "@/lib/newui/boCuc";
import type { IotxCapability } from "@/lib/iotx/contracts";
import type { Device } from "@/lib/types";

/**
 * Vẽ màn chi tiết theo lưới `ui.boCuc` — bản dựng lại từ bộ vẽ của bản tham chiếu, dùng
 * đúng bộ lớp `bc-*` để hai app nhìn giống nhau với cùng dữ liệu.
 *
 * Catalog quyết tất: ô nào ở đâu, rộng mấy cột, vẽ bằng control gì, căn lề ra sao. Tệp này
 * chỉ đổi mô tả đó thành DOM; không có một nhánh `if` nào theo loại thiết bị.
 */

/**
 * `gtIco`: emoji, địa chỉ ảnh, hoặc `@ten` trỏ vào kho icon của sadmin — `diaChiIcon` lo
 * phân loại. Trả null nghĩa là KHÔNG có gì để vẽ, và lúc đó đừng vẽ thẻ bọc (xem `ONoiDung`).
 */

function Ico({ ico }: { ico: string }) {
  if (laDuongDan(ico)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="bc-icoimg" src={ico} alt="" loading="lazy"
        // Kho icon trả 404 cho tên lạ, và chế độ mock thì không có máy chủ nào cả. Giấu
        // luôn thẻ bọc thay vì để trình duyệt vẽ biểu tượng ảnh hỏng rồi đẩy lệch nhãn.
        onError={e => { const bao = e.currentTarget.parentElement; if (bao) bao.style.display = "none"; }} />
    );
  }
  return <>{ico}</>;
}

const CHU_BAT_TAT = new Set(["true", "false", "on", "off", "1", "0"]);
const laChuBatTat = (v: unknown) => typeof v === "boolean" || CHU_BAT_TAT.has(String(v).trim().toLowerCase());

/** Lớp CSS cho nhãn theo `o.nhan` (cỡ, đậm, nghiêng); không có gì thì `undefined` để không in `class=""`. */
function lopNhan(o: OdaDung): string | undefined {
  const n = o.nhan ?? {};
  const lop = [n.co && n.co !== "vua" ? `nh-${n.co}` : "", n.dam ? "nh-dam" : "", n.nghieng ? "nh-nghieng" : ""].filter(Boolean);
  return lop.length ? lop.join(" ") : undefined;
}

/* Vòng xoay — dựng đúng như bản tham chiếu web.dev: hai CUNG TRÒN trên viewBox 120, tâm
   (60,60) bán kính 46, quét 270° bắt đầu từ 135° (mở xuống dưới). Cung chạy được vẽ bằng
   cách tính ĐIỂM CUỐI theo tỉ lệ, không dùng stroke-dasharray, nên không cần xoay cả thẻ
   svg rồi xoay ngược chữ lại. Số và đơn vị nằm chung một dòng. */
const TAM = 60, BAN_KINH = 46, GOC_DAU = 135, GOC_QUET = 270;

function diemTren(goc: number) {
  const rad = (goc * Math.PI) / 180;
  return `${(TAM + BAN_KINH * Math.cos(rad)).toFixed(2)} ${(TAM + BAN_KINH * Math.sin(rad)).toFixed(2)}`;
}

/** `t` trong [0,1]. Cờ cung-lớn bật khi quét quá nửa vòng tròn, đúng luật của SVG arc. */
function cungTron(t: number) {
  const quet = Math.max(0, Math.min(1, t)) * GOC_QUET;
  return `M${diemTren(GOC_DAU)}A${BAN_KINH} ${BAN_KINH} 0 ${quet > 180 ? 1 : 0} 1 ${diemTren(GOC_DAU + quet)}`;
}

const CUNG_NEN = cungTron(1);

function Dial({ v, min, max, chu }: { v: number; min: number; max: number; chu: string }) {
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={chu}>
      <path d={CUNG_NEN} stroke="var(--line)" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d={cungTron(max > min ? (v - min) / (max - min) : 0)}
        stroke="var(--brand)" strokeWidth="10" fill="none" strokeLinecap="round" />
      <text x="60" y="66" textAnchor="middle" fontSize="22" fontWeight="600" fill="var(--ink)">{chu}</text>
    </svg>
  );
}

function ONoiDung({ o, device, t, chan, gui, vatTu }: {
  o: OdaDung; device: Device; t: HamChu;
  /** Người dùng không có quyền điều khiển (chia sẻ chỉ-xem). */
  chan: boolean;
  gui: (cap: IotxCapability, v: unknown) => void;
  vatTu: GuiVatTu;
}) {
  const cap = o.cap;
  const v = device.lastValues?.[cap.key];
  const ten = nhanCap(cap, t);
  const lopN = lopNhan(o);
  // Cùng luật với khuôn chi tiết: thiếu quyền hoặc catalog không khai lệnh thì khóa.
  const khoa = chan || !cap.rpc;

  if (cap.kind === "onoff") {
    const bat = laBat(v);
    if (o.variant === "power01") {
      return (
        <div className="bc-srow" style={{ justifyContent: "center", gap: 10 }}>
          <button className={`bc-pwr${bat ? "" : " off"}`} aria-pressed={bat}
            aria-label={ten} disabled={khoa} onClick={() => gui(cap, !bat)}>⏻</button>
          {o.w >= 2 && <b className={lopN} style={{ fontWeight: 600 }}>{ten}</b>}
        </div>
      );
    }
    return (
      <div className="bc-srow">
        <span className={lopN}>{ten}</span>
        <button className="switch-hit" role="switch" aria-checked={bat}
          aria-label={ten} disabled={khoa} onClick={() => gui(cap, !bat)}>
          <span className={`switch${bat ? " on" : ""}`} />
        </button>
      </div>
    );
  }

  if (cap.kind === "level") {
    const { min, max, buoc, kep } = thongSoMuc(cap);
    const nay = doSo(v, min);
    const doi = (huong: number) => gui(cap, kep(nay + huong * buoc));
    if (o.variant === "dial01") {
      return (
        <div className="bc-dialwrap">
          <button className="bc-dialbtn" disabled={khoa} onClick={() => doi(-1)} aria-label={`${ten} −`}>−</button>
          <Dial v={nay} min={min} max={max} chu={chuSoCap(cap, v)} />
          <button className="bc-dialbtn" disabled={khoa} onClick={() => doi(1)} aria-label={`${ten} +`}>+</button>
        </div>
      );
    }
    if (o.variant === "step01") {
      return (
        <div className="bc-srow">
          <span className={lopN} style={{ fontSize: 15 }}>{ten}</span>
          <div className="bc-stp">
            <button disabled={khoa} onClick={() => doi(-1)} aria-label={`${ten} −`}>−</button>
            <span>{chuSoCap(cap, v)}</span>
            <button disabled={khoa} onClick={() => doi(1)} aria-label={`${ten} +`}>+</button>
          </div>
        </div>
      );
    }
    return (
      <input className="bc-sl" type="range" min={min} max={max} step={buoc} aria-label={ten}
        value={coSo(v) ? nay : min} disabled={khoa} onChange={e => gui(cap, Number(e.target.value))} />
    );
  }

  if (cap.kind === "enum") {
    const ds = cap.values ?? [];
    const cot = o.moiHang && o.moiHang > 0 ? Math.min(ds.length, o.moiHang) : cotChipTuDong(ds.length, o.w);
    return (
      <div className={`bc-chips co-${o.coNut || "vua"}`}
        style={{ gridTemplateColumns: `repeat(${2 * Math.max(1, cot)}, minmax(0, 1fr))` }}>
        {ds.map((gt, i) => {
          const chon = String(gt) === String(v);
          const chu = nhanGiaTriCap(cap, String(gt), t);
          // Không có icon thì KHÔNG dựng thẻ bọc. `.bc-chip i` có `min-height:18px`, nên một
          // thẻ rỗng vẫn chiếm chỗ và đẩy nhãn tụt xuống — nhìn như chữ không căn giữa.
          // Bản tham chiếu bỏ hẳn thẻ này khi catalog không khai icon.
          const ico = diaChiIcon(o.gtIco?.[String(gt)]);
          return (
            // Vẫn gọi `gui` khi bị khóa: chính nó nói lý do, thay vì nuốt cú bấm im lặng.
            <span key={String(gt)} role="button" tabIndex={khoa ? -1 : 0} aria-pressed={chon} aria-disabled={khoa} title={chu}
              className={`bc-chip${chon ? " on" : ""}`}
              style={{ gridColumn: cotChip(ds.length, Math.max(1, cot), i) }}
              onClick={() => gui(cap, gt)}
              onKeyDown={e => phimKichHoat(e, () => gui(cap, gt))}>
              {ico && <i aria-hidden="true"><Ico ico={ico} /></i>}
              <span>{chu}</span>
            </span>
          );
        })}
      </div>
    );
  }

  // Capability `list` không có `rpc` — lệnh đi cửa `muc/{cap}` — nên chỉ khóa theo quyền.
  if (cap.kind === "list") return <VatTuBlock device={device} cap={cap} khoa={chan} gui={vatTu} />;

  // sensor
  if (o.variant === "state01") {
    // Chưa có giá trị thì "—", không phải "Tắt". Giá trị bật/tắt chưa có nhãn thì nói Bật/Tắt;
    // còn lại (chế độ, mã trạng thái…) đi qua cùng bộ dịch nhãn với khuôn chi tiết.
    const chu = rong(v) ? "—"
      : cap.labels?.[String(v)] === undefined && laChuBatTat(v) ? (laBat(v) ? t("on") : t("off"))
        : nhanGiaTriCap(cap, String(v), t);
    return <span className="bc-big" style={{ fontSize: 15 }}>{chu}</span>;
  }
  return <span className="bc-big">{chuSoCap(cap, v)}</span>;
}

export default function BoCucGrid({ bc, device, chan, onCommand, onVatTu }: {
  bc: BoCuc;
  device: Device;
  chan: boolean;
  onCommand: (cap: IotxCapability, v: unknown) => void;
  onVatTu: GuiVatTu;
}) {
  const { t } = useChu();
  const product = device.product;
  // Lưới chỉ đổi khi catalog đổi; mỗi nhịp đồng bộ chỉ đổi giá trị, không đổi bố cục.
  const kq = useMemo(() => phanGiaiBoCuc(bc, product?.capabilities ?? [], capNguonCua(product)?.key), [bc, product]);
  const loi = kq.capBao ? danhSachLoi(kq.capBao, device.lastValues?.[kq.capBao.key]) : [];

  return (
    <div className="bc-wrap">
      {loi.length > 0 && kq.capBao && (
        <div className="bc-alarmstrip" role="alert">
          <div className="bc-alarmhead"><span aria-hidden="true">⚠</span><span>{nhanCap(kq.capBao, t)}</span></div>
          <ul>{loi.map(x => <li key={x.ma}>{x.chu}</li>)}</ul>
        </div>
      )}
      <div className="bc-grid" style={{
        gridTemplateColumns: `repeat(${kq.soCot}, 1fr)`,
        gridTemplateRows: `repeat(${Math.max(kq.soHang, 1)}, ${kq.caoHang}px)`,
      }}>
        {kq.o.map(o => {
          // Control giãn hết ngang thì thân xếp DỌC (nhãn trên, control dưới); control gọn
          // thì xếp NGANG. Đúng cách bản tham chiếu phân biệt.
          const than = dayNgang(o.variant)
            ? { flexDirection: "column" as const, justifyContent: CAN_DOC[o.canD || "giua"], alignItems: CAN_NGANG[o.canN || "giua"] }
            : { flexDirection: "row" as const, justifyContent: CAN_NGANG[o.canN || "giua"], alignItems: CAN_DOC[o.canD || "giua"] };
          return (
            <div key={o.key} className="bc-tile" data-k={o.key} data-v={o.variant} style={{
              gridColumn: `${o.col} / ${o.col + o.w}`,
              gridRow: `${kq.map[o.row]} / ${kq.map[o.row + o.h - 1] + 1}`,
            }}>
              {!tuCoNhan(o.variant) && (
                <div className={["bc-pl", lopNhan(o)].filter(Boolean).join(" ")}
                  style={{ textAlign: (CAN_CHU[o.nhan?.can ?? ""] || CAN_CHU[o.canN || "giua"] || "center") as "left" | "center" | "right" }}>
                  {nhanCap(o.cap, t)}
                </div>
              )}
              <div className="bc-body" style={than}>
                <ONoiDung o={o} device={device} t={t} chan={chan} gui={onCommand} vatTu={onVatTu} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
