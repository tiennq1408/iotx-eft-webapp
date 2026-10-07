"use client";

import { useEffect, useState } from "react";
import Icon from "../Icon";
import { useChu } from "../chu";
import { iotxClient, isIotxMode, moTaLoi } from "@/lib/iotx";
import type { IotxBuocHenGio, IotxCapability, IotxHenGioTongQuan, IotxThanChuongTrinh } from "@/lib/iotx/contracts";
import type { Device } from "@/lib/types";
import { useHenGio } from "@/hooks/useHenGio";
import {
  TRAN, capChoPhepCua, chuanHoaThan, doiChay, doiKieu, giaTriMacDinh, kiemChuongTrinh, thanRong,
} from "@/lib/newui/henGio";
import { dinhDangLuc } from "@/lib/newui/thoiGian";
import { nhanCap, nhanGiaTriCap } from "@/lib/newui/nhanCap";

import { KHOA_NGAY } from "@/components/automation/IfThenEditor";

/** Chương trình đang soạn: `id` null là tạo mới. */
type BanSoan = { id: number | null; than: IotxThanChuongTrinh };

/** Ô đặt hẹn một lần. Giữ ở màn cha để mở trình soạn rồi quay lại không mất chữ đang gõ. */
type NhapHen = { batTat: boolean; cach: "luc" | "phut"; luc: string; phut: string };
const NHAP_HEN_DAU: NhapHen = { batTat: false, cach: "luc", luc: "22:00", phut: "60" };

/** Chạy một thao tác rồi tải lại tổng quan; giao diện chỉ cần biết đang bận hay không. */
type Lam = (viec: () => Promise<unknown>) => Promise<void>;

function DauPanel({ tieuDe, onQuayLai }: { tieuDe: string; onQuayLai: () => void }) {
  const { t } = useChu();
  return (
    <header className="panel-head">
      <button className="icon-button" aria-label={t("back")} onClick={onQuayLai}><Icon name="arrowLeft" /></button>
      <h2>{tieuDe}</h2><span />
    </header>
  );
}

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
  const { tongQuan, dangTai, loi, setLoi, tai } = useHenGio(device.id);
  const [dangLam, setDangLam] = useState(false);
  const [soan, setSoan] = useState<BanSoan | null>(null);
  const [nhapHen, setNhapHen] = useState(NHAP_HEN_DAU);

  const capChoPhep = capChoPhepCua(tongQuan, device.product?.capabilities ?? []);

  const lam: Lam = async viec => {
    setLoi(""); setDangLam(true);
    try { await viec(); await tai(); }
    catch (error) { setLoi(moTaLoi(error)); }
    finally { setDangLam(false); }
  };

  if (soan) {
    return (
      <TrinhSoanChuongTrinh
        soan={soan}
        setThan={than => setSoan({ ...soan, than })}
        capChoPhep={capChoPhep}
        loi={loi}
        dangLam={dangLam}
        onHuy={() => setSoan(null)}
        onLuu={() => lam(async () => {
          const than = chuanHoaThan(soan.than);
          if (soan.id === null) await iotxClient.taoChuongTrinh(device.id, than);
          else await iotxClient.suaChuongTrinh(device.id, soan.id, than);
          setSoan(null);
        })}
      />
    );
  }

  return (
    <div className="full-panel">
      <DauPanel tieuDe={t("hg_title")} onQuayLai={onClose} />
      <div className="panel-body">
        {!isIotxMode && <p className="hint">{t("hg_mock")}</p>}
        {dangTai && isIotxMode && <p className="hint">{t("loading")}</p>}
        {loi && <p className="form-message">{loi}</p>}

        {tongQuan && !tongQuan.batDuoc && <p className="hint">{t("hg_unsupported")}</p>}

        {tongQuan?.batDuoc && (
          <>
            <HenMotLan deviceId={device.id} tongQuan={tongQuan} nhap={nhapHen} setNhap={setNhapHen} dangLam={dangLam} lam={lam} />
            <DanhSachChuongTrinh
              deviceId={device.id}
              tongQuan={tongQuan}
              coCap={capChoPhep.length > 0}
              dangLam={dangLam}
              lam={lam}
              onSoan={setSoan}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hẹn một lần                                                         */
/* ------------------------------------------------------------------ */

function HenMotLan({ deviceId, tongQuan, nhap, setNhap, dangLam, lam }: {
  deviceId: string;
  tongQuan: IotxHenGioTongQuan;
  nhap: NhapHen;
  setNhap: (nhap: NhapHen) => void;
  dangLam: boolean;
  lam: Lam;
}) {
  const { t } = useChu();
  const { batTat, cach, luc, phut } = nhap;
  const sua = (moi: Partial<NhapHen>) => setNhap({ ...nhap, ...moi });
  const phutHopLe = Number(phut) >= TRAN.phut.min && Number(phut) <= TRAN.phut.max;

  return (
    <section className="soft-card">
      <h3>{t("hg_one_shot")}</h3>
      {tongQuan.hen
        ? (
          <div className="ao-row">
            <span className="space-icon"><Icon name="clock" /></span>
            <div className="ao-chu">
              <strong>{tongQuan.hen.bat ? t("hg_will_on") : t("hg_will_off")}</strong>
              <small>{dinhDangLuc(tongQuan.hen.luc)}</small>
            </div>
            <button className="secondary nut-bam" disabled={dangLam} onClick={() => { void lam(() => iotxClient.huyHenGio(deviceId)); }}>{t("hg_cancel")}</button>
          </div>
        )
        : <p className="hint">{t("hg_none")}</p>}

      <div className="seg-group" style={{ marginTop: 10 }}>
        <button className={`seg-btn${batTat ? " sel" : ""}`} onClick={() => sua({ batTat: true })}>{t("hg_then_on")}</button>
        <button className={`seg-btn${!batTat ? " sel" : ""}`} onClick={() => sua({ batTat: false })}>{t("hg_then_off")}</button>
      </div>
      <div className="seg-group" style={{ marginTop: 8 }}>
        <button className={`seg-btn${cach === "luc" ? " sel" : ""}`} onClick={() => sua({ cach: "luc" })}>{t("hg_at_time")}</button>
        <button className={`seg-btn${cach === "phut" ? " sel" : ""}`} onClick={() => sua({ cach: "phut" })}>{t("hg_after")}</button>
      </div>
      {cach === "luc"
        ? <label className="field" style={{ marginTop: 10 }}><span>{t("hg_at")}</span><input type="time" value={luc} onChange={e => sua({ luc: e.target.value })} /></label>
        : <label className="field" style={{ marginTop: 10 }}><span>{t("hg_minutes", { min: TRAN.phut.min, max: TRAN.phut.max })}</span><input type="number" min={TRAN.phut.min} max={TRAN.phut.max} value={phut} onChange={e => sua({ phut: e.target.value })} /></label>}
      <button className="primary full" disabled={dangLam || (cach === "phut" && !phutHopLe)}
        onClick={() => { void lam(() => iotxClient.datHenGio(deviceId, cach === "luc" ? { bat: batTat, luc } : { bat: batTat, phut: Number(phut) })); }}>
        {t("hg_set")}
      </button>
      <p className="hint">{t("hg_replace_note")}</p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Danh sách chương trình                                              */
/* ------------------------------------------------------------------ */

function DanhSachChuongTrinh({ deviceId, tongQuan, coCap, dangLam, lam, onSoan }: {
  deviceId: string;
  tongQuan: IotxHenGioTongQuan;
  /** Sản phẩm còn capability nào cho phép hẹn giờ không — không thì chẳng tạo được gì. */
  coCap: boolean;
  dangLam: boolean;
  lam: Lam;
  onSoan: (soan: BanSoan) => void;
}) {
  const { t } = useChu();
  /**
   * Xoá là hai nhịp: bấm thùng rác thì nút đổi thành "Xoá thật?" + "Huỷ" trong 4 giây.
   * Máy chủ không giữ bản sao nên không có hoàn tác — ngày 07/10 đã mất ba chương trình
   * vì một chạm. Tổng quan nạp lại (vừa xoá/đổi gì đó) thì bỏ trạng thái chờ luôn.
   */
  const [choXoa, setChoXoa] = useState<number | null>(null);
  useEffect(() => {
    if (choXoa === null) return;
    const hen = setTimeout(() => setChoXoa(null), 4000);
    return () => clearTimeout(hen);
  }, [choXoa]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setChoXoa(null); }, [tongQuan]);

  return (
    <>
      <div className="saved-heading">
        <strong>{t("hg_programs")}</strong>
        <small>{tongQuan.chuongTrinh.length}/{TRAN.chuongTrinh}</small>
      </div>
      {tongQuan.dangChay && <p className="hint">{t("hg_running", { n: tongQuan.dangChay.buocXong })}</p>}
      {tongQuan.chuongTrinh.length === 0 && <p className="hint">{t("hg_no_program")}</p>}
      <div className="space-list">
        {tongQuan.chuongTrinh.map(ct => {
          // `dangChay` chỉ khác null khi chương trình ĐANG DÙNG thuộc kiểu `motlan` và đang
          // chạy dở — lúc đó PUT luôn bị 409. Chương trình `lap` không bao giờ có `dangChay`
          // và sửa khi đang dùng là hợp lệ, nên KHÔNG được khoá chỉ theo `dangDung`.
          const khoaSua = tongQuan.dangChay !== null && tongQuan.dangDung === ct.id;
          return (
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
              ? <button className="secondary nut-bam" disabled={dangLam} onClick={() => { void lam(() => iotxClient.thoiDungChuongTrinh(deviceId)); }}>{t("hg_unuse")}</button>
              : <button className="secondary nut-bam" disabled={dangLam} onClick={() => { void lam(() => iotxClient.dungChuongTrinhNay(deviceId, ct.id)); }}>{t("hg_use")}</button>}
            <button aria-label={t("hg_edit_program")} disabled={dangLam || khoaSua}
              title={khoaSua ? t("hg_khoa_sua") : undefined}
              onClick={() => onSoan({ id: ct.id, than: { ten: ct.ten, kieu: ct.kieu, chay: ct.chay, ngay: ct.ngay ?? [], batDau: ct.batDau ?? null, buoc: ct.buoc } })}>
              <Icon name="settings" />
            </button>
            {choXoa === ct.id ? (
              <>
                <button className="nut-bam canh-bao" disabled={dangLam}
                  onClick={() => { setChoXoa(null); void lam(() => iotxClient.xoaChuongTrinh(deviceId, ct.id)); }}>
                  {t("hg_xoa_that")}
                </button>
                <button className="secondary nut-bam" onClick={() => setChoXoa(null)}>{t("cancel")}</button>
              </>
            ) : (
              <button aria-label={t("auto_delete")} disabled={dangLam} onClick={() => setChoXoa(ct.id)}><Icon name="trash" /></button>
            )}
          </div>
          );
        })}
      </div>
      <button className="smart-create-button" disabled={tongQuan.chuongTrinh.length >= TRAN.chuongTrinh || !coCap}
        onClick={() => onSoan({ id: null, than: thanRong() })}>
        <Icon name="plus" /> {t("hg_new_program")}
      </button>
      {!coCap && <p className="hint">{t("hg_no_cap")}</p>}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Trình soạn chương trình                                             */
/* ------------------------------------------------------------------ */

function TrinhSoanChuongTrinh({ soan, setThan, capChoPhep, loi, dangLam, onHuy, onLuu }: {
  soan: BanSoan;
  setThan: (than: IotxThanChuongTrinh) => void;
  capChoPhep: IotxCapability[];
  loi: string;
  dangLam: boolean;
  onHuy: () => void;
  onLuu: () => Promise<void>;
}) {
  const { t } = useChu();
  const than = soan.than;
  const soBuoc = than.buoc.length;
  const loiKiem = kiemChuongTrinh(than, capChoPhep);
  const loiSoan = loiKiem ? t(loiKiem.khoa, loiKiem.thamSo) : "";

  function suaBuoc(i: number, moi: Partial<IotxBuocHenGio>) {
    setThan({ ...than, buoc: than.buoc.map((b, vt) => vt === i ? { ...b, ...moi } : b) });
  }
  function suaHanhDong(iBuoc: number, iHd: number, moi: Partial<{ cap: string; val: unknown }>) {
    setThan({
      ...than,
      buoc: than.buoc.map((b, vt) => vt === iBuoc ? { ...b, hd: b.hd.map((h, k) => k === iHd ? { ...h, ...moi } : h) } : b),
    });
  }

  return (
    <div className="full-panel">
      <DauPanel tieuDe={soan.id === null ? t("hg_new_program") : t("hg_edit_program")} onQuayLai={onHuy} />
      <div className="panel-body">
        <label className="field"><span>{t("hg_program_name")}</span>
          <input maxLength={TRAN.ten} value={than.ten} onChange={e => setThan({ ...than, ten: e.target.value })} />
        </label>

        <p className="form-label">{t("hg_kind")}</p>
        <div className="seg-group">
          <button className={`seg-btn${than.kieu === "gio" ? " sel" : ""}`} onClick={() => setThan(doiKieu(than, "gio"))}>{t("hg_kind_gio")}</button>
          <button className={`seg-btn${than.kieu === "khoang" ? " sel" : ""}`} onClick={() => setThan(doiKieu(than, "khoang"))}>{t("hg_kind_khoang")}</button>
        </div>

        <p className="form-label">{t("hg_run")}</p>
        <div className="seg-group">
          <button className={`seg-btn${than.chay === "motlan" ? " sel" : ""}`} onClick={() => setThan(doiChay(than, "motlan"))}>{t("hg_run_once")}</button>
          <button className={`seg-btn${than.chay === "lap" ? " sel" : ""}`} onClick={() => setThan(doiChay(than, "lap"))}>{t("hg_run_repeat")}</button>
        </div>

        {than.chay === "lap" && (
          <div className="weekday-row" style={{ marginTop: 10 }}>
            {KHOA_NGAY.map((khoa, i) => (
              <button key={khoa} className={than.ngay?.includes(i) ? "active" : ""}
                onClick={() => setThan({ ...than, ngay: than.ngay?.includes(i) ? than.ngay.filter(n => n !== i) : [...(than.ngay ?? []), i].sort() })}>
                {t(khoa)}
              </button>
            ))}
          </div>
        )}

        {than.kieu === "khoang" && than.chay === "lap" && (
          <label className="field" style={{ marginTop: 12 }}><span>{t("hg_start")}</span>
            <input type="time" value={than.batDau ?? ""} onChange={e => setThan({ ...than, batDau: e.target.value })} />
          </label>
        )}

        <div className="saved-heading"><strong>{t("hg_steps")}</strong><small>{soBuoc}/{TRAN.buoc}</small></div>
        {than.buoc.map((buoc, i) => (
          <div className="rule-row" key={i}>
            <div className="rule-row-head">
              <span>{t("hg_step_n", { n: i + 1 })}</span>
              {soBuoc > 1 && <button aria-label={t("auto_delete")} onClick={() => setThan({ ...than, buoc: than.buoc.filter((_, vt) => vt !== i) })}><Icon name="trash" /></button>}
            </div>
            {than.kieu === "gio"
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
                    {capChoPhep.map(c => <option key={c.key} value={c.key}>{nhanCap(c, t)}</option>)}
                  </select>
                  {cap?.kind === "onoff" && (
                    <select aria-label={t("hg_value")} value={String(hd.val)} onChange={e => suaHanhDong(i, k, { val: e.target.value === "true" })}>
                      <option value="true">{t("on")}</option><option value="false">{t("off")}</option>
                    </select>
                  )}
                  {cap?.kind === "enum" && (
                    <select aria-label={t("hg_value")} value={String(hd.val)} onChange={e => suaHanhDong(i, k, { val: e.target.value })}>
                      {(cap.values ?? []).map(v => <option key={v} value={v}>{nhanGiaTriCap(cap, v, t)}</option>)}
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
          onClick={() => setThan({ ...than, buoc: [...than.buoc, than.kieu === "gio" ? { moc: "20:00", hd: [] } : { moc: (soBuoc + 1) * 30, hd: [] }] })}>
          <Icon name="plus" /> {t("hg_add_step")}
        </button>

        {loi && <p className="form-message">{loi}</p>}
        {loiSoan && <p className="hint">{loiSoan}</p>}
        <div className="form-actions">
          <button className="secondary" onClick={onHuy}>{t("cancel")}</button>
          <button className="primary" disabled={Boolean(loiKiem) || dangLam} onClick={() => { void onLuu(); }}>{t("save")}</button>
        </div>
      </div>
    </div>
  );
}
