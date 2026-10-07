"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useChu } from "@/components/newui/chu";

/**
 * Khung dùng chung của các màn quản lý (không gian, chia sẻ, thêm thiết bị). Các màn này
 * dựng trước khi đổi giao diện và đã nối API thật, nên được giữ lại và mở từ menu; phần
 * hình thức đi theo bảng màu mới qua `app/globals.css`.
 */

export const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export function IconButton({ label, children, onClick, className }: { label: string; children: ReactNode; onClick: () => void; className?: string }) {
  return <button className={cn("icon-button", className)} aria-label={label} onClick={onClick}>{children}</button>;
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const { t } = useChu();
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button className="modal-scrim" aria-label={t("close")} onClick={onClose} />
      <section className={cn("modal-card", wide && "modal-wide")}>
        <header className="modal-head"><h2>{title}</h2><IconButton label={t("close")} onClick={onClose}><X /></IconButton></header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
