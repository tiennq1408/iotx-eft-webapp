"use client";

import { useState, useSyncExternalStore } from "react";
import { Bluetooth, BluetoothConnected } from "lucide-react";
import { useChu } from "@/components/ui/chu";
import { Sheet } from "@/components/ui/shell";
import { QuetQR } from "@/components/manage/QuetQR";
import { docBleBiMat, ghiBleBiMat, xoaBleBiMat } from "@/lib/iotx/cache";
import { BleLoi, bleClient, boBaoBle, docTrangThaiBle, ngheTrangThaiBle } from "@/lib/iotx/ble";
import { base64, docBiMatTem, tuBase64 } from "@/lib/iotx/bleKenh";
import type { Device } from "@/lib/types";

/**
 * Giao diện nối BLE ở màn chi tiết (docs/viec-ble-webapp.md mục 7). DeviceDetail chỉ chừa hai chỗ
 * cắm — nút cạnh nút thông tin, băng trên lưới — mọi logic nằm ở đây và `lib/iotx/ble.ts`.
 */

const useTrangThai = () => useSyncExternalStore(ngheTrangThaiBle, docTrangThaiBle, () => ({ loai: "nghi" }) as const);
/** Bản dựng máy chủ coi như KHÔNG hỗ trợ, nên nút không nháy lên rồi biến mất trên iPhone. */
const useCoHoTro = () => useSyncExternalStore(() => () => undefined, () => bleClient.coHoTro(), () => false);

/** Serial in trên mạch — chính là `name` thiết bị ở /v1 (`Device.code`). */
const serialCua = (d: Device) => d.code?.trim() || "";

/** Thông báo sau lần nối hỏng, theo thiết bị. Dùng chung cho nút và băng. */
let loiGanNhat: { deviceId: string; cau: string } | null = null;
const ngheLoi = new Set<() => void>();
const datLoi = (v: typeof loiGanNhat) => { loiGanNhat = v; ngheLoi.forEach(f => f()); };
const useLoi = () => useSyncExternalStore(f => { ngheLoi.add(f); return () => { ngheLoi.delete(f); }; }, () => loiGanNhat, () => null);

/**
 * Nút "Kết nối trực tiếp", cùng hàng nút thông tin thiết bị. KHÔNG có `navigator.bluetooth`
 * (iPhone, Firefox) thì ẩn hẳn — hiện ra rồi bấm vào báo lỗi còn tệ hơn.
 */
export function NutKetNoiBle({ device }: { device: Device }) {
  const { t } = useChu();
  const coHoTro = useCoHoTro();
  const tt = useTrangThai();
  const [moNhap, setMoNhap] = useState<{ cau?: string } | null>(null);
  const serial = serialCua(device);
  if (!coHoTro || !serial) return null;

  const daNoi = tt.loai === "daNoi" && tt.deviceId === device.id;
  const dangNoi = tt.loai === "dangNoi" && tt.deviceId === device.id;

  /** Gọi thẳng trong cú bấm — Chrome đòi `requestDevice` nằm trong cú bấm của người dùng. */
  const noi = (biMat: Uint8Array) => {
    datLoi(null);
    setMoNhap(null);
    bleClient.noi(serial, biMat, device.id).catch((e: unknown) => {
      if (!(e instanceof BleLoi) || e.ma === "huy") return;   // tự huỷ hộp chọn: không có gì để báo
      if (e.ma === "ma_sai") {
        // Bắt tay sai: bỏ mã đã cất, hỏi lại — đừng để khách kẹt với một mã sai vĩnh viễn.
        xoaBleBiMat(serial);
        setMoNhap({ cau: e.message });
        return;
      }
      datLoi({ deviceId: device.id, cau: e.message });
    });
  };

  const bam = () => {
    if (daNoi) { bleClient.ngat(); return; }
    if (dangNoi) return;
    const daCat = docBleBiMat(serial);
    if (daCat) noi(tuBase64(daCat));
    else setMoNhap({});
  };

  return (
    <>
      <button className={`tt-lon ble-nut${daNoi ? " on" : ""}`} aria-label={t(daNoi ? "ble_ngat_noi" : "ble_ket_noi")}
        title={t(daNoi ? "ble_ngat_noi" : "ble_ket_noi")} aria-pressed={daNoi} aria-busy={dangNoi || undefined} onClick={bam}>
        {daNoi ? <BluetoothConnected /> : <Bluetooth />}
      </button>
      {moNhap && <NhapBiMat serial={serial} cauLoi={moNhap.cau} onNoi={noi} onClose={() => setMoNhap(null)} />}
    </>
  );
}

/**
 * Nhập bí mật lần đầu: quét QR trên tem (dùng lại `QuetQR`), hoặc gõ tay khi tem mờ. Quét xong
 * vẫn phải bấm "Kết nối": camera đọc mã không phải cú bấm, mà Chrome chỉ mở hộp chọn thiết bị
 * Bluetooth trong cú bấm của người dùng.
 */
function NhapBiMat({ serial, cauLoi, onNoi, onClose }: {
  serial: string; cauLoi?: string; onNoi: (biMat: Uint8Array) => void; onClose: () => void;
}) {
  const { t } = useChu();
  const [ma, setMa] = useState("");
  const [loi, setLoi] = useState("");
  const biMat = docBiMatTem(ma);

  const nhan = (text: string) => {
    setMa(text);
    setLoi(docBiMatTem(text) ? "" : t("ble_ma_khong_hop_le"));
  };
  const xacNhan = () => {
    if (!biMat) { setLoi(t("ble_ma_khong_hop_le")); return; }
    ghiBleBiMat(serial, base64(biMat));
    onNoi(biMat);
  };

  return (
    <Sheet title={t("ble_ket_noi")} onClose={onClose}>
      <h2 className="modal-title">{t("ble_ket_noi")}</h2>
      {cauLoi && <p className="form-message" role="alert">{cauLoi} {t("ble_quet_lai")}</p>}
      <p className="hint">{t("ble_huong_dan", { serial })}</p>
      <QuetQR tieuDe={t("ble_quet_tem")} onDoc={nhan} />
      <label className="field"><span>{t("ble_nhap_tay")}</span>
        <input value={ma} autoComplete="off" spellCheck={false} aria-invalid={Boolean(loi) || undefined}
          onChange={e => { setMa(e.target.value); setLoi(""); }} />
      </label>
      {loi && <p className="form-message" role="status">{loi}</p>}
      <button className="primary full" disabled={!ma.trim()} onClick={xacNhan}>{t("ble_noi")}</button>
    </Sheet>
  );
}

/**
 * Băng trên lưới: đang nối / đã nối (kèm Ngắt) / mất kết nối giữa chừng (vàng, lệnh đã tự quay
 * về /v1) / lần nối vừa hỏng. Không có gì để nói thì không vẽ.
 */
export function BangBle({ device }: { device: Device }) {
  const { t } = useChu();
  const tt = useTrangThai();
  const loi = useLoi();
  if (tt.loai !== "nghi" && tt.deviceId === device.id) {
    if (tt.loai === "dangNoi") return <div className="ble-bang" role="status"><span>{t("ble_dang_noi")}</span></div>;
    if (tt.loai === "daNoi") {
      return (
        <div className="ble-bang on" role="status">
          <BluetoothConnected aria-hidden="true" /><span>{t("ble_da_noi")}</span>
          <button onClick={() => bleClient.ngat()}>{t("ble_ngat")}</button>
        </div>
      );
    }
    return (
      <div className="ble-bang vang" role="alert">
        <span>{t("ble_mat")}</span>
        <button aria-label={t("close")} onClick={boBaoBle}>×</button>
      </div>
    );
  }
  if (loi?.deviceId === device.id) {
    return (
      <div className="ble-bang vang" role="alert">
        <span>{loi.cau}</span>
        <button aria-label={t("close")} onClick={() => datLoi(null)}>×</button>
      </div>
    );
  }
  return null;
}
