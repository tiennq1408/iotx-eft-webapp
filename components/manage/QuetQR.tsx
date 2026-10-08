"use client";

import { useEffect, useRef, useState } from "react";
import { QrCode } from "lucide-react";
import jsQR from "jsqr";
import { useChu } from "@/components/newui/chu";

/** `BarcodeDetector` chưa có trong lib DOM của TypeScript; chỉ khai đúng phần dùng tới. */
type BoDoMa = { detect(anh: ImageBitmapSource): Promise<Array<{ rawValue: string }>> };
type CuaSoCoBoDoMa = Window & { BarcodeDetector?: new (opt: { formats: string[] }) => BoDoMa };

/**
 * Khung quét QR bằng camera của trình duyệt. Dùng `BarcodeDetector` khi trình duyệt có
 * (Chrome/Edge/Android), không thì giải mã từng khung hình bằng jsQR (Safari/iPhone).
 * Chỉ chạy khi người dùng bấm nút — camera không tự bật. Không mở được (bị từ chối, không
 * có camera, trang không phải HTTPS) thì nói rõ và để người dùng gõ tay bên dưới.
 */
export function QuetQR({ tieuDe, onDoc }: { tieuDe: string; onDoc: (text: string) => void }) {
  const { t } = useChu();
  const video = useRef<HTMLVideoElement>(null);
  const [dangQuet, setDangQuet] = useState(false);
  const [loi, setLoi] = useState("");
  const [daDoc, setDaDoc] = useState(false);
  const dungRef = useRef<() => void>(() => undefined);

  // Rời màn khi camera còn mở thì phải tắt, không thì đèn camera sáng mãi.
  useEffect(() => () => dungRef.current(), []);

  async function batDau() {
    setLoi(""); setDaDoc(false);
    // Camera chỉ có trên HTTPS/localhost — nói đúng nguyên nhân thay vì "kiểm tra quyền".
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) { setLoi(t(window.isSecureContext ? "add.quetKhongDuoc" : "add.quetCanHttps")); return; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch { setLoi(t("add.quetKhongDuoc")); return; }

    const v = video.current;
    if (!v) { stream.getTracks().forEach(tr => tr.stop()); return; }
    v.srcObject = stream;
    await v.play().catch(() => undefined);
    setDangQuet(true);

    const BoDoMa = (window as CuaSoCoBoDoMa).BarcodeDetector;
    const boDo = BoDoMa ? new BoDoMa({ formats: ["qr_code"] }) : null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let song = true;
    let hen: ReturnType<typeof setTimeout>;

    const dung = () => {
      song = false;
      clearTimeout(hen);
      stream.getTracks().forEach(tr => tr.stop());
      if (v.srcObject) v.srcObject = null;
      setDangQuet(false);
    };
    dungRef.current = dung;

    const doc = async (): Promise<string | null> => {
      if (v.readyState < 2 || !v.videoWidth) return null;
      if (boDo) {
        const kq = await boDo.detect(v).catch(() => []);
        return kq[0]?.rawValue ?? null;
      }
      if (!ctx) return null;
      // jsQR cần ảnh thô: thu nhỏ về tối đa 480px cho nhẹ, QR cỡ 5 (37 ô) vẫn đọc tốt.
      const tiLe = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
      canvas.width = Math.round(v.videoWidth * tiLe); canvas.height = Math.round(v.videoHeight * tiLe);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const anh = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(anh.data, anh.width, anh.height, { inversionAttempts: "dontInvert" })?.data ?? null;
    };

    const vong = async () => {
      if (!song) return;
      const ma = await doc();
      if (!song) return;
      if (ma) { dung(); setDaDoc(true); onDoc(ma); return; }
      hen = setTimeout(vong, 160);
    };
    hen = setTimeout(vong, 300);
  }

  return (
    <>
      <div className={`scanner${dangQuet ? " dang-quet" : ""}`}>
        {/* <video> luôn có mặt để gán stream; ẩn khi chưa quét. */}
        <video ref={video} playsInline muted hidden={!dangQuet} aria-label={t("add.moCamera")} />
        {!dangQuet && <><QrCode /><strong>{tieuDe}</strong></>}
      </div>
      {dangQuet
        ? <button type="button" className="secondary full" onClick={() => dungRef.current()}>{t("add.dungQuet")}</button>
        : <button type="button" className="secondary full" onClick={() => { void batDau(); }}>{t("add.moCamera")}</button>}
      {daDoc && <p className="hint" role="status">{t("add.daQuet")}</p>}
      {loi && <p className="form-message" role="status">{loi}</p>}
    </>
  );
}
