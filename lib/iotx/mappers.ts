import type { AppData } from "@/lib/storage";
import type { Device, SpaceState } from "@/lib/types";
import { capNguonCua } from "@/lib/newui/khuon";
import { laBat as asBoolean } from "./giaTri";
import type { IotxBootstrap, IotxCategory, IotxDevice } from "./contracts";

/**
 * Tính lại các trường dẫn xuất (`on`, `speed`) từ bộ giá trị cuối.
 *
 * Tách riêng vì có HAI đường dữ liệu vào: `/bootstrap`+`/devices`, và từng sự kiện SSE
 * `trang-thai`. Trước đây mỗi đường tự suy một kiểu, và đường SSE chỉ nhận khóa `power`
 * — nên thiết bị dùng khóa `ac_power_status` bật ở nơi khác thì app này không đổi trạng
 * thái cho tới lần tải lại trang.
 */
export function suyDanXuat(
  lastValues: Record<string, unknown>,
  product: IotxDevice["product"],
  speedCu = 0,
): { on: boolean; speed: number } {
  const khoaNguon = capNguonCua(product)?.key ?? "";
  const speed = Number(lastValues.speed ?? lastValues.curSpeed);
  return {
    on: asBoolean(lastValues[khoaNguon] ?? lastValues.power ?? lastValues.on),
    speed: Number.isFinite(speed) ? speed : speedCu,
  };
}

export function mapIotxDevice(device: IotxDevice): Device {
  return {
    id: device.id,
    name: device.label || device.name,
    model: device.type,
    code: device.name,
    house: device.house,
    room: device.room,
    group: device.grp,
    online: device.active,
    ...suyDanXuat(device.lastValues, device.product),
    fav: Boolean(device.fav),
    product: device.product,
    lastValues: device.lastValues,
    perms: device.perms,
    shared: device.shared,
    virtual: device.virtual,
  };
}

export function mapCategories(categories: IotxCategory[]): SpaceState {
  return {
    houses: categories.filter(item => item.kind === "house").map(item => item.name),
    rooms: categories.filter(item => item.kind === "room").map(item => item.name),
    groups: categories.filter(item => item.kind === "grp").map(item => item.name),
  };
}

export function mergeBootstrap(current: AppData, bootstrap: IotxBootstrap): AppData {
  return {
    ...current,
    devices: bootstrap.devices.filter(device => !device.hidden).map(mapIotxDevice),
    spaces: mapCategories(bootstrap.categories),
  };
}
