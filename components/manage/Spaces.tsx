"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { AppData } from "@/lib/types";
import { iotxClient, isIotxMode } from "@/lib/iotx";
import { useTacVu } from "@/hooks/useTacVu";
import { Modal } from "./chung";

type LoaiKhongGian = keyof AppData["spaces"];

const NHAN: Record<LoaiKhongGian, string> = { houses: "Nhà", rooms: "Phòng", groups: "Nhóm" };
const LOAI_API = { houses: "house", rooms: "room", groups: "grp" } as const;
const BIEU_TUONG: Record<LoaiKhongGian, string> = { houses: "🏠", rooms: "🚪", groups: "◉" };

/** Quản lý Nhà / Phòng / Nhóm — `POST/DELETE /categories`. */
export function Spaces({ data, setData, onClose }: { data: AppData; setData: Dispatch<SetStateAction<AppData>>; onClose: () => void }) {
  const [kind, setKind] = useState<LoaiKhongGian>("houses");
  const [name, setName] = useState("");
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
    <Modal title="Quản lý không gian" onClose={onClose} wide>
      <div className="segment three">
        {(Object.keys(NHAN) as LoaiKhongGian[]).map(key => (
          <button key={key} className={kind === key ? "active" : ""} onClick={() => setKind(key)}>{NHAN[key]}</button>
        ))}
      </div>
      <div className="space-list">
        {data.spaces[kind].map(item => (
          <div className="space-row" key={item}>
            <span className="space-icon">{BIEU_TUONG[kind]}</span>
            <strong>{item}</strong>
            <button aria-label="Xóa" onClick={() => { void remove(item); }}><Trash2 /></button>
          </div>
        ))}
      </div>
      <div className="inline-form">
        <input value={name} onChange={e => setName(e.target.value)} placeholder={`Tên ${NHAN[kind].toLowerCase()} mới`} />
        <button onClick={() => { void add(); }}><Plus /> Tạo</button>
      </div>
      {loi && <p className="form-message">{loi}</p>}
      <p className="hint">Không gian được đồng bộ với tài khoản Livotec của bạn.</p>
    </Modal>
  );
}
