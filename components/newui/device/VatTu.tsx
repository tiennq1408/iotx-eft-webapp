"use client";

import { useState } from "react";
import Icon from "../Icon";
import { useChu } from "../chu";
import type { IotxCapability, IotxLenhVatTu } from "@/lib/iotx/contracts";
import type { Device } from "@/lib/types";
import { danhSachMuc, docSo, phanTramConLai, tenMuc } from "@/lib/newui/vatTu";

/** Gửi một lệnh vật tư; trả `true` khi máy chủ nhận. Hỏng thì nơi gọi đã tự báo lỗi. */
export type GuiVatTu = (cap: IotxCapability, lenh: IotxLenhVatTu) => Promise<boolean>;

/**
 * Capability kiểu `list` — vật tư/lõi lọc. Bốn lệnh của hợp đồng đi qua
 * `POST /devices/{id}/muc/{cap}`: `them`, `thay` (đặt lại đồng hồ), `tuoi` (sửa tuổi thọ
 * ngày), `bo` (ngừng theo dõi). Máy chủ tự quyết mục do mạch hay máy chủ giữ.
 *
 * Danh sách mục đọc thẳng từ `lastValues[cap.key]` — hợp đồng nói đó là mảng đã GỘP phần
 * mạch báo và phần máy chủ giữ, nên app không tự ghép lại.
 */
export function VatTuBlock({ device, cap, khoa, gui }: {
  device: Device; cap: IotxCapability; khoa: boolean; gui: GuiVatTu;
}) {
  const { t } = useChu();
  const [moThem, setMoThem] = useState(false);
  const [tenMoi, setTenMoi] = useState("");
  const [serialMoi, setSerialMoi] = useState("");
  const [suaTuoiId, setSuaTuoiId] = useState<string | null>(null);
  const [tuoiMoi, setTuoiMoi] = useState("365");
  const [hoiBoId, setHoiBoId] = useState<string | null>(null);
  const [dangLam, setDangLam] = useState(false);

  const muc = danhSachMuc(device, cap);

  /** Ô sửa/hỏi lại chỉ đóng khi lệnh thành công — hỏng thì giữ nguyên để người dùng thử lại. */
  async function lam(lenh: IotxLenhVatTu, xong?: () => void) {
    setDangLam(true);
    try { if (await gui(cap, lenh)) xong?.(); }
    finally { setDangLam(false); }
  }

  return (
    <>
      <p className="field-label">{cap.label || t("supplies")}</p>
      {muc.length === 0 && <p className="hint">{t("supplies_empty")}</p>}
      {muc.map((item, i) => {
        const id = String(item.id ?? i);
        const pct = phanTramConLai(item);
        // Cùng cách đọc với thanh tiến độ: nhận cả chuỗi và các tên trường khác nhau.
        const tuoi = docSo(item, ["tuoiTho", "life", "lifeDays"]);
        return (
          <div className="vat-tu-row" key={id}>
            <div className="vat-tu-chu">
              <strong>{tenMuc(item)}{item.xacThuc === false && <em className="tag-cho"> {t("supplies_unverified")}</em>}</strong>
              {pct !== null && (
                <>
                  <div className="filter-name-row"><span>{tuoi !== undefined ? t("supplies_life", { ngay: tuoi }) : ""}</span><span>{pct}%</span></div>
                  <div className="progress-wrap"><div className={`progress-bar${pct < 20 ? " low" : ""}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
                </>
              )}
            </div>
            <div className="vat-tu-nut">
              <button className="seg-btn" disabled={khoa || dangLam} onClick={() => { void lam({ kieu: "thay", id: String(item.id ?? "") }); }}>{t("supplies_replace")}</button>
              <button className="seg-btn" disabled={khoa || dangLam} onClick={() => { setSuaTuoiId(suaTuoiId === id ? null : id); setTuoiMoi(String(item.tuoiTho ?? 365)); }}>{t("supplies_life_edit")}</button>
              {hoiBoId === id
                ? <button className="seg-btn danger-btn" disabled={khoa || dangLam} onClick={() => { void lam({ kieu: "bo", id: String(item.id ?? "") }, () => setHoiBoId(null)); }}>{t("supplies_drop_confirm")}</button>
                : <button className="seg-btn" disabled={khoa || dangLam} onClick={() => setHoiBoId(id)}>{t("supplies_drop")}</button>}
            </div>
            {suaTuoiId === id && (
              <div className="vat-tu-sua">
                <input type="number" min={1} inputMode="numeric" aria-label={t("supplies_life_edit")} value={tuoiMoi} onChange={e => setTuoiMoi(e.target.value)} />
                <button className="seg-btn sel" disabled={khoa || dangLam || !(Number(tuoiMoi) > 0)} onClick={() => { void lam({ kieu: "tuoi", id: String(item.id ?? ""), tuoiTho: Number(tuoiMoi) }, () => setSuaTuoiId(null)); }}>{t("save")}</button>
              </div>
            )}
          </div>
        );
      })}

      {moThem ? (
        <div className="vat-tu-them">
          <input aria-label={t("supplies_name")} placeholder={t("supplies_name")} value={tenMoi} onChange={e => setTenMoi(e.target.value)} />
          <input aria-label={t("supplies_serial")} placeholder={t("supplies_serial")} value={serialMoi} onChange={e => setSerialMoi(e.target.value)} />
          <p className="hint">{t("supplies_add_hint")}</p>
          <div className="vat-tu-nut">
            <button className="seg-btn" onClick={() => setMoThem(false)}>{t("cancel")}</button>
            <button className="seg-btn sel" disabled={khoa || dangLam || (!tenMoi.trim() && !serialMoi.trim())}
              onClick={() => { void lam({ kieu: "them", ...(serialMoi.trim() ? { serial: serialMoi.trim() } : {}), ...(tenMoi.trim() ? { ten: tenMoi.trim() } : {}) }, () => { setMoThem(false); setTenMoi(""); setSerialMoi(""); }); }}>
              {t("supplies_add")}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-full secondary" disabled={khoa} onClick={() => setMoThem(true)}><Icon name="plus" /> {t("supplies_add")}</button>
      )}
    </>
  );
}
