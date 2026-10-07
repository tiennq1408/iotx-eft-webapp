"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Share2, Trash2 } from "lucide-react";
import type { AppData, ChiaSeNhan } from "@/lib/types";
import type { IotxPermission } from "@/lib/iotx/contracts";
import { IotxApiError, iotxClient, isIotxMode, moTaLoi } from "@/lib/iotx";
import { useChu, type HamChu } from "@/components/newui/chu";
import { Modal } from "./chung";

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
