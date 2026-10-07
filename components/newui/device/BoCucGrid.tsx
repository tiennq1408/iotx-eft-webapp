"use client";

import { useChu, type HamChu } from "../chu";
import { VatTuBlock, type GuiVatTu } from "./VatTu";
import { nhanCap, nhanGiaTriCap } from "@/lib/newui/nhanCap";
import { diaChiIcon } from "@/lib/newui/assets";
import { coSo, doSo, laBat } from "@/lib/iotx/giaTri";
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

const donVi = (c: IotxCapability) => (c.unit ? `${c.unitSpace ? " " : ""}${c.unit}` : "");

/**
 * `gtIco`: emoji, địa chỉ ảnh, hoặc `@ten` trỏ vào kho icon của sadmin — `diaChiIcon` lo
 * phân loại. Trả null nghĩa là KHÔNG có gì để vẽ, và lúc đó đừng vẽ thẻ bọc (xem `ONoiDung`).
 */
const icoVeDuoc = diaChiIcon;

function Ico({ ico }: { ico: string }) {
  if (/^(https?:|data:image|\/)/i.test(ico)) {
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

function lopNhan(o: OdaDung) {
  const n = o.nhan ?? {};
  return (n.co && n.co !== "vua" ? ` nh-${n.co}` : "") + (n.dam ? " nh-dam" : "") + (n.nghieng ? " nh-nghieng" : "");
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
export function cungTron(t: number) {
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

function ONoiDung({ o, device, t, gui, vatTu }: {
  o: OdaDung; device: Device; t: HamChu;
  gui: (cap: IotxCapability, v: unknown) => void;
  vatTu: GuiVatTu;
}) {
  const cap = o.cap;
  const v = device.lastValues?.[cap.key];
  const ten = nhanCap(cap, t);

  if (cap.kind === "onoff") {
    const bat = laBat(v);
    if (o.variant === "power01") {
      return (
        <div className="bc-srow" style={{ justifyContent: "center", gap: 10 }}>
          <button className={`bc-pwr${bat ? "" : " off"}`} aria-pressed={bat}
            aria-label={ten} onClick={() => gui(cap, !bat)}>⏻</button>
          {o.w >= 2 && <b className={lopNhan(o).trim() || undefined} style={{ fontWeight: 600 }}>{ten}</b>}
        </div>
      );
    }
    return (
      <div className="bc-srow">
        <span className={lopNhan(o).trim() || undefined}>{ten}</span>
        <button className="switch-hit" role="switch" aria-checked={bat}
          aria-label={ten} onClick={() => gui(cap, !bat)}>
          <span className={`switch${bat ? " on" : ""}`} />
        </button>
      </div>
    );
  }

  if (cap.kind === "level") {
    const min = Number(cap.min ?? 0), max = Number(cap.max ?? 100), buoc = Number(cap.step ?? 1) || 1;
    const nay = doSo(v, min);
    const doi = (huong: number) => gui(cap, Math.max(min, Math.min(max, nay + huong * buoc)));
    if (o.variant === "dial01") {
      return (
        <div className="bc-dialwrap">
          <button className="bc-dialbtn" onClick={() => doi(-1)} aria-label={`${ten} −`}>−</button>
          <Dial v={nay} min={min} max={max} chu={coSo(v) ? `${nay}${donVi(cap)}` : "—"} />
          <button className="bc-dialbtn" onClick={() => doi(1)} aria-label={`${ten} +`}>+</button>
        </div>
      );
    }
    if (o.variant === "step01") {
      return (
        <div className="bc-srow">
          <span className={lopNhan(o).trim() || undefined} style={{ fontSize: 15 }}>{ten}</span>
          <div className="bc-stp">
            <button onClick={() => doi(-1)} aria-label={`${ten} −`}>−</button>
            <span>{coSo(v) ? `${nay}${donVi(cap)}` : "—"}</span>
            <button onClick={() => doi(1)} aria-label={`${ten} +`}>+</button>
          </div>
        </div>
      );
    }
    return (
      <input className="bc-sl" type="range" min={min} max={max} step={buoc} aria-label={ten}
        value={coSo(v) ? nay : min} onChange={e => gui(cap, Number(e.target.value))} />
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
          const ico = icoVeDuoc(o.gtIco?.[String(gt)]);
          return (
            <span key={String(gt)} role="button" tabIndex={0} aria-pressed={chon} title={chu}
              className={`bc-chip${chon ? " on" : ""}`}
              style={{ gridColumn: cotChip(ds.length, Math.max(1, cot), i) }}
              onClick={() => gui(cap, gt)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); gui(cap, gt); } }}>
              {ico && <i aria-hidden="true"><Ico ico={ico} /></i>}
              <span>{chu}</span>
            </span>
          );
        })}
      </div>
    );
  }

  if (cap.kind === "list") return <VatTuBlock device={device} cap={cap} khoa={false} gui={vatTu} />;

  // sensor
  if (o.variant === "state01") {
    const chu = cap.labels?.[String(v)] ?? (laBat(v) ? t("on") : t("off"));
    return <span className="bc-big" style={{ fontSize: 15 }}>{chu}</span>;
  }
  return <span className="bc-big">{coSo(v) ? `${doSo(v, 0)}${donVi(cap)}` : "—"}</span>;
}

export default function BoCucGrid({ bc, device, onCommand, onVatTu }: {
  bc: BoCuc;
  device: Device;
  onCommand: (cap: IotxCapability, v: unknown) => void;
  onVatTu: GuiVatTu;
}) {
  const { t } = useChu();
  const kq = phanGiaiBoCuc(bc, device.product?.capabilities ?? []);
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
                <div className={`bc-pl${lopNhan(o)}`}
                  style={{ textAlign: (CAN_CHU[o.nhan?.can ?? ""] || CAN_CHU[o.canN || "giua"] || "center") as "left" | "center" | "right" }}>
                  {nhanCap(o.cap, t)}
                </div>
              )}
              <div className="bc-body" style={than}>
                <ONoiDung o={o} device={device} t={t} gui={onCommand} vatTu={onVatTu} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
