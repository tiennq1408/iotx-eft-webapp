"use client";

import { useState } from "react";
import { useChu, type HamChu } from "../chu";
import type { GuiVatTu } from "./VatTu";
import BoCucGrid from "./BoCucGrid";
import VeO, { type Ngu } from "./VeO";
import { boCucCua } from "@/lib/newui/boCuc";
import { baoDangKeu, mauSkin, phanGiaiSanPham } from "@/lib/newui/khuon";
import { moTaLoi } from "@/lib/iotx/errors";
import { isIotxMode } from "@/lib/iotx";
import { anhDaiDienSanPham } from "@/lib/newui/assets";
import { nhanCap } from "@/lib/newui/nhanCap";
import { tenChuongTrinhDangDung } from "@/lib/newui/henGio";
import { dinhDangLuc } from "@/lib/newui/thoiGian";
import { useHenGio } from "@/hooks/useHenGio";
import type { IotxCapability, IotxHenGioTongQuan, IotxLenhVatTu } from "@/lib/iotx/contracts";
import type { Device, SpaceState } from "@/lib/types";

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
  onClose: () => void;
  onCommand: (capability: IotxCapability, value: unknown) => Promise<void>;
  onAn: () => void;
  /** Ném lỗi khi máy chủ từ chối — màn này hiện lỗi ngay cạnh khối vật tư. */
  onVatTu: (capability: IotxCapability, lenh: IotxLenhVatTu) => Promise<void>;
  onHenGio: () => void;
  /** Danh sách nhà / phòng / nhóm để đổ vào ba ô gán ở đầu màn. */
  spaces: SpaceState;
  /** Sửa chính thiết bị: đổi tên, gán chỗ, ghim. Một cửa `PATCH /devices/{id}` lo cả bốn. */
  onSua: (patch: { label?: string; house?: string; room?: string; grp?: string; fav?: boolean }) => Promise<void>;
};

/* ------------------------------------------------------------------ */
/* Màn                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Ba ô gán ở đầu màn. `grp` là tên trường của API, còn trong `Device` nó là `group` —
 * khác tên nên tách riêng thay vì suy ra, để sau này đọc không phải đoán.
 */
const GAN = [
  { khoa: "house" as const, dsKey: "houses" as const, nhan: "pick_house", chuaGan: "dev_chua_gan_nha" },
  { khoa: "room" as const, dsKey: "rooms" as const, nhan: "pick_room", chuaGan: "dev_chua_gan_phong" },
  { khoa: "grp" as const, dsKey: "groups" as const, nhan: "pick_group", chuaGan: "dev_chua_gan_nhom" },
];

/**
 * Một dòng tóm tắt cho thanh ghim hẹn giờ. Thứ tự ưu tiên theo cái người dùng cần biết
 * trước: chương trình đang CHẠY giữa chừng → hẹn sắp bắn → chương trình đang dùng → chưa gì.
 */
function tomTatHenGio(tq: IotxHenGioTongQuan | null, t: HamChu): string {
  if (!tq) return t("hg_chua_dat");
  if (tq.dangChay && tq.dangDung !== null) {
    return t("hg_ghim_chay", { ten: tenChuongTrinhDangDung(tq), n: tq.dangChay.buocXong });
  }
  if (tq.hen) return t(tq.hen.bat ? "hg_ghim_bat" : "hg_ghim_tat", { luc: dinhDangLuc(tq.hen.luc) });
  if (tq.dangDung !== null) return t("hg_ghim_dung", { ten: tenChuongTrinhDangDung(tq) });
  return t("hg_chua_dat");
}

export default function DeviceDetail({ device, onClose, onCommand, onAn, onHenGio, onVatTu, spaces, onSua }: PropsMan) {
  const { t } = useChu();
  const [loi, setLoi] = useState("");
  const [doiTen, setDoiTen] = useState(false);
  const [tenMoi, setTenMoi] = useState("");
  const [themMuc, setThemMuc] = useState<"house" | "room" | "grp" | null>(null);

  /** Người chỉ được xem thì không sửa được tên, chỗ hay ghim — ẩn hẳn cho khỏi mời gọi. */
  const choSua = device.perms?.create !== false && device.perms?.control !== false;

  async function lam(patch: Parameters<typeof onSua>[0]) {
    setLoi("");
    try { await onSua(patch); }
    catch (e) { setLoi(moTaLoi(e)); }
  }

  async function luuTen() {
    if (!doiTen) return;
    const v = tenMoi.trim();
    setDoiTen(false);
    if (v && v !== device.name) await lam({ label: v });
  }

  /**
   * Thanh ghim phải nói ĐÚNG trạng thái, không in cứng "chưa đặt gì".
   *
   * Hỏi thẳng `/hen-gio` thay vì suy từ catalog, vì chỉ máy chủ mới biết có hẹn đang chờ
   * hay chương trình đang chạy. Hai kết cục GIẤU hẳn thanh:
   *   batDuoc=false  → sản phẩm tắt hẹn giờ
   *   404 / 403      → máy được chia sẻ (hợp đồng chỉ cho CHỦ), hoặc sản phẩm tắt hẹn giờ
   * Lỗi tạm (mất mạng, 502, 401…) thì GIỮ thanh: dòng tóm tắt nói lỗi, bấm vào là màn hẹn
   * giờ cho thử lại. Đang tải lần đầu thì chưa vẽ, để nút không nháy lên rồi lại biến mất.
   */
  const { tongQuan: hg, loi: loiHenGio, anGian, dangTai: dangTaiHenGio } = useHenGio(device.id);
  const hienGhim = !isIotxMode || (!dangTaiHenGio && !anGian && hg?.batDuoc !== false);
  const [moThem, setMoThem] = useState(false);

  const kq = phanGiaiSanPham(device.product);

  // Ngoại tuyến KHÔNG chặn thao tác — bản tham chiếu cũng không chặn, và thực tế lệnh gửi
  // cho máy đang offline vẫn tới nơi (nền tảng xếp hàng / máy lấy lại khi kết nối lại). Chỉ
  // thiếu quyền mới là chặn thật; còn lại để máy chủ quyết và báo lỗi nếu từ chối.
  const choDieuKhien = device.perms?.control !== false;
  const choXoa = device.perms?.delete !== false;

  /** Người được chia sẻ chỉ-xem: báo lý do ngay tại chỗ thay vì để máy chủ từ chối. */
  function khongQuyen() {
    if (choDieuKhien) return false;
    setLoi(t("chan_khongQuyen"));
    return true;
  }

  function gui(cap: IotxCapability, giaTri: unknown) {
    if (khongQuyen()) return;
    if (!cap.rpc) { setLoi(t("chan_khong_lenh", { ten: nhanCap(cap, t) })); return; }
    setLoi("");
    onCommand(cap, giaTri).catch(e => setLoi(moTaLoi(e)));
  }

  const guiVatTu: GuiVatTu = async (cap, lenh) => {
    if (khongQuyen()) return false;
    setLoi("");
    try { await onVatTu(cap, lenh); return true; }
    catch (e) { setLoi(moTaLoi(e)); return false; }
  };

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
      <BoCucGrid bc={bc} device={device} chan={!choDieuKhien} onCommand={gui} onVatTu={guiVatTu} />
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
            <div className="small dim">{nhanCap(kq.veHero.cap, t)}</div>
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
              {doiTen ? (
                <input className="dev-teno" autoFocus value={tenMoi} maxLength={60}
                  aria-label={t("dev_rename")}
                  onChange={e => setTenMoi(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") void luuTen(); if (e.key === "Escape") setDoiTen(false); }}
                  onBlur={() => { void luuTen(); }} />
              ) : (
                <>
                  <span className="dev-ten">{device.name}</span>
                  {choSua && (
                    <button className="dev-but" aria-label={t("dev_rename")}
                      onClick={() => { setTenMoi(device.name); setDoiTen(true); }}>✏️</button>
                  )}
                </>
              )}
            </div>
            <div className={`dev-st small${device.online ? "" : " dim"}`}>
              <i className={`dev-dot${device.online ? " on" : ""}`} />
              {device.online ? t("online") : t("offline")}
              {device.shared ? ` · 👥 ${t("dev_shared")}` : ""}
            </div>
          </div>
          <button className={`fav-lon${device.fav ? " on" : ""}`} aria-pressed={Boolean(device.fav)}
            aria-label={t("dev_fav")} onClick={() => { void lam({ fav: !device.fav }); }}>★</button>
        </div>

        {/* Gán nhà / phòng / nhóm ngay tại đây, không phải lặn vào màn quản lý. */}
        {choSua && (
          <div className="frow dev-gan">
            {GAN.map(({ khoa, dsKey, nhan, chuaGan }) => {
              const dang = khoa === "grp" ? device.group : (device[khoa] as string);
              const ds = [...new Set([...(spaces[dsKey] ?? []), dang].filter(Boolean))]
                .sort((a, b) => a.localeCompare(b, "vi"));
              return themMuc === khoa ? (
                <input key={khoa} className="fsel" autoFocus placeholder={t(nhan)} maxLength={40}
                  aria-label={t(nhan)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { void lam({ [khoa]: e.currentTarget.value.trim() }); setThemMuc(null); }
                    if (e.key === "Escape") setThemMuc(null);
                  }}
                  onBlur={e => { const v = e.target.value.trim(); if (v) void lam({ [khoa]: v }); setThemMuc(null); }} />
              ) : (
                <select key={khoa} className="fsel" aria-label={t(nhan)} value={dang || ""}
                  onChange={e => {
                    if (e.target.value === "__moi") { setThemMuc(khoa); return; }
                    void lam({ [khoa]: e.target.value });
                  }}>
                  <option value="">{t(chuaGan)}</option>
                  {ds.map(v => <option key={v} value={v}>{v}</option>)}
                  <option value="__moi">＋ {t("dev_them_moi")}</option>
                </select>
              );
            })}
          </div>
        )}

        {/* Không có capability nào để vẽ: nói thẳng thay vì một màn trống không giải thích. */}
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
            <i>{loiHenGio && !hg ? loiHenGio : tomTatHenGio(hg, t)}</i>
          </button>
        )}
      </div>
    </div>
  );
}
