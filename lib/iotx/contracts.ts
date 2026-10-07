export type IotxTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tenant?: string;
};

export type IotxTheme = {
  tenant: string;
  tenantName?: string;
  colorPrimary?: string;
  logoUrl?: string | null;
  quotas?: { rules?: number; devices?: number };
  aiEnabled?: boolean;
  loginMethods?: { eu?: string[]; staff?: string[] };
};

export type IotxProfile = {
  email: string;
  tenant: string;
  tenantName: string;
  theme: IotxTheme;
  tbCustomerId: string;
};

export type IotxPermission = { control?: boolean; create?: boolean; delete?: boolean };

export type IotxCapability = {
  key: string;
  kind: "onoff" | "level" | "enum" | "sensor" | "list";
  label: string;
  rpc?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  unitSpace?: boolean;
  values?: string[];
  labels?: Record<string, string>;
  [key: string]: unknown;
};

export type IotxProduct = {
  nameVi: string;
  nameEn?: string;
  category: string;
  icon: string;
  productGroup?: string | null;
  ui?: {
    renderer?: string;
    archetype?: string;
    skin?: string;
    controls?: string[];
    gauges?: string[];
    image?: string;
    uuTien?: string[];
    slots?: Record<string, {
      nhom?: "hero" | "status" | "secondary" | "alarm" | "lock" | string;
      co?: number;
      variant?: string;
      /**
       * Hợp đồng để ô slot mở (`additionalProperties: true`), nên máy chủ có thể kèm thêm
       * trường. `keoTheo` là một trong số đó: bật khối này thì đặt luôn khối kia (ví dụ
       * Boost bật thì đẩy mức lên `max`). Không gửi thì không có hành vi gì thêm.
       */
      keoTheo?: Array<{ key: string; giaTri: "max" | "min" | number }>;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  } | null;
  /** `tatCap` liệt kê KEY capability bị loại khỏi hẹn giờ (spec: cùng miền với `capChoPhep`). */
  henGio?: { bat?: boolean; tatCap?: string[] };
  codec?: Record<string, unknown>;
  capabilities: IotxCapability[];
  telemetry: string[];
  version: number;
  /**
   * `SanPham` mở (`additionalProperties: true`) — máy chủ có thể đính thêm dữ liệu vào đây.
   * Hiện app đọc `tinhNang`/`features`: danh mục tính năng nâng cao, dạng phẳng hoặc tách
   * theo ngôn ngữ. Hợp đồng KHÔNG có endpoint riêng cho danh mục này.
   */
  [key: string]: unknown;
};

export type IotxDevice = {
  id: string;
  name: string;
  type: string;
  product?: IotxProduct | null;
  label: string;
  house: string;
  room: string;
  grp: string;
  fav: boolean;
  hidden: boolean;
  active: boolean;
  createdTime: number;
  lastValues: Record<string, unknown>;
  shared: boolean;
  perms: IotxPermission;
  virtual?: boolean;
  virtualKind?: "external" | "state" | "button";
  place?: string | null;
};

export type IotxCategory = { kind: "house" | "room" | "grp"; name: string };

export type IotxBootstrap = {
  devices: IotxDevice[];
  categories: IotxCategory[];
  me: IotxProfile;
  unread: number;
  phienBan: { i18n: string; products: string; theme: string };
};

export type IotxNotification = {
  id: number;
  type: string;
  title: string;
  body?: string | null;
  read: boolean;
  created_at: string;
};

/**
 * Một hàng /shares. Nhánh "granted" dùng snake_case (member_email, scope_ref) còn nhánh
 * "receivedFromOthers" dùng camelCase (ownerEmail, scopeRef) — hợp đồng là vậy, nên kiểu
 * này gộp cả hai và phần đọc tự chọn trường nào có.
 */
export type IotxShare = {
  id: number;
  member_email?: string;
  /** null = người nhận chưa đăng nhập lần nào (lời mời còn treo). */
  member_sub?: string | null;
  email?: string;
  ownerEmail?: string;
  house: string;
  scope: string;
  scope_ref?: string;
  scopeRef?: string;
  perms?: IotxPermission;
  created_at?: string;
};

export type IotxShares = {
  granted: IotxShare[];
  receivedFromOthers: IotxShare[];
};

export type IotxRule = IotxRuleInput & {
  id: number;
  name: string;
  enabled?: boolean;
  status?: string;
};

/**
 * Nhóm "Từ thiết bị" của GET /rules — chỉ đọc, hình dạng khác hẳn một luật thường:
 * đây là chương trình hẹn giờ đang dùng của từng thiết bị, sửa thì về màn thiết bị.
 * Các bản ghi này KHÔNG tính vào trần 20 luật mỗi người.
 */
export type IotxLuatTuThietBi = {
  deviceId: string;
  tenThietBi: string;
  tenCT: string;
  trangThai: "dang_chay" | "dang_dung";
};

export type IotxRules = {
  rules: IotxRule[];
  tuThietBi: IotxLuatTuThietBi[];
};

export type IotxRuleCondition = {
  type?: "device" | "time";
  deviceId?: string;
  key?: string;
  op?: "gt" | "lt" | "eq" | "neq";
  value?: unknown;
  from?: string;
  to?: string;
  days?: number[];
  conn?: "and" | "or";
};

export type IotxRuleAction = {
  deviceId?: string;
  method?: string;
  params?: Record<string, unknown>;
  delaySec?: number;
  notify?: string;
};

export type IotxRuleInput = {
  name: string;
  kind?: "cond" | "sched";
  conds?: IotxRuleCondition[];
  gates?: IotxRuleCondition[];
  exclusions?: IotxRuleCondition[];
  actions?: IotxRuleAction[];
  startsAt?: string | null;
  endsAt?: string | null;
  yieldSec?: number;
  holdSec?: number;
  cooldownSec?: number;
  shadow?: boolean;
  enabled?: boolean;
};

export type IotxStreamEvent = {
  deviceId: string;
  key: string;
  value: unknown;
  ts: number;
};

/** Một dòng trong kết quả POST /rules/simulate (hình dạng đo thật trên DEV). */
export type IotxMoPhongDong = {
  pass: boolean;
  conn?: "and" | "or";
  deviceId?: string;
  key?: string;
  op?: string;
  value?: unknown;
  current?: unknown;
  type?: "device" | "time";
  from?: string;
  to?: string;
  days?: number[];
};

export type IotxMoPhong = {
  conditions: IotxMoPhongDong[];
  gates: IotxMoPhongDong[];
  exclusions: IotxMoPhongDong[];
  willFire: boolean;
  /** Câu tiếng Việt do máy chủ soạn, ví dụ: điều kiện "Nếu" chưa đúng. Hiện thẳng lên màn. */
  why: string | null;
};

export type IotxLanChay = {
  at?: string;
  shadow?: boolean;
  detail?: Record<string, unknown>;
};

/* ---------------- hẹn giờ theo thiết bị ---------------- */

export type IotxBuocHenGio = {
  /** kieu='gio' → "HH:MM"; kieu='khoang' → phút thứ mấy (1..1440, tăng dần). */
  moc: string | number;
  hd: Array<{ cap: string; val: unknown }>;
};

export type IotxThanChuongTrinh = {
  ten: string;
  kieu: "gio" | "khoang";
  buoc: IotxBuocHenGio[];
  chay: "motlan" | "lap";
  /** 0=CN … 6=T7, bắt buộc ≥1 khi chay='lap'. */
  ngay?: number[];
  /** Bắt buộc khi kieu='khoang' và chay='lap'. */
  batDau?: string | null;
};

export type IotxChuongTrinhHenGio = IotxThanChuongTrinh & {
  id: number;
  /** Cap từng lưu trong bước nhưng đã bị thu hồi — app phải đeo cảnh báo. */
  capThuHoi: string[];
};

export type IotxHenGioTongQuan = {
  /** false = sản phẩm tắt hẹn giờ; app phải giấu hẳn màn này. */
  batDuoc: boolean;
  capChoPhep: string[];
  hen: { luc: number; bat: boolean } | null;
  dangDung: number | null;
  dangChay: { buocXong: number; tuLuc: number } | null;
  chuongTrinh: IotxChuongTrinhHenGio[];
};

/* ---------------- vật tư (capability kiểu list) ---------------- */

/** Một mục của capability `list`, đã gộp mạch + máy chủ. Hợp đồng để mở nên đọc phòng thủ. */
export type IotxMucVatTu = {
  id?: string;
  ten?: string;
  name?: string;
  sanPham?: string;
  serial?: string;
  xacThuc?: boolean;
  tuoiTho?: number;
  conLai?: number;
  phanTram?: number;
  nguon?: "server" | "mach";
  [key: string]: unknown;
};

export type IotxLenhVatTu = {
  kieu: "them" | "thay" | "tuoi" | "bo";
  id?: string;
  tuoiTho?: number;
  serial?: string;
  sanPham?: string;
  ten?: string;
};

export type IotxKieuAo = "external" | "state" | "button";

/** Một hàng của GET /virtual. Thiết bị ảo cũng nằm luôn trong /devices với virtual: true. */
export type IotxThietBiAo = {
  id: string;
  kind: IotxKieuAo;
  name: string;
  /** external: {place, lat, lon}; hai kiểu còn lại rỗng. */
  config?: Record<string, unknown>;
  /** external: temperature/humidity/aqi/…; state: {on}; button: {pressed, count}. */
  state?: Record<string, unknown>;
  updatedAt?: string | null;
  capabilities?: IotxCapability[];
};

export type IotxNoiChon = { key: string; name: string };
