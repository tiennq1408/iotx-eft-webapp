"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useChu } from "./chu";
import { IMG } from "@/lib/newui/assets";
import { iotxClient, isIotxMode, laLoiDangNhap, moTaLoi } from "@/lib/iotx";

/**
 * Màn chào theo bản thiết kế: chỉ hai ô nhập, không có tab và không có hàng cờ.
 *
 * Đường ĐĂNG KÝ vẫn còn — nằm sau liên kết "Tạo tài khoản mới" ở cuối, đúng chỗ bản
 * thiết kế đặt nó. Ô nhập để trống chứ không điền sẵn "Ngocthuy/123" như nguyên mẫu, vì
 * màn này chạy với tài khoản thật.
 */
/** Tên ngôn ngữ viết bằng chính ngôn ngữ đó ("Tiếng Việt", "ไทย"); không có thì để mã. */
function tenNgonNgu(ma: string): string {
  try {
    const ten = new Intl.DisplayNames([ma], { type: "language" }).of(ma);
    return ten && ten !== ma ? ten : ma.toUpperCase();
  } catch { return ma.toUpperCase(); }
}

export default function LoginScreen({ onDone, logoUrl, lang, langs = [], onLang }: {
  onDone: () => void | Promise<void>;
  /** Logo của hãng từ `GET /tenant/theme`; chưa có thì dùng wordmark Livotec đóng kèm. */
  logoUrl?: string | null;
  lang?: string;
  /**
   * `langs` của `GET /i18n` (cửa public, gọi được trước đăng nhập). Dựng khối chọn từ đây,
   * không viết cứng: máy chủ thêm ngôn ngữ là màn tự có. Rỗng (chưa tải xong) thì ẩn hẳn.
   */
  langs?: string[];
  onLang?: (ma: string) => void;
}) {
  const { t } = useChu();
  // Ngôn ngữ đang dùng mà máy chủ không liệt kê vẫn phải có trong danh sách, không thì nút
  // nào cũng không sáng.
  const dsLang = lang && !langs.includes(lang) ? [lang, ...langs] : langs;
  const coChonLang = langs.length > 0 && Boolean(onLang);
  const [che, setChe] = useState<"login" | "register">("login");
  const [user, setUser] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loi, setLoi] = useState("");
  const [dangGui, setDangGui] = useState(false);

  async function guiDi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const taiKhoan = user.trim();
    const matKhau = pass.trim();
    if (!taiKhoan || !matKhau) { setLoi(t("login_need_all")); return; }
    setDangGui(true);
    setLoi("");
    try {
      if (isIotxMode) {
        if (che === "login") await iotxClient.login(taiKhoan, matKhau);
        else await iotxClient.register(email.trim() || taiKhoan, matKhau, taiKhoan);
      } else {
        sessionStorage.setItem("livotec-session", "1");
      }
      await onDone();
    } catch (error) {
      setLoi(laLoiDangNhap(error) ? t("login_bad") : moTaLoi(error));
    } finally {
      setDangGui(false);
    }
  }

  /**
   * Hợp đồng `/v1` chưa có cửa đặt lại mật khẩu (không có trong openapi), nên nút này nói
   * thẳng là chưa hỗ trợ — không giả vờ gửi email. IBS mở cửa thật thì chỉ thay thân hàm.
   */
  function quenMatKhau() {
    setLoi(t("login_forgot_chua"));
  }

  return (
    <main className="login-screen">
      <div className="login-overlay" />
      <div className="login-content">
        {logoUrl
          // Địa chỉ logo do máy chủ trả lúc chạy nên không khai trước được cho next/image.
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className="login-wordmark" src={logoUrl} alt="" />
          : <Image unoptimized className="login-wordmark" src={IMG.logoWordmark} alt="Livotec" width={210} height={64} />}
        <div className="login-avatar"><Image unoptimized src={IMG.avatar} alt="" width={76} height={76} /></div>
        {/* Ba dòng chữ trắng nằm trên đoạn sáng nhất của dải màu — đo được 1,6:1. Bọc
            chung một lớp nền mờ tan dần ở hai đầu: dải màu của bản thiết kế giữ nguyên,
            còn chữ thì đủ tương phản. */}
        <div className="login-greet">
          <h1 className="login-title">{t("login_welcome")}</h1>
          <p className="login-title-band">{t("login_back")}</p>
          <p className="login-sub">{t("login_sub")}</p>
        </div>

        {/* Chọn ngôn ngữ TRƯỚC khi đăng nhập: người dùng Thái mở app lần đầu không thể mắc kẹt
            ở màn tiếng Việt. Ô select, danh sách từ `langs` máy chủ, tên viết bằng chính ngôn
            ngữ đó. Mặc định tiếng Việt; đã chọn gì thì lần sau mở app (kể cả sau đăng xuất)
            vẫn là ngôn ngữ đó — `ghiNgonNguDaChon` lưu riêng, không bị xoá cùng phiên. */}
        {coChonLang && (
          <label className="login-lang">
            <span className="login-lang-ico" aria-hidden="true">🌐</span>
            <select aria-label={t("login_lang")} value={lang} onChange={event => onLang?.(event.target.value)}>
              {dsLang.map(ma => <option key={ma} value={ma}>{tenNgonNgu(ma)}</option>)}
            </select>
          </label>
        )}

        <form className="login-form" onSubmit={guiDi}>
          <input
            className="login-field"
            type="text"
            value={user}
            autoComplete="username"
            aria-label={che === "login" ? t("login_user") : t("login_name")}
            placeholder={che === "login" ? t("login_user") : t("login_name")}
            onChange={event => setUser(event.target.value)}
          />
          {che === "register" && (
            <input
              className="login-field"
              type="email"
              value={email}
              autoComplete="email"
              aria-label={t("login_email")}
              placeholder={t("login_email")}
              onChange={event => setEmail(event.target.value)}
            />
          )}
          <input
            className="login-field"
            type="password"
            value={pass}
            autoComplete={che === "login" ? "current-password" : "new-password"}
            aria-label={t("login_pass")}
            placeholder={t("login_pass")}
            onChange={event => setPass(event.target.value)}
          />

          <button className="login-btn" type="submit" disabled={dangGui}>
            {dangGui ? t("working") : che === "login" ? t("login_btn") : t("login_signup")}
          </button>
          {che === "login" && (
            <div className="login-phu">
              <button type="button" className="login-forgot" onClick={quenMatKhau}>{t("login_forgot")}</button>
            </div>
          )}
          {che === "login" && (
            <button type="button" className="login-create" onClick={() => { setChe("register"); setLoi(""); }}>{t("login_create")}</button>
          )}
          {loi && <p className="login-msg" role="status">{loi}</p>}
        </form>
      </div>
    </main>
  );
}
