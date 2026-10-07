"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { AppData } from "@/lib/types";
import { iotxClient, isIotxMode } from "@/lib/iotx";
import { useTacVu } from "@/hooks/useTacVu";
import { Modal } from "./chung";
import { useChu } from "@/components/newui/chu";

type LoaiKhongGian = keyof AppData["spaces"];

const KHOA_NHAN: Record<LoaiKhongGian, string> = { houses: "loc_nha", rooms: "loc_phong", groups: "loc_nhom" };
const LOAI_API = { houses: "house", rooms: "room", groups: "grp" } as const;
const BIEU_TUONG: Record<LoaiKhongGian, string> = { houses: "🏠", rooms: "🚪", groups: "◉" };

/** Quản lý Nhà / Phòng / Nhóm — `POST/DELETE /categories`. */
export function Spaces({ data, setData, onClose }: { data: AppData; setData: Dispatch<SetStateAction<AppData>>; onClose: () => void }) {
  const { t } = useChu();
  const [kind, setKind] = useState<LoaiKhongGian>("houses");
  const [name, setName] = useState("");
  const [hoiXoa, setHoiXoa] = useState<string | null>(null);
  // Lỗi máy chủ phải hiện ra: trước đây lời gọi bị nuốt thành unhandled rejection và
  // người dùng bấm "Tạo" mà không thấy gì xảy ra.
  const { loi, chay } = useTacVu();

  async function add() {
    const value = name.trim();
    if (!value || data.spaces[kind].includes(value)) return;
    await chay(async () => {
      if (isIotxMode) await iotxClient.createCategory({ kind: LOAI_API[kind], name: value });
      setData(current => ({ ...current, spaces: { ...current.spaces, [kind]: [...current.spaces[kind], value] } }));
      setName("");
    });
  }

  async function remove(item: string) {
    await chay(async () => {
      if (isIotxMode) await iotxClient.deleteCategory(LOAI_API[kind], item);
      setData(current => ({ ...current, spaces: { ...current.spaces, [kind]: current.spaces[kind].filter(value => value !== item) } }));
    });
  }

  return (
    <Modal title={t("spaces.title")} onClose={onClose} wide>
      <div className="segment three">
        {(Object.keys(KHOA_NHAN) as LoaiKhongGian[]).map(key => (
          <button key={key} className={kind === key ? "active" : ""} onClick={() => setKind(key)}>{t(KHOA_NHAN[key])}</button>
        ))}
      </div>
      <div className="space-list">
        {data.spaces[kind].map(item => (
          <div className="space-row" key={item}>
            <span className="space-icon">{BIEU_TUONG[kind]}</span>
            <strong>{item}</strong>
            {hoiXoa === item
              ? <button className="go-that" onClick={() => { setHoiXoa(null); void remove(item); }}>{t("confirm_delete")}</button>
              : <button aria-label={t("auto_delete")} onClick={() => setHoiXoa(item)}><Trash2 /></button>}
          </div>
        ))}
      </div>
      <div className="inline-form">
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t("spaces.newPh", { loai: t(KHOA_NHAN[kind]).toLowerCase() })} />
        <button onClick={() => { void add(); }}><Plus /> {t("common.create")}</button>
      </div>
      {loi && <p className="form-message">{loi}</p>}
      <p className="hint">{t("spaces.syncNote")}</p>
    </Modal>
  );
}
