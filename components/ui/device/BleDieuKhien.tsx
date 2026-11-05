"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bluetooth, Settings, Wifi } from "lucide-react";
import { useChu } from "../chu";
import { useKenhBle } from "./KenhKetNoi";
import { LoiBle, PhienBle, coWebBluetooth, coDuongBle, matWifiChac, phienBle, xoaMaTemDaNho } from "@/lib/ble/dieuKhienBle";
import type { Device } from "@/lib/types";

/**
 * Khối "Điều khiển gần qua Bluetooth" trên màn chi tiết quạt, điều hoà.
 *
 * Chỉ vẽ khi trình duyệt có Web Bluetooth (Chrome/Edge trên Android, máy tính; cần HTTPS hoặc
 * localhost) và thiết bị có đường Bluetooth (`coDuongBle`). iPhone/iPad không có API này nên
 * không thấy khối, thay vì thấy một nút bấm vào chỉ để báo lỗi.
 *
 * Firmware chạy MỘT đường điều khiển mỗi lúc: Wi-Fi, hoặc Bluetooth. Hàng nút "Điều khiển qua
 * Wi-Fi | Bluetooth" đổi qua lại bằng một chạm: Bluetooth = nối + xác thực (mạch tắt Wi-Fi);
 * Wi-Fi = gửi `setWifi` rỗng (mạch về mạng đã lưu, không khởi động lại) rồi ngắt Bluetooth.
 * Thiết bị mất Wi-Fi thì khối hiện cảnh báo kèm nút, không tự nối. "Cài đặt Wi-Fi" chỉ để đổi sang
 * mạng khác (nối Bluetooth trước nếu chưa nối): gửi `startWifiSetup`, mạch khởi động lại vào luồng
 * cài đặt ban đầu — phát mạng `mzService_<serial>`, người dùng chọn Wi-Fi ở trang cài đặt.
 *
 * Chỉ nối khi người dùng bấm, và lần nào cũng hỏi mã: chọn máy và nối TRƯỚC, nhập mã tem SAU
 * (`PhienBle.chonMay` rồi `xacThuc`). App không nhớ mã.
 *
 * Rời màn chi tiết là ngắt, để không có một kết nối vô hình nào còn giữ thiết bị.
 */
export default function BleDieuKhien({ device, chan }: { device: Device; chan: boolean }) {
  const { t } = useChu();
  const { phien, wifi } = useKenhBle(device);
  /** Đã nối máy, đang chờ người dùng nhập mã tem. */
  const [choMa, setChoMa] = useState<PhienBle | null>(null);
  const choMaRef = useRef<PhienBle | null>(null);
  const [ma, setMa] = useState("");
  const [dangNoi, setDangNoi] = useState(false);
  const [loi, setLoi] = useState("");
  /** Bấm "Cài đặt Wi-Fi" khi chưa nối: nối Bluetooth xong thì gửi luôn lệnh cài đặt. */
  const sauKhiNoiCaiWifi = useRef(false);
  /** Vừa bấm Wi-Fi: chờ mạch về mạng đã lưu (hết hạn sau ~40 s), chưa hiện cảnh báo mất Wi-Fi. */
  const [veWifiDen, setVeWifiDen] = useState(0);
  useEffect(() => {
    if (!veWifiDen) return;
    const h = setTimeout(() => setVeWifiDen(0), Math.max(0, veWifiDen - Date.now()));
    return () => clearTimeout(h);
  }, [veWifiDen]);
  /**
   * Vừa bấm "Cài đặt Wi-Fi": mạch đang phát mạng cài đặt. Nút đó sáng, không cảnh báo mất Wi-Fi. Xong khi mạch có Wi-Fi lại (đã mất rồi có lại), chọn chế độ khác, hoặc sau 5 phút.
   */
  const [caiWifiDen, setCaiWifiDen] = useState(0);
  const daMatKhiCai = useRef(false);
  useEffect(() => {
    if (!caiWifiDen) { daMatKhiCai.current = false; return; }
    if (!wifi) daMatKhiCai.current = true;
    const xong = wifi && daMatKhiCai.current;
    const h = setTimeout(() => setCaiWifiDen(0), xong ? 0 : Math.max(0, caiWifiDen - Date.now()));
    return () => clearTimeout(h);
  }, [caiWifiDen, wifi]);
  const coKhoi = coWebBluetooth() && coDuongBle(device) && !chan;

  const datChoMa = (p: PhienBle | null) => { choMaRef.current = p; setChoMa(p); };

  // Rời màn chi tiết → ngắt (cả kết nối đang chờ mã).
  useEffect(() => () => { phienBle(device.id)?.ngat(); choMaRef.current?.ngat(); }, [device.id]);
  useEffect(() => { xoaMaTemDaNho(); }, []);

  function baoLoi(e: unknown) {
    if (e instanceof LoiBle) {
      const khoa = `ble_loi_${e.ma}`;
      const cau = t(khoa);
      setLoi(cau !== khoa ? cau : e.message);
    } else {
      setLoi(t("ble_loi_chung", { loi: e instanceof Error ? e.message : String(e) }));
    }
  }

  if (!coKhoi) return null;
  /** Vừa chọn Wi-Fi: mạch đang về mạng đã lưu (tới ~40 s) — chưa coi là mất Wi-Fi. */
  const choVeWifi = !wifi && veWifiDen > 0;
  const dangCaiWifi = caiWifiDen > 0;
  /** Không có Wi-Fi và chưa điều khiển qua Bluetooth: khung cảnh báo với hai lựa chọn. */
  const matWifi = !wifi && !phien && !choMa && !choVeWifi && !dangCaiWifi;

  /** Mạng cài đặt mạch phát ra — phải khớp `build_identity_strings` trong firmware wifi_prov.c. */
  const mangCaiDat = `mzService_${(device.code ?? "").slice(-22)}`;

  /** Đã xác thực xong: bấm "Cài đặt Wi-Fi" từ trạng thái thường thì gửi luôn lệnh cài đặt. */
  function daNoiXong(p: PhienBle) {
    if (sauKhiNoiCaiWifi.current) void caiWifi(p);
    sauKhiNoiCaiWifi.current = false;
  }

  /** "Cài đặt Wi-Fi": mạch tắt Bluetooth, khởi động lại và phát mạng cài đặt như luồng ban đầu. */
  async function caiWifi(p: PhienBle) {
    setLoi("");
    setDangNoi(true);
    try {
      await p.gui("startWifiSetup", {});
      setCaiWifiDen(Date.now() + 5 * 60_000);
    } catch (e) {
      baoLoi(e);
    } finally {
      setDangNoi(false);
    }
  }

  /**
   * Nút "Wi-Fi" khi đang Bluetooth: mạch về mạng đã lưu ngay (`setWifi` rỗng), rồi ngắt Bluetooth.
   * Mạch không vào được mạng thì sau 30 s tự bật Bluetooth, khi đó khối hiện cảnh báo mất Wi-Fi.
   */
  async function dungWifi(p: PhienBle) {
    setLoi("");
    setDangNoi(true);
    try {
      await p.gui("setWifi", {});
    } catch (e) {
      // "busy" = mạch đang ở Wi-Fi sẵn; mất kết nối = mạch đã chuyển. Còn lại thì giữ Bluetooth.
      if (!(e instanceof LoiBle && (e.ma === "busy" || e.ma === "ngat"))) {
        baoLoi(e);
        setDangNoi(false);
        return;
      }
    }
    p.ngat();
    setVeWifiDen(Date.now() + 40_000);   // firmware: 30 s thử mạng + ~10 s vào lại máy chủ
    setDangNoi(false);
  }

  /**
   * Chạm nút: hộp chọn → nối → hỏi mã tem. `caiWifiSau`: nút "Cài đặt Wi-Fi" — lệnh gửi cho mạch qua
   * Bluetooth nên cũng phải nối trước.
   */
  async function bamNoi(caiWifiSau = false) {
    sauKhiNoiCaiWifi.current = caiWifiSau;
    setLoi("");
    setCaiWifiDen(0);
    setDangNoi(true);
    try {
      const p = await PhienBle.chonMay(device.id, device.code);
      setMa("");
      datChoMa(p);
    } catch (e) {
      // Người dùng đóng hộp chọn của trình duyệt: không phải lỗi, im lặng.
      if (e instanceof DOMException && e.name === "NotFoundError") return;
      baoLoi(e);
    } finally {
      setDangNoi(false);
    }
  }

  /** Đã nối máy: gửi mã tem. Sai mã thì giữ kết nối để nhập lại; lỗi khác thì bỏ kết nối. */
  async function guiMa() {
    const p = choMaRef.current;
    if (!p) return;
    setLoi("");
    setDangNoi(true);
    try {
      await p.xacThuc(ma);
      setMa("");
      datChoMa(null);
      daNoiXong(p);
    } catch (e) {
      baoLoi(e);
      if (!(e instanceof LoiBle && e.ma === "auth")) { p.ngat(); datChoMa(null); }
    } finally {
      setDangNoi(false);
    }
  }

  const maHopLe = /^\d{5}$/.test(ma);
  const cheDoBle = !!phien || !!choMa;
  /** Nút Wi-Fi chỉ sáng khi đang (hoặc vừa chọn) đi Wi-Fi — mất Wi-Fi thì không nút nào sáng. */
  const cheDoWifi = !cheDoBle && !dangCaiWifi && (wifi || choVeWifi);

  return (
    <div className="card ble-dk">
      <div className="seg-group ble-chedo" role="group" aria-label={t("che_do")}>
        <button className={`seg-btn${cheDoWifi ? " sel" : ""}`} aria-pressed={cheDoWifi} disabled={dangNoi}
          onClick={() => { setCaiWifiDen(0); if (phien) void dungWifi(phien); else if (choMa) { choMa.ngat(); datChoMa(null); setLoi(""); } }}>
          <Wifi aria-hidden="true" /> {t("kenh_wifi")}
        </button>
        <button className={`seg-btn${cheDoBle ? " sel" : ""}`} aria-pressed={cheDoBle} disabled={dangNoi}
          onClick={() => { if (!cheDoBle) void bamNoi(); }}>
          <Bluetooth aria-hidden="true" /> {dangNoi && !cheDoBle ? t("working") : t("kenh_ble")}
        </button>
      </div>
      {phien ? (
        <>
          <div className="capline">
            <span>
              <Bluetooth className="ic-dong" aria-hidden="true" />{" "}
              {t("ble_dang_noi", { ten: phien.ten || device.name })}
            </span>
          </div>
          <p className="small dim">{t("ble_dang_noi_mo_ta")}</p>
          <button className="btn gh" disabled={dangNoi} onClick={() => { void caiWifi(phien); }}>
            <Settings aria-hidden="true" /> {t("ble_cai_wifi")}
          </button>
        </>
      ) : choMa ? (
        <>
          <label className="small" htmlFor={`ble-ma-${device.id}`}>{t("ble_nhap_ma_sau_noi", { ten: choMa.ten || device.name })}</label>
          <div className="frow">
            <input id={`ble-ma-${device.id}`} className="fsel" inputMode="numeric" autoComplete="off" maxLength={5}
              placeholder="12345" value={ma} onChange={e => setMa(e.target.value.replace(/\D/g, ""))}
              onKeyDown={e => { if (e.key === "Enter" && maHopLe && !dangNoi) void guiMa(); }} />
            <button className="btn" disabled={!maHopLe || dangNoi} onClick={() => { void guiMa(); }}>
              {dangNoi ? t("working") : t("ble_ket_noi")}
            </button>
          </div>
          <button className="btn gh" onClick={() => { choMa.ngat(); datChoMa(null); setLoi(""); }}>{t("cancel")}</button>
        </>
      ) : matWifi ? (
        <div className="ble-canh-bao" role="alert">
          <p className="ble-nhac">
            <AlertTriangle aria-hidden="true" />{" "}
            {t(device.online && !matWifiChac(device.id) ? "ble_nghi_mat_wifi" : "ble_mat_wifi")}
          </p>
          <p className="small">{t("ble_mat_wifi_cach")}</p>
          <button className="btn" disabled={dangNoi} onClick={() => { void bamNoi(); }}>
            <Bluetooth aria-hidden="true" /> {dangNoi ? t("working") : t("ble_mo")}
          </button>
          <button className="btn gh" disabled={dangNoi} onClick={() => { void bamNoi(true); }}>
            <Settings aria-hidden="true" /> {t("ble_cai_wifi")}
          </button>
        </div>
      ) : (
        <>
          <button className={dangCaiWifi ? "btn" : "btn gh"} aria-pressed={dangCaiWifi} disabled={dangNoi}
            onClick={() => { void bamNoi(true); }}>
            <Settings aria-hidden="true" /> {t("ble_cai_wifi")}
          </button>
          {!choVeWifi && !dangCaiWifi && <p className="small dim">{t("ble_mo_ta")}</p>}
        </>
      )}
      {dangCaiWifi && <p className="small" role="status">{t("ble_dang_cai_wifi", { mang: mangCaiDat })}</p>}
      {choVeWifi && <p className="small" role="status">{t("ble_dang_ve_wifi")}</p>}
      {loi && <p className="form-message" role="status">{loi}</p>}
    </div>
  );
}
