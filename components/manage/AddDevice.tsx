"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Bluetooth, ChevronRight, QrCode, Settings2, ShieldCheck, X } from "lucide-react";
import type { AppData, Device } from "@/lib/types";
import { iotxClient, isIotxMode, moTaLoi } from "@/lib/iotx";
import { IconButton } from "./chung";
import { useChu } from "@/components/newui/chu";
import { QuetQR } from "./QuetQR";
import { docTem } from "@/lib/newui/qrTem";

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * Danh sách Wi-Fi MÔ PHỎNG — web không dò được mạng quanh thiết bị. Mật khẩu nhập ở bước này
 * được thu rồi bỏ, không gửi đi đâu (hợp đồng: mật khẩu Wi-Fi không rời khỏi máy người dùng).
 */
const MANG_WIFI_MO_PHONG = ["Livotec Home 2.4G", "Home IoT", "Viettel_2.4G"];

type BuocMan = 0 | 1 | 2 | 3 | 4 | 5;

/** Web Bluetooth chưa có trong lib DOM của TypeScript; chỉ khai đúng phần dùng tới. */
type ThietBiBle = { name?: string; gatt?: { connect(): Promise<unknown> } };
type NavCoBle = Navigator & {
  bluetooth?: { requestDevice(opt: { filters: Array<{ name?: string; namePrefix?: string }> }): Promise<ThietBiBle> };
};
const coWebBluetooth = () => typeof navigator !== "undefined" && Boolean((navigator as NavCoBle).bluetooth);
/**
 * Vì sao không có Web Bluetooth: Chrome/Edge chỉ mở API này trên HTTPS hoặc localhost — mở qua
 * IP LAN `http://192.168…` là nó biến mất dù trình duyệt có hỗ trợ. Hai nguyên nhân cần hai
 * câu khác nhau, không thì người dùng Chrome tưởng máy mình "là iPhone".
 */
const lyDoKhongBle = () => (typeof window !== "undefined" && !window.isSecureContext ? "add.bleCanHttps" : "add.bleKhongHoTro");

/**
 * Các bước đi qua của từng nhánh, không kể màn "xong". Nhánh serial đi tắt: mạch thật đã có
 * sẵn Wi-Fi và chứng thư nên bỏ hẳn ghép nối và Wi-Fi, chỉ còn nhận mạch rồi đặt tên.
 */
const BUOC_THEO_NHANH: Record<"qr" | "serial", BuocMan[]> = { qr: [0, 1, 2, 3, 4], serial: [0, 1, 4] };

/**
 * Wizard thêm thiết bị — cơ chế theo bản tham chiếu web.dev (đo 08/10/2026), dáng màn của local.
 *
 *   QR     : chọn → tên trên tem + mã 5 số (quét camera hoặc gõ) → ghép nối Bluetooth (thật nếu
 *            trình duyệt có Web Bluetooth, không thì mô phỏng) → Wi-Fi (mô phỏng)
 *            → đặt tên hiển thị + phòng → claim(tenTem, maSo) → updateDevice → xong
 *   serial : chọn → serial → claimBoard NGAY → đặt tên hiển thị + phòng → updateDevice → xong
 *
 * `claim` đòi `name` là TÊN IN TRÊN TEM (kiểu `fan81029`), không phải tên hiển thị người dùng
 * đặt — bản cũ gửi tên hiển thị nên nhánh QR luôn 404.
 */
export function AddDevice({ data, setData, onSynced, onClose }: { data: AppData; setData: Dispatch<SetStateAction<AppData>>; onSynced: () => Promise<void>; onClose: () => void }) {
  const { t } = useChu();
  const [step, setStep] = useState<BuocMan>(0);
  const [method, setMethod] = useState<"qr" | "serial">("qr");
  const [tenTem, setTenTem] = useState("");
  const [maSo, setMaSo] = useState("");
  const [serial, setSerial] = useState("");
  const [wifi, setWifi] = useState(MANG_WIFI_MO_PHONG[0]);
  const [password, setPassword] = useState("");
  const [name, setName] = useState(() => t("add.defaultName"));
  const [room, setRoom] = useState(() => data.spaces.rooms[0] || t("add.defaultRoom"));
  const [message, setMessage] = useState("");
  const [goiY, setGoiY] = useState("");
  const [dangLam, setDangLam] = useState(false);
  /** Nhánh serial: id mạch đã nhận ở bước 1, và mạch có đang online không (`dangNoi`). */
  const [machDaNhan, setMachDaNhan] = useState<{ id: string; dangNoi: boolean } | null>(null);
  /** Tên quảng bá BLE đọc được từ mã ① trên tem (`PROV_…`), nếu người dùng lỡ quét mã đó. */
  const [bleTen, setBleTen] = useState("");
  /** Mạch đã ghép nối qua Web Bluetooth (Chrome/Edge trên Android và máy tính). */
  const [ble, setBle] = useState<{ ten: string } | null>(null);

  const nha = data.spaces.houses[0] || t("add.defaultHouse");
  const nhom = data.spaces.groups[0] || t("add.defaultGroup");
  const maSoHopLe = /^\d{5}$/.test(maSo.trim());

  const cacBuoc = BUOC_THEO_NHANH[method];
  const viTri = Math.min(cacBuoc.indexOf(step) < 0 ? cacBuoc.length - 1 : cacBuoc.indexOf(step), cacBuoc.length - 1);

  /** Mã QR ② đọc được ở nhánh QR: điền tên tem + mã 5 số; mã ① (Wi-Fi) thì nhắc quét mã còn lại. */
  function docQrTem(text: string) {
    setMessage(""); setGoiY("");
    const d = docTem(text);
    if (d.laMaWifi) { if (d.bleTen) setBleTen(d.bleTen); setGoiY(t("add.maWifi")); return; }
    if (d.ten) setTenTem(d.ten);
    if (d.maSo) setMaSo(d.maSo);
    if (!d.ten) setGoiY(t("add.quetThieuTen"));
  }

  /** Mã QR đọc được ở nhánh serial: lấy `sn`; tem in tay thì lấy cả chuỗi. */
  function docQrSerial(text: string) {
    setMessage(""); setGoiY("");
    const d = docTem(text);
    if (d.laMaWifi) { setGoiY(t("add.maWifi")); return; }
    const sn = d.serial ?? d.ten;
    if (sn) setSerial(sn); else setGoiY(t("add.quetThieuTen"));
  }

  /**
   * Ghép nối thật qua Web Bluetooth: tìm mạch theo TÊN trên tem (và tên `PROV_…` nếu đã quét
   * mã ①). Chỉ gọi khi người dùng bấm — trình duyệt bắt buộc vậy. Bắt tay Security 2 và gửi
   * Wi-Fi qua `prov-config` chưa có đặc tả firmware, nên bước Wi-Fi sau đó vẫn là mô phỏng.
   */
  async function ghepNoiBle() {
    setMessage(""); setDangLam(true);
    try {
      const bt = (navigator as NavCoBle).bluetooth!;
      const tenTemSach = tenTem.trim();
      const filters = [
        ...(tenTemSach ? [{ name: tenTemSach }] : []),
        ...(bleTen ? [{ name: bleTen }] : []),
        { namePrefix: "PROV_" },
      ];
      const thietBi = await bt.requestDevice({ filters });
      await thietBi.gatt?.connect();
      setBle({ ten: thietBi.name || tenTemSach });
    } catch (error) {
      // Người dùng đóng hộp chọn → NotFoundError: không phải lỗi, chỉ chưa chọn.
      const ten = error instanceof Error ? error.name : "";
      setMessage(ten === "NotFoundError" ? t("add.bleHuy") : t("add.bleLoi", { loi: error instanceof Error ? error.message : String(error) }));
    } finally { setDangLam(false); }
  }

  /** Nhánh serial: nhận mạch ngay, không qua Wi-Fi hay ghép nối. Hỏng thì ở lại bước này và nói nguyên văn câu máy chủ. */
  async function nhanMach() {
    setMessage(""); setDangLam(true);
    try {
      if (isIotxMode) {
        const claimed = await iotxClient.claimBoard(serial.trim());
        setMachDaNhan({ id: claimed.id, dangNoi: claimed.dangNoi });
      } else {
        setMachDaNhan({ id: uid(), dangNoi: true });
      }
      setStep(4);
    } catch (error) {
      // 400 của /claim-mach-that mang câu tiếng Việt của máy chủ — `moTaLoi` hiện nguyên văn.
      setMessage(moTaLoi(error));
    } finally { setDangLam(false); }
  }

  async function finish() {
    setMessage(""); setDangLam(true);
    try {
      const tenHienThi = name.trim() || t("add.defaultName");
      if (isIotxMode) {
        const id = method === "serial"
          ? machDaNhan!.id
          : (await iotxClient.claim(tenTem.trim(), maSo.trim())).id;
        await iotxClient.updateDevice(id, { label: tenHienThi, house: nha, room, grp: nhom });
        await onSynced();
      } else {
        const device: Device = {
          id: machDaNhan?.id ?? uid(), name: tenHienThi, model: method === "serial" ? "SB-614" : "SBI-314",
          code: method === "serial" ? serial.trim() : tenTem.trim(),
          house: nha, room, group: nhom, online: machDaNhan?.dangNoi ?? true, on: false, speed: 3,
        };
        setData(current => ({ ...current, devices: [...current.devices, device] }));
      }
      setStep(5);
    } catch (error) {
      // `moTaLoi` giữ đúng luật 404 nhập nhằng: sai tên tem, sai mã hay thiết bị đã có chủ
      // đều chỉ được nói một câu chung. Ở lại bước này để người dùng sửa.
      setMessage(moTaLoi(error));
    } finally { setDangLam(false); }
  }

  return (
    <div className="full-panel add-flow">
      <header className="panel-head">
        <IconButton label={t("close")} onClick={onClose}><X /></IconButton>
        <h2>{t("add.title")}</h2>
        <span>{viTri + 1}/{cacBuoc.length}</span>
      </header>
      <div className="progress" style={{ gridTemplateColumns: `repeat(${cacBuoc.length}, 1fr)` }}>
        {cacBuoc.map((b, i) => <i key={b} className={i <= viTri ? "done" : ""} />)}
      </div>
      <div className="panel-body">
        {step === 0 && (
          <>
            <p className="eyebrow">{t("add.how")}</p>
            <button className="method-card" onClick={() => { setMethod("qr"); setMessage(""); setGoiY(""); setStep(1); }}>
              <QrCode /><span><strong>{t("add.qr")}</strong><small>{t("add.qrHint")}</small></span><ChevronRight />
            </button>
            <button className="method-card" onClick={() => { setMethod("serial"); setMessage(""); setGoiY(""); setStep(1); }}>
              <Settings2 /><span><strong>{t("add.serial")}</strong><small>{t("add.serialHint")}</small></span><ChevronRight />
            </button>
          </>
        )}

        {step === 1 && method === "qr" && (
          <>
            <QuetQR tieuDe={t("add.scanQr")} onDoc={docQrTem} />
            {goiY && <p className="hint" role="status">{goiY}</p>}
            <label className="field"><span>{t("add.tenTem")}</span>
              <input value={tenTem} placeholder={t("add.tenTemPh")} autoComplete="off" onChange={e => setTenTem(e.target.value)} />
            </label>
            <label className="field"><span>{t("add.maSo")}</span>
              <input value={maSo} placeholder={t("add.maSoPh")} inputMode="numeric" maxLength={5} autoComplete="off" onChange={e => setMaSo(e.target.value)} />
            </label>
            <button className="primary full" disabled={!tenTem.trim() || !maSoHopLe} onClick={() => setStep(2)}>{t("add.identify")}</button>
            {message && <p className="form-message">{message}</p>}
          </>
        )}

        {step === 1 && method === "serial" && (
          <>
            <QuetQR tieuDe={t("add.enterSerial")} onDoc={docQrSerial} />
            {goiY && <p className="hint" role="status">{goiY}</p>}
            <label className="field"><span>{t("add.code")}</span>
              <input value={serial} placeholder="40A00008909" autoComplete="off" onChange={e => setSerial(e.target.value)} />
            </label>
            <p className="hint">{t("add.machPhaiOnline")}</p>
            <button className="primary full" disabled={dangLam || !serial.trim()} onClick={() => { void nhanMach(); }}>{t("add.identify")}</button>
            {message && <p className="form-message">{message}</p>}
          </>
        )}

        {step === 2 && (
          <>
            <div className="pairing">
              <Bluetooth /><span />
              <strong>{ble ? t("add.daGhepNoi", { ten: ble.ten }) : t("add.pairing", { wifi: tenTem.trim() })}</strong>
              <small>{ble ? t("add.wifiMoPhongSauBle") : coWebBluetooth() ? t("add.bleChon", { ten: tenTem.trim() }) : t(lyDoKhongBle())}</small>
            </div>
            {ble ? (
              <button className="primary full" onClick={() => setStep(3)}>{t("add.tiepTuc")}</button>
            ) : coWebBluetooth() ? (
              <>
                <button className="primary full" disabled={dangLam} onClick={() => { void ghepNoiBle(); }}>{t("add.timBle")}</button>
                <button className="secondary full" onClick={() => setStep(3)}>{t("add.boQuaBle")}</button>
              </>
            ) : (
              <button className="primary full" onClick={() => setStep(3)}>{t("add.simulate")}</button>
            )}
            {message && <p className="form-message">{message}</p>}
          </>
        )}

        {step === 3 && (
          <>
            <div className="success-hero"><ShieldCheck /><strong>{t("add.found")}</strong><small>{t("add.waitingWifi")}</small></div>
            <p className="hint">{ble ? t("add.wifiMoPhongSauBle") : t("add.moPhong")}</p>
            <label className="field">
              <span>{t("add.wifi")}</span>
              <select value={wifi} onChange={e => setWifi(e.target.value)}>{MANG_WIFI_MO_PHONG.map(ten => <option key={ten}>{ten}</option>)}</select>
            </label>
            <label className="field">
              <span>{t("add.wifiPass")}</span>
              <input type="password" value={password} autoComplete="off" onChange={e => setPassword(e.target.value)} placeholder={t("add.wifiPassPh")} />
            </label>
            <button className="primary full" onClick={() => setStep(4)}>{t("add.connect")}</button>
          </>
        )}

        {step === 4 && (
          <>
            <div className="success-hero"><ShieldCheck /><strong>{t("add.online")}</strong></div>
            {machDaNhan && !machDaNhan.dangNoi && <p className="hint">{t("add.chuaOnline")}</p>}
            <label className="field"><span>{t("add.name")}</span><input value={name} onChange={e => setName(e.target.value)} /></label>
            <label className="field">
              <span>{t("add.room")}</span>
              <select value={room} onChange={e => setRoom(e.target.value)}>{data.spaces.rooms.map(item => <option key={item}>{item}</option>)}</select>
            </label>
            <button className="primary full" disabled={dangLam} onClick={() => { void finish(); }}>{t("add.finish")}</button>
            {message && <p className="form-message">{message}</p>}
          </>
        )}

        {step === 5 && (
          <div className="finished">
            <ShieldCheck /><h2>{t("add.done")}</h2><p>{t("add.ready", { name: name.trim() || t("add.defaultName") })}</p>
            {machDaNhan && !machDaNhan.dangNoi && <p className="hint">{t("add.chuaOnline")}</p>}
            <button className="primary full" onClick={onClose}>{t("add.home")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
