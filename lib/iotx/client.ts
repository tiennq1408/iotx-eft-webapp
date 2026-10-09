import { iotxConfig } from "./config";
import { docEtag, ghiEtag, xoaCacheNguoiDung } from "./cache";
import { IotxApiError } from "./errors";
import type {
  IotxBootstrap, IotxCategory, IotxNotification, IotxProduct,
  IotxKieuAo, IotxLanChay, IotxMoPhong, IotxNoiChon, IotxRuleCondition, IotxRuleInput,
  IotxHenGioTongQuan, IotxLenhVatTu, IotxThanChuongTrinh,
  IotxPermission, IotxRules, IotxShares, IotxThietBiAo,
  IotxStreamEvent, IotxTheme, IotxTokenSet,
} from "./contracts";

const TOKEN_KEY = "livotec-iotx-session";

/**
 * Cửa gửi mã đặt lại mật khẩu — CHỜ IBS. Tới 08/10/2026 `/v1` chưa có cửa này (openapi) và
 * SMTP trong sadmin đang tắt. IBS mở cửa thì điền đường dẫn vào đây — chỉ sửa một chỗ.
 */
const CUA_QUEN_MAT_KHAU: string | null = null;
/** `message` của lỗi khi cửa quên mật khẩu chưa bật — màn đăng nhập dựa vào đây để nói rõ. */
export const QUEN_MAT_KHAU_CHUA_BAT = "quen_mat_khau_chua_bat";

/**
 * Cửa đăng nhập Google — CHỜ IBS. Tới 08/10/2026 `/v1` chưa có cửa này; tài liệu IoTX ghi
 * Google SSO "chờ creds + luồng redirect" và sadmin đang tắt. App không được gọi thẳng Keycloak,
 * nên phải đợi IBS mở cửa trong `/v1/auth/*`. Có cửa thì điền đường dẫn vào đây và viết luồng.
 */
const CUA_DANG_NHAP_GOOGLE: string | null = null;
/** `message` của lỗi khi đăng nhập Google chưa bật. */
export const GOOGLE_CHUA_BAT = "google_chua_bat";

/**
 * Cửa đổi mật khẩu khi đã đăng nhập — CHỜ IBS. Tới 09/10/2026 `/v1` chưa có cửa này (openapi
 * chỉ có `/auth/login|register|refresh`). IBS mở cửa thì điền đường dẫn vào đây — chỉ sửa một chỗ.
 */
const CUA_DOI_MAT_KHAU: string | null = null;
/** `message` của lỗi khi cửa đổi mật khẩu chưa bật. */
export const DOI_MAT_KHAU_CHUA_BAT = "doi_mat_khau_chua_bat";

/**
 * Sửa hồ sơ (tên hiển thị, ảnh đại diện) — CHỜ IBS. Tới 09/10/2026 `/v1` chỉ có `GET /me`,
 * trả email/tenant, không có tên hay ảnh, cũng không có cửa ghi. IBS mở cửa thì điền đường
 * dẫn vào hai hằng dưới — chỉ sửa một chỗ.
 */
const CUA_DOI_TEN: string | null = null;
const CUA_DOI_ANH_DAI_DIEN: string | null = null;
/** `message` của lỗi khi cửa sửa hồ sơ chưa bật. */
export const HO_SO_CHUA_BAT = "ho_so_chua_bat";

/** Thân `{ ok: true }` mà hầu hết cửa ghi trả về, kèm vài trường riêng của từng cửa. */
type Ok<T = object> = { ok: true } & T;

export type TokenStore = {
  get(): IotxTokenSet | null;
  set(tokens: IotxTokenSet): void;
  clear(): void;
};

export const browserTokenStore: TokenStore = {
  get() {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null") as IotxTokenSet | null; }
    catch { return null; }
  },
  set(tokens) { if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens)); },
  clear() { if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY); },
};

type RequestOptions = Omit<RequestInit, "body"> & {
  auth?: boolean;
  body?: unknown;
  retryAuth?: boolean;
  /**
   * Bật ETag cho cửa đọc này. Có khóa thì request gửi kèm `If-None-Match`; máy chủ trả
   * `304` nghĩa là dữ liệu chưa đổi và app dùng lại bản đang giữ — đúng quy ước hợp đồng
   * ("304: dữ liệu không thay đổi; giữ cache hiện tại").
   */
  etagKey?: string;
};

const STREAM_IM_LANG_MS = 35_000;

/**
 * Hợp đồng: nhịp giữ kết nối tối đa mỗi 30 giây. Quá hạn mà luồng vẫn im lặng nghĩa là
 * kết nối đã chết trong im lặng — phải ném lỗi để nối lại, thay vì treo vô hạn.
 * Hẹn giờ luôn được dọn để không rò rỉ timer qua mỗi khung đọc.
 */
function choDocCoHanGio<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hanGio = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new IotxApiError(0, "stream_im_lang")), ms);
  });
  return Promise.race([promise, hanGio]).finally(() => clearTimeout(timer));
}

export class IotxClient {
  constructor(
    private readonly baseUrl = iotxConfig.apiBase,
    private readonly tokens: TokenStore = browserTokenStore,
  ) {}

  /** Lần làm mới đang bay — mọi request cùng gặp 401 đợi chung nó, không mỗi cái tự refresh. */
  private dangLamMoi: Promise<boolean> | null = null;
  /**
   * Thế hệ phiên: tăng mỗi lần đăng nhập và mỗi lần phiên kết thúc. Request bắt đầu ở thế hệ
   * cũ mà về sau đó thì bị bỏ — không ghi token, không ghi ETag. Nếu không, một lần refresh
   * hay một `/bootstrap` đang bay lúc đăng xuất sẽ ghi lại token (tải lại trang là tự đăng
   * nhập lại) hoặc email và thiết bị của người vừa rời đi.
   */
  private theHe = 0;
  private readonly nguoiNgheHetPhien = new Set<() => void>();

  /**
   * Báo khi phiên kết thúc — người dùng đăng xuất, hoặc phiên chết hẳn (refresh cũng hỏng).
   * Token bị xoá ở tầng này, nên nếu không có kênh báo thì giao diện vẫn tưởng còn đăng nhập
   * và cứ thế hỏi máy chủ không kèm token.
   */
  onHetPhien(nghe: () => void) {
    this.nguoiNgheHetPhien.add(nghe);
    return () => { this.nguoiNgheHetPhien.delete(nghe); };
  }

  private hetPhien() {
    // Đã hết phiên rồi thì chỉ dọn lại cho chắc, không báo lần nữa: một 401 có thể đi qua
    // client, luồng SSE và hook — mỗi nơi gọi một lần.
    const conPhien = this.tokens.get() !== null;
    this.theHe++;
    this.tokens.clear();
    xoaCacheNguoiDung();
    if (conPhien) for (const nghe of this.nguoiNgheHetPhien) nghe();
  }

  /** Request bắt đầu ở thế hệ `theHe` mà phiên đã đổi — bỏ kết quả của nó. */
  private kiemTheHe(theHe: number) {
    if (theHe !== this.theHe) throw new IotxApiError(0, "phien_da_doi");
  }

  /**
   * Làm mới token sau một 401 — đúng một lần dù bao nhiêu request cùng hỏng.
   *
   * `daDung` là access token mà request vừa hỏng đã gửi. Nếu kho đã có token KHÁC thì một
   * request khác vừa làm mới xong: chỉ cần gửi lại. Gọi refresh lần nữa bằng refresh token
   * đã bị xoay vòng thì máy chủ từ chối, và lần hỏng đó sẽ xoá mất token vừa có.
   */
  private async lamMoiSau401(daDung: string | undefined): Promise<boolean> {
    const hienTai = this.tokens.get();
    if (hienTai?.accessToken && hienTai.accessToken !== daDung) return true;
    if (!this.dangLamMoi) {
      const refreshToken = hienTai?.refreshToken;
      this.dangLamMoi = (refreshToken ? this.refresh(refreshToken).then(() => true, () => false) : Promise.resolve(false))
        .then(ok => { if (!ok) this.hetPhien(); return ok; })
        .finally(() => { this.dangLamMoi = null; });
    }
    return this.dangLamMoi;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { auth = true, body, retryAuth = true, etagKey, headers: suppliedHeaders, ...init } = options;
    const theHe = this.theHe;
    const headers = new Headers(suppliedHeaders);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const tokenSet = this.tokens.get();
    if (auth && tokenSet?.accessToken) headers.set("Authorization", `Bearer ${tokenSet.accessToken}`);
    const dangGiu = etagKey ? docEtag(etagKey) : null;
    if (dangGiu) headers.set("If-None-Match", dangGiu.etag);

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.kiemTheHe(theHe);

    if (response.status === 401 && auth && tokenSet) {
      if (retryAuth && await this.lamMoiSau401(tokenSet.accessToken)) return this.request<T>(path, { ...options, retryAuth: false });
      // Token vừa làm mới mà vẫn bị từ chối (phiên bị thu hồi, lệch đồng hồ): làm mới tiếp chỉ
      // thành vòng `/auth/refresh` mỗi nhịp hỏi lại. Đúng luật: refresh một lần rồi thôi.
      if (!retryAuth) this.hetPhien();
    }

    // 304 không có thân; dùng lại bản đang giữ. Mất cache mà vẫn nhận 304 thì phải hỏi lại
    // không kèm If-None-Match, chứ trả undefined ra ngoài là app trắng dữ liệu.
    if (response.status === 304) {
      if (dangGiu) return dangGiu.data as T;
      return this.request<T>(path, { ...options, etagKey: undefined });
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      throw new IotxApiError(response.status, payload?.message || `HTTP ${response.status}`, payload);
    }

    if (response.status === 204) return undefined as T;
    const ketQua = await response.json() as T;
    this.kiemTheHe(theHe);
    const etag = response.headers.get("ETag");
    if (etagKey && etag) ghiEtag(etagKey, etag, ketQua);
    return ketQua;
  }

  async theme() {
    return this.request<IotxTheme>(`/tenant/theme?tenant=${encodeURIComponent(iotxConfig.tenant)}`, { auth: false, etagKey: `theme:${iotxConfig.tenant}` });
  }

  async i18n(lang = iotxConfig.lang) {
    return this.request<{ lang: string; langs: string[]; strings: Record<string, string> }>(`/i18n?lang=${encodeURIComponent(lang)}&tenant=${encodeURIComponent(iotxConfig.tenant)}`, { auth: false, etagKey: `i18n:${iotxConfig.tenant}:${lang}` });
  }

  async login(email: string, password: string) {
    const result = await this.request<IotxTokenSet>("/auth/login", { method: "POST", auth: false, body: { tenant: iotxConfig.tenant, email, password } });
    this.theHe++;
    this.tokens.set(result);
    return result;
  }

  async register(email: string, password: string, fullName?: string) {
    const result = await this.request<IotxTokenSet>("/auth/register", { method: "POST", auth: false, body: { tenant: iotxConfig.tenant, email, password, fullName } });
    this.theHe++;
    this.tokens.set(result);
    return result;
  }

  async refresh(refreshToken: string) {
    const previous = this.tokens.get();
    const result = await this.request<IotxTokenSet>("/auth/refresh", { method: "POST", auth: false, retryAuth: false, body: { refreshToken } });
    this.tokens.set({ ...result, tenant: result.tenant || previous?.tenant || iotxConfig.tenant });
    return result;
  }

  logout() { this.hetPhien(); }

  /** Gửi mã đặt lại mật khẩu tới email/SĐT. Chưa có cửa thì ném lỗi `QUEN_MAT_KHAU_CHUA_BAT`. */
  guiMaQuenMatKhau(dinhDanh: string) {
    if (!CUA_QUEN_MAT_KHAU) return Promise.reject(new IotxApiError(0, QUEN_MAT_KHAU_CHUA_BAT));
    return this.request<Ok>(CUA_QUEN_MAT_KHAU, { method: "POST", auth: false, body: { tenant: iotxConfig.tenant, dinhDanh } });
  }
  /** Đổi mật khẩu của người đang đăng nhập. Chưa có cửa thì ném lỗi `DOI_MAT_KHAU_CHUA_BAT`. */
  doiMatKhau(matKhauCu: string, matKhauMoi: string) {
    if (!CUA_DOI_MAT_KHAU) return Promise.reject(new IotxApiError(0, DOI_MAT_KHAU_CHUA_BAT));
    return this.request<Ok>(CUA_DOI_MAT_KHAU, { method: "POST", body: { matKhauCu, matKhauMoi } });
  }
  /** Đổi tên hiển thị. Chưa có cửa thì ném lỗi `HO_SO_CHUA_BAT`. */
  doiTen(ten: string) {
    if (!CUA_DOI_TEN) return Promise.reject(new IotxApiError(0, HO_SO_CHUA_BAT));
    return this.request<Ok>(CUA_DOI_TEN, { method: "PATCH", body: { ten } });
  }
  /** Đổi ảnh đại diện. Chưa có cửa thì ném lỗi `HO_SO_CHUA_BAT`; hợp đồng tải tệp do IBS chốt khi mở cửa. */
  doiAnhDaiDien(anh: File): Promise<Ok> {
    if (!CUA_DOI_ANH_DAI_DIEN) return Promise.reject(new IotxApiError(0, HO_SO_CHUA_BAT));
    return Promise.reject(new Error(`Chưa viết luồng tải ảnh ${anh.name} lên ${CUA_DOI_ANH_DAI_DIEN}`));
  }
  /** Đăng nhập bằng Google. Chưa có cửa thì ném lỗi `GOOGLE_CHUA_BAT`. */
  dangNhapGoogle(): Promise<void> {
    // Có cửa rồi thì viết luồng redirect theo hợp đồng IBS ở đây; tới lúc đó luôn báo chưa bật.
    if (CUA_DANG_NHAP_GOOGLE === null) return Promise.reject(new IotxApiError(0, GOOGLE_CHUA_BAT));
    throw new Error(`Chưa viết luồng đăng nhập Google cho ${CUA_DANG_NHAP_GOOGLE}`);
  }
  bootstrap(lang = iotxConfig.lang) { return this.request<IotxBootstrap>(`/bootstrap?lang=${encodeURIComponent(lang)}`, { etagKey: `bootstrap:${lang}` }); }
  products(lang = iotxConfig.lang) { return this.request<Record<string, IotxProduct>>(`/products?lang=${encodeURIComponent(lang)}&tenant=${encodeURIComponent(iotxConfig.tenant)}`, { auth: false, etagKey: `products:${iotxConfig.tenant}:${lang}` }); }
  notifications() { return this.request<{ unread: number; items: IotxNotification[] }>("/notifications"); }
  shares() { return this.request<IotxShares>("/shares"); }
  rules() { return this.request<IotxRules>("/rules"); }

  claim(name: string, secret: string) {
    return this.request<Ok<{ id: string; name: string; type: string }>>("/claim", { method: "POST", body: { name, secret } });
  }

  claimBoard(serial: string) {
    return this.request<Ok<{ id: string; name: string; type: string; dangNoi: boolean }>>("/claim-mach-that", { method: "POST", body: { serial } });
  }

  updateDevice(id: string, patch: { label?: string; house?: string; room?: string; grp?: string; fav?: boolean; hidden?: boolean }) {
    return this.request<Ok>(`/devices/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });
  }

  rpc(id: string, method: string, params: Record<string, unknown>, idempotencyKey = crypto.randomUUID()) {
    return this.request<{ ok: boolean; replayed?: boolean }>(`/devices/${encodeURIComponent(id)}/rpc`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: { method, params },
    });
  }

  /** Lệnh trên MỘT mục của capability kiểu `list` (lõi lọc, vật tư…). */
  lenhMucVatTu(id: string, cap: string, lenh: IotxLenhVatTu) {
    return this.request<Ok<{ nguon?: "server" | "mach"; id?: string; xacThuc?: boolean }>>(
      `/devices/${encodeURIComponent(id)}/muc/${encodeURIComponent(cap)}`,
      { method: "POST", body: lenh },
    );
  }

  /* ---------------- hẹn giờ theo thiết bị ---------------- */
  /** `batDuoc=false` nghĩa là sản phẩm tắt hẹn giờ — app phải giấu hẳn màn này. */
  xemHenGio(id: string) { return this.request<IotxHenGioTongQuan>(`/devices/${encodeURIComponent(id)}/hen-gio`); }
  /** Gửi `bat` kèm ĐÚNG MỘT trong `phut` (1..720) hoặc `luc` ("HH:MM"). */
  datHenGio(id: string, than: { bat: boolean; phut?: number; luc?: string }) {
    return this.request<Ok<{ hen: { luc: number; bat: boolean } }>>(`/devices/${encodeURIComponent(id)}/hen-gio/hen`, { method: "PUT", body: than });
  }
  huyHenGio(id: string) { return this.request<Ok>(`/devices/${encodeURIComponent(id)}/hen-gio/hen`, { method: "DELETE" }); }
  taoChuongTrinh(id: string, than: IotxThanChuongTrinh) {
    return this.request<Ok<{ id: number }>>(`/devices/${encodeURIComponent(id)}/hen-gio/chuong-trinh`, { method: "POST", body: than });
  }
  suaChuongTrinh(id: string, ctId: number, than: IotxThanChuongTrinh) {
    return this.request<Ok>(`/devices/${encodeURIComponent(id)}/hen-gio/chuong-trinh/${ctId}`, { method: "PUT", body: than });
  }
  xoaChuongTrinh(id: string, ctId: number) {
    return this.request<Ok>(`/devices/${encodeURIComponent(id)}/hen-gio/chuong-trinh/${ctId}`, { method: "DELETE" });
  }
  /** Kích hoạt một chương trình — mỗi thiết bị chỉ một chương trình đang dùng. */
  dungChuongTrinhNay(id: string, ctId: number) {
    return this.request<Ok>(`/devices/${encodeURIComponent(id)}/hen-gio/chuong-trinh/${ctId}/dung`, { method: "POST" });
  }
  thoiDungChuongTrinh(id: string) {
    return this.request<Ok>(`/devices/${encodeURIComponent(id)}/hen-gio/dang-dung`, { method: "DELETE" });
  }

  createCategory(category: IotxCategory) { return this.request<Ok>("/categories", { method: "POST", body: category }); }
  deleteCategory(kind: IotxCategory["kind"], name: string) { return this.request<Ok>(`/categories/${kind}/${encodeURIComponent(name)}`, { method: "DELETE" }); }
  createShare(input: { email: string; house: string; scope?: string; scopeRef?: string; perms?: IotxPermission }) {
    return this.request<Ok<{ id: number; pending: boolean }>>("/shares", { method: "POST", body: input });
  }
  /** Siết/nới quyền một chia sẻ đã cấp. Máy chủ trả về quyền SAU KHI ghép, nên lấy theo đó. */
  suaQuyenChiaSe(id: number | string, perms: IotxPermission) {
    return this.request<Ok<{ perms: IotxPermission }>>(`/shares/${encodeURIComponent(String(id))}`, { method: "PATCH", body: { perms } });
  }
  deleteShare(id: number | string) { return this.request<Ok>(`/shares/${encodeURIComponent(String(id))}`, { method: "DELETE" }); }
  readNotifications(id?: number) { return this.request<Ok>("/notifications/read", { method: "POST", body: id === undefined ? {} : { id } }); }
  deleteNotification(id: number | string) { return this.request<Ok>(`/notifications/${encodeURIComponent(String(id))}`, { method: "DELETE" }); }
  /** Luật mới LUÔN ở chế độ chạy thử (hợp đồng); lên thật đi qua `updateRule({ shadow: false })`. */
  createRule(rule: Omit<IotxRuleInput, "shadow">) { return this.request<Ok<{ id: number; shadow: boolean }>>("/rules", { method: "POST", body: { ...rule, shadow: true } }); }
  updateRule(id: number, rule: Partial<IotxRuleInput>) { return this.request<Ok>(`/rules/${id}`, { method: "PATCH", body: rule }); }
  deleteRule(id: number) { return this.request<Ok>(`/rules/${id}`, { method: "DELETE" }); }
  chayLuatNgay(id: number) { return this.request<Ok>(`/rules/${id}/run`, { method: "POST" }); }
  dungLuat(id: number) { return this.request<Ok>(`/rules/${id}/stop`, { method: "POST" }); }
  lichSuChay(id: number) { return this.request<IotxLanChay[]>(`/rules/${id}/runs`); }

  noChonDuoc() { return this.request<IotxNoiChon[]>("/virtual/places"); }
  thietBiAo() { return this.request<IotxThietBiAo[]>("/virtual"); }
  taoThietBiAo(input: { kind: IotxKieuAo; name: string; place?: string; lat?: number; lon?: number }) {
    return this.request<Ok<{ id: string }>>("/virtual", { method: "POST", body: input });
  }
  doiTenThietBiAo(id: string, name: string) {
    return this.request<Ok>(`/virtual/${encodeURIComponent(id)}`, { method: "PATCH", body: { name } });
  }
  /** Đang bị luật dùng thì máy chủ từ chối kèm tên luật — hiện thẳng câu đó lên màn. */
  xoaThietBiAo(id: string) {
    return this.request<Ok>(`/virtual/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
  datTrangThaiAo(id: string, on: boolean) {
    return this.request<Ok<{ on: boolean }>>(`/virtual/${encodeURIComponent(id)}/state`, { method: "POST", body: { on } });
  }
  /** Nút ảo bật 3 giây rồi tự tắt — mồi kích cho tự động hoá. */
  bamNutAo(id: string) {
    return this.request<Ok<{ count: number }>>(`/virtual/${encodeURIComponent(id)}/press`, { method: "POST" });
  }
  /** Xem trước với số đo hiện tại — chỉ đọc, không gửi lệnh nào xuống thiết bị. */
  moPhongLuat(input: { conds: IotxRuleCondition[]; gates?: IotxRuleCondition[]; exclusions?: IotxRuleCondition[] }) {
    return this.request<IotxMoPhong>("/rules/simulate", { method: "POST", body: input });
  }

  async subscribe(
    onEvent: (event: IotxStreamEvent) => void,
    options: { signal?: AbortSignal; onReconnect?: () => void } = {},
  ) {
    let attempt = 0;
    let daTungNoi = false;
    // Mỗi lần nối chỉ được làm mới token một lần. Token mới mà vẫn bị từ chối (lệch đồng hồ,
    // phiên bị thu hồi) thì refresh tiếp chỉ thành vòng lặp không nghỉ đập vào máy chủ.
    let daLamMoiLanNay = false;
    while (!options.signal?.aborted) {
      const token = this.tokens.get()?.accessToken;
      if (!token) throw new IotxApiError(401, "missing_session");
      try {
        const response = await fetch(`${this.baseUrl}/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: options.signal,
        });

        if (response.status === 401) {
          // Access token sống 300 giây. Luồng SSE đứng yên thì không có request nào làm mới
          // hộ, nên nếu không tự refresh ở đây, realtime chết hẳn sau 5 phút app không thao tác.
          if (daLamMoiLanNay || !await this.lamMoiSau401(token)) {
            this.hetPhien();
            throw new IotxApiError(401, "session_expired");
          }
          daLamMoiLanNay = true;
          continue;
        }

        if (!response.ok || !response.body) throw new IotxApiError(response.status, `stream_${response.status}`);

        attempt = 0;
        daLamMoiLanNay = false;
        // Server không hỗ trợ Last-Event-ID nên không phát lại sự kiện đã lỡ: nối lại xong
        // mới báo cho caller đi lấy lastValues, chứ không báo lúc vừa đứt.
        if (daTungNoi) options.onReconnect?.();
        daTungNoi = true;

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        try {
          while (!options.signal?.aborted) {
            const { value, done } = await choDocCoHanGio(reader.read(), STREAM_IM_LANG_MS);
            if (done) break;
            buffer += value;
            const frames = buffer.split("\n\n");
            buffer = frames.pop() || "";
            for (const frame of frames) {
              if (!frame.includes("event: trang-thai")) continue;
              const data = frame.split("\n").find(line => line.startsWith("data:"))?.slice(5).trim();
              if (data) onEvent(JSON.parse(data) as IotxStreamEvent);
            }
          }
        } finally {
          await reader.cancel().catch(() => undefined);
        }
      } catch (error) {
        if (options.signal?.aborted) return;
        if (error instanceof IotxApiError && error.status === 401) throw error;
      }

      // Ngẫu nhiên hóa thời gian chờ. Nếu mọi máy dùng đúng một công thức, chúng sẽ nối lại
      // cùng một khoảnh khắc và dồn thành một đỉnh tải đập vào máy chủ vừa khởi động xong.
      const tran = Math.min(1000 * 2 ** attempt++, 15000);
      const cho = tran / 2 + Math.random() * (tran / 2);
      await new Promise(resolve => setTimeout(resolve, cho));
    }
  }
}

export const iotxClient = new IotxClient();
