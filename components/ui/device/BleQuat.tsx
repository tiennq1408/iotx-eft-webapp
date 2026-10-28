"use client";

import { useEffect, useState } from "react";
import { Bluetooth, BluetoothOff } from "lucide-react";
import { useChu } from "../chu";
import { LoiBle, PhienBleQuat, coWebBluetooth, docMaTem, laQuatBle, ngheBle, nhoMaTem, phienBle } from "@/lib/ble/quatBle";
import type { Device } from "@/lib/types";

/**
 * Khối "Điều khiển gần qua Bluetooth" trên màn chi tiết quạt — đường dự phòng khi mất mạng.
 *
 * Chỉ vẽ khi trình duyệt có Web Bluetooth (Chrome/Edge trên Android, máy tính; cần HTTPS hoặc
 * localhost) và thiết bị là quạt. iPhone/iPad không có API này nên không thấy khối, thay vì
 * thấy một nút bấm vào chỉ để báo lỗi.
 *
 * Nối xong thì MỌI lệnh trên màn (và công tắc trên thẻ) đi qua Bluetooth — `guiLenh` trong
 * `LivotecApp` hỏi `phienBle` trước khi gọi `/v1`. Rời màn chi tiết là ngắt, để không có một
 * kết nối vô hình nào còn giữ quạt.
 */
export default function BleQuat({ device, chan }: { device: Device; chan: boolean }) {
  const { t } = useChu();
  const [phien, setPhien] = useState<PhienBleQuat | undefined>(() => phienBle(device.id));
  const [nhapMa, setNhapMa] = useState(false);
  const [ma, setMa] = useState("");
  const [dangNoi, setDangNoi] = useState(false);
  const [loi, setLoi] = useState("");

  useEffect(() => ngheBle(id => { if (id === device.id) setPhien(phienBle(device.id)); }), [device.id]);
  // Rời màn chi tiết → ngắt.
  useEffect(() => () => { phienBle(device.id)?.ngat(); }, [device.id]);

  if (!coWebBluetooth() || !laQuatBle(device) || chan) return null;

  async function noi(maTem: string) {
    setLoi("");
    setDangNoi(true);
    try {
      await PhienBleQuat.ketNoi(device.id, maTem, device.code);
      nhoMaTem(device.id, maTem);
      setNhapMa(false);
    } catch (e) {
      // Người dùng đóng hộp chọn của trình duyệt: không phải lỗi, im lặng.
      if (e instanceof DOMException && e.name === "NotFoundError") return;
      if (e instanceof LoiBle) {
        if (e.ma === "auth") { nhoMaTem(device.id, ""); setNhapMa(true); }
        const khoa = `ble_loi_${e.ma}`;
        const cau = t(khoa);
        setLoi(cau !== khoa ? cau : e.message);
      } else {
        setLoi(t("ble_loi_chung", { loi: e instanceof Error ? e.message : String(e) }));
      }
    } finally {
      setDangNoi(false);
    }
  }

  function bamNoi() {
    const daNho = docMaTem(device.id);
    if (daNho) { void noi(daNho); return; }
    setNhapMa(true);
  }

  const maHopLe = /^\d{5}$/.test(ma);

  return (
    <div className="card ble-quat">
      {phien ? (
        <>
          <div className="capline">
            <span><Bluetooth className="ic-dong" aria-hidden="true" /> {t("ble_dang_noi", { ten: phien.ten || device.name })}</span>
          </div>
          <p className="small dim">{t("ble_dang_noi_mo_ta")}</p>
          <button className="btn gh" onClick={() => phien.ngat()}><BluetoothOff aria-hidden="true" /> {t("ble_ngat")}</button>
        </>
      ) : nhapMa ? (
        <>
          <label className="small" htmlFor={`ble-ma-${device.id}`}>{t("ble_nhap_ma")}</label>
          <div className="frow">
            <input id={`ble-ma-${device.id}`} className="fsel" inputMode="numeric" autoComplete="off" maxLength={5}
              placeholder="12345" value={ma} onChange={e => setMa(e.target.value.replace(/\D/g, ""))}
              onKeyDown={e => { if (e.key === "Enter" && maHopLe && !dangNoi) void noi(ma); }} />
            <button className="btn" disabled={!maHopLe || dangNoi} onClick={() => { void noi(ma); }}>
              {dangNoi ? t("working") : t("ble_ket_noi")}
            </button>
          </div>
          <button className="btn gh" onClick={() => { setNhapMa(false); setLoi(""); }}>{t("cancel")}</button>
        </>
      ) : (
        <>
          <button className="btn gh" disabled={dangNoi} onClick={bamNoi}>
            <Bluetooth aria-hidden="true" /> {dangNoi ? t("working") : t("ble_mo")}
          </button>
          <p className="small dim">{t("ble_mo_ta")}</p>
        </>
      )}
      {loi && <p className="form-message" role="status">{loi}</p>}
    </div>
  );
}
