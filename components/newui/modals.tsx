"use client";

import Image from "next/image";
import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Camera } from "lucide-react";
import Icon from "./Icon";
import { Sheet } from "./shell";
import { useChu } from "./chu";
import { IMG } from "@/lib/newui/assets";
import { coNgonNgu, MAT_KHAU_TOI_THIEU, tenNgonNgu } from "@/lib/newui/ngonNgu";
import type { CaiDat, CoChu, GiaoDien } from "@/lib/newui/caiDat";
import { DOI_MAT_KHAU_CHUA_BAT, HO_SO_CHUA_BAT, IotxApiError, iotxClient, moTaLoi } from "@/lib/iotx";
import type { UiNotification } from "@/lib/types";
import { TAT_CA } from "@/lib/newui/boLoc";

export type MucMenu = "spaces" | "members" | "add" | "virtual" | "timers" | "devices";

/** Nhãn của từng lựa chọn — khóa chữ, dùng chung cho popup tài khoản và popup chọn. */
export const NHAN_GIAO_DIEN: Record<GiaoDien, string> = { sang: "gd_sang", toi: "gd_toi", heThong: "gd_he_thong" };
export const NHAN_CO_CHU: Record<CoChu, string> = { vua: "co_vua", lon: "co_lon", ratLon: "co_rat_lon" };

/** Ba mục trong cụm Tài khoản mở popup chọn: cùng một kiểu dòng, cùng một kiểu popup. */
export type MucChon = "ngonNgu" | "coChu" | "giaoDien";

/** Menu góc phải: đúng năm mục quản lý và dòng phiên bản. */
export function MenuDrawer({ phienBan, onClose, onChon }: {
  phienBan: string;
  onClose: () => void;
  onChon: (muc: MucMenu) => void;
}) {
  const { t } = useChu();
  const items: Array<{ emo: string; nhan: string; muc: MucMenu }> = [
    { emo: "🏠", nhan: "menu_spaces", muc: "spaces" },
    { emo: "👥", nhan: "menu_members", muc: "members" },
    { emo: "🔲", nhan: "menu_devices", muc: "devices" },
    { emo: "📶", nhan: "menu_add", muc: "add" },
    { emo: "☀️", nhan: "menu_virtual", muc: "virtual" },
  ];
  return (
    <div className="drawer-overlay" role="dialog" aria-modal="true" aria-label={t("menu_title")}>
      <button className="modal-scrim" aria-label={t("close")} onClick={onClose} />
      <aside className="drawer">
        <button className="nut-dong-goc" aria-label={t("close")} onClick={onClose}><Icon name="close" /></button>
        <h3><Icon name="menu" /> {t("menu_title")}</h3>
        {items.map(muc => (
          <button key={muc.muc} className="drawer-item" onClick={() => onChon(muc.muc)}>
            <span className="emo" aria-hidden="true">{muc.emo}</span>{t(muc.nhan)}
          </button>
        ))}
        <p className="drawer-foot">{t("version_line", { ban: phienBan })}</p>
      </aside>
    </div>
  );
}

/**
 * Popup tài khoản — mở khi bấm avatar + tên ở góc trái trên, thả xuống ngay dưới đó.
 *
 * Hồ sơ · cụm Tài khoản (đổi mật khẩu, ngôn ngữ, cỡ chữ, giao diện, thông báo) · Đăng xuất.
 * Ngôn ngữ, cỡ chữ, giao diện là ba dòng giống nhau: nhãn, giá trị đang chọn, mũi tên; bấm
 * vào mở popup chọn (`ChonModal`). Danh sách ngôn ngữ dựng từ `langs` máy chủ trả.
 */
export function TaiKhoanPopup({ ten, email, lang, caiDat, onCaiDat, onClose, onDoiTen, onDoiAnh, onDoiMatKhau, onMoChon, onDangXuat }: {
  ten: string;
  email: string;
  lang: string;
  caiDat: CaiDat;
  onCaiDat: (patch: Partial<CaiDat>) => void;
  onClose: () => void;
  onDoiTen: () => void;
  onDoiAnh: () => void;
  onDoiMatKhau: () => void;
  onMoChon: (muc: MucChon) => void;
  onDangXuat: () => void;
}) {
  const { t } = useChu();
  const dongChon: Array<{ muc: MucChon; emo: string; nhan: string; giaTri: string }> = [
    { muc: "ngonNgu", emo: "🌐", nhan: "menu_ngon_ngu", giaTri: `${coNgonNgu(lang)} ${tenNgonNgu(lang)}` },
    { muc: "coChu", emo: "🔤", nhan: "chu_co", giaTri: t(NHAN_CO_CHU[caiDat.coChu]) },
    { muc: "giaoDien", emo: "🌓", nhan: "menu_giao_dien", giaTri: t(NHAN_GIAO_DIEN[caiDat.giaoDien]) },
  ];
  return (
    <div className="tk-overlay" role="dialog" aria-modal="true" aria-label={t("menu_tai_khoan")}>
      <button className="modal-scrim" aria-label={t("close")} onClick={onClose} />
      <section className="tk-popup">
        <button className="nut-dong-goc" aria-label={t("close")} onClick={onClose}><Icon name="close" /></button>
        <div className="menu-ho-so">
          <button className="tk-anh" aria-label={t("anh_doi")} onClick={onDoiAnh}>
            <span className="avatar-circle"><Image unoptimized src={IMG.avatar} alt="" width={48} height={48} /></span>
            <span className="tk-anh-icon" aria-hidden="true"><Camera /></span>
          </button>
          <div className="menu-ho-so-chu">
            <strong>{ten}</strong>
            {email && <span>{email}</span>}
          </div>
        </div>

        <div className="menu-cum" role="group" aria-labelledby="menu-cum-tai-khoan">
          <h3 id="menu-cum-tai-khoan">{t("menu_tai_khoan")}</h3>
          <button className="drawer-item" onClick={onDoiTen}>
            <span className="emo" aria-hidden="true">✏️</span>
            <span className="menu-nhan">{t("menu_doi_ten")}</span>
            <span className="menu-mui" aria-hidden="true"><Icon name="chevRight" /></span>
          </button>
          <button className="drawer-item" onClick={onDoiMatKhau}>
            <span className="emo" aria-hidden="true">🔑</span>
            <span className="menu-nhan">{t("menu_doi_mk")}</span>
            <span className="menu-mui" aria-hidden="true"><Icon name="chevRight" /></span>
          </button>
          {dongChon.map(d => (
            <button key={d.muc} className="drawer-item menu-dong-chon" aria-haspopup="dialog" onClick={() => onMoChon(d.muc)}>
              <span className="emo" aria-hidden="true">{d.emo}</span>
              <span className="menu-nhan">{t(d.nhan)}</span>
              <span className="menu-gia-tri">{d.giaTri}</span>
              <span className="menu-mui" aria-hidden="true"><Icon name="chevRight" /></span>
            </button>
          ))}
          <button className="drawer-item" role="switch" aria-checked={caiDat.thongBao} onClick={() => onCaiDat({ thongBao: !caiDat.thongBao })}>
            <span className="emo" aria-hidden="true">🔔</span>
            <span className="menu-nhan">
              {t("menu_thong_bao")}
              <small>{t("menu_thong_bao_mo_ta")}</small>
            </span>
            <span className={`switch${caiDat.thongBao ? " on" : ""}`} aria-hidden="true" />
          </button>
        </div>

        <button className="btn-full danger menu-dang-xuat" onClick={onDangXuat}>{t("logout")}</button>
      </section>
    </div>
  );
}

/** Dòng xem trước trong popup cỡ chữ — dịch theo ngôn ngữ đang dùng. */
export function XemTruocCoChu() {
  const { t } = useChu();
  return <p className="chu-xem-truoc">{t("chu_xem_truoc")}</p>;
}

/**
 * Popup chọn MỘT giá trị — dùng chung cho ngôn ngữ, cỡ chữ, giao diện để ba mục trông và
 * dùng giống hệt nhau. Chọn xong là đóng (quay về menu); `phuLuc` để thêm dòng xem trước.
 */
export function ChonModal({ khoaTieuDe, luaChon, dangChon, onChon, onClose, phuLuc }: {
  /** Khóa chữ — hộp nằm trong `ChuProvider` nên tự dịch, kể cả chữ máy chủ `/i18n` trả. */
  khoaTieuDe: string;
  /** `khoa`: khóa chữ để dịch; `nhan`: chữ sẵn (tên ngôn ngữ viết bằng chính nó). */
  luaChon: Array<{ giaTri: string; khoa?: string; nhan?: string }>;
  dangChon: string;
  onChon: (giaTri: string) => void;
  onClose: () => void;
  phuLuc?: ReactNode;
}) {
  const { t } = useChu();
  const tieuDe = t(khoaTieuDe);
  return (
    <Sheet title={tieuDe} onClose={onClose} centered>
      <h2 className="modal-title">{tieuDe}</h2>
      <div className="chon-ds">
        {luaChon.map(l => (
          <button key={l.giaTri} className={`radio-list-row${dangChon === l.giaTri ? " sel" : ""}`} aria-pressed={dangChon === l.giaTri} onClick={() => onChon(l.giaTri)}>
            <span className="rc" />{l.khoa ? t(l.khoa) : l.nhan}
          </button>
        ))}
      </div>
      {phuLuc}
    </Sheet>
  );
}

/**
 * Đổi tên hiển thị. Chặn tại chỗ khi bỏ trống hoặc quá dài; tới khi IBS mở cửa sửa hồ sơ,
 * gửi đi nhận `HO_SO_CHUA_BAT` và màn nói rõ là tính năng đang chờ bật.
 */
const TEN_TOI_DA = 60;
export function DoiTenModal({ tenHienTai, onClose }: { tenHienTai: string; onClose: () => void }) {
  const { t } = useChu();
  const [ten, setTen] = useState(tenHienTai);
  const [loi, setLoi] = useState("");
  const [canhBao, setCanhBao] = useState("");
  const [dangGui, setDangGui] = useState(false);

  async function gui(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCanhBao("");
    const moi = ten.trim();
    const l = !moi ? t("dt_loi_trong") : moi.length > TEN_TOI_DA ? t("dt_loi_dai", { n: TEN_TOI_DA }) : "";
    setLoi(l);
    if (l) return;
    setDangGui(true);
    try {
      await iotxClient.doiTen(moi);
      onClose();
    } catch (error) {
      setCanhBao(error instanceof IotxApiError && error.message === HO_SO_CHUA_BAT ? t("dt_chua_bat") : moTaLoi(error));
    } finally { setDangGui(false); }
  }

  return (
    <Sheet title={t("menu_doi_ten")} onClose={onClose}>
      <h2 className="modal-title">{t("menu_doi_ten")}</h2>
      <form className="stack" noValidate onSubmit={gui}>
        {canhBao && <p className="dynamic-error" role="alert">{canhBao}</p>}
        <div className="field">
          <label htmlFor="dt-ten">{t("dt_ten")}</label>
          <input id="dt-ten" value={ten} placeholder={t("dt_ten_ph")} autoComplete="name" maxLength={TEN_TOI_DA + 20}
            aria-invalid={Boolean(loi)} aria-describedby={loi ? "dt-ten-err" : undefined}
            onChange={event => { setTen(event.target.value); setLoi(""); }} />
          {loi && <span className="dmk-err" id="dt-ten-err">{loi}</span>}
        </div>
        <button className="btn-full" type="submit" disabled={dangGui}>{dangGui ? t("working") : t("save")}</button>
      </form>
    </Sheet>
  );
}

/**
 * Đổi ảnh đại diện: chọn ảnh từ máy, xem trước, rồi lưu. Tới khi IBS mở cửa tải ảnh, lưu sẽ
 * nhận `HO_SO_CHUA_BAT` và màn nói rõ là tính năng đang chờ bật.
 */
export function DoiAnhModal({ onClose }: { onClose: () => void }) {
  const { t } = useChu();
  const [tep, setTep] = useState<File | null>(null);
  const [xemTruoc, setXemTruoc] = useState<string | null>(null);
  const [loi, setLoi] = useState("");
  const [canhBao, setCanhBao] = useState("");
  const [dangGui, setDangGui] = useState(false);

  // Thu hồi địa chỉ ảnh xem trước khi đổi ảnh khác hoặc đóng hộp, không thì rò bộ nhớ.
  useEffect(() => () => { if (xemTruoc) URL.revokeObjectURL(xemTruoc); }, [xemTruoc]);

  function chonTep(event: ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0];
    event.target.value = "";
    if (!f) return;
    setCanhBao("");
    if (!f.type.startsWith("image/")) { setLoi(t("anh_loi_kieu")); return; }
    setLoi("");
    setTep(f);
    setXemTruoc(URL.createObjectURL(f));
  }

  async function luu() {
    if (!tep) return;
    setCanhBao("");
    setDangGui(true);
    try {
      await iotxClient.doiAnhDaiDien(tep);
      onClose();
    } catch (error) {
      setCanhBao(error instanceof IotxApiError && error.message === HO_SO_CHUA_BAT ? t("anh_chua_bat") : moTaLoi(error));
    } finally { setDangGui(false); }
  }

  return (
    <Sheet title={t("anh_doi")} onClose={onClose}>
      <h2 className="modal-title">{t("anh_doi")}</h2>
      {canhBao && <p className="dynamic-error" role="alert">{canhBao}</p>}
      <div className="anh-xem-truoc">
        <span className="avatar-circle">
          {xemTruoc
            // Ảnh người dùng vừa chọn là blob: cục bộ, next/image không tối ưu được.
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={xemTruoc} alt="" />
            : <Image unoptimized src={IMG.avatar} alt="" width={96} height={96} />}
        </span>
      </div>
      <label className="btn-full secondary anh-chon">
        <input type="file" accept="image/*" className="dn-sr" onChange={chonTep} />
        <Camera aria-hidden="true" />{t("anh_chon")}
      </label>
      {loi && <p className="dmk-err" role="alert">{loi}</p>}
      <button className="btn-full" disabled={!tep || dangGui} onClick={() => { void luu(); }}>{dangGui ? t("working") : t("save")}</button>
    </Sheet>
  );
}

/**
 * Đổi mật khẩu. Chặn tại chỗ những lỗi biết trước (bỏ trống, < 8 ký tự, nhập lại không khớp,
 * trùng mật khẩu cũ); lỗi máy chủ vào ô báo chung. Tới khi IBS mở cửa, gửi đi sẽ nhận lỗi
 * `DOI_MAT_KHAU_CHUA_BAT` và màn nói rõ là tính năng đang chờ bật.
 */
export function DoiMatKhauModal({ onClose }: { onClose: () => void }) {
  const { t } = useChu();
  const [cu, setCu] = useState("");
  const [moi, setMoi] = useState("");
  const [nhapLai, setNhapLai] = useState("");
  const [loi, setLoi] = useState<Record<string, string>>({});
  const [canhBao, setCanhBao] = useState("");
  const [xong, setXong] = useState(false);
  const [dangGui, setDangGui] = useState(false);

  async function gui(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCanhBao("");
    const l: Record<string, string> = {};
    if (!cu) l.cu = t("dmk_loi_cu");
    if (moi.length < MAT_KHAU_TOI_THIEU) l.moi = t("dk_loi_pw_ngan", { n: MAT_KHAU_TOI_THIEU });
    else if (moi === cu) l.moi = t("dmk_loi_trung");
    if (nhapLai !== moi) l.nhapLai = t("dk_loi_pw2");
    setLoi(l);
    if (Object.keys(l).length) return;
    setDangGui(true);
    try {
      await iotxClient.doiMatKhau(cu, moi);
      setXong(true);
    } catch (error) {
      setCanhBao(error instanceof IotxApiError && error.message === DOI_MAT_KHAU_CHUA_BAT ? t("dmk_chua_bat") : moTaLoi(error));
    } finally { setDangGui(false); }
  }

  const o = (id: "cu" | "moi" | "nhapLai", nhan: string, ph: string, giaTri: string, dat: (v: string) => void, tuDien: string) => (
    <div className="field">
      <label htmlFor={`dmk-${id}`}>{nhan}</label>
      <input id={`dmk-${id}`} type="password" value={giaTri} placeholder={ph} autoComplete={tuDien}
        aria-invalid={Boolean(loi[id])} aria-describedby={loi[id] ? `dmk-${id}-err` : undefined}
        onChange={event => { dat(event.target.value); if (loi[id]) setLoi(c => { const n = { ...c }; delete n[id]; return n; }); }} />
      {loi[id] && <span className="dmk-err" id={`dmk-${id}-err`}>{loi[id]}</span>}
    </div>
  );

  return (
    <Sheet title={t("menu_doi_mk")} onClose={onClose}>
      <h2 className="modal-title">{t("menu_doi_mk")}</h2>
      {xong ? (
        <p className="dmk-xong" role="status">{t("dmk_xong")}</p>
      ) : (
        <form className="stack" noValidate onSubmit={gui}>
          {canhBao && <p className="dynamic-error" role="alert">{canhBao}</p>}
          {o("cu", t("dmk_cu"), t("dmk_cu_ph"), cu, setCu, "current-password")}
          {o("moi", t("dmk_moi"), t("dmk_moi_ph"), moi, setMoi, "new-password")}
          {o("nhapLai", t("dmk_nhap_lai"), t("dmk_nhap_lai"), nhapLai, setNhapLai, "new-password")}
          <button className="btn-full" type="submit" disabled={dangGui}>{dangGui ? t("working") : t("menu_doi_mk")}</button>
        </form>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

export function NotifModal({ items, onClose, onXoa, onXoaHet }: {
  items: UiNotification[];
  onClose: () => void;
  onXoa: (id: string) => void;
  onXoaHet: () => void;
}) {
  const { t } = useChu();
  return (
    <Sheet title={t("notif_title")} onClose={onClose}>
      <p className="modal-title">{t("notif_title")}</p>
      {items.length === 0 && <p className="placeholder-msg">{t("notif_empty")}</p>}
      {items.map(muc => (
        <div className="notif-row" key={muc.id}>
          <div className="nicn"><Icon name={muc.icon} /></div>
          <div>
            <div className="ntxt">{muc.title}{muc.text ? ` — ${muc.text}` : ""}</div>
            <div className="ntime">{muc.time}</div>
          </div>
          <button className="ndel" aria-label={t("notif_delete")} onClick={() => onXoa(muc.id)}><Icon name="close" /></button>
        </div>
      ))}
      {items.length > 0 && <button className="btn-full secondary" onClick={onXoaHet}>{t("notif_clear")}</button>}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Một hộp chọn dùng cho cả ba bộ lọc (nhà, phòng, nhóm). Hàng đầu luôn là "tất cả" — bỏ
 * lọc — nên không dùng lại nó cho những chỗ phải chọn đúng một mục (xem `DevicePickerModal`).
 */
export function LocPickerModal({ khoaTieuDe, khoaTatCa, dangChon, danhSach, onClose, onChon }: {
  /** Khóa chữ, không phải chữ sẵn: hộp này nằm trong cây `ChuProvider` nên tự dịch được. */
  khoaTieuDe: string;
  khoaTatCa: string;
  dangChon: string;
  danhSach: string[];
  onClose: () => void;
  onChon: (ten: string) => void;
}) {
  const { t } = useChu();
  const rows = [TAT_CA, ...danhSach];
  return (
    <Sheet title={t(khoaTieuDe)} onClose={onClose} centered>
      <p className="modal-title">{t(khoaTieuDe)}</p>
      {rows.map(ten => (
        <button key={ten} className={`radio-list-row${dangChon === ten ? " sel" : ""}`} aria-pressed={dangChon === ten} onClick={() => onChon(ten)}>
          <span className="rc" />{ten === TAT_CA ? t(khoaTatCa) : ten}
        </button>
      ))}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Chọn thiết bị — dùng cho những màn thuộc về MỘT thiết bị (hẹn giờ). Không dùng lại
 * `LocPickerModal` vì hộp đó luôn chèn thêm hàng "tất cả", không có nghĩa ở đây.
 */
export function DevicePickerModal({ danhSach, onClose, onChon }: {
  danhSach: Array<{ id: string; name: string; room?: string }>;
  onClose: () => void;
  onChon: (id: string) => void;
}) {
  const { t } = useChu();
  return (
    <Sheet title={t("pick_device")} onClose={onClose} centered>
      <p className="modal-title">{t("pick_device")}</p>
      {danhSach.length === 0 && <p className="placeholder-msg">{t("no_device")}</p>}
      {danhSach.map(device => (
        <button key={device.id} className="radio-list-row" onClick={() => onChon(device.id)}>
          <span className="rc" />{device.name}{device.room ? ` · ${device.room}` : ""}
        </button>
      ))}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

export function PlaceholderModal({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useChu();
  return (
    <Sheet title={title} onClose={onClose} centered>
      <p className="modal-title">{title}</p>
      <p className="placeholder-msg">{t("placeholder_msg")}</p>
      <button className="btn-full" onClick={onClose}>{t("understood")}</button>
    </Sheet>
  );
}
