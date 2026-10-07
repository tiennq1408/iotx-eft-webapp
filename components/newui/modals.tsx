"use client";

import Image from "next/image";
import Icon from "./Icon";
import { Sheet } from "./shell";
import { useChu } from "./chu";
import { IMG } from "@/lib/newui/assets";
import { NGON_NGU } from "@/lib/newui/strings";
import type { UiNotification } from "@/lib/types";
import { TAT_CA } from "@/lib/newui/boLoc";

export type MucMenu = "spaces" | "members" | "add" | "virtual" | "timers" | "devices";

const CO: Record<string, string> = { vi: IMG.flagVi, en: IMG.flagEn, fil: IMG.flagFil };

/* ------------------------------------------------------------------ */

export function MenuDrawer({ lang, phienBan, onLang, onClose, onChon }: {
  lang: string;
  phienBan: string;
  onLang: (ma: string) => void;
  onClose: () => void;
  onChon: (muc: MucMenu) => void;
}) {
  const { t } = useChu();
  const items: Array<{ emo: string; nhan: string; muc: MucMenu }> = [
    { emo: "🏠", nhan: "menu_spaces", muc: "spaces" },
    { emo: "👥", nhan: "menu_members", muc: "members" },
    { emo: "🔲", nhan: "menu_devices", muc: "devices" },
    { emo: "📶", nhan: "menu_add", muc: "add" },
    { emo: "☀️", nhan: "menu_virtual", muc: "virtual" },
  ];
  return (
    <div className="drawer-overlay" role="dialog" aria-modal="true" aria-label={t("menu_title")}>
      <button className="modal-scrim" aria-label={t("close")} onClick={onClose} />
      <aside className="drawer">
        <h3><Icon name="menu" /> {t("menu_title")}</h3>
        <div className="lang-row">
          {NGON_NGU.map(muc => (
            <button key={muc.id} className={`lang-flag${lang === muc.id ? " active" : ""}`} aria-pressed={lang === muc.id} onClick={() => onLang(muc.id)}>
              <Image unoptimized src={CO[muc.id]} alt="" width={22} height={22} style={{ borderRadius: "50%" }} />
              <span>{muc.ten}</span>
            </button>
          ))}
        </div>
        {items.map(muc => (
          <button key={muc.muc} className="drawer-item" onClick={() => onChon(muc.muc)}>
            <span className="emo" aria-hidden="true">{muc.emo}</span>{t(muc.nhan)}
          </button>
        ))}
        <p className="drawer-foot">{t("version_line", { ban: phienBan })}</p>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ProfileModal({ ten, email, vaiTro, onClose, onLogout }: {
  ten: string;
  email: string;
  vaiTro: string;
  onClose: () => void;
  onLogout: () => void;
}) {
  const { t } = useChu();
  return (
    <Sheet title={ten} onClose={onClose} centered>
      <div style={{ textAlign: "center" }}>
        <div className="avatar-circle" style={{ width: 64, height: 64, margin: "0 auto 12px" }}>
          <Image unoptimized src={IMG.avatar} alt="" width={64} height={64} />
        </div>
        <h3 style={{ margin: "0 0 3px", fontSize: 16 }}>{ten}</h3>
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>{email || vaiTro}</p>
      </div>
      <button className="btn-full danger" onClick={onLogout}>{t("logout")}</button>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

export function NotifModal({ items, onClose, onXoa, onXoaHet }: {
  items: UiNotification[];
  onClose: () => void;
  onXoa: (id: string) => void;
  onXoaHet: () => void;
}) {
  const { t } = useChu();
  return (
    <Sheet title={t("notif_title")} onClose={onClose}>
      <p className="modal-title">{t("notif_title")}</p>
      {items.length === 0 && <p className="placeholder-msg">{t("notif_empty")}</p>}
      {items.map(muc => (
        <div className="notif-row" key={muc.id}>
          <div className="nicn"><Icon name={muc.icon} /></div>
          <div>
            <div className="ntxt">{muc.title}{muc.text ? ` — ${muc.text}` : ""}</div>
            <div className="ntime">{muc.time}</div>
          </div>
          <button className="ndel" aria-label={t("notif_delete")} onClick={() => onXoa(muc.id)}><Icon name="close" /></button>
        </div>
      ))}
      {items.length > 0 && <button className="btn-full secondary" onClick={onXoaHet}>{t("notif_clear")}</button>}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Một hộp chọn dùng cho cả ba bộ lọc (nhà, phòng, nhóm). Hàng đầu luôn là "tất cả" — bỏ
 * lọc — nên không dùng lại nó cho những chỗ phải chọn đúng một mục (xem `DevicePickerModal`).
 */
export function LocPickerModal({ khoaTieuDe, khoaTatCa, dangChon, danhSach, onClose, onChon }: {
  /** Khóa chữ, không phải chữ sẵn: hộp này nằm trong cây `ChuProvider` nên tự dịch được. */
  khoaTieuDe: string;
  khoaTatCa: string;
  dangChon: string;
  danhSach: string[];
  onClose: () => void;
  onChon: (ten: string) => void;
}) {
  const { t } = useChu();
  const rows = [TAT_CA, ...danhSach];
  return (
    <Sheet title={t(khoaTieuDe)} onClose={onClose} centered>
      <p className="modal-title">{t(khoaTieuDe)}</p>
      {rows.map(ten => (
        <button key={ten} className={`radio-list-row${dangChon === ten ? " sel" : ""}`} aria-pressed={dangChon === ten} onClick={() => onChon(ten)}>
          <span className="rc" />{ten === TAT_CA ? t(khoaTatCa) : ten}
        </button>
      ))}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Chọn thiết bị — dùng cho những màn thuộc về MỘT thiết bị (hẹn giờ). Không dùng lại
 * `LocPickerModal` vì hộp đó luôn chèn thêm hàng "tất cả", không có nghĩa ở đây.
 */
export function DevicePickerModal({ danhSach, onClose, onChon }: {
  danhSach: Array<{ id: string; name: string; room?: string }>;
  onClose: () => void;
  onChon: (id: string) => void;
}) {
  const { t } = useChu();
  return (
    <Sheet title={t("pick_device")} onClose={onClose} centered>
      <p className="modal-title">{t("pick_device")}</p>
      {danhSach.length === 0 && <p className="placeholder-msg">{t("no_device")}</p>}
      {danhSach.map(device => (
        <button key={device.id} className="radio-list-row" onClick={() => onChon(device.id)}>
          <span className="rc" />{device.name}{device.room ? ` · ${device.room}` : ""}
        </button>
      ))}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

export function PlaceholderModal({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useChu();
  return (
    <Sheet title={title} onClose={onClose} centered>
      <p className="modal-title">{title}</p>
      <p className="placeholder-msg">{t("placeholder_msg")}</p>
      <button className="btn-full" onClick={onClose}>{t("understood")}</button>
    </Sheet>
  );
}
