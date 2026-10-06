"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import Icon from "./Icon";
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
export default function LoginScreen({ onDone, logoUrl }: {
  onDone: () => void | Promise<void>;
  /** Logo của hãng từ `GET /tenant/theme`; chưa có thì dùng wordmark Livotec đóng kèm. */
  logoUrl?: string | null;
}) {
  const { t } = useChu();
  const [che, setChe] = useState<"login" | "register">("login");
  const [user, setUser] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loi, setLoi] = useState("");
  const [dangGui, setDangGui] = useState(false);
  const [dangQuet, setDangQuet] = useState(false);

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
   * Nhận diện khuôn mặt chưa có cửa nào trong hợp đồng `/v1`, nên nút này chỉ mô phỏng
   * hiệu ứng quét rồi nói thẳng là chưa nối được — không lặng lẽ cho vào app.
   */
  function quetKhuonMat() {
    if (dangQuet) return;
    setDangQuet(true);
    setLoi("");
    window.setTimeout(() => {
      setDangQuet(false);
      setLoi(t("login_face_demo"));
    }, 1400);
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
          <div className="login-pw-row">
            <input
              className="login-field"
              type="password"
              value={pass}
              autoComplete={che === "login" ? "current-password" : "new-password"}
              aria-label={t("login_pass")}
              placeholder={t("login_pass")}
              onChange={event => setPass(event.target.value)}
            />
            <button type="button" className={`face-scan-btn${dangQuet ? " scanning" : ""}`} aria-label={t("login_face_hint")} onClick={quetKhuonMat}>
              <i><Icon name="faceScan" /></i>
            </button>
          </div>

          <button className="login-btn" type="submit" disabled={dangGui}>
            {dangGui ? t("working") : che === "login" ? t("login_btn") : t("login_signup")}
          </button>
          <button type="button" className="login-face-hint" onClick={quetKhuonMat}>
            <Icon name="faceScan" /> {t("login_face_hint")}
          </button>
          {che === "login" && (
            <button type="button" className="login-create" onClick={() => { setChe("register"); setLoi(""); }}>{t("login_create")}</button>
          )}
          {loi && <p className="login-msg" role="status">{loi}</p>}
        </form>
      </div>
      {dangQuet && (
        <div className="login-scanning-overlay" role="status">
          <div className="scan-ring" />
          <div>{t("login_scanning")}</div>
        </div>
      )}
    </main>
  );
}
