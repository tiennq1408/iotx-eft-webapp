"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react";
import type { Device } from "@/lib/types";
import type { IotxCapability, IotxMoPhong, IotxRuleAction, IotxRuleCondition, IotxRuleInput } from "@/lib/iotx/contracts";
import { iotxClient, moTaLoi } from "@/lib/iotx";
import { useChu, type HamChu } from "@/components/newui/chu";
import { nhanCap } from "@/lib/newui/nhanCap";

/** Trần cứng của hợp đồng. Chặn ngay trên client để người dùng biết sớm, server vẫn kiểm lại. */
const TRAN = { conds: 10, gates: 5, exclusions: 5, actions: 20 };

const KHOA_NGAY = ["dow.sun", "dow.mon", "dow.tue", "dow.wed", "dow.thu", "dow.fri", "dow.sat"];
const MAC_DINH_NGAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

type NhomDieuKien = "conds" | "gates" | "exclusions";
type Dong = IotxRuleCondition & { _thoiGian?: boolean };

function capabilitiesDieuKien(device?: Device) {
  return (device?.product?.capabilities ?? []).filter(c => c.kind !== "list");
}
function capabilitiesHanhDong(device?: Device) {
  return (device?.product?.capabilities ?? []).filter(c => Boolean(c.rpc));
}

/** Kiểu giá trị phải khớp capability, nếu không máy chủ từ chối lệnh. */
function doiGiaTri(capability: IotxCapability | undefined, raw: string): unknown {
  if (!capability) return raw;
  if (capability.kind === "onoff") return raw === "true";
  if (capability.kind === "level" || capability.kind === "sensor") return Number(raw);
  return raw;
}

function toanTuChoPhep(capability?: IotxCapability) {
  // So sánh lớn/nhỏ chỉ có nghĩa với số; bật/tắt và danh sách chỉ bằng hoặc khác.
  if (!capability || capability.kind === "onoff" || capability.kind === "enum") return ["eq", "neq"];
  return ["gt", "lt", "eq", "neq"];
}

export default function IfThenEditor({ devices, onClose, onSaved }: {
  devices: Device[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useChu();
  const [name, setName] = useState("");
  const [conds, setConds] = useState<Dong[]>([{ deviceId: "", key: "", op: "gt", value: "" }]);
  const [gates, setGates] = useState<Dong[]>([]);
  const [exclusions, setExclusions] = useState<Dong[]>([]);
  const [actions, setActions] = useState<IotxRuleAction[]>([{ deviceId: "", method: "", params: {} }]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [holdSec, setHoldSec] = useState(0);
  const [yieldSec, setYieldSec] = useState(300);
  const [moPhong, setMoPhong] = useState<IotxMoPhong | null>(null);
  const [loi, setLoi] = useState("");
  const [dangLam, setDangLam] = useState(false);

  const theoId = useMemo(() => new Map(devices.map(d => [d.id, d])), [devices]);

  /** Máy chủ trả về key thô trong kết quả mô phỏng; đổi sang nhãn người dùng đọc được. */
  const nhanChiSo = (deviceId?: string, key?: string) => {
    const capability = capabilitiesDieuKien(theoId.get(deviceId || "")).find(c => c.key === key);
    return capability ? nhanCap(capability, t) : (key || "");
  };
  const nhomState: Record<NhomDieuKien, [Dong[], React.Dispatch<React.SetStateAction<Dong[]>>]> = {
    conds: [conds, setConds], gates: [gates, setGates], exclusions: [exclusions, setExclusions],
  };

  function suaDong(nhom: NhomDieuKien, i: number, patch: Partial<Dong>) {
    const [, set] = nhomState[nhom];
    set(cu => cu.map((dong, vt) => vt === i ? { ...dong, ...patch } : dong));
    setMoPhong(null);
  }
  function xoaDong(nhom: NhomDieuKien, i: number) {
    nhomState[nhom][1](cu => cu.filter((_, vt) => vt !== i));
    setMoPhong(null);
  }
  function themDong(nhom: NhomDieuKien, thoiGian = false) {
    nhomState[nhom][1](cu => cu.length >= TRAN[nhom] ? cu
      : [...cu, thoiGian ? { type: "time", from: "22:00", to: "06:00", days: [], _thoiGian: true } : { deviceId: "", key: "", op: "gt", value: "", conn: "and" }]);
    setMoPhong(null);
  }

  function dungGiaTri(dong: Dong) {
    const capability = capabilitiesDieuKien(theoId.get(dong.deviceId || "")).find(c => c.key === dong.key);
    return { capability, chuoi: dong.value === undefined || dong.value === null ? "" : String(dong.value) };
  }

  function chuyenDoiDieuKien(ds: Dong[]): IotxRuleCondition[] {
    return ds.map(dong => {
      if (dong.type === "time") return { type: "time", from: dong.from, to: dong.to, days: dong.days, conn: dong.conn };
      const { capability, chuoi } = dungGiaTri(dong);
      return { type: "device", deviceId: dong.deviceId, key: dong.key, op: dong.op, value: doiGiaTri(capability, chuoi), conn: dong.conn };
    });
  }

  const hopLe = name.trim().length > 0
    && conds.length > 0
    && conds.every(c => c.type === "time" || (c.deviceId && c.key))
    && actions.every(a => a.notify !== undefined || (a.deviceId && a.method));

  async function xemTruoc() {
    setLoi(""); setDangLam(true);
    try {
      setMoPhong(await iotxClient.moPhongLuat({
        conds: chuyenDoiDieuKien(conds), gates: chuyenDoiDieuKien(gates), exclusions: chuyenDoiDieuKien(exclusions),
      }));
    } catch (error) { setLoi(`${t("routine.previewFailed")}: ${moTaLoi(error)}`); }
    finally { setDangLam(false); }
  }

  async function luu() {
    setLoi(""); setDangLam(true);
    const than: IotxRuleInput = {
      name: name.trim(), kind: "cond",
      conds: chuyenDoiDieuKien(conds),
      gates: chuyenDoiDieuKien(gates),
      exclusions: chuyenDoiDieuKien(exclusions),
      actions,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      holdSec, yieldSec,
      shadow: true, // hợp đồng: luật mới luôn bắt đầu ở chế độ chạy thử
    };
    try { await iotxClient.createRule(than); await onSaved(); onClose(); }
    catch (error) { setLoi(moTaLoi(error)); }
    finally { setDangLam(false); }
  }

  const veDong = (nhom: NhomDieuKien, dong: Dong, i: number) => {
    const device = theoId.get(dong.deviceId || "");
    const dsCap = capabilitiesDieuKien(device);
    const capability = dsCap.find(c => c.key === dong.key);
    return <div className="rule-row" key={`${nhom}-${i}`}>
      <div className="rule-row-head">
        <span>{t("routine.condN", { n: i + 1 })}</span>
        {i > 0 && <select aria-label={t("routine.and")} value={dong.conn || "and"} onChange={e => suaDong(nhom, i, { conn: e.target.value as "and" | "or" })}>
          <option value="and">{t("routine.and")}</option>
          <option value="or">{t("routine.or")}</option>
        </select>}
        <button aria-label={t("common.delete")} onClick={() => xoaDong(nhom, i)}><Trash2 /></button>
      </div>
      {dong.type === "time" ? <>
        <div className="rule-grid two">
          <label><span>{t("routine.timeWindow")}</span><input type="time" value={dong.from || ""} onChange={e => suaDong(nhom, i, { from: e.target.value })} /></label>
          <label><span>{t("common.to")}</span><input type="time" value={dong.to || ""} onChange={e => suaDong(nhom, i, { to: e.target.value })} /></label>
        </div>
        <div className="weekday-row">{MAC_DINH_NGAY.map((mac, thu) => {
          const dangChon = (dong.days || []).includes(thu);
          return <button key={thu} className={dangChon ? "active" : ""} onClick={() => suaDong(nhom, i, {
            days: dangChon ? (dong.days || []).filter(x => x !== thu) : [...(dong.days || []), thu],
          })}>{t(KHOA_NGAY[thu])}</button>;
        })}</div>
        <p className="hint">{t("routine.noDays")}</p>
      </> : <div className="rule-grid four">
        <select aria-label={t("routine.pickDevice")} value={dong.deviceId || ""} onChange={e => suaDong(nhom, i, { deviceId: e.target.value, key: "", value: "" })}>
          <option value="" disabled>{t("routine.pickDevice")}</option>
          {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select aria-label={t("routine.pickCap")} value={dong.key || ""} onChange={e => suaDong(nhom, i, { key: e.target.value, value: "" })}>
          <option value="" disabled>{t("routine.pickCap")}</option>
          {dsCap.map(c => <option key={c.key} value={c.key}>{nhanCap(c, t)}</option>)}
        </select>
        <select aria-label="toán tử" value={dong.op || "eq"} onChange={e => suaDong(nhom, i, { op: e.target.value as IotxRuleCondition["op"] })}>
          {toanTuChoPhep(capability).map(op => <option key={op} value={op}>{t(`op.${op}`)}</option>)}
        </select>
        {veGiaTri(capability, String(dong.value ?? ""), giaTri => suaDong(nhom, i, { value: giaTri }), t)}
      </div>}
    </div>;
  };

  const veKhoi = (nhom: NhomDieuKien, tieuDe: string, goiY: string, choThoiGian: boolean) => {
    const [ds] = nhomState[nhom];
    return <section className={`rule-section${nhom === "conds" ? "" : " optional"}`}>
      <h3>{tieuDe}</h3>
      <p>{goiY}</p>
      {ds.map((dong, i) => veDong(nhom, dong, i))}
      <div className="rule-add">
        <button className="secondary" disabled={ds.length >= TRAN[nhom]} onClick={() => themDong(nhom)}><Plus /> {t("common.add")} ({ds.length}/{TRAN[nhom]})</button>
        {choThoiGian && <button className="secondary" disabled={ds.length >= TRAN[nhom]} onClick={() => themDong(nhom, true)}><Plus /> {t("routine.timeWindow")}</button>}
      </div>
    </section>;
  };

  return <div className="full-panel editor-panel">
    <header className="panel-head">
      <button className="icon-button" aria-label={t("common.back")} onClick={onClose}><ArrowLeft /></button>
      <h2>{t("routine.condTitle")}</h2><span />
    </header>
    <div className="panel-body stack">
      <label className="field"><span>{t("routine.title")}</span>
        <input value={name} maxLength={60} placeholder={t("routine.namePhCond")} onChange={e => setName(e.target.value)} /></label>

      {veKhoi("conds", t("routine.if"), t("routine.allConds"), false)}
      {veKhoi("gates", t("routine.onlyOpt"), t("routine.onlyHint"), true)}
      {veKhoi("exclusions", t("routine.exceptOpt"), t("routine.exceptHint"), true)}

      <section className="rule-section">
        <h3>{t("routine.thenMax")}</h3>
        <p>{t("routine.doWhat")}</p>
        {actions.map((hanhDong, i) => {
          const device = theoId.get(hanhDong.deviceId || "");
          const dsCap = capabilitiesHanhDong(device);
          const capability = dsCap.find(c => c.rpc === hanhDong.method);
          const laThongBao = hanhDong.notify !== undefined;
          const sua = (patch: Partial<IotxRuleAction>) => setActions(cu => cu.map((a, vt) => vt === i ? { ...a, ...patch } : a));
          return <div className="rule-row" key={i}>
            <div className="rule-row-head">
              <span>{t("routine.actionN", { n: i + 1 })}</span>
              <select aria-label="kiểu hành động" value={laThongBao ? "notify" : "device"} onChange={e => setActions(cu => cu.map((a, vt) => vt === i
                ? (e.target.value === "notify" ? { notify: t("routine.notifyDefault") } : { deviceId: "", method: "", params: {} })
                : a))}>
                <option value="device">{t("common.device")}</option>
                <option value="notify">{t("routine.sendNotify")}</option>
              </select>
              <button aria-label={t("common.delete")} onClick={() => setActions(cu => cu.filter((_, vt) => vt !== i))}><Trash2 /></button>
            </div>
            {laThongBao
              ? <input value={hanhDong.notify || ""} placeholder={t("routine.notifyText")} onChange={e => sua({ notify: e.target.value })} />
              : <div className="rule-grid four">
                  <select aria-label={t("routine.pickDevice")} value={hanhDong.deviceId || ""} onChange={e => sua({ deviceId: e.target.value, method: "", params: {} })}>
                    <option value="" disabled>{t("routine.pickDevice")}</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <select aria-label={t("routine.pickCap")} value={hanhDong.method || ""} onChange={e => {
                    const cap = dsCap.find(c => c.rpc === e.target.value);
                    sua({ method: e.target.value, params: cap ? { [cap.key]: doiGiaTri(cap, cap.kind === "enum" ? (cap.values?.[0] ?? "") : cap.kind === "onoff" ? "true" : String(cap.min ?? 0)) } : {} });
                  }}>
                    <option value="" disabled>{t("routine.pickCap")}</option>
                    {dsCap.map(c => <option key={c.key} value={c.rpc}>{nhanCap(c, t)}</option>)}
                  </select>
                  {veGiaTri(capability, capability ? String((hanhDong.params ?? {})[capability.key] ?? "") : "", giaTri => {
                    if (capability) sua({ params: { [capability.key]: doiGiaTri(capability, giaTri) } });
                  }, t)}
                  <label className="cho-sau"><span>{t("routine.waitSeconds")}</span>
                    <input type="number" min={0} value={hanhDong.delaySec ?? 0} onChange={e => sua({ delaySec: Number(e.target.value) })} /></label>
                </div>}
          </div>;
        })}
        <div className="rule-add">
          <button className="secondary" disabled={actions.length >= TRAN.actions} onClick={() => setActions(cu => [...cu, { deviceId: "", method: "", params: {} }])}>
            <Plus /> {t("common.add")} ({actions.length}/{TRAN.actions})</button>
        </div>
      </section>

      <section className="rule-section">
        <h3>{t("routine.validityFull")}</h3>
        <div className="rule-grid two">
          <input type="datetime-local" aria-label="bắt đầu" value={startsAt} onChange={e => setStartsAt(e.target.value)} />
          <input type="datetime-local" aria-label="kết thúc" value={endsAt} onChange={e => setEndsAt(e.target.value)} />
        </div>
        <p className="hint">{t("routine.expiryHint")}</p>
        <label className="field"><span>{t("routine.hold")}</span>
          <select value={holdSec} onChange={e => setHoldSec(Number(e.target.value))}>
            <option value={0}>{t("routine.holdNow")}</option>
            <option value={30}>{t("dur.30s")}</option>
            <option value={60}>{t("dur.1m")}</option>
            <option value={300}>{t("dur.5m")}</option>
          </select></label>
        <label className="field"><span>{t("routine.yield")}</span>
          <select value={yieldSec} onChange={e => setYieldSec(Number(e.target.value))}>
            <option value={0}>{t("routine.noYield")}</option>
            <option value={300}>{t("dur.5m")}</option>
            <option value={900}>{t("dur.15m")}</option>
            <option value={3600}>{t("dur.1h")}</option>
          </select></label>
        <p className="hint">{t("routine.yieldHint")}</p>
      </section>

      <button className="secondary full" disabled={dangLam || !conds.length} onClick={() => { void xemTruoc(); }}>
        {t("routine.preview")}</button>

      {moPhong && <div className="rule-preview">
        <strong>{moPhong.willFire
          ? t("routine.willRun")
          : t("routine.wontRun", { why: moPhong.why || "" })}</strong>
        {[...moPhong.conditions, ...moPhong.gates, ...moPhong.exclusions].map((dong, i) => <p key={i}>
          <b>{dong.pass ? t("routine.pass") : t("routine.fail")}</b>
          {" · "}{dong.type === "time" ? `${dong.from}–${dong.to}` : `${nhanChiSo(dong.deviceId, dong.key)} ${t(`op.${dong.op}`)} ${String(dong.value)}`}
          {dong.current !== undefined && ` · ${t("routine.currently", { v: String(dong.current) })}`}
        </p>)}
      </div>}

      <p className="hint">{t("routine.shadowHint")}</p>
      {loi && <div className="dynamic-error"><X />{loi}</div>}
      <button className="primary full" disabled={dangLam || !hopLe} onClick={() => { void luu(); }}>
        {dangLam ? t("common.saving") : t("common.save")}</button>
    </div>
  </div>;
}

/** Ô nhập giá trị dựng theo kiểu capability — không đoán khoảng, không viết cứng danh sách. */
function veGiaTri(capability: IotxCapability | undefined, giaTri: string, onChange: (v: string) => void, t: HamChu) {
  if (!capability) return <input aria-label={t("routine.value")} value={giaTri} onChange={e => onChange(e.target.value)} placeholder={t("routine.value")} />;
  if (capability.kind === "onoff") return <select aria-label={t("routine.value")} value={giaTri || "true"} onChange={e => onChange(e.target.value)}>
    <option value="true">{t("common.on")}</option><option value="false">{t("common.off")}</option></select>;
  if (capability.kind === "enum") return <select aria-label={t("routine.value")} value={giaTri || capability.values?.[0] || ""} onChange={e => onChange(e.target.value)}>
    {(capability.values || []).map(v => <option key={v} value={v}>{capability.labels?.[v] || v}</option>)}</select>;
  return <input aria-label={t("routine.value")} type="number" min={capability.min} max={capability.max} step={capability.step ?? 1}
    value={giaTri} onChange={e => onChange(e.target.value)} />;
}
