"use client";

import { useEffect, useRef, useState } from "react";
import { Bluetooth, BluetoothOff, Wifi } from "lucide-react";
import { useChu } from "../chu";
import { useKenhBle } from "./KenhKetNoi";
import { LoiBle, PhienBle, coWebBluetooth, docMaTem, coDuongBle, matWifiChac, nhoMaTem, phienBle } from "@/lib/ble/dieuKhienBle";
import type { Device } from "@/lib/types";

/**
 * Khối "Điều khiển gần qua Bluetooth" trên màn chi tiết quạt, điều hoà.
 *
 * Chỉ vẽ khi trình duyệt có Web Bluetooth (Chrome/Edge trên Android, máy tính; cần HTTPS hoặc
 * localhost) và thiết bị có đường Bluetooth (`coDuongBle`). iPhone/iPad không có API này nên
 * không thấy khối, thay vì thấy một nút bấm vào chỉ để báo lỗi.
 *
 * Chọn kênh (`kenhDung`): Wi-Fi được ưu tiên. Thiết bị mất Wi-Fi thì khối tự nối Bluetooth —
 * không cần chạm nếu máy đã được chọn trước đó và mã tem đã nhớ; trình duyệt bắt chạm thì
 * hiện lời nhắc kèm nút. Có Wi-Fi lại thì lệnh tự về Wi-Fi, Bluetooth chờ sẵn. Người dùng vẫn
 * tự chọn Bluetooth được (nối tay khi đang có Wi-Fi, hoặc nút "Dùng Bluetooth").
 *
 * Rời màn chi tiết là ngắt, để không có một kết nối vô hình nào còn giữ thiết bị.
 */
export default function BleDieuKhien({ device, chan }: { device: Device; chan: boolean }) {
  const { t } = useChu();
  const { phien, kenh, wifi } = useKenhBle(device);
  const [nhapMa, setNhapMa] = useState(false);
  const [ma, setMa] = useState("");
  const [dangNoi, setDangNoi] = useState(false);
  const [loi, setLoi] = useState("");
  /** Mất Wi-Fi mà trình duyệt không cho tự nối: cần người dùng chạm. */
  const [canCham, setCanCham] = useState(false);
  /** Mỗi lần mất Wi-Fi chỉ tự nối một lần — hỏng thì để người dùng chạm, không thử dồn dập. */
  const daTuNoi = useRef(false);
  const coKhoi = coWebBluetooth() && coDuongBle(device) && !chan;

  // Rời màn chi tiết → ngắt.
  useEffect(() => () => { phienBle(device.id)?.ngat(); }, [device.id]);

  function baoLoi(e: unknown) {
    if (e instanceof LoiBle) {
      if (e.ma === "auth") { nhoMaTem(device.id, ""); setNhapMa(true); }
      const khoa = `ble_loi_${e.ma}`;
      const cau = t(khoa);
      setLoi(cau !== khoa ? cau : e.message);
    } else {
      setLoi(t("ble_loi_chung", { loi: e instanceof Error ? e.message : String(e) }));
    }
  }

  // Mất Wi-Fi → tự nối Bluetooth (cần mã tem đã nhớ); có Wi-Fi lại → cho tự nối ở lần mất sau.
  useEffect(() => {
    if (wifi) { daTuNoi.current = false; return; }
    if (!coKhoi || phienBle(device.id) || daTuNoi.current) return;
    const maNho = docMaTem(device.id);
    if (!maNho) return;   // chưa nhớ mã: lời nhắc chạm tự hiện (`nhacCham`)
    daTuNoi.current = true;
    void (async () => {
      setDangNoi(true);
      try {
        await PhienBle.noiLai(device.id, maNho, device.code);
        setLoi("");
      } catch (e) {
        if (e instanceof LoiBle && e.ma === "can_cham") setCanCham(true);
        else baoLoi(e);
      } finally {
        setDangNoi(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy lại khi trạng thái mạng hay phiên đổi
  }, [wifi, device.id, coKhoi, phien]);

  if (!coKhoi) return null;
  const nhacCham = !wifi && (canCham || !docMaTem(device.id));

  async function noi(maTem: string) {
    setLoi("");
    setDangNoi(true);
    try {
      // Nối tay khi máy đang có Wi-Fi = người dùng chọn Bluetooth. Nối lúc mất Wi-Fi thì để tự
      // động: có Wi-Fi lại là lệnh về Wi-Fi.
      await PhienBle.ketNoi(device.id, maTem, device.code, wifi);
      nhoMaTem(device.id, maTem);
      setNhapMa(false);
      setCanCham(false);
    } catch (e) {
      // Người dùng đóng hộp chọn của trình duyệt: không phải lỗi, im lặng.
      if (e instanceof DOMException && e.name === "NotFoundError") return;
      baoLoi(e);
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
    <div className="card ble-dk">
      {phien ? (
        <>
          <div className="capline">
            <span>
              <Bluetooth className="ic-dong" aria-hidden="true" />{" "}
              {t(kenh === "ble" ? "ble_dang_noi" : "ble_cho", { ten: phien.ten || device.name })}
            </span>
          </div>
          <p className="small dim">
            {t(kenh !== "ble" ? "ble_cho_mo_ta" : phien.tuChon && wifi ? "ble_tu_chon_mo_ta" : "ble_du_phong_mo_ta")}
          </p>
          {wifi && (phien.tuChon ? (
            <button className="btn gh" onClick={() => phien.datTuChon(false)}><Wifi aria-hidden="true" /> {t("ble_uu_tien_wifi")}</button>
          ) : (
            <button className="btn gh" onClick={() => phien.datTuChon(true)}><Bluetooth aria-hidden="true" /> {t("ble_dung_ble")}</button>
          ))}
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
          {nhacCham && <p className="small ble-nhac" role="status">{t(device.online && !matWifiChac(device.id) ? "ble_nghi_mat_wifi" : "ble_mat_wifi")}</p>}
          <button className={nhacCham ? "btn" : "btn gh"} disabled={dangNoi} onClick={bamNoi}>
            <Bluetooth aria-hidden="true" /> {dangNoi ? t("working") : t("ble_mo")}
          </button>
          {!nhacCham && <p className="small dim">{t("ble_mo_ta")}</p>}
        </>
      )}
      {loi && <p className="form-message" role="status">{loi}</p>}
    </div>
  );
}
