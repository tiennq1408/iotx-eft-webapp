"use client";

import Image from "next/image";
import { useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, Check, ChevronLeft, Eye, EyeOff, Lock } from "lucide-react";
import { useChu } from "./chu";
import { IMG } from "@/lib/newui/assets";
import { GOOGLE_CHUA_BAT, IotxApiError, QUEN_MAT_KHAU_CHUA_BAT, iotxClient, isIotxMode, laLoiDangNhap, moTaLoi } from "@/lib/iotx";

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

/**
 * Cờ đứng trước tên ngôn ngữ. Suy vùng từ chính mã ngôn ngữ (`vi`→VN, `th`→TH, `fil`→PH,
 * `en`→US) rồi đổi sang emoji cờ — không viết cứng danh sách, máy chủ thêm ngôn ngữ là có cờ.
 * <option> không chứa được ảnh nên dùng emoji; không suy được vùng thì dùng 🌐.
 */
function coNgonNgu(ma: string): string {
  try {
    const vung = new Intl.Locale(ma).maximize().region;
    if (vung && /^[A-Z]{2}$/.test(vung)) return [...vung].map(c => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("");
  } catch { /* mã lạ */ }
  return "🌐";
}

const laEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const laSoDienThoai = (v: string) => /^(0|\+84)\d{9}$/.test(v.replace(/[\s.-]/g, ""));
const MAT_KHAU_TOI_THIEU = 8;

type Man = "dangNhap" | "quenMatKhau" | "dangKy";
type Loi = Record<string, string>;

/** Một ô nhập có nhãn riêng (đọc màn hình hiểu được), lỗi định dạng ngay dưới ô. */
/** Chữ G bốn màu của Google, dùng nguyên theo hướng dẫn nút "Sign in with Google". */
function LogoGoogle() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** `anNhan`: nhãn chỉ để trình đọc màn hình đọc, mắt chỉ thấy placeholder. */
function O({ id, nhan, loi, anNhan, children }: { id: string; nhan: string; loi?: string; anNhan?: boolean; children: ReactNode }) {
  return (
    <div className="dn-field">
      <label htmlFor={id} className={anNhan ? "dn-sr" : undefined}>{nhan}</label>
      {children}
      {loi && <span className="dn-err" id={`${id}-err`}><AlertCircle aria-hidden="true" />{loi}</span>}
    </div>
  );
}

export default function LoginScreen({ onDone, logoUrl, lang, langs = [], onLang }: {
  onDone: () => void | Promise<void>;
  /** Logo của hãng từ `GET /tenant/theme`; chưa có thì dùng wordmark Livotec đóng kèm. */
  logoUrl?: string | null;
  lang?: string;
  /** `langs` của `GET /i18n` (cửa public). Rỗng thì ẩn ô chọn. */
  langs?: string[];
  onLang?: (ma: string) => void;
}) {
  const { t } = useChu();
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

  /**
   * Ô tài khoản ở cả ba màn: nhãn "Tài khoản", placeholder "Email hoặc số điện thoại". Chỉ màn
   * đăng ký kiểm định dạng; đăng nhập và quên mật khẩu gửi nguyên lên máy chủ. Nhận SĐT ở client
   * không có nghĩa máy chủ nhận: sadmin đang tắt "SĐT + mật khẩu", nên gõ SĐT sẽ được gửi đi và
   * nhận câu lỗi chung của 401/404 nếu IBS chưa bật.
   */
  const nhanId = t("dn_tai_khoan");
  const goiYId = t("dn_tai_khoan_ph");

  function sangMan(moi: Man) {
    setMan(moi); setCanhBao(""); setLoi({}); setHienMk(false); setQmBuoc("nhap");
  }

  /** Gõ lại vào ô nào thì xoá lỗi của chính ô đó, như mẫu. */
  function xoaLoi(id: string) {
    setLoi(cu => { if (!cu[id]) return cu; const moi = { ...cu }; delete moi[id]; return moi; });
  }

  /** Lỗi định dạng của ô định danh: phải là email hoặc số điện thoại Việt Nam. */
  function kiemDinhDanh(v: string): string {
    if (!v) return t("dn_loi_id_trong");
    if (laEmail(v) || laSoDienThoai(v)) return "";
    return t("dn_loi_id_sai");
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
    // Màn đăng nhập không kiểm định dạng tài khoản: gửi nguyên lên máy chủ, đúng sai do máy chủ trả.
    if (!id) moi["dn-id"] = t("dn_loi_id_trong");
    if (!dnPw) moi["dn-pw"] = t("dn_loi_pw_trong");
    setLoi(moi);
    if (Object.keys(moi).length) return;
    await goi(async () => {
      if (isIotxMode) await iotxClient.login(id, dnPw);
      else sessionStorage.setItem("livotec-session", "1");
      await onDone();
    });
  }

  async function dangNhapGoogle() {
    setCanhBao(""); setLoi({});
    setDangGui(true);
    try {
      await iotxClient.dangNhapGoogle();
      await onDone();
    } catch (error) {
      // Chưa có cửa (chờ IBS): nói rõ trong cảnh báo chung.
      setCanhBao(error instanceof IotxApiError && error.message === GOOGLE_CHUA_BAT ? t("dn_google_chua_bat") : moTaLoi(error));
    } finally { setDangGui(false); }
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
    // Không kiểm định dạng ở đây, như màn đăng nhập: chỉ chặn ô trống.
    const loiId = id ? "" : t("dn_loi_id_trong");
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

  const oChu = (id: string, giaTri: string, dat: (v: string) => void, ph: string | undefined, tuDien: string, kieu = "text") => (
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
      <div className="login-content">
        <div className="dn-topbar">
          {man === "dangNhap" ? (
            <div className="dn-brand">
              {logoUrl
                // Địa chỉ logo do máy chủ trả lúc chạy nên không khai trước được cho next/image.
                // eslint-disable-next-line @next/next/no-img-element
                ? <img className="login-wordmark" src={logoUrl} alt="" />
                : <Image unoptimized className="login-wordmark" src={IMG.logoWordmark} alt="Livotec" width={210} height={64} />}
            </div>
          ) : nutLai}
          {coChonLang && (
            <label className="login-lang">
              <span className="dn-sr">{t("login_lang")}</span>
              <select value={lang} onChange={event => onLang?.(event.target.value)}>
                {dsLang.map(ma => <option key={ma} value={ma}>{coNgonNgu(ma)} {tenNgonNgu(ma)}</option>)}
              </select>
            </label>
          )}
        </div>

        {man === "dangNhap" && (
          <section className="dn-khung" aria-labelledby="dn-title">
            <div className="dn-head">
              <h1 id="dn-title">{t("login_btn")}</h1>
            </div>
            <form className="dn-form" noValidate onSubmit={dangNhap}>
              {thongBao}
              <O id="dn-id" nhan={nhanId} loi={loi["dn-id"]}>
                {oChu("dn-id", dnId, setDnId, goiYId, "username")}
              </O>
              <O id="dn-pw" nhan={t("dn_pw")} loi={loi["dn-pw"]}>
                {oMatKhau("dn-pw", dnPw, setDnPw, t("dn_pw_ph"), "current-password")}
              </O>
              <div className="dn-row">
                <label className="dn-check"><input type="checkbox" checked={ghiNho} onChange={e => setGhiNho(e.target.checked)} /><span className="dn-tich" aria-hidden="true" />{t("dn_ghi_nho")}</label>
                <button type="button" className="dn-link" onClick={() => sangMan("quenMatKhau")}>{t("dn_quen")}</button>
              </div>
              <button className="login-btn" type="submit" disabled={dangGui}>{dangGui ? t("working") : t("login_btn")}</button>
              <div className="dn-hoac"><span>{t("dn_hoac")}</span></div>
              <button className="dn-google" type="button" disabled={dangGui} onClick={dangNhapGoogle}>
                <LogoGoogle />{t("dn_google")}
              </button>
            </form>
            <p className="dn-foot">{t("dn_chua_co")} <button type="button" className="dn-link" onClick={() => sangMan("dangKy")}>{t("dn_dk_ngay")}</button></p>
          </section>
        )}

        {man === "quenMatKhau" && (
          <section className="dn-khung" aria-labelledby="qm-title">
            {qmBuoc === "nhap" ? (
              <>
                <div className="dn-head">
                  <div className="dn-tieu-de">
                    <span className="dn-badge"><Lock aria-hidden="true" /></span>
                    <h1 id="qm-title">{t("qm_title")}</h1>
                  </div>
                  <p className="dn-lead">{t("qm_lead")}</p>
                </div>
                <form className="dn-form" noValidate onSubmit={guiMa}>
                  {thongBao}
                  <O id="qm-id" nhan={nhanId} loi={loi["qm-id"]}>
                    {oChu("qm-id", qmId, setQmId, goiYId, "username")}
                  </O>
                  <button className="login-btn" type="submit" disabled={dangGui}>{dangGui ? t("working") : t("qm_gui")}</button>
                </form>
              </>
            ) : (
              <>
                {/* Bước 2 dựng sẵn theo mẫu — chỉ tới được khi IBS có cửa gửi mã. */}
                <div className="dn-head">
                  <div className="dn-tieu-de">
                    <span className="dn-badge"><Check aria-hidden="true" /></span>
                    <h1 id="qm-title">{t("qm_da_gui")}</h1>
                  </div>
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
                {oChu("dk-id", dkId, setDkId, goiYId, "username")}
              </O>
              <O id="dk-pw" nhan={t("dn_pw")} loi={loi["dk-pw"]}>
                {oMatKhau("dk-pw", dkPw, setDkPw, t("dn_pw_ph"), "new-password")}
              </O>
              <O id="dk-pw2" nhan={t("dk_pw2")} loi={loi["dk-pw2"]} anNhan>
                {oChu("dk-pw2", dkPw2, setDkPw2, t("dk_pw2"), "new-password", hienMk ? "text" : "password")}
              </O>
              <button className="login-btn" type="submit" disabled={dangGui}>{dangGui ? t("working") : t("dk_btn")}</button>
            </form>
            <p className="dn-foot">{t("dk_da_co")} <button type="button" className="dn-link" onClick={() => sangMan("dangNhap")}>{t("login_btn")}</button></p>
          </section>
        )}
      </div>
    </main>
  );
}
