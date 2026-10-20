"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { useChu } from "./chu";

/**
 * Màn nhập mã xác thực 6 số — dùng chung cho đăng ký và quên mật khẩu.
 *
 * KHÔNG tự gọi API: nhận `onXacNhan` / `onGuiLai` từ ngoài, mỗi luồng tự lo phần việc của mình.
 * Hai mốc thời gian (`hetHanSau`, `guiLaiSau`) là số giây máy chủ trả ở `/auth/otp/gui`; nơi gọi
 * đổi `key` sau mỗi lần gửi lại để đồng hồ chạy lại từ đầu.
 *
 * Mặc định có nút **Xác nhận** và chỉ gửi khi bấm (hoặc Enter) — cả đăng ký lẫn quên mật khẩu
 * dùng cách này theo yêu cầu 19/10/2026. `tuGui` bật lại kiểu đủ 6 số thì tự gửi.
 *
 * Một ô nhập DUY NHẤT (không phải 6 ô rời): 6 ô rời hỏng khi dán mã, và trình đọc màn hình đọc
 * thành sáu trường vô nghĩa. `autoComplete="one-time-code"` để iOS/Android tự điền mã từ thư.
 */
const chiSo = (v: string) => v.replace(/\D/g, "").slice(0, 6);
const mss = (giay: number) => `${Math.floor(giay / 60)}:${String(giay % 60).padStart(2, "0")}`;

export default function NhapMaOtp({ dich, hetHanSau, guiLaiSau, dangGui, onXacNhan, onGuiLai, tuGui = false }: {
  /** Địa chỉ đã gửi tới — chỉ để hiện cho người dùng nhìn. */
  dich: string;
  /** Giây, máy chủ trả. */
  hetHanSau: number;
  /** Giây, máy chủ trả. */
  guiLaiSau: number;
  dangGui: boolean;
  onXacNhan: (ma: string) => void | Promise<void>;
  onGuiLai: () => void | Promise<void>;
  /** Đủ 6 số thì tự gửi, không có nút Xác nhận. Mặc định tắt: chỉ gửi khi bấm nút (hoặc Enter). */
  tuGui?: boolean;
}) {
  const { t } = useChu();
  const [ma, setMa] = useState("");
  const [batDau] = useState(() => Date.now());
  const [daQua, setDaQua] = useState(0);
  /** Mã vừa gửi đi: đủ 6 số thì tự gửi, nhưng KHÔNG gửi lại đúng mã đó lần nữa khi màn vẽ lại. */
  const daGui = useRef("");

  useEffect(() => {
    const dongHo = setInterval(() => setDaQua(Math.floor((Date.now() - batDau) / 1000)), 250);
    return () => clearInterval(dongHo);
  }, [batDau]);

  const conLai = Math.max(0, hetHanSau - daQua);
  const choGuiLai = Math.max(0, guiLaiSau - daQua);
  const hetHan = conLai === 0;

  // Chỉ khi bật `tuGui`: đủ 6 số thì tự gửi.
  useEffect(() => {
    if (!tuGui || ma.length !== 6 || hetHan || dangGui || daGui.current === ma) return;
    daGui.current = ma;
    void onXacNhan(ma);
  }, [tuGui, ma, hetHan, dangGui, onXacNhan]);

  function gui(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ma.length !== 6 || hetHan || dangGui) return;
    daGui.current = ma;
    void onXacNhan(ma);
  }

  /** Dán: lọc bỏ mọi ký tự không phải số rồi cắt còn 6 — người ta hay dán kèm khoảng trắng.
      Phải chặn ở đây: `maxLength` cắt chuỗi dán TRƯỚC khi lọc, " 1 2 3 4 5 6 " còn lại "1 2 3". */
  function dan(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    setMa(chiSo(event.clipboardData.getData("text")));
  }

  return (
    <form className="dn-form" noValidate onSubmit={gui}>
      <div className="dn-field">
        <label htmlFor="otp-ma">{t("ma_nhan")}</label>
        <input id="otp-ma" className="dn-input dn-otp" type="text" value={ma}
          inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}"
          placeholder={t("ma_ph")} disabled={hetHan} aria-describedby="otp-dich otp-han"
          onPaste={dan} onChange={e => setMa(chiSo(e.target.value))} />
        <span id="otp-dich" className="dn-sr">{dich}</span>
        <span id="otp-han" className="dn-otp-han" aria-live="polite">
          {dangGui ? t("ma_dang_kiem") : hetHan ? t("ma_het_han") : t("ma_con_lai", { t: mss(conLai) })}
        </span>
      </div>
      {!tuGui && (
        <button type="submit" className="login-btn" disabled={ma.length !== 6 || hetHan || dangGui}>
          {dangGui ? t("working") : t("ma_xac_nhan")}
        </button>
      )}
      <button type="button" className="login-btn secondary" disabled={choGuiLai > 0 || dangGui}
        onClick={() => { daGui.current = ""; setMa(""); void onGuiLai(); }}>
        {choGuiLai > 0 ? t("ma_gui_lai_sau", { n: choGuiLai }) : t("qm_gui_lai")}
      </button>
    </form>
  );
}
