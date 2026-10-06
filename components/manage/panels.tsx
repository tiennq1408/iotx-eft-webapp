"use client";

/**
 * Các màn đã dựng trước khi đổi giao diện: Quản lý Nhà/Phòng/Nhóm, Thành viên & chia sẻ,
 * wizard Thêm thiết bị 5 bước.
 *
 * Prototype giao diện mới không vẽ những màn này, nhưng chúng đã nối API thật
 * (`/categories`, `/shares`, `/claim`, `/claim-mach-that`) nên được giữ lại nguyên vẹn và
 * mở từ menu. Phần hình thức đi theo bảng màu mới qua `app/globals.css`.
 *
 * Hai màn "Hẹn giờ" và "Kịch bản theo thời gian" cũ đã bị gỡ khỏi đây: chúng chỉ ghi
 * `localStorage`, trong khi hợp đồng có hẳn `/devices/{id}/hen-gio/*`. Bản thật nằm ở
 * `components/newui/device/HenGioPanel.tsx`.
 */

import { useMemo, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import { ChevronRight, Plus, QrCode, Settings2, Share2, ShieldCheck, Trash2, Wifi, X } from "lucide-react";
import type { AppData } from "@/lib/storage";
import type { Device } from "@/lib/types";
import type { IotxPermission, IotxShare } from "@/lib/iotx/contracts";
import { IotxApiError, iotxClient, isIotxMode, moTaLoi } from "@/lib/iotx";

import { useChu, type HamChu } from "@/components/newui/chu";

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export type ChiaSeNhan = {
  id: string;
  email: string;
  house: string;
  scope: string;
  scopeRef: string;
  perms?: IotxPermission;
  /** Chỉ có ở chia sẻ mình cấp: người nhận chưa đăng ký nên lời mời còn treo. */
  choDangKy?: boolean;
};

/** Nhánh "receivedFromOthers" dùng camelCase và ownerEmail là NGƯỜI CHIA SẺ cho tôi. */
export function mapShareNhanDuoc(item: IotxShare): ChiaSeNhan {
  return {
    id: String(item.id),
    email: item.ownerEmail || item.email || item.member_email || "",
    house: item.house || "",
    scope: item.scope || "house",
    scopeRef: item.scopeRef || item.scope_ref || "",
    perms: item.perms,
  };
}

/** Nhánh "granted" dùng snake_case; member_sub rỗng nghĩa là người nhận chưa đăng nhập bao giờ. */
export function mapShareDaCap(item: IotxShare): ChiaSeNhan {
  return {
    id: String(item.id),
    email: item.member_email || item.email || item.ownerEmail || "",
    house: item.house || "",
    scope: item.scope || "house",
    scopeRef: item.scope_ref || item.scopeRef || "",
    perms: item.perms,
    choDangKy: !item.member_sub,
  };
}

/** Quyền vắng trường nào coi như true (hợp đồng), nên đọc từ rộng xuống hẹp. */
function moTaQuyen(perms: IotxPermission | undefined, t: HamChu) {
  if (perms?.control === false) return t("share.viewOnly");
  if (perms?.create === false) return t("share.controlOnly");
  if (perms?.delete === false) return t("share.noDelete");
  return t("share.fullAccess");
}

/**
 * 404 not_found ở màn chia sẻ cố tình nhập nhằng (email lạ / nhà không phải của mình /
 * thiết bị không thuộc nhà đó), nên chỉ nói đúng một câu chung.
 */
function laLoiChiaSe(error: unknown) {
  return error instanceof IotxApiError && error.status === 404;
}

function moTaPhamVi(item: ChiaSeNhan, t: HamChu) {
  if (item.scope === "room") return t("share.oneRoom", { name: item.scopeRef });
  if (item.scope === "device") return t("share.oneDevice");
  return t("share.wholeHouse", { name: item.house });
}
function IconButton({ label, children, onClick, className }: { label: string; children: ReactNode; onClick: () => void; className?: string }) {
  return <button className={cn("icon-button", className)} aria-label={label} onClick={onClick}>{children}</button>;
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}>
    <button className="modal-scrim" aria-label="Đóng" onClick={onClose} />
    <section className={cn("modal-card", wide && "modal-wide")}>
      <header className="modal-head"><h2>{title}</h2><IconButton label="Đóng" onClick={onClose}><X /></IconButton></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>;
}
export function Spaces({ data, setData, onClose }: { data: AppData; setData: Dispatch<SetStateAction<AppData>>; onClose: () => void }) {
  const [kind, setKind] = useState<keyof AppData["spaces"]>("houses");
  const [name, setName] = useState("");
  const labels = { houses: "Nhà", rooms: "Phòng", groups: "Nhóm" };
  const apiKind = { houses: "house", rooms: "room", groups: "grp" } as const;
  async function add() { const value = name.trim(); if (!value || data.spaces[kind].includes(value)) return; if (isIotxMode) await iotxClient.createCategory({ kind: apiKind[kind], name: value }); setData(current => ({ ...current, spaces: { ...current.spaces, [kind]: [...current.spaces[kind], value] } })); setName(""); }
  async function remove(item: string) { if (isIotxMode) await iotxClient.deleteCategory(apiKind[kind], item); setData(current => ({ ...current, spaces: { ...current.spaces, [kind]: current.spaces[kind].filter(value => value !== item) } })); }
  return <Modal title="Quản lý không gian" onClose={onClose} wide><div className="segment three">{(Object.keys(labels) as Array<keyof typeof labels>).map(key => <button key={key} className={kind === key ? "active" : ""} onClick={() => setKind(key)}>{labels[key]}</button>)}</div><div className="space-list">{data.spaces[kind].map(item => <div className="space-row" key={item}><span className="space-icon">{kind === "houses" ? "🏠" : kind === "rooms" ? "🚪" : "◉"}</span><strong>{item}</strong><button aria-label="Xóa" onClick={() => { void remove(item); }}><Trash2 /></button></div>)}</div><div className="inline-form"><input value={name} onChange={e => setName(e.target.value)} placeholder={`Tên ${labels[kind].toLowerCase()} mới`} /><button onClick={() => { void add(); }}><Plus /> Tạo</button></div><p className="hint">Không gian được đồng bộ với tài khoản Livotec của bạn.</p></Modal>;
}
type PhamVi = "house" | "room" | "device";

export function Members({ data, daCap, nhanDuoc, onReload, onClose }: { data: AppData; daCap: ChiaSeNhan[]; nhanDuoc: ChiaSeNhan[]; onReload: () => Promise<void>; onClose: () => void }) {
  const { t } = useChu();
  const nhaMacDinh = data.spaces.houses[0] || "";
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState<PhamVi>("house");
  const [house, setHouse] = useState(nhaMacDinh);
  const [room, setRoom] = useState(data.spaces.rooms[0] || "");
  const [deviceId, setDeviceId] = useState(data.devices[0]?.id || "");
  const [khongChoXoa, setKhongChoXoa] = useState(false);
  const [moNangCao, setMoNangCao] = useState(false);
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState("");
  const [bao, setBao] = useState("");
  const [hoiGo, setHoiGo] = useState("");

  // Chỉ liệt kê phòng thật sự có thiết bị trong nhà đang chọn; danh mục phòng dùng chung
  // cho mọi nhà nên đưa hết ra là mời vào phòng không tồn tại ở nhà đó.
  const phongCuaNha = useMemo(() => {
    const co = new Set(data.devices.filter(device => device.house === house).map(device => device.room).filter(Boolean));
    return data.spaces.rooms.filter(ten => co.has(ten));
  }, [data.devices, data.spaces.rooms, house]);
  const thietBiCuaNha = useMemo(() => data.devices.filter(device => device.house === house), [data.devices, house]);
  // Đổi nhà thì phòng/thiết bị đang chọn có thể không còn thuộc nhà đó nữa — rơi về lựa chọn đầu.
  const phongChon = phongCuaNha.includes(room) ? room : (phongCuaNha[0] || "");
  const thietBiChon = thietBiCuaNha.some(device => device.id === deviceId) ? deviceId : (thietBiCuaNha[0]?.id || "");

  async function share(event: FormEvent) {
    event.preventDefault();
    setLoi(""); setBao("");
    if (!email.trim() || !house) return setLoi(t("share.needEmailHouse"));
    const scopeRef = scope === "room" ? phongChon : scope === "device" ? thietBiChon : undefined;
    if (scope !== "house" && !scopeRef) return setLoi(t("share.needEmailHouse"));
    // Hợp đồng: vắng trường nào coi như true. Chỉ gửi trường thật sự muốn siết.
    const perms = khongChoXoa ? { delete: false } : undefined;
    setDangGui(true);
    try {
      if (isIotxMode) {
        const ketQua = await iotxClient.createShare({ email: email.trim(), house, scope, scopeRef, perms });
        setBao(ketQua.pending ? t("share.invited") : t("share.shared"));
        await onReload();
      } else {
        setBao(t("share.shared"));
      }
      setEmail("");
    } catch (error) {
      setLoi(laLoiChiaSe(error) ? t("share.inviteFailed") : moTaLoi(error));
    } finally { setDangGui(false); }
  }

  async function doiQuyen(item: ChiaSeNhan, choXoa: boolean) {
    setLoi(""); setBao("");
    try {
      if (isIotxMode) await iotxClient.suaQuyenChiaSe(item.id, { delete: choXoa });
      setBao(t("share.permsUpdated"));
      await onReload();
    } catch (error) { setLoi(moTaLoi(error)); }
  }

  async function revoke(id: string) {
    setLoi(""); setBao(""); setHoiGo("");
    try {
      if (isIotxMode) await iotxClient.deleteShare(id);
      setBao(t("share.revoked"));
      await onReload();
    } catch (error) { setLoi(moTaLoi(error)); }
  }

  return <Modal title={t("share.title")} onClose={onClose} wide>
    <section className="soft-card">
      <h3>{t("share.invite")}</h3>
      {/* Chỉ chủ nhà mới chia sẻ được. Tài khoản chưa có nhà nào thì ô "Chọn nhà" rỗng —
          để trống mà không nói gì thì trông y như app hỏng. */}
      {data.spaces.houses.length === 0
        ? <p className="hint">{t("share.noHouse")}</p>
        : <form className="stack" onSubmit={event => { void share(event); }}>
        <input type="email" required placeholder={t("share.emailPh")} value={email} onChange={e => setEmail(e.target.value)} />
        <div className="segment pham-vi">
          <button type="button" className={scope === "house" ? "active" : ""} onClick={() => setScope("house")}>{t("share.scopeHouse")}</button>
          <button type="button" className={scope === "room" ? "active" : ""} onClick={() => setScope("room")}>{t("share.scopeRoom")}</button>
          <button type="button" className={scope === "device" ? "active" : ""} onClick={() => setScope("device")}>{t("share.scopeDevice")}</button>
        </div>
        <label className="o-chon"><span>{t("share.pickHouse")}</span><select value={house} onChange={e => setHouse(e.target.value)}>{data.spaces.houses.map(ten => <option key={ten} value={ten}>{ten}</option>)}</select></label>
        {scope === "room" && <label className="o-chon"><span>{t("share.pickRoom")}</span><select value={phongChon} onChange={e => setRoom(e.target.value)}>{phongCuaNha.map(ten => <option key={ten} value={ten}>{ten}</option>)}</select></label>}
        {scope === "device" && <label className="o-chon"><span>{t("share.scopeDevice")}</span><select value={thietBiChon} onChange={e => setDeviceId(e.target.value)}>{thietBiCuaNha.map(device => <option key={device.id} value={device.id}>{device.name}{device.room ? ` · ${device.room}` : ""}</option>)}</select></label>}
        <p className="hint">{t("share.defaultHint")}</p>
        <button type="button" className="text-button" onClick={() => setMoNangCao(!moNangCao)}>{t("share.advanced")}</button>
        {moNangCao && <label className="o-tick"><input type="checkbox" checked={khongChoXoa} onChange={e => setKhongChoXoa(e.target.checked)} /><span>{t("share.blockDelete")}</span></label>}
        <button className="primary" disabled={dangGui}><Share2 /> {dangGui ? t("common.working") : t("share.doShare")}</button>
        {loi && <p className="form-message">{loi}</p>}
        {bao && !loi && <p className="hint">{bao}</p>}
      </form>}
    </section>

    <h3>{t("share.sharedWith")}</h3>
    <div className="space-list">
      {daCap.length === 0 && <p className="hint">{t("share.noneShared")}</p>}
      {daCap.map(item => <div className="member-row" key={item.id}>
        <span className="member-avatar">{item.email[0]?.toUpperCase() || "?"}</span>
        <div>
          <strong>{item.email}{item.choDangKy && <em className="tag-cho"> {t("share.pending")}</em>}</strong>
          <small>{moTaPhamVi(item, t)} · {moTaQuyen(item.perms, t)}</small>
          <label className="o-tick nho"><input type="checkbox" checked={item.perms?.delete === false} onChange={e => { void doiQuyen(item, !e.target.checked); }} /><span>{t("share.blockDelete")}</span></label>
        </div>
        {hoiGo === item.id
          ? <button className="go-that" onClick={() => { void revoke(item.id); }}>{t("share.revokeConfirm")}</button>
          : <button aria-label={t("share.revoke")} onClick={() => setHoiGo(item.id)}><Trash2 /></button>}
      </div>)}
    </div>

    <h3>{t("share.sharedToMe")}</h3>
    <div className="space-list">
      {nhanDuoc.length === 0 && <p className="hint">{t("share.noneToMe")}</p>}
      {nhanDuoc.map(item => <div className="member-row" key={item.id}>
        <span className="member-avatar">{item.email[0]?.toUpperCase() || "?"}</span>
        <div><strong>{item.email}</strong><small>{moTaPhamVi(item, t)} · {moTaQuyen(item.perms, t)}</small></div>
      </div>)}
    </div>
  </Modal>;
}
export function AddDevice({ data, setData, onSynced, onClose }: { data: AppData; setData: Dispatch<SetStateAction<AppData>>; onSynced: () => Promise<void>; onClose: () => void }) {
  const [step, setStep] = useState(0); const [method, setMethod] = useState<"qr" | "serial">("qr"); const [code, setCode] = useState("LV-SB614-2026"); const [wifi, setWifi] = useState("Livotec Home 2.4G"); const [password, setPassword] = useState(""); const [name, setName] = useState("Quạt mới"); const [room, setRoom] = useState(data.spaces.rooms[0] || "Phòng khách");
  const [message, setMessage] = useState("");
  async function finish() { try { setMessage(""); if (isIotxMode) { const claimed = method === "serial" ? await iotxClient.claimBoard(code.trim()) : await iotxClient.claim(name.trim() || code.trim(), code.trim()); await iotxClient.updateDevice(claimed.id, { label: name.trim() || "Quạt mới", house: data.spaces.houses[0] || "Nhà của tôi", room, grp: data.spaces.groups[0] || "Mặc định" }); await onSynced(); } else { const device: Device = { id: uid(), name: name || "Quạt mới", model: code.includes("314") ? "SBI-314" : "SB-614", house: data.spaces.houses[0] || "Nhà của tôi", room, group: data.spaces.groups[0] || "Mặc định", online: true, on: false, speed: 3 }; setData(current => ({ ...current, devices: [...current.devices, device] })); } setStep(5); } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể thêm thiết bị."); } }
  return <div className="full-panel add-flow"><header className="panel-head"><IconButton label="Đóng" onClick={onClose}><X /></IconButton><h2>Thêm thiết bị</h2><span>{Math.min(step + 1, 5)}/5</span></header><div className="progress">{[0,1,2,3,4].map(value => <i key={value} className={value <= step ? "done" : ""} />)}</div><div className="panel-body">
    {step === 0 && <><p className="eyebrow">Bạn muốn thêm thiết bị bằng cách nào?</p><button className="method-card" onClick={() => { setMethod("qr"); setStep(1); }}><QrCode /><span><strong>Quét mã QR</strong><small>Nhanh nhất · mã ở trên thân thiết bị</small></span><ChevronRight /></button><button className="method-card" onClick={() => { setMethod("serial"); setStep(1); }}><Settings2 /><span><strong>Nhập mã thiết bị</strong><small>Dùng serial hoặc mã ghép nối</small></span><ChevronRight /></button></>}
    {step === 1 && <><div className="scanner"><QrCode /><strong>{method === "qr" ? "Đặt mã QR vào khung" : "Nhập serial thiết bị"}</strong></div><label className="field"><span>Mã thiết bị</span><input value={code} onChange={e => setCode(e.target.value)} /></label><button className="primary full" disabled={!code.trim()} onClick={() => setStep(2)}>Nhận diện thiết bị</button></>}
    {step === 2 && <><div className="success-hero"><ShieldCheck /><strong>Đã tìm thấy quạt Livotec</strong><small>Thiết bị đang chờ cấu hình Wi-Fi</small></div><label className="field"><span>Mạng Wi-Fi 2.4 GHz</span><select value={wifi} onChange={e => setWifi(e.target.value)}><option>Livotec Home 2.4G</option><option>Home IoT</option><option>Viettel_2.4G</option></select></label><label className="field"><span>Mật khẩu Wi-Fi</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Có thể để trống khi dùng bản mock" /></label><button className="primary full" onClick={() => setStep(3)}>Kết nối</button></>}
    {step === 3 && <><div className="pairing"><Wifi /><span /><strong>Đang ghép nối với {wifi}</strong><small>Đảm bảo đèn Wi-Fi trên quạt đang nhấp nháy.</small></div><button className="primary full" onClick={() => setStep(4)}>Mô phỏng kết nối thành công</button></>}
    {step === 4 && <><div className="success-hero"><ShieldCheck /><strong>Thiết bị đã trực tuyến</strong></div><label className="field"><span>Tên thiết bị</span><input value={name} onChange={e => setName(e.target.value)} /></label><label className="field"><span>Phòng</span><select value={room} onChange={e => setRoom(e.target.value)}>{data.spaces.rooms.map(item => <option key={item}>{item}</option>)}</select></label><button className="primary full" onClick={() => { void finish(); }}>Hoàn tất</button>{message && <p className="form-message">{message}</p>}</>}
    {step === 5 && <div className="finished"><ShieldCheck /><h2>Đã thêm thiết bị</h2><p>{name} đã sẵn sàng điều khiển.</p><button className="primary full" onClick={onClose}>Về trang chủ</button></div>}
  </div></div>;
}

