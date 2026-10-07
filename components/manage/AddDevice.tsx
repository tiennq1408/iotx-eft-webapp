"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { ChevronRight, QrCode, Settings2, ShieldCheck, Wifi, X } from "lucide-react";
import type { AppData, Device } from "@/lib/types";
import { iotxClient, isIotxMode, moTaLoi } from "@/lib/iotx";
import { IconButton } from "./chung";

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/** Giá trị gieo sẵn của luồng thêm thiết bị, và chỗ rơi về khi tài khoản chưa khai gì. */
const MAC_DINH = {
  ma: "LV-SB614-2026",
  wifi: "Livotec Home 2.4G",
  ten: "Quạt mới",
  nha: "Nhà của tôi",
  phong: "Phòng khách",
  nhom: "Mặc định",
};
const MANG_WIFI = ["Livotec Home 2.4G", "Home IoT", "Viettel_2.4G"];

/** Wizard thêm thiết bị 5 bước: cách thêm → mã → Wi-Fi → ghép nối → đặt tên/phòng. */
export function AddDevice({ data, setData, onSynced, onClose }: { data: AppData; setData: Dispatch<SetStateAction<AppData>>; onSynced: () => Promise<void>; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<"qr" | "serial">("qr");
  const [code, setCode] = useState(MAC_DINH.ma);
  const [wifi, setWifi] = useState(MAC_DINH.wifi);
  const [password, setPassword] = useState("");
  const [name, setName] = useState(MAC_DINH.ten);
  const [room, setRoom] = useState(data.spaces.rooms[0] || MAC_DINH.phong);
  const [message, setMessage] = useState("");

  const nha = data.spaces.houses[0] || MAC_DINH.nha;
  const nhom = data.spaces.groups[0] || MAC_DINH.nhom;

  async function finish() {
    try {
      setMessage("");
      if (isIotxMode) {
        const claimed = method === "serial"
          ? await iotxClient.claimBoard(code.trim())
          : await iotxClient.claim(name.trim() || code.trim(), code.trim());
        await iotxClient.updateDevice(claimed.id, { label: name.trim() || MAC_DINH.ten, house: nha, room, grp: nhom });
        await onSynced();
      } else {
        const device: Device = {
          id: uid(), name: name || MAC_DINH.ten, model: code.includes("314") ? "SBI-314" : "SB-614",
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
        <IconButton label="Đóng" onClick={onClose}><X /></IconButton>
        <h2>Thêm thiết bị</h2>
        <span>{Math.min(step + 1, 5)}/5</span>
      </header>
      <div className="progress">{[0, 1, 2, 3, 4].map(value => <i key={value} className={value <= step ? "done" : ""} />)}</div>
      <div className="panel-body">
        {step === 0 && (
          <>
            <p className="eyebrow">Bạn muốn thêm thiết bị bằng cách nào?</p>
            <button className="method-card" onClick={() => { setMethod("qr"); setStep(1); }}>
              <QrCode /><span><strong>Quét mã QR</strong><small>Nhanh nhất · mã ở trên thân thiết bị</small></span><ChevronRight />
            </button>
            <button className="method-card" onClick={() => { setMethod("serial"); setStep(1); }}>
              <Settings2 /><span><strong>Nhập mã thiết bị</strong><small>Dùng serial hoặc mã ghép nối</small></span><ChevronRight />
            </button>
          </>
        )}
        {step === 1 && (
          <>
            <div className="scanner"><QrCode /><strong>{method === "qr" ? "Đặt mã QR vào khung" : "Nhập serial thiết bị"}</strong></div>
            <label className="field"><span>Mã thiết bị</span><input value={code} onChange={e => setCode(e.target.value)} /></label>
            <button className="primary full" disabled={!code.trim()} onClick={() => setStep(2)}>Nhận diện thiết bị</button>
          </>
        )}
        {step === 2 && (
          <>
            <div className="success-hero"><ShieldCheck /><strong>Đã tìm thấy quạt Livotec</strong><small>Thiết bị đang chờ cấu hình Wi-Fi</small></div>
            <label className="field">
              <span>Mạng Wi-Fi 2.4 GHz</span>
              <select value={wifi} onChange={e => setWifi(e.target.value)}>{MANG_WIFI.map(ten => <option key={ten}>{ten}</option>)}</select>
            </label>
            <label className="field">
              <span>Mật khẩu Wi-Fi</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Có thể để trống khi dùng bản mock" />
            </label>
            <button className="primary full" onClick={() => setStep(3)}>Kết nối</button>
          </>
        )}
        {step === 3 && (
          <>
            <div className="pairing"><Wifi /><span /><strong>Đang ghép nối với {wifi}</strong><small>Đảm bảo đèn Wi-Fi trên quạt đang nhấp nháy.</small></div>
            <button className="primary full" onClick={() => setStep(4)}>Mô phỏng kết nối thành công</button>
          </>
        )}
        {step === 4 && (
          <>
            <div className="success-hero"><ShieldCheck /><strong>Thiết bị đã trực tuyến</strong></div>
            <label className="field"><span>Tên thiết bị</span><input value={name} onChange={e => setName(e.target.value)} /></label>
            <label className="field">
              <span>Phòng</span>
              <select value={room} onChange={e => setRoom(e.target.value)}>{data.spaces.rooms.map(item => <option key={item}>{item}</option>)}</select>
            </label>
            <button className="primary full" onClick={() => { void finish(); }}>Hoàn tất</button>
            {message && <p className="form-message">{message}</p>}
          </>
        )}
        {step === 5 && (
          <div className="finished">
            <ShieldCheck /><h2>Đã thêm thiết bị</h2><p>{name} đã sẵn sàng điều khiển.</p>
            <button className="primary full" onClick={onClose}>Về trang chủ</button>
          </div>
        )}
      </div>
    </div>
  );
}
