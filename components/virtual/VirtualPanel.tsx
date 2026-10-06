"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CloudSun, Hand, Home, Plus, Trash2, X } from "lucide-react";
import { iotxClient, isIotxMode, moTaLoi } from "@/lib/iotx";
import type { IotxKieuAo, IotxNoiChon, IotxThietBiAo } from "@/lib/iotx/contracts";
import { useChu } from "@/components/newui/chu";

const TRAN = 10;

export default function VirtualPanel({ onClose, onThayDoi }: { onClose: () => void; onThayDoi: () => void | Promise<void> }) {
  const { t } = useChu();
  const [ds, setDs] = useState<IotxThietBiAo[]>([]);
  const [noi, setNoi] = useState<IotxNoiChon[]>([]);
  const [kieu, setKieu] = useState<IotxKieuAo>("state");
  const [ten, setTen] = useState("");
  const [nơi, setNoiChon] = useState("");
  const [dangSuaId, setDangSuaId] = useState<string | null>(null);
  const [tenSua, setTenSua] = useState("");
  const [loi, setLoi] = useState("");
  const [dangLam, setDangLam] = useState(false);

  const tai = useCallback(async () => {
    // Thiết bị ảo sống ở IBS, không có bản mock nào. Ở chế độ mock mà vẫn gọi thì chỉ nhận
    // 403/404 rồi hiện một câu lỗi khó hiểu — thà nói thẳng là màn này cần nối máy chủ.
    if (!isIotxMode) return;
    try {
      // Danh sách thành phố chỉ cần cho kiểu "nguồn ngoài"; hỏng thì phần còn lại vẫn chạy.
      const [danhSach, noiCo] = await Promise.all([
        iotxClient.thietBiAo(),
        iotxClient.noChonDuoc().catch(() => [] as IotxNoiChon[]),
      ]);
      setDs(danhSach);
      setNoi(noiCo);
    } catch (error) { setLoi(moTaLoi(error)); }
  }, []);

  // Nạp lần đầu. Quy tắc set-state-in-effect nhắm vào setState ĐỒNG BỘ trong thân effect;
  // ở đây state chỉ đổi sau khi request trả về, đúng kiểu "đăng ký nhận dữ liệu từ hệ ngoài".
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void tai(); }, [tai]);

  const moTaKieu: Record<IotxKieuAo, { nhan: string; goiY: string; cho: string; icon: React.ReactNode }> = {
    external: { nhan: t("virtual.external"), goiY: t("virtual.externalDesc"), cho: t("virtual.phExternal"), icon: <CloudSun /> },
    state: { nhan: t("virtual.state"), goiY: t("virtual.stateDesc"), cho: t("virtual.phState"), icon: <Home /> },
    button: { nhan: t("virtual.button"), goiY: t("virtual.buttonDesc"), cho: t("virtual.phButton"), icon: <Hand /> },
  };

  async function lam(viec: () => Promise<unknown>) {
    setLoi(""); setDangLam(true);
    try { await viec(); await tai(); await onThayDoi(); }
    catch (error) { setLoi(moTaLoi(error)); }
    finally { setDangLam(false); }
  }

  async function tao() {
    if (!ten.trim()) return;
    await lam(async () => {
      await iotxClient.taoThietBiAo({ kind: kieu, name: ten.trim(), ...(kieu === "external" && nơi ? { place: nơi } : {}) });
      setTen("");
    });
  }

  function tomTatTrangThai(muc: IotxThietBiAo) {
    const st = muc.state || {};
    if (muc.kind === "state") return st.on ? t("state.on") : t("state.offNow");
    if (muc.kind === "button") return t("virtual.pressCount", { n: Number(st.count ?? 0) });
    const phan: string[] = [];
    if (st.temperature !== undefined && st.temperature !== null) phan.push(`${st.temperature}°C`);
    if (st.humidity !== undefined && st.humidity !== null) phan.push(t("virtual.humidity", { v: String(st.humidity) }));
    if (st.aqi !== undefined && st.aqi !== null) phan.push(t("virtual.aqi", { v: String(st.aqi) }));
    return phan.length ? phan.join(" · ") : t("virtual.noData");
  }

  return <div className="full-panel">
    <header className="panel-head">
      <button className="icon-button" aria-label={t("common.back")} onClick={onClose}><ArrowLeft /></button>
      <h2>{t("virtual.title")}</h2><span />
    </header>
    <div className="panel-body">
      <p className="hint">{t("virtual.hint")}</p>
      {!isIotxMode && <p className="hint">Màn này cần nối máy chủ IoTX. Ứng dụng đang chạy ở chế độ mock nên chưa tạo được thiết bị ảo.</p>}

      <section className="soft-card">
        <h3>{t("common.create")}</h3>
        <div className="kieu-ao">
          {(Object.keys(moTaKieu) as IotxKieuAo[]).map(ma => <button key={ma} className={kieu === ma ? "active" : ""} onClick={() => setKieu(ma)}>
            <span>{moTaKieu[ma].icon}</span><strong>{moTaKieu[ma].nhan}</strong><small>{moTaKieu[ma].goiY}</small>
          </button>)}
        </div>
        <div className="stack">
          <input value={ten} maxLength={40} placeholder={moTaKieu[kieu].cho} onChange={e => setTen(e.target.value)} />
          {kieu === "external" && <select aria-label={t("place.title")} value={nơi} onChange={e => setNoiChon(e.target.value)}>
            <option value="">{t("virtual.pickPlace")}</option>
            {noi.map(n => <option key={n.key} value={n.key}>{n.name}</option>)}
          </select>}
          <button className="primary" disabled={!isIotxMode || dangLam || !ten.trim() || ds.length >= TRAN || (kieu === "external" && !nơi)} onClick={() => { void tao(); }}>
            <Plus /> {t("common.create")}
          </button>
        </div>
        <p className="hint">{t("virtual.limit")} ({ds.length}/{TRAN})</p>
      </section>

      {loi && <div className="dynamic-error"><X />{loi}<button aria-label={t("common.close")} onClick={() => setLoi("")}><X /></button></div>}

      <div className="space-list">
        {ds.length === 0 && <p className="hint">{t("virtual.empty")}</p>}
        {ds.map(muc => <article className="ao-row" key={muc.id}>
          <span className="space-icon">{muc.kind === "external" ? "🌤️" : muc.kind === "button" ? "🔘" : "🏠"}</span>
          <div className="ao-chu">
            {dangSuaId === muc.id
              ? <input autoFocus value={tenSua} maxLength={40} onChange={e => setTenSua(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { void lam(() => iotxClient.doiTenThietBiAo(muc.id, tenSua.trim())).then(() => setDangSuaId(null)); } }} />
              : <button className="ao-ten" onClick={() => { setDangSuaId(muc.id); setTenSua(muc.name); }}>{muc.name}</button>}
            <small>{moTaKieu[muc.kind].nhan} · {tomTatTrangThai(muc)}</small>
          </div>
          {muc.kind === "state" && <button className={`switch${muc.state?.on ? " on" : ""}`} aria-label={muc.state?.on ? t("common.off") : t("common.on")}
            disabled={dangLam} onClick={() => { void lam(() => iotxClient.datTrangThaiAo(muc.id, !muc.state?.on)); }}><i /></button>}
          {muc.kind === "button" && <button className="secondary nut-bam" disabled={dangLam}
            onClick={() => { void lam(() => iotxClient.bamNutAo(muc.id)); }}>{t("virtual.press")}</button>}
          <button aria-label={t("common.delete")} disabled={dangLam}
            onClick={() => { void lam(() => iotxClient.xoaThietBiAo(muc.id)); }}><Trash2 /></button>
        </article>)}
      </div>
    </div>
  </div>;
}
