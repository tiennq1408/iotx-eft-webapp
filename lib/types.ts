import type { IotxPermission, IotxProduct } from "./iotx/contracts";

export type Device = {
  id: string;
  name: string;
  model: string;
  /** Mã in trên thân máy (prototype hiện dưới tên thiết bị). */
  code?: string;
  room: string;
  group: string;
  house: string;
  online: boolean;
  on: boolean;
  speed: number;
  /** Ghim thiết bị — đồng bộ với `PATCH /devices/{id} { fav }`. */
  fav?: boolean;
  product?: IotxProduct | null;
  lastValues?: Record<string, unknown>;
  perms?: IotxPermission;
  shared?: boolean;
  virtual?: boolean;
  /** Đã ẩn khỏi danh sách (`PATCH /devices/{id} { hidden }`) — vẫn ghép nối, chỉ không hiện. */
  hidden?: boolean;
};

export type SpaceState = { houses: string[]; rooms: string[]; groups: string[] };

export type AppData = {
  devices: Device[];
  spaces: SpaceState;
};

export type UiNotification = { id: string; icon: string; title: string; text: string; time: string; unread: boolean };

export type ChiaSeNhan = {
  id: string;
  email: string;
  house: string;
  scope: string;
  scopeRef: string;
  perms?: IotxPermission;
  /** Chỉ có ở chia sẻ mình cấp: người nhận chưa đăng ký nên lời mời còn treo. */
  choDangKy?: boolean;
};
