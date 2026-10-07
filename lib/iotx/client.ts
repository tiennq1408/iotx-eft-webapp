import { iotxConfig } from "./config";
import { docEtag, ghiEtag, xoaCacheNguoiDung } from "./cache";
import type {
  IotxBootstrap, IotxCategory, IotxDevice, IotxNotification, IotxProduct,
  IotxKieuAo, IotxLanChay, IotxMoPhong, IotxNoiChon, IotxProfile, IotxRuleCondition, IotxRuleInput,
  IotxHenGioTongQuan, IotxLenhVatTu, IotxThanChuongTrinh,
  IotxPermission, IotxRules, IotxShares, IotxThietBiAo,
  IotxStreamEvent, IotxTheme, IotxTokenSet,
} from "./contracts";

const TOKEN_KEY = "livotec-iotx-session";

export class IotxApiError extends Error {
  constructor(public status: number, message: string, public payload?: unknown) {
    super(message);
    this.name = "IotxApiError";
  }
}

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
    this.tokens.clear();
    xoaCacheNguoiDung();
    for (const nghe of this.nguoiNgheHetPhien) nghe();
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

    if (response.status === 401 && auth && retryAuth && tokenSet) {
      if (await this.lamMoiSau401(tokenSet.accessToken)) return this.request<T>(path, { ...options, retryAuth: false });
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
    this.tokens.set(result);
    return result;
  }

  async register(email: string, password: string, fullName?: string) {
    const result = await this.request<IotxTokenSet>("/auth/register", { method: "POST", auth: false, body: { tenant: iotxConfig.tenant, email, password, fullName } });
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
  me() { return this.request<IotxProfile>("/me"); }
  bootstrap(lang = iotxConfig.lang) { return this.request<IotxBootstrap>(`/bootstrap?lang=${encodeURIComponent(lang)}`, { etagKey: `bootstrap:${lang}` }); }
  products(lang = iotxConfig.lang) { return this.request<Record<string, IotxProduct>>(`/products?lang=${encodeURIComponent(lang)}&tenant=${encodeURIComponent(iotxConfig.tenant)}`, { auth: false, etagKey: `products:${iotxConfig.tenant}:${lang}` }); }
  devices(lang = iotxConfig.lang) { return this.request<IotxDevice[]>(`/devices?lang=${encodeURIComponent(lang)}`); }
  categories() { return this.request<IotxCategory[]>("/categories"); }
  notifications() { return this.request<{ unread: number; items: IotxNotification[] }>("/notifications"); }
  shares() { return this.request<IotxShares>("/shares"); }
  rules() { return this.request<IotxRules>("/rules"); }

  claim(name: string, secret: string) {
    return this.request<{ ok: true; id: string; name: string; type: string }>("/claim", { method: "POST", body: { name, secret } });
  }

  claimBoard(serial: string) {
    return this.request<{ ok: true; id: string; name: string; type: string; dangNoi: boolean }>("/claim-mach-that", { method: "POST", body: { serial } });
  }

  updateDevice(id: string, patch: { label?: string; house?: string; room?: string; grp?: string; fav?: boolean; hidden?: boolean }) {
    return this.request<{ ok: true }>(`/devices/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });
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
    return this.request<{ ok: true; nguon?: "server" | "mach"; id?: string; xacThuc?: boolean }>(
      `/devices/${encodeURIComponent(id)}/muc/${encodeURIComponent(cap)}`,
      { method: "POST", body: lenh },
    );
  }

  /* ---------------- hẹn giờ theo thiết bị ---------------- */
  /** `batDuoc=false` nghĩa là sản phẩm tắt hẹn giờ — app phải giấu hẳn màn này. */
  xemHenGio(id: string) { return this.request<IotxHenGioTongQuan>(`/devices/${encodeURIComponent(id)}/hen-gio`); }
  /** Gửi `bat` kèm ĐÚNG MỘT trong `phut` (1..720) hoặc `luc` ("HH:MM"). */
  datHenGio(id: string, than: { bat: boolean; phut?: number; luc?: string }) {
    return this.request<{ ok: true; hen: { luc: number; bat: boolean } }>(`/devices/${encodeURIComponent(id)}/hen-gio/hen`, { method: "PUT", body: than });
  }
  huyHenGio(id: string) { return this.request<{ ok: true }>(`/devices/${encodeURIComponent(id)}/hen-gio/hen`, { method: "DELETE" }); }
  taoChuongTrinh(id: string, than: IotxThanChuongTrinh) {
    return this.request<{ ok: true; id: number }>(`/devices/${encodeURIComponent(id)}/hen-gio/chuong-trinh`, { method: "POST", body: than });
  }
  suaChuongTrinh(id: string, ctId: number, than: IotxThanChuongTrinh) {
    return this.request<{ ok: true }>(`/devices/${encodeURIComponent(id)}/hen-gio/chuong-trinh/${ctId}`, { method: "PUT", body: than });
  }
  xoaChuongTrinh(id: string, ctId: number) {
    return this.request<{ ok: true }>(`/devices/${encodeURIComponent(id)}/hen-gio/chuong-trinh/${ctId}`, { method: "DELETE" });
  }
  /** Kích hoạt một chương trình — mỗi thiết bị chỉ một chương trình đang dùng. */
  dungChuongTrinhNay(id: string, ctId: number) {
    return this.request<{ ok: true }>(`/devices/${encodeURIComponent(id)}/hen-gio/chuong-trinh/${ctId}/dung`, { method: "POST" });
  }
  thoiDungChuongTrinh(id: string) {
    return this.request<{ ok: true }>(`/devices/${encodeURIComponent(id)}/hen-gio/dang-dung`, { method: "DELETE" });
  }

  createCategory(category: IotxCategory) { return this.request<{ ok: true }>("/categories", { method: "POST", body: category }); }
  renameCategory(kind: IotxCategory["kind"], from: string, to: string) { return this.request<{ ok: true }>("/categories", { method: "PATCH", body: { kind, from, to } }); }
  deleteCategory(kind: IotxCategory["kind"], name: string) { return this.request<{ ok: true }>(`/categories/${kind}/${encodeURIComponent(name)}`, { method: "DELETE" }); }
  createShare(input: { email: string; house: string; scope?: string; scopeRef?: string; perms?: IotxPermission }) {
    return this.request<{ ok: true; id: number; pending: boolean }>("/shares", { method: "POST", body: input });
  }
  /** Siết/nới quyền một chia sẻ đã cấp. Máy chủ trả về quyền SAU KHI ghép, nên lấy theo đó. */
  suaQuyenChiaSe(id: number | string, perms: IotxPermission) {
    return this.request<{ ok: true; perms: IotxPermission }>(`/shares/${encodeURIComponent(String(id))}`, { method: "PATCH", body: { perms } });
  }
  deleteShare(id: number | string) { return this.request<{ ok: true }>(`/shares/${encodeURIComponent(String(id))}`, { method: "DELETE" }); }
  readNotifications(id?: number) { return this.request<{ ok: true }>("/notifications/read", { method: "POST", body: id === undefined ? {} : { id } }); }
  deleteNotification(id: number | string) { return this.request<{ ok: true }>(`/notifications/${encodeURIComponent(String(id))}`, { method: "DELETE" }); }
  createRule(rule: IotxRuleInput) { return this.request<{ ok: true; id: number; shadow: boolean }>("/rules", { method: "POST", body: { shadow: true, ...rule } }); }
  updateRule(id: number, rule: Partial<IotxRuleInput>) { return this.request<{ ok: true }>(`/rules/${id}`, { method: "PATCH", body: rule }); }
  deleteRule(id: number) { return this.request<{ ok: true }>(`/rules/${id}`, { method: "DELETE" }); }
  chayLuatNgay(id: number) { return this.request<{ ok: true }>(`/rules/${id}/run`, { method: "POST" }); }
  dungLuat(id: number) { return this.request<{ ok: true }>(`/rules/${id}/stop`, { method: "POST" }); }
  lichSuChay(id: number) { return this.request<IotxLanChay[]>(`/rules/${id}/runs`); }

  noChonDuoc() { return this.request<IotxNoiChon[]>("/virtual/places"); }
  thietBiAo() { return this.request<IotxThietBiAo[]>("/virtual"); }
  taoThietBiAo(input: { kind: IotxKieuAo; name: string; place?: string; lat?: number; lon?: number }) {
    return this.request<{ ok: true; id: string }>("/virtual", { method: "POST", body: input });
  }
  doiTenThietBiAo(id: string, name: string) {
    return this.request<{ ok: true }>(`/virtual/${encodeURIComponent(id)}`, { method: "PATCH", body: { name } });
  }
  /** Đang bị luật dùng thì máy chủ từ chối kèm tên luật — hiện thẳng câu đó lên màn. */
  xoaThietBiAo(id: string) {
    return this.request<{ ok: true }>(`/virtual/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
  datTrangThaiAo(id: string, on: boolean) {
    return this.request<{ ok: true; on: boolean }>(`/virtual/${encodeURIComponent(id)}/state`, { method: "POST", body: { on } });
  }
  /** Nút ảo bật 3 giây rồi tự tắt — mồi kích cho tự động hoá. */
  bamNutAo(id: string) {
    return this.request<{ ok: true; count: number }>(`/virtual/${encodeURIComponent(id)}/press`, { method: "POST" });
  }
  /** Xem trước với số đo hiện tại — chỉ đọc, không gửi lệnh nào xuống thiết bị. */
  moPhongLuat(input: { conds: IotxRuleCondition[]; gates?: IotxRuleCondition[]; exclusions?: IotxRuleCondition[] }) {
    return this.request<IotxMoPhong>("/rules/simulate", { method: "POST", body: input });
  }

  async subscribe(
    onEvent: (event: IotxStreamEvent) => void,
    options: { signal?: AbortSignal; deviceIds?: string[]; onReconnect?: () => void } = {},
  ) {
    let attempt = 0;
    let daTungNoi = false;
    // Mỗi lần nối chỉ được làm mới token một lần. Token mới mà vẫn bị từ chối (lệch đồng hồ,
    // phiên bị thu hồi) thì refresh tiếp chỉ thành vòng lặp không nghỉ đập vào máy chủ.
    let daLamMoiLanNay = false;
    while (!options.signal?.aborted) {
      const token = this.tokens.get()?.accessToken;
      if (!token) throw new IotxApiError(401, "missing_session");
      const query = options.deviceIds?.length ? `?thiet_bi=${encodeURIComponent(options.deviceIds.join(","))}` : "";
      try {
        const response = await fetch(`${this.baseUrl}/stream${query}`, {
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
