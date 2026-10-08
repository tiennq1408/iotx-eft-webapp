"use client";

import Image from "next/image";
import { useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, Check, ChevronLeft, Eye, EyeOff, Lock } from "lucide-react";
import { useChu } from "./chu";
import { IMG } from "@/lib/newui/assets";
import { IotxApiError, QUEN_MAT_KHAU_CHUA_BAT, iotxClient, isIotxMode, laLoiDangNhap, moTaLoi } from "@/lib/iotx";

/**
 * Màn đăng nhập dựng theo mẫu `docs/mau/login.html` (xem `docs/viec-man-dang-nhap.md`):
 * ba màn Đăng nhập · Quên mật khẩu · Đăng ký, chuyển bằng state React (không dùng
 * `location.hash` — app là SPA một khung).
 *
 * Giữ của local: ảnh nền (dải màu + lớp phủ), wordmark, và toàn bộ logic API. Màu nhấn đi
 * theo `theme.colorPrimary` qua biến `--teal*` mà `apDungTheme` sinh ra.
 *
 * Hai thứ của mẫu CỐ Ý bỏ:
 * - Đếm "còn {n} lần thử" — con số do client tự bịa, máy chủ không trả gì như vậy.
 * - Gắn lỗi máy chủ vào ô mật khẩu — 401 (sai mật khẩu) và 404 (sai tenant) phải nói CÙNG
 *   một câu, tách ra là lộ "email này có tồn tại". Lỗi máy chủ luôn vào `.alert` chung;
 *   `.err` dưới ô chỉ dành cho lỗi định dạng phát hiện ở client.
 */

/** Tên ngôn ngữ viết bằng chính ngôn ngữ đó ("Tiếng Việt", "ไทย"); không có thì để mã. */
function tenNgonNgu(ma: string): string {
  try {
    const ten = new Intl.DisplayNames([ma], { type: "language" }).of(ma);
    return ten && ten !== ma ? ten : ma.toUpperCase();
  } catch { return ma.toUpperCase(); }
}

const laEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const laSoDienThoai = (v: string) => /^(0|\+84)\d{9}$/.test(v.replace(/[\s.-]/g, ""));
const MAT_KHAU_TOI_THIEU = 8;

type Man = "dangNhap" | "quenMatKhau" | "dangKy";
type Loi = Record<string, string>;

/** Một ô nhập có nhãn riêng (đọc màn hình hiểu được), lỗi định dạng ngay dưới ô. */
function O({ id, nhan, loi, children }: { id: string; nhan: string; loi?: string; children: ReactNode }) {
  return (
    <div className="dn-field">
      <label htmlFor={id}>{nhan}</label>
      {children}
      {loi && <span className="dn-err" id={`${id}-err`}><AlertCircle aria-hidden="true" />{loi}</span>}
    </div>
  );
}

export default function LoginScreen({ onDone, logoUrl, tenHang, lang, langs = [], onLang, loginMethods }: {
  onDone: () => void | Promise<void>;
  /** Logo của hãng từ `GET /tenant/theme`; chưa có thì dùng wordmark Livotec đóng kèm. */
  logoUrl?: string | null;
  /** `tenantName` của `/tenant/theme` — không viết cứng. */
  tenHang?: string | null;
  lang?: string;
  /** `langs` của `GET /i18n` (cửa public). Rỗng thì ẩn ô chọn. */
  langs?: string[];
  onLang?: (ma: string) => void;
  /**
   * `loginMethods` của `/tenant/theme`. Trường này đang khai nhiều hơn thực tế (sadmin 08/10:
   * SĐT + mật khẩu TẮT, cổng SMS trống), nên chỉ nhận SĐT khi nó ghi rõ `phone` — mặc định
   * chỉ email.
   */
  loginMethods?: { eu?: string[] } | null;
}) {
  const { t } = useChu();
  const choSdt = Boolean(loginMethods?.eu?.includes("phone"));
  const dsLang = lang && !langs.includes(lang) ? [lang, ...langs] : langs;
  const coChonLang = langs.length > 0 && Boolean(onLang);

  const [man, setMan] = useState<Man>("dangNhap");
  const [canhBao, setCanhBao] = useState("");
  const [loi, setLoi] = useState<Loi>({});
  const [dangGui, setDangGui] = useState(false);
  const [hienMk, setHienMk] = useState(false);

  // đăng nhập
  const [dnId, setDnId] = useState("");
  const [dnPw, setDnPw] = useState("");
  /** Ô "Ghi nhớ đăng nhập" giữ theo mẫu, CHƯA nối gì — phiên vẫn lưu như cũ. */
  const [ghiNho, setGhiNho] = useState(false);
  // quên mật khẩu
  const [qmId, setQmId] = useState("");
  const [qmBuoc, setQmBuoc] = useState<"nhap" | "daGui">("nhap");
  // đăng ký
  const [dkTen, setDkTen] = useState("");
  const [dkId, setDkId] = useState("");
  const [dkPw, setDkPw] = useState("");
  const [dkPw2, setDkPw2] = useState("");
  const [dkDongY, setDkDongY] = useState(false);

  const nhanId = choSdt ? t("dn_id_email_sdt") : t("dn_id_email");
  const phId = choSdt ? t("dn_id_ph_email_sdt") : t("dn_id_ph_email");

  function sangMan(moi: Man) {
    setMan(moi); setCanhBao(""); setLoi({}); setHienMk(false); setQmBuoc("nhap");
  }

  /** Gõ lại vào ô nào thì xoá lỗi của chính ô đó, như mẫu. */
  function xoaLoi(id: string) {
    setLoi(cu => { if (!cu[id]) return cu; const moi = { ...cu }; delete moi[id]; return moi; });
  }

  /** Lỗi định dạng của ô định danh (email, hoặc email/SĐT khi tenant bật SĐT). */
  function kiemDinhDanh(v: string): string {
    if (!v) return choSdt ? t("dn_loi_id_trong") : t("dn_loi_id_trong_email");
    if (laEmail(v) || (choSdt && laSoDienThoai(v))) return "";
    return choSdt ? t("dn_loi_id_sai") : t("dn_loi_id_sai_email");
  }

  async function goi(viec: () => Promise<void>) {
    setDangGui(true); setCanhBao("");
    try { await viec(); }
    catch (error) {
      // Lỗi máy chủ LUÔN vào cảnh báo chung; 401 và 404 nói cùng một câu.
      setCanhBao(laLoiDangNhap(error) ? t("login_bad") : moTaLoi(error));
    } finally { setDangGui(false); }
  }

  async function dangNhap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCanhBao("");
    const id = dnId.trim();
    const moi: Loi = {};
    const loiId = kiemDinhDanh(id);
    if (loiId) moi["dn-id"] = loiId;
    if (!dnPw) moi["dn-pw"] = t("dn_loi_pw_trong");
    setLoi(moi);
    if (Object.keys(moi).length) return;
    await goi(async () => {
      if (isIotxMode) await iotxClient.login(id, dnPw);
      else sessionStorage.setItem("livotec-session", "1");
      await onDone();
    });
  }

  async function dangKy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCanhBao("");
    const ten = dkTen.trim();
    const id = dkId.trim();
    const moi: Loi = {};
    if (!ten) moi["dk-ten"] = t("dk_loi_ten");
    const loiId = kiemDinhDanh(id);
    if (loiId) moi["dk-id"] = loiId;
    // Chặn tại chỗ: hợp đồng gộp "mật khẩu < 8" vào 409 chung với "email đã đăng ký".
    if (dkPw.length < MAT_KHAU_TOI_THIEU) moi["dk-pw"] = t("dk_loi_pw_ngan", { n: MAT_KHAU_TOI_THIEU });
    if (dkPw2 !== dkPw) moi["dk-pw2"] = t("dk_loi_pw2");
    if (!dkDongY) moi["dk-dong-y"] = t("dk_loi_dong_y");
    setLoi(moi);
    if (Object.keys(moi).length) return;
    await goi(async () => {
      if (isIotxMode) await iotxClient.register(id, dkPw, ten);
      else sessionStorage.setItem("livotec-session", "1");
      await onDone();
    });
  }

  async function guiMa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCanhBao("");
    const id = qmId.trim();
    const loiId = kiemDinhDanh(id);
    setLoi(loiId ? { "qm-id": loiId } : {});
    if (loiId) return;
    setDangGui(true);
    try {
      await iotxClient.guiMaQuenMatKhau(id);
      setQmBuoc("daGui");
    } catch (error) {
      // Chưa có cửa (chờ IBS) hoặc SMTP đang tắt: nói rõ, KHÔNG nhảy sang "Đã gửi mã".
      setCanhBao(error instanceof IotxApiError && error.message === QUEN_MAT_KHAU_CHUA_BAT ? t("qm_chua_bat") : moTaLoi(error));
    } finally { setDangGui(false); }
  }

  const oMatKhau = (id: string, giaTri: string, dat: (v: string) => void, ph: string, tuDien: string, moTa?: string) => (
    <div className={`dn-input-wrap${loi[id] ? " invalid" : ""}`}>
      <input id={id} type={hienMk ? "text" : "password"} value={giaTri} placeholder={ph} autoComplete={tuDien}
        aria-invalid={Boolean(loi[id])} aria-describedby={[loi[id] ? `${id}-err` : "", moTa ?? ""].filter(Boolean).join(" ") || undefined}
        onChange={e => { dat(e.target.value); xoaLoi(id); }} />
      <button type="button" className="dn-eye" aria-label={hienMk ? t("dn_an") : t("dn_hien")} onClick={() => setHienMk(!hienMk)}>
        {hienMk ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );

  const oChu = (id: string, giaTri: string, dat: (v: string) => void, ph: string, tuDien: string, kieu = "text") => (
    <input className={`dn-input${loi[id] ? " invalid" : ""}`} id={id} type={kieu} value={giaTri} placeholder={ph} autoComplete={tuDien}
      aria-invalid={Boolean(loi[id])} aria-describedby={loi[id] ? `${id}-err` : undefined}
      onChange={e => { dat(e.target.value); xoaLoi(id); }} />
  );

  const thongBao = canhBao && (
    <div className="dn-alert" role="alert"><AlertCircle aria-hidden="true" /><span>{canhBao}</span></div>
  );

  const nutLai = (
    <button type="button" className="dn-back" aria-label={t("dn_quay_lai")} onClick={() => sangMan("dangNhap")}>
      <ChevronLeft aria-hidden="true" />
    </button>
  );

  return (
    <main className="login-screen">
      <div className="login-overlay" />
      <div className="login-content">
        <div className="dn-topbar">
          {man === "dangNhap" ? (
            <div className="dn-brand">
              {logoUrl
                // Địa chỉ logo do máy chủ trả lúc chạy nên không khai trước được cho next/image.
                // eslint-disable-next-line @next/next/no-img-element
                ? <img className="login-wordmark" src={logoUrl} alt="" />
                : <Image unoptimized className="login-wordmark" src={IMG.logoWordmark} alt="Livotec" width={210} height={64} />}
              {tenHang && <span className="dn-ten-hang">{tenHang}</span>}
            </div>
          ) : nutLai}
          {coChonLang && (
            <label className="login-lang">
              <span className="dn-sr">{t("login_lang")}</span>
              <select value={lang} onChange={event => onLang?.(event.target.value)}>
                {dsLang.map(ma => <option key={ma} value={ma}>{tenNgonNgu(ma)}</option>)}
              </select>
            </label>
          )}
        </div>

        {man === "dangNhap" && (
          <section className="dn-khung" aria-labelledby="dn-title">
            <div className="dn-head">
              <h1 id="dn-title">{t("login_btn")}</h1>
              <p className="dn-lead">{t("dn_lead")}</p>
            </div>
            <form className="dn-form" noValidate onSubmit={dangNhap}>
              {thongBao}
              <O id="dn-id" nhan={nhanId} loi={loi["dn-id"]}>
                {oChu("dn-id", dnId, setDnId, phId, "username")}
              </O>
              <O id="dn-pw" nhan={t("dn_pw")} loi={loi["dn-pw"]}>
                {oMatKhau("dn-pw", dnPw, setDnPw, t("dn_pw_ph"), "current-password")}
              </O>
              <div className="dn-row">
                <label className="dn-check"><input type="checkbox" checked={ghiNho} onChange={e => setGhiNho(e.target.checked)} /><span className="dn-tich" aria-hidden="true" />{t("dn_ghi_nho")}</label>
                <button type="button" className="dn-link" onClick={() => sangMan("quenMatKhau")}>{t("dn_quen")}</button>
              </div>
              <button className="login-btn" type="submit" disabled={dangGui}>{dangGui ? t("working") : t("login_btn")}</button>
            </form>
            <p className="dn-foot">{t("dn_chua_co")} <button type="button" className="dn-link" onClick={() => sangMan("dangKy")}>{t("dn_dk_ngay")}</button></p>
          </section>
        )}

        {man === "quenMatKhau" && (
          <section className="dn-khung" aria-labelledby="qm-title">
            {qmBuoc === "nhap" ? (
              <>
                <div className="dn-head">
                  <span className="dn-badge"><Lock aria-hidden="true" /></span>
                  <h1 id="qm-title">{t("qm_title")}</h1>
                  <p className="dn-lead">{choSdt ? t("qm_lead") : t("qm_lead_email")}</p>
                </div>
                <form className="dn-form" noValidate onSubmit={guiMa}>
                  {thongBao}
                  <O id="qm-id" nhan={nhanId} loi={loi["qm-id"]}>
                    {oChu("qm-id", qmId, setQmId, phId, "username")}
                  </O>
                  <button className="login-btn" type="submit" disabled={dangGui}>{dangGui ? t("working") : t("qm_gui")}</button>
                </form>
              </>
            ) : (
              <>
                {/* Bước 2 dựng sẵn theo mẫu — chỉ tới được khi IBS có cửa gửi mã. */}
                <div className="dn-head">
                  <span className="dn-badge"><Check aria-hidden="true" /></span>
                  <h1 id="qm-title">{t("qm_da_gui")}</h1>
                  <p className="dn-lead">{t("qm_da_gui_lead", { dich: qmId.trim() })}</p>
                </div>
                {thongBao}
                <button type="button" className="login-btn" onClick={() => setCanhBao(t("qm_chua_bat"))}>{t("qm_nhap_ma")}</button>
                <p className="dn-foot">{t("qm_khong_nhan")} <button type="button" className="dn-link" onClick={() => { setQmBuoc("nhap"); setCanhBao(""); }}>{t("qm_gui_lai")}</button></p>
              </>
            )}
            <p className="dn-foot">{t("qm_da_nho")} <button type="button" className="dn-link" onClick={() => sangMan("dangNhap")}>{t("login_btn")}</button></p>
          </section>
        )}

        {man === "dangKy" && (
          <section className="dn-khung" aria-labelledby="dk-title">
            <div className="dn-head">
              <h1 id="dk-title">{t("dk_title")}</h1>
              <p className="dn-lead">{t("dk_lead")}</p>
            </div>
            <form className="dn-form" noValidate onSubmit={dangKy}>
              {thongBao}
              <O id="dk-ten" nhan={t("dk_ten")} loi={loi["dk-ten"]}>
                {oChu("dk-ten", dkTen, setDkTen, t("dk_ten_ph"), "name")}
              </O>
              <O id="dk-id" nhan={nhanId} loi={loi["dk-id"]}>
                {oChu("dk-id", dkId, setDkId, phId, "username")}
              </O>
              <O id="dk-pw" nhan={t("dn_pw")} loi={loi["dk-pw"]}>
                {oMatKhau("dk-pw", dkPw, setDkPw, t("dk_pw_ph"), "new-password", "dk-pw-hint")}
                <span className="dn-hint" id="dk-pw-hint">{t("dk_hint", { n: MAT_KHAU_TOI_THIEU })}</span>
              </O>
              <O id="dk-pw2" nhan={t("dk_pw2")} loi={loi["dk-pw2"]}>
                {oChu("dk-pw2", dkPw2, setDkPw2, t("dk_pw2"), "new-password", hienMk ? "text" : "password")}
              </O>
              <div className="dn-field">
                {/* Chưa có trang Điều khoản / Chính sách nên để chữ thường, không gắn liên kết chết. */}
                <label className="dn-check top">
                  <input type="checkbox" checked={dkDongY} aria-invalid={Boolean(loi["dk-dong-y"])}
                    aria-describedby={loi["dk-dong-y"] ? "dk-dong-y-err" : undefined}
                    onChange={e => { setDkDongY(e.target.checked); xoaLoi("dk-dong-y"); }} />
                  <span className="dn-tich" aria-hidden="true" />
                  <span>{t("dk_dong_y")}</span>
                </label>
                {loi["dk-dong-y"] && <span className="dn-err" id="dk-dong-y-err"><AlertCircle aria-hidden="true" />{loi["dk-dong-y"]}</span>}
              </div>
              <button className="login-btn" type="submit" disabled={dangGui}>{dangGui ? t("working") : t("dk_btn")}</button>
            </form>
            <p className="dn-foot">{t("dk_da_co")} <button type="button" className="dn-link" onClick={() => sangMan("dangNhap")}>{t("login_btn")}</button></p>
          </section>
        )}
      </div>
    </main>
  );
}
