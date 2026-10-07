"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useChu, type HamChu } from "../chu";
import { VatTuBlock, type GuiVatTu } from "./VatTu";
import BoCucGrid from "./BoCucGrid";
import { boCucCua } from "@/lib/newui/boCuc";
import { baoDangKeu, mauSkin, phanGiai, type O } from "@/lib/newui/khuon";
import { moTaLoi } from "@/lib/iotx/errors";
import { iotxClient, isIotxMode } from "@/lib/iotx";
import { anhDaiDienSanPham } from "@/lib/newui/assets";
import { coSo, doSo, laBat } from "@/lib/iotx/giaTri";
import { nhanCap as nhanCapChung, nhanGiaTriCap as nhanGiaTriChung } from "@/lib/newui/nhanCap";
import type { IotxCapability, IotxHenGioTongQuan, IotxLenhVatTu } from "@/lib/iotx/contracts";
import type { Device } from "@/lib/types";

/**
 * Màn chi tiết thiết bị — dựng theo đúng bản tham chiếu `web.dev.happibot.net`.
 *
 * Bố cục và cách chia nhóm nằm ở `lib/newui/khuon.ts` (`phanGiai`); tệp này chỉ đổi kết quả
 * đó thành DOM, với đúng bộ lớp CSS của bản tham chiếu (`devpage`, `card`, `mchips`,
 * `ctl-*`) để hai app nhìn giống nhau với cùng một dữ liệu.
 *
 * Thứ tự trên màn: băng báo động đang kêu → số đọc → khối chính → nguồn → nhóm phụ →
 * "⋯ Xem thêm N" gói phần còn lại (kèm những báo động đang im, hiện dưới dạng dòng trạng thái).
 */

export type PropsMan = {
  device: Device;
  lang: string;
  onClose: () => void;
  onCommand: (capability: IotxCapability, value: unknown) => Promise<void>;
  onLang: (ma: string) => void;
  onAn: () => void;
  onVatTu: GuiVatTu;
  onHenGio: () => void;
};

/* ------------------------------------------------------------------ */
/* Đọc giá trị                                                         */
/* ------------------------------------------------------------------ */

const so = doSo;
const donVi = (c: IotxCapability) => (c.unit ? `${c.unitSpace ? " " : ""}${c.unit}` : "");

// Nhãn capability dùng chung với thẻ ngoài danh sách, để hai nơi không bao giờ lệch chữ.
const nhanCua = nhanCapChung;
const nhanGiaTri = (cap: IotxCapability, v: string, t: HamChu) => nhanGiaTriChung(cap, v, t);

/* ------------------------------------------------------------------ */
/* Một ô điều khiển                                                    */
/* ------------------------------------------------------------------ */

type Ngu = {
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

function VeO({ o, ngu, nhan = true }: { o: O; ngu: Ngu; nhan?: boolean }) {
  const { device, t, gui, chan, vatTu } = ngu;
  const { cap, variant } = o;
  const ten = nhanCua(cap, t);
  const v = device.lastValues?.[cap.key];
  const khoa = chan || !cap.rpc;

  const min = cap.min ?? 0;
  const max = cap.max ?? 100;
  const buoc = cap.step && cap.step > 0 ? cap.step : 1;
  const nay = so(v, min);
  const pct = max > min ? (nay - min) / (max - min) : 0;
  const kep = (x: number) => Math.min(max, Math.max(min, x));

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
            <span className="small">{coSo(v) ? `${nay}${donVi(cap)}` : "—"}</span>
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
              <span className="small">{coSo(v) ? `${nay}${donVi(cap)}` : "—"}</span>
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
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); gui(cap, x); } }}
              >
                {nhanGiaTri(cap, x, t)}
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
          <button className="switch-hit" aria-label={ten} aria-pressed={bat} disabled={khoa} onClick={() => gui(cap, !bat)}>
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

    case "readout01":
      return (
        <div className="card ctl-doc">
          <div className="ctl-doc-so">{v === undefined || v === null || v === "" ? "—" : `${v}`}<em>{cap.unit ?? ""}</em></div>
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
          <span className="small">{v === undefined || v === null || v === "" ? "—" : nhanGiaTri(cap, String(v), t)}</span>
        </div>
      );

    case "alarm01":
      return (
        <div className="card ctl-bao" role="status">
          <b>{ten}</b>
          <span className="small">{v === undefined ? "—" : nhanGiaTri(cap, String(v), t)}</span>
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

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Màn                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Một dòng tóm tắt cho thanh ghim hẹn giờ. Thứ tự ưu tiên theo cái người dùng cần biết
 * trước: chương trình đang CHẠY giữa chừng → hẹn sắp bắn → chương trình đang dùng → chưa gì.
 */
function tomTatHenGio(tq: IotxHenGioTongQuan | null, t: HamChu): string {
  if (!tq) return t("hg_chua_dat");
  if (tq.dangChay && tq.dangDung !== null) {
    const ten = tq.chuongTrinh.find(c => c.id === tq.dangDung)?.ten ?? "";
    return t("hg_ghim_chay", { ten, n: tq.dangChay.buocXong });
  }
  if (tq.hen) {
    const luc = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
      .format(new Date(tq.hen.luc));
    return t(tq.hen.bat ? "hg_ghim_bat" : "hg_ghim_tat", { luc });
  }
  if (tq.dangDung !== null) {
    return t("hg_ghim_dung", { ten: tq.chuongTrinh.find(c => c.id === tq.dangDung)?.ten ?? "" });
  }
  return t("hg_chua_dat");
}

export default function DeviceDetail({ device, onClose, onCommand, onAn, onHenGio, onVatTu }: PropsMan) {
  const { t } = useChu();
  const [loi, setLoi] = useState("");

  /**
   * Thanh ghim phải nói ĐÚNG trạng thái, không in cứng "chưa đặt gì".
   *
   * Hỏi thẳng `/hen-gio` thay vì suy từ catalog, vì chỉ máy chủ mới biết có hẹn đang chờ
   * hay chương trình đang chạy. Ba kết cục:
   *   batDuoc=false  → sản phẩm tắt hẹn giờ
   *   404            → máy được chia sẻ; hợp đồng chỉ cho CHỦ dùng hẹn giờ
   * Cả hai đều GIẤU hẳn thanh, thay vì mời người dùng bấm vào một màn chỉ báo lỗi.
   */
  const [hg, setHg] = useState<IotxHenGioTongQuan | null>(null);
  const [hienGhim, setHienGhim] = useState(!isIotxMode);

  const taiHenGio = useCallback(async () => {
    if (!isIotxMode) return;
    try {
      const tq = await iotxClient.xemHenGio(device.id);
      setHg(tq);
      setHienGhim(tq.batDuoc);
    } catch { setHienGhim(false); }
  }, [device.id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void taiHenGio(); }, [taiHenGio]);
  const [moThem, setMoThem] = useState(false);

  const kq = useMemo(
    () => phanGiai(device.product, device.product?.capabilities ?? []),
    [device.product],
  );

  // Ngoại tuyến KHÔNG chặn thao tác — bản tham chiếu cũng không chặn, và thực tế lệnh gửi
  // cho máy đang offline vẫn tới nơi (nền tảng xếp hàng / máy lấy lại khi kết nối lại). Chỉ
  // thiếu quyền mới là chặn thật; còn lại để máy chủ quyết và báo lỗi nếu từ chối.
  const choDieuKhien = device.perms?.control !== false;
  const choXoa = device.perms?.delete !== false;

  function gui(cap: IotxCapability, giaTri: unknown) {
    if (device.perms?.control === false) { setLoi(t("chan_khongQuyen")); return; }
    if (!cap.rpc) { setLoi(t("chan_khong_lenh", { ten: nhanCua(cap, t) })); return; }
    setLoi("");
    onCommand(cap, giaTri).catch(e => setLoi(moTaLoi(e)));
  }

  async function guiVatTu(cap: IotxCapability, lenh: IotxLenhVatTu) {
    if (device.perms?.control === false) { setLoi(t("chan_khongQuyen")); return; }
    setLoi("");
    try { await onVatTu(cap, lenh); }
    catch (e) { setLoi(moTaLoi(e)); }
  }

  const ngu: Ngu = { device, t, chan: !choDieuKhien, gui, vatTu: guiVatTu };
  const anhDaiDien = anhDaiDienSanPham(device.product);
  // Catalog khai lưới thì lưới quyết tất; chưa khai thì vẫn đi đường khuôn/slots cũ.
  const bc = boCucCua(device.product);
  const da = mauSkin(bc?.skin ?? kq?.skin);
  const bien = da
    ? ({ display: "contents", "--brand": da.brand, "--brand-deep": da.deep, "--brand-soft": da.soft } as React.CSSProperties)
    : undefined;

  // Báo động đang im không đáng chiếm chỗ trên đầu màn — tụt xuống "xem thêm" dạng dòng
  // trạng thái, đúng như bản tham chiếu.
  const baoKeu = (kq?.veBao ?? []).filter(o => baoDangKeu(o.cap, device.lastValues?.[o.cap.key]));
  const baoIm = (kq?.veBao ?? [])
    .filter(o => !baoDangKeu(o.cap, device.lastValues?.[o.cap.key]))
    .map(o => ({ ...o, variant: "state01" }));
  const them = [...(kq?.veMore ?? []), ...baoIm];

  const than = bc ? (
    <div style={bien}>
      <BoCucGrid bc={bc} device={device} onCommand={gui} onVatTu={guiVatTu} />
    </div>
  ) : kq && (
    <div style={bien}>
      {baoKeu.map(o => <VeO key={o.cap.key} o={o} ngu={ngu} />)}

      {kq.veStatus.length > 0 && (
        <div className={`ctl-hang${kq.veStatus.length === 1 ? " mot" : ""}`}>
          {kq.veStatus.map(o => <VeO key={o.cap.key} o={o} ngu={ngu} />)}
        </div>
      )}

      {kq.veHero && (kq.veHero.variant === "dial01" || kq.veHero.variant === "gauge01" || kq.veHero.cap.kind === "list"
        ? <VeO o={kq.veHero} ngu={ngu} />
        : (
          <div className="card ctl-hero">
            <div className="small dim">{nhanCua(kq.veHero.cap, t)}</div>
            <VeO o={kq.veHero} ngu={ngu} nhan={false} />
          </div>
        ))}

      {kq.veNguon && <VeO o={kq.veNguon} ngu={ngu} />}
      {kq.veSecondary.map(o => <VeO key={o.cap.key} o={o} ngu={ngu} />)}

      {them.length > 0 && (moThem ? (
        <>
          <div className="small dim" style={{ marginTop: ".2rem" }}>{t("khung_more")} · {them.length}</div>
          {them.map(o => <VeO key={o.cap.key} o={o} ngu={ngu} />)}
          <button className="btn gh" onClick={() => setMoThem(false)}>{t("khung_less")}</button>
        </>
      ) : (
        <button className="btn gh ctl-more" onClick={() => setMoThem(true)}>
          ⋯ {t("khung_more")} <b>{them.length}</b>
        </button>
      ))}
    </div>
  );

  return (
    <div className="sheet devpage">
      <div className="devbody">
        {/* Một hàng duy nhất mang tên thiết bị: thanh tiêu đề phía trên lặp lại đúng cái
            tên này nên đã bỏ, nút trở lại dọn xuống đây cùng hàng. */}
        <div className="row devdau">
          <button className="devback" aria-label={t("back")} onClick={onClose}>‹</button>
          <span className="dev-ico" aria-hidden="true">
            {anhDaiDien.kieu === "anh"
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={anhDaiDien.src} alt="" />
              : anhDaiDien.chu}
          </span>
          <div className="dev-giua">
            <div className="dev-tenhang">
              <span className="dev-ten">{device.name}</span>
            </div>
            <div className={`dev-st small${device.online ? "" : " dim"}`}>
              <i className={`dev-dot${device.online ? " on" : ""}`} />
              {device.online ? t("online") : t("offline")}
              {device.room ? ` · ${device.room}` : ""}
            </div>
          </div>
        </div>

        {/* Sản phẩm không có khuôn nhận ra được: nói thẳng thay vì vẽ một màn nửa vời. */}
        {!bc && !kq && <p className="small dim">{t("khong_co_khuon")}</p>}

        {than}

        {loi && <p className="form-message" role="status">{loi}</p>}
        {!choDieuKhien && <p className="small dim">{t("chan_khongQuyen")}</p>}
        {/* Máy đang ngoại tuyến: nhắc để biết lệnh có thể chưa tới ngay, nhưng vẫn bấm được. */}
        {choDieuKhien && !device.online && <p className="small dim">{t("nhac_offline")}</p>}

        <div className="frow">
          {choXoa && <button className="btn gh" onClick={onAn}>🙈 {t("hide_device")}</button>}
          <button className="btn gh" onClick={onClose}>{t("close")}</button>
        </div>

        {hienGhim && device.product?.henGio?.bat !== false && (
          <button className="hg-ghim" onClick={onHenGio}>
            <b>⏱ {t("hg_open")}</b>
            <i>{tomTatHenGio(hg, t)}</i>
          </button>
        )}
      </div>
    </div>
  );
}
