import type { AppData, ChiaSeNhan, Device, SpaceState, UiNotification } from "@/lib/types";
import { capNguonCua } from "@/lib/newui/khuon";
import { dinhDangLuc } from "@/lib/newui/thoiGian";
import { laBat as asBoolean } from "./giaTri";
import type { IotxBootstrap, IotxCategory, IotxDevice, IotxNotification, IotxShare } from "./contracts";

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

/** Ghi đè vài giá trị cuối của một thiết bị và suy lại `on`/`speed` theo đúng `suyDanXuat`. */
export function apGiaTri(device: Device, patch: Record<string, unknown>): Device {
  const lastValues = { ...device.lastValues, ...patch };
  return { ...device, lastValues, ...suyDanXuat(lastValues, device.product, device.speed) };
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

function mapCategories(categories: IotxCategory[]): SpaceState {
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

/** Nhánh "receivedFromOthers" dùng camelCase và ownerEmail là NGƯỜI CHIA SẺ cho tôi. */
export function mapShareNhanDuoc(item: IotxShare): ChiaSeNhan {
  return {
    id: String(item.id),
    email: item.ownerEmail || item.email || item.member_email || "",
    house: item.house || "",
    scope: item.scope || "house",
    scopeRef: item.scopeRef || item.scope_ref || "",
    perms: item.perms,
  };
}

/** Nhánh "granted" dùng snake_case; member_sub rỗng nghĩa là người nhận chưa đăng nhập bao giờ. */
export function mapShareDaCap(item: IotxShare): ChiaSeNhan {
  return {
    id: String(item.id),
    email: item.member_email || item.email || item.ownerEmail || "",
    house: item.house || "",
    scope: item.scope || "house",
    scopeRef: item.scope_ref || item.scopeRef || "",
    perms: item.perms,
    choDangKy: !item.member_sub,
  };
}

function iconThongBao(type: string) {
  if (type === "error" || type === "alarm") return "flame";
  if (type === "success") return "checkCircle";
  if (type === "water") return "drop";
  return "bell";
}

export function mapNotification(item: IotxNotification): UiNotification {
  return {
    id: String(item.id),
    icon: iconThongBao(item.type),
    title: item.title,
    text: item.body || "",
    time: dinhDangLuc(item.created_at),
    unread: !item.read,
  };
}
