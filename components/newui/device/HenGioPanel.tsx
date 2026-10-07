"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "../Icon";
import { useChu } from "../chu";
import { iotxClient, isIotxMode, moTaLoi } from "@/lib/iotx";
import type { IotxBuocHenGio, IotxCapability, IotxHenGioTongQuan, IotxThanChuongTrinh } from "@/lib/iotx/contracts";
import type { Device } from "@/lib/types";

/** Trần cứng của hợp đồng — chặn ngay ở client, máy chủ vẫn kiểm lại. */
const TRAN = { chuongTrinh: 10, buoc: 8, hanhDong: 5, ten: 40, phut: { min: 1, max: 720 } };
const NGAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
/**
 * Giờ bắt đầu gieo sẵn khi chu kỳ chuyển sang cần nó.
 *
 * Trước đây ô nhập lấy `soan.batDau ?? "06:00"` làm GIÁ TRỊ HIỂN THỊ trong khi state vẫn
 * null. Người dùng nhìn thấy "06:00" nằm đó mà màn vẫn báo "cần giờ bắt đầu", và gõ lại
 * đúng 06:00 thì trình duyệt không bắn onChange nên không thoát ra được. Gieo vào state
 * thì cái nhìn thấy và cái gửi đi là một.
 */
const MAC_DINH_BAT_DAU = "06:00";

function gioCuaEpoch(ms: number) {
  const d = new Date(ms);
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(d);
}

const thanRong = (): IotxThanChuongTrinh => ({
  ten: "", kieu: "gio", chay: "lap", ngay: [0, 1, 2, 3, 4, 5, 6],
  buoc: [{ moc: "06:00", hd: [] }],
});

/**
 * Hẹn giờ theo thiết bị — `GET/PUT/DELETE /devices/{id}/hen-gio/*`.
 *
 * Hai thứ khác nhau nằm cùng một màn, đúng như hợp đồng:
 * - **Hẹn** bật/tắt: mỗi thiết bị đúng MỘT hẹn, đặt lại là thay hẹn cũ.
 * - **Chương trình**: tối đa 10 cái, mỗi lúc chỉ một cái "đang dùng".
 *
 * `batDuoc = false` nghĩa là sản phẩm tắt hẹn giờ; lúc đó màn này không được hiện gì để
 * thao tác. Người được chia sẻ gọi vào sẽ nhận `404 not_found` — hiện đúng câu chung.
 */
export default function HenGioPanel({ device, onClose }: { device: Device; onClose: () => void }) {
  const { t } = useChu();
  const [tongQuan, setTongQuan] = useState<IotxHenGioTongQuan | null>(null);
  // Khởi tạo theo chế độ chạy: bản mock không gọi gì nên không có gì để "đang tải", và
  // nhờ vậy effect nạp lần đầu không phải setState đồng bộ.
  const [dangTai, setDangTai] = useState(isIotxMode);
  const [loi, setLoi] = useState("");
  const [dangLam, setDangLam] = useState(false);

  // đặt hẹn
  const [batTat, setBatTat] = useState(false);
  const [cach, setCach] = useState<"luc" | "phut">("luc");
  const [luc, setLuc] = useState("22:00");
  const [phut, setPhut] = useState("60");

  // trình soạn chương trình
  const [soan, setSoan] = useState<IotxThanChuongTrinh | null>(null);
  const [soanId, setSoanId] = useState<number | null>(null);

  const capChoPhep = (tongQuan?.capChoPhep ?? []).map(key =>
    (device.product?.capabilities ?? []).find(cap => cap.key === key)).filter(Boolean) as IotxCapability[];

  const tai = useCallback(async () => {
    if (!isIotxMode) return;
    try {
      const ketQua = await iotxClient.xemHenGio(device.id);
      setTongQuan(ketQua);
      setLoi("");
    } catch (error) { setLoi(moTaLoi(error)); }
    finally { setDangTai(false); }
  }, [device.id]);

  // Nạp lần đầu. Quy tắc set-state-in-effect nhắm vào setState ĐỒNG BỘ trong thân effect;
  // ở đây mọi setState đều nằm sau `await`, đúng kiểu "đăng ký nhận dữ liệu từ hệ ngoài"
  // (cùng lý do đã ghi ở VirtualPanel).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void tai(); }, [tai]);

  async function lam(viec: () => Promise<unknown>) {
    setLoi(""); setDangLam(true);
    try { await viec(); await tai(); }
    catch (error) { setLoi(moTaLoi(error)); }
    finally { setDangLam(false); }
  }

  /* ---------------- trình soạn ---------------- */

  function suaBuoc(i: number, moi: Partial<IotxBuocHenGio>) {
    setSoan(cu => cu && ({ ...cu, buoc: cu.buoc.map((b, vt) => vt === i ? { ...b, ...moi } : b) }));
  }
  function suaHanhDong(iBuoc: number, iHd: number, moi: Partial<{ cap: string; val: unknown }>) {
    setSoan(cu => cu && ({
      ...cu,
      buoc: cu.buoc.map((b, vt) => vt === iBuoc ? { ...b, hd: b.hd.map((h, k) => k === iHd ? { ...h, ...moi } : h) } : b),
    }));
  }

  function giaTriMacDinh(cap: IotxCapability | undefined): unknown {
    if (!cap) return "";
    if (cap.kind === "onoff") return true;
    if (cap.kind === "enum") return cap.values?.[0] ?? "";
    return cap.min ?? 0;
  }

  /**
   * Soát đúng những ràng buộc hợp đồng nêu, và trả về câu NÓI RÕ sai ở đâu.
   *
   * Máy chủ vẫn kiểm lại — nhưng để nó từ chối thì người dùng mất một vòng mạng mới biết
   * mình gõ sai bước nào. Hai luật dễ vi phạm nhất mà bản cũ bỏ qua hẳn: mốc `khoang` phải
   * TĂNG DẦN, và mốc `gio` không được trùng nhau.
   */
  const loiSoan = (() => {
    if (!soan) return "";
    if (!soan.ten.trim() || soan.ten.length > TRAN.ten) return t("hg_loi_ten");
    if (soan.buoc.length < 1 || soan.buoc.length > TRAN.buoc) return t("hg_invalid");

    const daGap = new Set<string>();
    let truoc = -1;
    for (let i = 0; i < soan.buoc.length; i++) {
      const b = soan.buoc[i], n = i + 1;
      if (b.hd.length < 1 || b.hd.length > TRAN.hanhDong) return t("hg_loi_hd", { n });
      // Cap có thể đã bị thu hồi SAU khi lưu (`capThuHoi`) — lúc đó nó không còn trong
      // `capChoPhep`, máy chủ sẽ chối, nên bắt ngay tại đây.
      if (b.hd.some(h => !h.cap || !capChoPhep.some(c => c.key === h.cap))) return t("hg_loi_cap", { n });

      if (soan.kieu === "gio") {
        const moc = String(b.moc);
        if (daGap.has(moc)) return t("hg_loi_trung", { n });
        daGap.add(moc);
      } else {
        const moc = Number(b.moc);
        if (!Number.isInteger(moc) || moc < 1 || moc > 1440) return t("hg_loi_moc", { n });
        if (moc <= truoc) return t("hg_loi_tang", { n });
        truoc = moc;
      }
    }

    if (soan.chay === "lap" && (soan.ngay?.length ?? 0) < 1) return t("hg_loi_ngay");
    if (soan.kieu === "khoang" && soan.chay === "lap" && !soan.batDau) return t("hg_loi_batdau");
    return "";
  })();
  const hopLe = Boolean(soan) && loiSoan === "";

  async function luuChuongTrinh() {
    if (!soan || !hopLe) return;
    const than: IotxThanChuongTrinh = {
      ...soan,
      ten: soan.ten.trim(),
      ngay: soan.chay === "lap" ? soan.ngay : undefined,
      batDau: soan.kieu === "khoang" && soan.chay === "lap" ? soan.batDau : undefined,
    };
    await lam(async () => {
      if (soanId === null) await iotxClient.taoChuongTrinh(device.id, than);
      else await iotxClient.suaChuongTrinh(device.id, soanId, than);
      setSoan(null); setSoanId(null);
    });
  }

  /* ---------------- render ---------------- */

  const dau = (tieuDe: string, quayLai: () => void) => (
    <header className="panel-head">
      <button className="icon-button" aria-label={t("back")} onClick={quayLai}><Icon name="arrowLeft" /></button>
      <h2>{tieuDe}</h2><span />
    </header>
  );

  if (soan) {
    const soBuoc = soan.buoc.length;
    return (
      <div className="full-panel">
        {dau(soanId === null ? t("hg_new_program") : t("hg_edit_program"), () => { setSoan(null); setSoanId(null); })}
        <div className="panel-body">
          <label className="field"><span>{t("hg_program_name")}</span>
            <input maxLength={TRAN.ten} value={soan.ten} onChange={e => setSoan({ ...soan, ten: e.target.value })} />
          </label>

          <p className="form-label">{t("hg_kind")}</p>
          <div className="seg-group">
            <button className={`seg-btn${soan.kieu === "gio" ? " sel" : ""}`} onClick={() => setSoan({ ...soan, kieu: "gio", buoc: soan.buoc.map(b => ({ ...b, moc: "06:00" })) })}>{t("hg_kind_gio")}</button>
            <button className={`seg-btn${soan.kieu === "khoang" ? " sel" : ""}`} onClick={() => setSoan({ ...soan, kieu: "khoang", batDau: soan.chay === "lap" ? (soan.batDau ?? MAC_DINH_BAT_DAU) : soan.batDau, buoc: soan.buoc.map((b, i) => ({ ...b, moc: (i + 1) * 30 })) })}>{t("hg_kind_khoang")}</button>
          </div>

          <p className="form-label">{t("hg_run")}</p>
          <div className="seg-group">
            <button className={`seg-btn${soan.chay === "motlan" ? " sel" : ""}`} onClick={() => setSoan({ ...soan, chay: "motlan" })}>{t("hg_run_once")}</button>
            <button className={`seg-btn${soan.chay === "lap" ? " sel" : ""}`} onClick={() => setSoan({ ...soan, chay: "lap", batDau: soan.kieu === "khoang" ? (soan.batDau ?? MAC_DINH_BAT_DAU) : soan.batDau })}>{t("hg_run_repeat")}</button>
          </div>

          {soan.chay === "lap" && (
            <div className="weekday-row" style={{ marginTop: 10 }}>
              {NGAY.map((ten, i) => (
                <button key={ten} className={soan.ngay?.includes(i) ? "active" : ""}
                  onClick={() => setSoan({ ...soan, ngay: soan.ngay?.includes(i) ? soan.ngay.filter(n => n !== i) : [...(soan.ngay ?? []), i].sort() })}>
                  {ten}
                </button>
              ))}
            </div>
          )}

          {soan.kieu === "khoang" && soan.chay === "lap" && (
            <label className="field" style={{ marginTop: 12 }}><span>{t("hg_start")}</span>
              <input type="time" value={soan.batDau ?? ""} onChange={e => setSoan({ ...soan, batDau: e.target.value })} />
            </label>
          )}

          <div className="saved-heading"><strong>{t("hg_steps")}</strong><small>{soBuoc}/{TRAN.buoc}</small></div>
          {soan.buoc.map((buoc, i) => (
            <div className="rule-row" key={i}>
              <div className="rule-row-head">
                <span>{t("hg_step_n", { n: i + 1 })}</span>
                {soBuoc > 1 && <button aria-label={t("auto_delete")} onClick={() => setSoan({ ...soan, buoc: soan.buoc.filter((_, vt) => vt !== i) })}><Icon name="trash" /></button>}
              </div>
              {soan.kieu === "gio"
                ? <input type="time" aria-label={t("hg_at")} value={String(buoc.moc)} onChange={e => suaBuoc(i, { moc: e.target.value })} />
                : <input type="number" min={1} max={1440} aria-label={t("hg_minute")} value={Number(buoc.moc)} onChange={e => suaBuoc(i, { moc: Number(e.target.value) })} />}

              {buoc.hd.map((hd, k) => {
                const cap = capChoPhep.find(c => c.key === hd.cap);
                return (
                  <div className="rule-grid two" key={k} style={{ marginTop: 8 }}>
                    <select aria-label={t("hg_capability")} value={hd.cap} onChange={e => {
                      const capMoi = capChoPhep.find(c => c.key === e.target.value);
                      suaHanhDong(i, k, { cap: e.target.value, val: giaTriMacDinh(capMoi) });
                    }}>
                      {capChoPhep.map(c => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
                    </select>
                    {cap?.kind === "onoff" && (
                      <select aria-label={t("hg_value")} value={String(hd.val)} onChange={e => suaHanhDong(i, k, { val: e.target.value === "true" })}>
                        <option value="true">{t("on")}</option><option value="false">{t("off")}</option>
                      </select>
                    )}
                    {cap?.kind === "enum" && (
                      <select aria-label={t("hg_value")} value={String(hd.val)} onChange={e => suaHanhDong(i, k, { val: e.target.value })}>
                        {(cap.values ?? []).map(v => <option key={v} value={v}>{cap.labels?.[v] ?? v}</option>)}
                      </select>
                    )}
                    {(cap?.kind === "level" || !cap) && (
                      <input type="number" aria-label={t("hg_value")} min={cap?.min} max={cap?.max} step={cap?.step ?? 1}
                        value={Number(hd.val ?? 0)} onChange={e => suaHanhDong(i, k, { val: Number(e.target.value) })} />
                    )}
                  </div>
                );
              })}

              <div className="rule-add">
                <button className="secondary" disabled={buoc.hd.length >= TRAN.hanhDong || capChoPhep.length === 0}
                  onClick={() => suaBuoc(i, { hd: [...buoc.hd, { cap: capChoPhep[0]?.key ?? "", val: giaTriMacDinh(capChoPhep[0]) }] })}>
                  <Icon name="plus" /> {t("hg_add_action")} ({buoc.hd.length}/{TRAN.hanhDong})
                </button>
                {buoc.hd.length > 0 && (
                  <button className="secondary" onClick={() => suaBuoc(i, { hd: buoc.hd.slice(0, -1) })}>{t("hg_del_action")}</button>
                )}
              </div>
            </div>
          ))}

          <button className="smart-add-point" disabled={soBuoc >= TRAN.buoc}
            onClick={() => setSoan({ ...soan, buoc: [...soan.buoc, soan.kieu === "gio" ? { moc: "20:00", hd: [] } : { moc: (soBuoc + 1) * 30, hd: [] }] })}>
            <Icon name="plus" /> {t("hg_add_step")}
          </button>

          {loi && <p className="form-message">{loi}</p>}
          {loiSoan && <p className="hint">{loiSoan}</p>}
          <div className="form-actions">
            <button className="secondary" onClick={() => { setSoan(null); setSoanId(null); }}>{t("cancel")}</button>
            <button className="primary" disabled={!hopLe || dangLam} onClick={() => { void luuChuongTrinh(); }}>{t("save")}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="full-panel">
      {dau(t("hg_title"), onClose)}
      <div className="panel-body">
        {!isIotxMode && <p className="hint">{t("hg_mock")}</p>}
        {dangTai && isIotxMode && <p className="hint">{t("loading")}</p>}
        {loi && <p className="form-message">{loi}</p>}

        {tongQuan && !tongQuan.batDuoc && <p className="hint">{t("hg_unsupported")}</p>}

        {tongQuan?.batDuoc && (
          <>
            <section className="soft-card">
              <h3>{t("hg_one_shot")}</h3>
              {tongQuan.hen
                ? (
                  <div className="ao-row">
                    <span className="space-icon"><Icon name="clock" /></span>
                    <div className="ao-chu">
                      <strong>{tongQuan.hen.bat ? t("hg_will_on") : t("hg_will_off")}</strong>
                      <small>{gioCuaEpoch(tongQuan.hen.luc)}</small>
                    </div>
                    <button className="secondary nut-bam" disabled={dangLam} onClick={() => { void lam(() => iotxClient.huyHenGio(device.id)); }}>{t("hg_cancel")}</button>
                  </div>
                )
                : <p className="hint">{t("hg_none")}</p>}

              <div className="seg-group" style={{ marginTop: 10 }}>
                <button className={`seg-btn${batTat ? " sel" : ""}`} onClick={() => setBatTat(true)}>{t("hg_then_on")}</button>
                <button className={`seg-btn${!batTat ? " sel" : ""}`} onClick={() => setBatTat(false)}>{t("hg_then_off")}</button>
              </div>
              <div className="seg-group" style={{ marginTop: 8 }}>
                <button className={`seg-btn${cach === "luc" ? " sel" : ""}`} onClick={() => setCach("luc")}>{t("hg_at_time")}</button>
                <button className={`seg-btn${cach === "phut" ? " sel" : ""}`} onClick={() => setCach("phut")}>{t("hg_after")}</button>
              </div>
              {cach === "luc"
                ? <label className="field" style={{ marginTop: 10 }}><span>{t("hg_at")}</span><input type="time" value={luc} onChange={e => setLuc(e.target.value)} /></label>
                : <label className="field" style={{ marginTop: 10 }}><span>{t("hg_minutes", { min: TRAN.phut.min, max: TRAN.phut.max })}</span><input type="number" min={TRAN.phut.min} max={TRAN.phut.max} value={phut} onChange={e => setPhut(e.target.value)} /></label>}
              <button className="primary full" disabled={dangLam || (cach === "phut" && !(Number(phut) >= TRAN.phut.min && Number(phut) <= TRAN.phut.max))}
                onClick={() => { void lam(() => iotxClient.datHenGio(device.id, cach === "luc" ? { bat: batTat, luc } : { bat: batTat, phut: Number(phut) })); }}>
                {t("hg_set")}
              </button>
              <p className="hint">{t("hg_replace_note")}</p>
            </section>

            <div className="saved-heading">
              <strong>{t("hg_programs")}</strong>
              <small>{tongQuan.chuongTrinh.length}/{TRAN.chuongTrinh}</small>
            </div>
            {tongQuan.dangChay && <p className="hint">{t("hg_running", { n: tongQuan.dangChay.buocXong })}</p>}
            {tongQuan.chuongTrinh.length === 0 && <p className="hint">{t("hg_no_program")}</p>}
            <div className="space-list">
              {tongQuan.chuongTrinh.map(ct => (
                <div className="ao-row" key={ct.id}>
                  <span className="space-icon"><Icon name="clock" /></span>
                  <div className="ao-chu">
                    <strong>{ct.ten}{tongQuan.dangDung === ct.id && <em className="tag-cho"> {t("hg_in_use")}</em>}</strong>
                    <small>
                      {ct.kieu === "gio" ? t("hg_kind_gio") : t("hg_kind_khoang")} · {ct.chay === "lap" ? t("hg_run_repeat") : t("hg_run_once")} · {t("hg_steps_n", { n: ct.buoc.length })}
                      {ct.capThuHoi.length > 0 && ` · ${t("hg_revoked", { n: ct.capThuHoi.length })}`}
                    </small>
                  </div>
                  {tongQuan.dangDung === ct.id
                    ? <button className="secondary nut-bam" disabled={dangLam} onClick={() => { void lam(() => iotxClient.thoiDungChuongTrinh(device.id)); }}>{t("hg_unuse")}</button>
                    : <button className="secondary nut-bam" disabled={dangLam} onClick={() => { void lam(() => iotxClient.dungChuongTrinhNay(device.id, ct.id)); }}>{t("hg_use")}</button>}
                  <button aria-label={t("hg_edit_program")} disabled={dangLam} onClick={() => { setSoanId(ct.id); setSoan({ ten: ct.ten, kieu: ct.kieu, chay: ct.chay, ngay: ct.ngay ?? [], batDau: ct.batDau ?? null, buoc: ct.buoc }); }}><Icon name="settings" /></button>
                  <button aria-label={t("auto_delete")} disabled={dangLam} onClick={() => { void lam(() => iotxClient.xoaChuongTrinh(device.id, ct.id)); }}><Icon name="trash" /></button>
                </div>
              ))}
            </div>
            <button className="smart-create-button" disabled={tongQuan.chuongTrinh.length >= TRAN.chuongTrinh || capChoPhep.length === 0}
              onClick={() => { setSoanId(null); setSoan(thanRong()); }}>
              <Icon name="plus" /> {t("hg_new_program")}
            </button>
            {capChoPhep.length === 0 && <p className="hint">{t("hg_no_cap")}</p>}
          </>
        )}
      </div>
    </div>
  );
}
