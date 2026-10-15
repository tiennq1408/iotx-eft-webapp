"use client";

import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import { useChu, type HamChu } from "../chu";
import { VatTuBlock, type GuiVatTu } from "./VatTu";
import { nhanCap, nhanGiaTriCap } from "@/lib/newui/nhanCap";
import { LA_MA_MAU, capNguonCua, mauTuHex } from "@/lib/newui/khuon";
import { diaChiIcon, laDuongDan } from "@/lib/newui/assets";
import { phimKichHoat } from "@/lib/newui/phim";
import { coSo, doSo, laBat, rong } from "@/lib/iotx/giaTri";
import { chuSoCap, thongSoMuc } from "@/lib/newui/giaTriCap";
import {
  CAN_CHU, CAN_DOC, CAN_NGANG, RONG_NUT, cotChipTuDong, danhSachLoi, dayNgang, lopViTri,
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

/** `nhan.mau`: `"skin"` → màu nhấn của ô; mã hex → dùng thẳng. Giá trị khác bị bỏ — chuỗi này
    đến từ máy chủ và đi vào `style`, đừng để nó chèn được khai báo CSS lạ. */
function mauNhan(o: OdaDung): string | undefined {
  const m = o.nhan?.mau?.trim();
  if (m === "skin") return "var(--brand)";
  return m && LA_MA_MAU.test(m) ? m : undefined;
}

/**
 * Nhãn của ô, dựng như bản tham chiếu (đo lại 15/10/2026): `span.bc-lb > i.bc-lico + span.bc-lb-chu`.
 * Icon cố định (`o.ico`) mặc định nằm bên trái. Chữ đứng trong `.bc-lb-chu` riêng để ô có
 * `mauCtl` tô chữ màu mực, chỉ icon/nút mang màu nhấn; `nhan.mau` đặt thẳng lên chữ thì thắng.
 */
function NhanO({ o, ten, style, dam }: { o: OdaDung; ten: string; style?: React.CSSProperties; dam?: boolean }) {
  const ico = diaChiIcon(o.ico);
  return (
    <span className={`bc-lb ${lopViTri(o.vtIco) || "vt-trai"}`}>
      {ico && <i className="bc-lico" aria-hidden="true"><Ico ico={ico} /></i>}
      <span className={["bc-lb-chu", lopNhan(o)].filter(Boolean).join(" ")}
        style={{ ...style, fontWeight: dam ? 600 : undefined, color: mauNhan(o) }}>{ten}</span>
    </span>
  );
}

/** Ảnh nền của ô: chỉ nhận địa chỉ ảnh, và bọc chuỗi để dấu nháy trong URL không phá `url()`. */
function nenAnhO(o: OdaDung): string | undefined {
  const v = o.nenAnh?.trim();
  return v && /^(https?:\/\/|\/)/i.test(v) ? `url(${JSON.stringify(v)})` : undefined;
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

/* Dưới nửa độ thì điểm đầu và điểm cuối gần như trùng nhau: SVG bỏ cung, còn đầu tròn của
   một đoạn dài 0 thì trình duyệt tự đoán hướng nên vẽ thành vệt lệch khỏi rãnh. Ở mức đó
   vẽ thẳng một chấm tròn bằng đúng bề dày nét, đặt tại điểm đầu cung. */
const QUET_TOI_THIEU = 0.5 / GOC_QUET;
const [DAU_X, DAU_Y] = diemTren(GOC_DAU).split(" ");

function Dial({ v, min, max, chu }: { v: number; min: number; max: number; chu: string }) {
  const t = max > min ? Math.max(0, Math.min(1, (v - min) / (max - min))) : 0;
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={chu}>
      <path d={CUNG_NEN} stroke="var(--line)" strokeWidth="10" fill="none" strokeLinecap="round" />
      {t < QUET_TOI_THIEU
        ? <circle cx={DAU_X} cy={DAU_Y} r="5" fill="var(--brand)" />
        : <path d={cungTron(t)} stroke="var(--brand)" strokeWidth="10" fill="none" strokeLinecap="round" />}
      {/* Màu chữ theo ô (`currentColor`), để ô `mauCtl` trắng trên ảnh nền có chữ trắng. */}
      <text x="60" y="66" textAnchor="middle" fontSize="22" fontWeight="600" fill="currentColor">{chu}</text>
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
  // Cùng luật với khuôn chi tiết: thiếu quyền hoặc catalog không khai lệnh thì khóa.
  const khoa = chan || !cap.rpc;

  if (cap.kind === "onoff") {
    const bat = laBat(v);
    if (o.variant === "power01") {
      return (
        <div className="bc-srow" style={{ justifyContent: CAN_NGANG[o.canN || "giua"], gap: 10 }}>
          <button className={`bc-pwr${bat ? "" : " off"}`} aria-pressed={bat}
            aria-label={ten} disabled={khoa} onClick={() => gui(cap, !bat)}>⏻</button>
          {o.w >= 2 && <NhanO o={o} ten={ten} dam />}
        </div>
      );
    }
    return (
      <div className="bc-srow">
        <NhanO o={o} ten={ten} />
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
          <NhanO o={o} ten={ten} style={{ fontSize: 15 }} />
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
    const cot = Math.max(1, o.moiHang && o.moiHang > 0 ? Math.min(ds.length, o.moiHang) : cotChipTuDong(ds.length, o.w));
    // Như web.dev: khối chip là flex-wrap, mỗi chip chiếm 1/cot hàng nhưng ĐƯỢC GIÃN (grow 1),
    // nên hàng cuối thiếu chip thì các chip còn lại tự kéo kín cả hàng.
    const coChip: React.CSSProperties = { flex: `1 0 calc((100% - ${6 * (cot - 1)}px) / ${cot})` };
    if (o.rongNut && RONG_NUT[o.rongNut]) coChip.minWidth = RONG_NUT[o.rongNut];
    const gond = o.canD === "tren" || o.canD === "duoi" ? `gond gond-${o.canD}` : "";
    return (
      <div className={[`bc-chips co-${o.coNut || "vua"}`, lopViTri(o.vtIco) || "vt-tren", gond, o.hlChon === "vien" ? "hl-vien" : ""].filter(Boolean).join(" ")}>
        {ds.map(gt => {
          const chon = String(gt) === String(v);
          const chu = nhanGiaTriCap(cap, String(gt), t);
          // Không có icon thì KHÔNG dựng thẻ bọc. `.bc-chip i` có `min-height:18px`, nên một
          // thẻ rỗng vẫn chiếm chỗ và đẩy nhãn tụt xuống — nhìn như chữ không căn giữa.
          // Bản tham chiếu bỏ hẳn thẻ này khi catalog không khai icon.
          const ico = diaChiIcon(o.gtIco?.[String(gt)]);
          return (
            // Vẫn gọi `gui` khi bị khóa: chính nó nói lý do, thay vì nuốt cú bấm im lặng.
            <span key={String(gt)} role="button" tabIndex={khoa ? -1 : 0} aria-pressed={chon} aria-disabled={khoa} title={chu}
              className={["bc-chip", chon ? "on" : "", lopViTri(o.gtVt?.[String(gt)])].filter(Boolean).join(" ")}
              style={coChip}
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

/** `mauCtl`: ba biến màu nội tuyến đè lên biến gốc, chỉ trong ô này. Mã hỏng thì bỏ qua. */
function bienMauO(o: OdaDung): React.CSSProperties | undefined {
  const m = o.mauCtl ? mauTuHex(o.mauCtl.trim()) : null;
  return m ? ({ "--brand": m.brand, "--brand-deep": m.deep, "--brand-soft": m.soft } as React.CSSProperties) : undefined;
}

function lopO(o: OdaDung): string {
  return ["bc-tile", bienMauO(o) ? "mauo" : "", o.vien === "skin" ? "vien" : "", nenAnhO(o) ? "nen" : ""].filter(Boolean).join(" ");
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
          <div className="bc-alarmhead"><TriangleAlert className="ic-dong" aria-hidden="true" /><span>{nhanCap(kq.capBao, t)}</span></div>
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
            <div key={o.key} className={lopO(o)} data-k={o.key} data-v={o.variant} style={{
              gridColumn: `${o.col} / ${o.col + o.w}`,
              gridRow: `${kq.map[o.row]} / ${kq.map[o.row + o.h - 1] + 1}`,
              ...bienMauO(o),
              backgroundImage: nenAnhO(o),
            }}>
              {!tuCoNhan(o.variant) && (
                <div className={["bc-pl", lopNhan(o)].filter(Boolean).join(" ")}
                  style={{ textAlign: (CAN_CHU[o.nhan?.can ?? ""] || CAN_CHU[o.canN || "giua"] || "center") as "left" | "center" | "right", color: mauNhan(o) }}>
                  {o.ico ? <NhanO o={o} ten={nhanCap(o.cap, t)} /> : nhanCap(o.cap, t)}
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
