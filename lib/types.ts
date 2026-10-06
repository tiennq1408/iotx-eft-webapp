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
};

export type SpaceState = { houses: string[]; rooms: string[]; groups: string[] };
