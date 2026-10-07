"use client";

import type { HamChu } from "../chu";
import { VatTuBlock, type GuiVatTu } from "./VatTu";
import type { O } from "@/lib/newui/khuon";
import { coSo, doSo, laBat, rong } from "@/lib/iotx/giaTri";
import { chuSoCap, thongSoMuc } from "@/lib/newui/giaTriCap";
import { nhanCap, nhanGiaTriCap } from "@/lib/newui/nhanCap";
import { phimKichHoat } from "@/lib/newui/phim";
import type { IotxCapability } from "@/lib/iotx/contracts";
import type { Device } from "@/lib/types";

/**
 * Một ô điều khiển của màn chi tiết khi sản phẩm KHÔNG khai lưới `ui.boCuc` — vẽ theo
 * `variant` mà `phanGiai` (lib/newui/khuon.ts) chọn, với đúng bộ lớp CSS của bản tham chiếu.
 */

/* ------------------------------------------------------------------ */
/* Một ô điều khiển                                                    */
/* ------------------------------------------------------------------ */

export type Ngu = {
  device: Device;
  t: HamChu;
  chan: boolean;
  gui: (cap: IotxCapability, v: unknown) => void;
  /** Lệnh trên MỘT mục vật tư đi cửa riêng `POST /devices/{id}/muc/{cap}`, không qua RPC. */
  vatTu: GuiVatTu;
};

/** Vòng cung 270°: chu vi × 0,75 — giống hệt SVG của bản tham chiếu. */
const VANH = 2 * Math.PI * 42 * 0.75;

function Dial({ nhan, giaTri, un, pct, nho }: { nhan: string; giaTri: string; un: string; pct: number; nho?: boolean }) {
  const canh = nho ? 96 : 164;
  return (
    <>
      <div className="small dim">{nhan}</div>
      <div className="ctl-dial" style={{ width: canh, height: canh }}>
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--line)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${VANH} 999`} />
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--brand)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(VANH * Math.max(0, Math.min(1, pct))).toFixed(2)} 999`} />
        </svg>
        <div className="ctl-dial-mid">
          <div className="ctl-dial-big">{giaTri}</div>
          {un && <div className="ctl-dial-un">{un}</div>}
        </div>
      </div>
    </>
  );
}

export default function VeO({ o, ngu, nhan = true }: { o: O; ngu: Ngu; nhan?: boolean }) {
  const { device, t, gui, chan, vatTu } = ngu;
  const { cap, variant } = o;
  const ten = nhanCap(cap, t);
  const v = device.lastValues?.[cap.key];
  const khoa = chan || !cap.rpc;

  const { min, max, buoc, kep } = thongSoMuc(cap);
  const nay = doSo(v, min);
  const pct = max > min ? (nay - min) / (max - min) : 0;

  switch (variant) {
    case "dial01":
      return (
        <div className="card ctl-hero">
          <Dial nhan={ten} giaTri={coSo(v) ? String(nay) : "—"} un={cap.unit ?? ""} pct={pct} />
          <div className="ctl-steprow">
            <button className="ctl-step" aria-label={`${ten} −`} disabled={khoa} onClick={() => gui(cap, kep(nay - buoc))}>−</button>
            <button className="ctl-step" aria-label={`${ten} +`} disabled={khoa} onClick={() => gui(cap, kep(nay + buoc))}>+</button>
          </div>
        </div>
      );

    case "slider01":
      return (
        <div className="card">
          {nhan && <div className="small dim">{ten}</div>}
          <div className="capline">
            <input
              className="ctl-slider" type="range" aria-label={ten}
              min={min} max={max} step={buoc} value={coSo(v) ? nay : min} disabled={khoa}
              onChange={e => gui(cap, Number(e.target.value))}
            />
            <span className="small">{chuSoCap(cap, v)}</span>
          </div>
        </div>
      );

    case "step01":
      return (
        <div className="card">
          <div className="capline">
            {nhan && <span className="small dim">{ten}</span>}
            <span className="row">
              <button className="ctl-step" aria-label={`${ten} −`} disabled={khoa} onClick={() => gui(cap, kep(nay - buoc))}>−</button>
              <span className="small">{chuSoCap(cap, v)}</span>
              <button className="ctl-step" aria-label={`${ten} +`} disabled={khoa} onClick={() => gui(cap, kep(nay + buoc))}>+</button>
            </span>
          </div>
        </div>
      );

    case "chips01": {
      // Catalog chưa khai `values` thì không dựng được lựa chọn nào — ẩn hẳn, tuyệt đối
      // không tự nghĩ ra mã lệnh để gửi.
      const ds = cap.values ?? [];
      if (!ds.length) return null;
      const dang = String(v ?? "");
      return (
        <div className="card">
          {nhan && <div className="small dim">{ten}</div>}
          <div className="mchips">
            {ds.map(x => (
              <span
                key={x}
                className={dang === x ? "on" : ""}
                role="button"
                tabIndex={khoa ? -1 : 0}
                aria-pressed={dang === x}
                aria-disabled={khoa}
                // Vẫn gọi `gui` khi đang bị chặn: chính nó nói lý do. Nuốt cú bấm ở đây thì
                // người dùng bấm mà không thấy gì xảy ra, tưởng app hỏng.
                onClick={() => gui(cap, x)}
                onKeyDown={e => phimKichHoat(e, () => gui(cap, x))}
              >
                {nhanGiaTriCap(cap, x, t)}
              </span>
            ))}
          </div>
        </div>
      );
    }

    case "switch01": {
      const bat = laBat(v);
      return (
        <div className="card capline">
          <span className="small">{ten}</span>
          <button className="switch-hit" role="switch" aria-label={ten} aria-checked={bat} disabled={khoa} onClick={() => gui(cap, !bat)}>
            <span className={`switch${bat ? " on" : ""}`} />
          </button>
        </div>
      );
    }

    case "power01": {
      const bat = laBat(v);
      return (
        <div className="card ctl-pwr">
          <div className="capline">
            <button className={`ctl-pwrbtn${bat ? " on" : ""}`} aria-label={ten} aria-pressed={bat} disabled={khoa} onClick={() => gui(cap, !bat)}>⏻</button>
            <span>{ten}</span>
            <span className="dim small">{bat ? t("on") : t("off")}</span>
          </div>
        </div>
      );
    }

    // Kiểu vẽ lạ rơi về số đọc: luôn thấy ĐƯỢC giá trị, không bao giờ là ô trống.
    case "readout01":
    default:
      return (
        <div className="card ctl-doc">
          <div className="ctl-doc-so">{rong(v) ? "—" : `${v}`}<em>{cap.unit ?? ""}</em></div>
          <div className="small dim">{ten}</div>
        </div>
      );

    case "gauge01":
      // Vòng cỡ nhỏ: `gauge01` hay nằm ở hàng số đọc, không phải khối chính — dùng lớp
      // riêng để không có hai khối chính trên cùng một màn.
      return (
        <div className="card ctl-gauge">
          <Dial nhan={ten} giaTri={coSo(v) ? String(nay) : "—"} un={cap.unit ?? ""} pct={pct} nho />
        </div>
      );

    case "state01":
      return (
        <div className="card capline">
          <span className="small dim">{ten}</span>
          <span className="small">{rong(v) ? "—" : nhanGiaTriCap(cap, String(v), t)}</span>
        </div>
      );

    case "alarm01":
      return (
        <div className="card ctl-bao" role="status">
          <b>{ten}</b>
          <span className="small">{rong(v) ? "—" : nhanGiaTriCap(cap, String(v), t)}</span>
        </div>
      );

    case "filterlist01":
      // Capability kiểu `list` KHÔNG có `rpc` — lệnh của nó đi cửa `muc/{cap}` — nên chỉ
      // khóa theo quyền (`chan`), đừng dùng `khoa` ở trên vì nó luôn true khi thiếu `rpc`.
      return (
        <div className="card ctl-vattu">
          <VatTuBlock device={device} cap={cap} khoa={chan} gui={vatTu} />
        </div>
      );

  }
}
