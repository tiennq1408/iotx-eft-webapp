"use client";
import { useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { useChu } from "./ui/chu";

type SuKienCai = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * Sự kiện `beforeinstallprompt` của Chrome (docs/viec-pwa.md 2.5) bắt ở cấp MODULE, không phải
 * trong component như mẫu ở doc: nút nằm trong menu tài khoản, mà menu chỉ dựng lúc mở — Chrome
 * bắn sự kiện ngay khi tải trang, đợi menu mở mới nghe là đã lỡ, nút không bao giờ hiện.
 */
let suKien: SuKienCai | null = null;
const nguoiNghe = new Set<() => void>();
const bao = () => nguoiNghe.forEach(f => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); suKien = e as SuKienCai; bao(); });
  window.addEventListener("appinstalled", () => { suKien = null; bao(); });
}

function useSuKienCai(): SuKienCai | null {
  return useSyncExternalStore(
    f => { nguoiNghe.add(f); return () => { nguoiNghe.delete(f); }; },
    () => suKien,
    () => null,
  );
}

/** Dòng "Cài ứng dụng" trong menu tài khoản. Không có sự kiện (iPhone, Firefox, đã cài) thì không hiện gì. */
export default function NutCaiApp() {
  const { t } = useChu();
  const sk = useSuKienCai();
  if (!sk) return null;
  return (
    <button className="drawer-item" onClick={async () => {
      // Lời mời chỉ dùng được một lần, chọn gì cũng bỏ.
      await sk.prompt();
      suKien = null; bao();
    }}>
      <span className="emo" aria-hidden="true"><Download /></span>
      <span className="menu-nhan">{t("menu_cai_app")}</span>
    </button>
  );
}
