import { MOCK_DEVICES, MOCK_SPACES } from "./newui/mockCatalog";
import type { Device, SpaceState } from "./types";

export type AppData = {
  devices: Device[];
  spaces: SpaceState;
};

export const defaultData: AppData = {
  devices: MOCK_DEVICES,
  spaces: MOCK_SPACES,
};

/**
 * Đổi khóa khi hình dạng dữ liệu mock thay đổi. Bản v5 tách bình nóng lạnh và quạt thành
 * hai dòng riêng, thêm máy hút mùi và nhà thứ hai; bản v4 lưu trong máy người dùng có
 * `group`/`house` cũ và thiếu capability của các loại mới, đọc lại sẽ cho ra màn trống —
 * nên phải để khóa riêng thay vì cố gộp.
 */
const KEY = "livotec-home-v5";

export function loadData(): AppData {
  try {
    const value = localStorage.getItem(KEY);
    if (!value) return defaultData;
    const stored = JSON.parse(value) as Partial<AppData>;
    // Thiết bị lưu trong localStorage không mang theo product (catalog đến từ máy chủ hoặc
    // từ mock), nên ghép lại product theo id để các màn điều khiển vẫn dựng được.
    const devices = Array.isArray(stored.devices)
      ? stored.devices.map(device => ({
        ...device,
        product: device.product ?? MOCK_DEVICES.find(mau => mau.id === device.id)?.product ?? null,
      }))
      : defaultData.devices;
    return { ...defaultData, ...stored, devices };
  } catch { return defaultData; }
}

export function saveData(data: AppData) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch { /* hết chỗ hoặc trình duyệt chặn: bỏ qua, app vẫn chạy trong phiên này */ }
}
