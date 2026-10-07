"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import Icon from "./Icon";
import { useChu } from "./chu";
import { IMG } from "@/lib/newui/assets";

/* ------------------------------------------------------------------ */
/* Tấm trượt (modal sheet)                                             */
/* ------------------------------------------------------------------ */

export function Sheet({ title, onClose, centered, children }: {
  title: string;
  onClose: () => void;
  centered?: boolean;
  children: ReactNode;
}) {
  const { t } = useChu();
  return (
    <div className={`modal-overlay${centered ? " centered" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <button className="modal-scrim" aria-label={t("close")} onClick={onClose} />
      <section className="modal-sheet">
        <button className="modal-close" aria-label={t("close")} onClick={onClose}><span><Icon name="close" /></span></button>
        {children}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Thanh trên                                                          */
/* ------------------------------------------------------------------ */

export function TopBar({ ten, chuaDoc, onProfile, onNotif, onMenu }: {
  ten: string;
  chuaDoc: number;
  onProfile: () => void;
  onNotif: () => void;
  onMenu: () => void;
}) {
  const { t } = useChu();
  return (
    <header className="top-bar">
      <button className="profile-chip" onClick={onProfile}>
        <span className="avatar-circle"><Image unoptimized src={IMG.avatar} alt="" width={34} height={34} /></span>
        <span className="profile-name">{ten}<Icon name="chevDown" /></span>
      </button>
      <div className="top-actions">
        <button className="icon-btn" aria-label={`${t("notif_title")}${chuaDoc > 0 ? ` (${chuaDoc})` : ""}`} onClick={onNotif}>
          <Icon name="bell" />
          {chuaDoc > 0 && <span className="dot" />}
        </button>
        <button className="icon-btn" aria-label={t("menu_title")} onClick={onMenu}><Icon name="menu" /></button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Nav dưới                                                            */
/* ------------------------------------------------------------------ */

export type ManChinh = "home" | "devices" | "automation" | "services" | "discover";

const NAV: Array<{ k: ManChinh; icon: string; img?: string; nhan: string }> = [
  { k: "home", icon: "home2", nhan: "nav_home" },
  { k: "devices", icon: "devices2", img: IMG.navCpu, nhan: "nav_devices" },
  { k: "automation", icon: "bolt", img: IMG.navBrain, nhan: "nav_automation" },
  { k: "services", icon: "lifebuoy", img: IMG.navHeadset, nhan: "nav_services" },
  { k: "discover", icon: "compass", img: IMG.navGlobe, nhan: "nav_discover" },
];

export function BottomNav({ active, onChon }: { active: ManChinh; onChon: (man: ManChinh) => void }) {
  const { t } = useChu();
  return (
    <nav className="bottom-nav">
      {NAV.map(muc => (
        <button
          key={muc.k}
          className={`bn-item${active === muc.k ? " active" : ""}`}
          aria-current={active === muc.k ? "page" : undefined}
          onClick={() => onChon(muc.k)}
        >
          <span className="bn-icon-wrap">
            {muc.img ? <Image unoptimized src={muc.img} alt="" width={21} height={21} /> : <Icon name={muc.icon} />}
          </span>
          <span>{t(muc.nhan)}</span>
        </button>
      ))}
    </nav>
  );
}
