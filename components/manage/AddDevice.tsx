"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { ChevronRight, QrCode, Settings2, ShieldCheck, Wifi, X } from "lucide-react";
import type { AppData, Device } from "@/lib/types";
import { iotxClient, isIotxMode, moTaLoi } from "@/lib/iotx";
import { IconButton } from "./chung";
import { useChu } from "@/components/newui/chu";

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Giá trị gieo sẵn của luồng thêm thiết bị; tên/nhà/phòng/nhóm mặc định là khóa chữ. */
const MAC_DINH = { ma: "LV-SB614-2026", wifi: "Livotec Home 2.4G" };
const MANG_WIFI = ["Livotec Home 2.4G", "Home IoT", "Viettel_2.4G"];

/** Wizard thêm thiết bị 5 bước: cách thêm → mã → Wi-Fi → ghép nối → đặt tên/phòng. */
export function AddDevice({ data, setData, onSynced, onClose }: { data: AppData; setData: Dispatch<SetStateAction<AppData>>; onSynced: () => Promise<void>; onClose: () => void }) {
  const { t } = useChu();
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<"qr" | "serial">("qr");
  const [code, setCode] = useState(MAC_DINH.ma);
  const [wifi, setWifi] = useState(MAC_DINH.wifi);
  const [password, setPassword] = useState("");
  const [name, setName] = useState(() => t("add.defaultName"));
  const [room, setRoom] = useState(() => data.spaces.rooms[0] || t("add.defaultRoom"));
  const [message, setMessage] = useState("");

  const nha = data.spaces.houses[0] || t("add.defaultHouse");
  const nhom = data.spaces.groups[0] || t("add.defaultGroup");

  async function finish() {
    try {
      setMessage("");
      if (isIotxMode) {
        const claimed = method === "serial"
          ? await iotxClient.claimBoard(code.trim())
          : await iotxClient.claim(name.trim() || code.trim(), code.trim());
        await iotxClient.updateDevice(claimed.id, { label: name.trim() || t("add.defaultName"), house: nha, room, grp: nhom });
        await onSynced();
      } else {
        const device: Device = {
          id: uid(), name: name || t("add.defaultName"), model: code.includes("314") ? "SBI-314" : "SB-614",
          house: nha, room, group: nhom, online: true, on: false, speed: 3,
        };
        setData(current => ({ ...current, devices: [...current.devices, device] }));
      }
      setStep(5);
    } catch (error) {
      // `moTaLoi` giữ đúng luật 404 nhập nhằng: mã claim sai chỉ được nói một câu chung.
      setMessage(moTaLoi(error));
    }
  }

  return (
    <div className="full-panel add-flow">
      <header className="panel-head">
        <IconButton label={t("close")} onClick={onClose}><X /></IconButton>
        <h2>{t("add.title")}</h2>
        <span>{Math.min(step + 1, 5)}/5</span>
      </header>
      <div className="progress">{[0, 1, 2, 3, 4].map(value => <i key={value} className={value <= step ? "done" : ""} />)}</div>
      <div className="panel-body">
        {step === 0 && (
          <>
            <p className="eyebrow">{t("add.how")}</p>
            <button className="method-card" onClick={() => { setMethod("qr"); setStep(1); }}>
              <QrCode /><span><strong>{t("add.qr")}</strong><small>{t("add.qrHint")}</small></span><ChevronRight />
            </button>
            <button className="method-card" onClick={() => { setMethod("serial"); setStep(1); }}>
              <Settings2 /><span><strong>{t("add.serial")}</strong><small>{t("add.serialHint")}</small></span><ChevronRight />
            </button>
          </>
        )}
        {step === 1 && (
          <>
            <div className="scanner"><QrCode /><strong>{method === "qr" ? t("add.scanQr") : t("add.enterSerial")}</strong></div>
            <label className="field"><span>{t("add.code")}</span><input value={code} onChange={e => setCode(e.target.value)} /></label>
            <button className="primary full" disabled={!code.trim()} onClick={() => setStep(2)}>{t("add.identify")}</button>
          </>
        )}
        {step === 2 && (
          <>
            <div className="success-hero"><ShieldCheck /><strong>{t("add.found")}</strong><small>{t("add.waitingWifi")}</small></div>
            <label className="field">
              <span>{t("add.wifi")}</span>
              <select value={wifi} onChange={e => setWifi(e.target.value)}>{MANG_WIFI.map(ten => <option key={ten}>{ten}</option>)}</select>
            </label>
            <label className="field">
              <span>{t("add.wifiPass")}</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t("add.wifiPassPh")} />
            </label>
            <button className="primary full" onClick={() => setStep(3)}>{t("add.connect")}</button>
          </>
        )}
        {step === 3 && (
          <>
            <div className="pairing"><Wifi /><span /><strong>{t("add.pairing", { wifi })}</strong><small>{t("add.pairingHint")}</small></div>
            <button className="primary full" onClick={() => setStep(4)}>{t("add.simulate")}</button>
          </>
        )}
        {step === 4 && (
          <>
            <div className="success-hero"><ShieldCheck /><strong>{t("add.online")}</strong></div>
            <label className="field"><span>{t("add.name")}</span><input value={name} onChange={e => setName(e.target.value)} /></label>
            <label className="field">
              <span>{t("add.room")}</span>
              <select value={room} onChange={e => setRoom(e.target.value)}>{data.spaces.rooms.map(item => <option key={item}>{item}</option>)}</select>
            </label>
            <button className="primary full" onClick={() => { void finish(); }}>{t("add.finish")}</button>
            {message && <p className="form-message">{message}</p>}
          </>
        )}
        {step === 5 && (
          <div className="finished">
            <ShieldCheck /><h2>{t("add.done")}</h2><p>{t("add.ready", { name })}</p>
            <button className="primary full" onClick={onClose}>{t("add.home")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
