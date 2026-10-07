import type { IotxBootstrap, IotxProduct, IotxTheme } from "./contracts";
import type { AppData } from "@/lib/types";
import type { BoChu } from "./i18n";

type PhienBan = IotxBootstrap["phienBan"];
type NoiDungCache = {
  phienBan?: Partial<PhienBan>;
  /** Catalog theo NGÔN NGỮ: nhãn capability là chữ đã dịch, đổi lang là phải tải lại. */
  products?: Record<string, { nhan?: string; products: Record<string, IotxProduct> }>;
  i18n?: Record<string, { nhan?: string; boChu: BoChu }>;
  theme?: { nhan?: string; theme: IotxTheme };
  /** ETag đã nhận kèm thân phản hồi, để gửi lại If-None-Match và dùng lại khi máy chủ trả 304. */
  etag?: Record<string, { etag: string; data: unknown }>;
};

// v2: catalog xếp theo ngôn ngữ. Bản v1 có hình dạng khác, đọc vào sẽ sai — để khóa mới.
const KEY = "livotec-iotx-cache-v2";

/**
 * Bản đã parse, giữ trong bộ nhớ. Mỗi request đều hỏi ETag, và nhịp đồng bộ chạy mỗi 2,5
 * giây — parse lại cả khối (catalog, bảng chữ, /bootstrap) mỗi lần là phí. Tab khác ghi đè
 * thì sự kiện `storage` bỏ bản nhớ để lần đọc sau lấy lại từ localStorage.
 */
let banNho: NoiDungCache | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("storage", e => { if (e.key === KEY || e.key === null) banNho = null; });
}

function doc(): NoiDungCache {
  if (typeof window === "undefined") return {};
  if (banNho) return banNho;
  try { banNho = JSON.parse(localStorage.getItem(KEY) || "{}") as NoiDungCache; }
  catch { banNho = {}; }
  return banNho;
}

function ghi(value: NoiDungCache) {
  if (typeof window === "undefined") return;
  banNho = value;
  try { localStorage.setItem(KEY, JSON.stringify(value)); }
  catch { /* hết chỗ hoặc trình duyệt chặn: bỏ cache, không làm hỏng luồng chính */ }
}

/**
 * Catalog đang giữ, chỉ trả về khi nhãn phiên bản còn khớp với nhãn bootstrap vừa báo.
 * Lệch nhãn nghĩa là hãng đã đổi catalog — phải tải lại.
 */
export function docProducts(lang: string, nhan: string | undefined): Record<string, IotxProduct> | null {
  const muc = doc().products?.[lang];
  if (!muc || !nhan || muc.nhan !== nhan) return null;
  return muc.products;
}

export function ghiProducts(lang: string, nhan: string | undefined, products: Record<string, IotxProduct>) {
  const cache = doc();
  ghi({ ...cache, products: { ...cache.products, [lang]: { nhan, products } } });
}

/**
 * Bộ chữ đang giữ cho một ngôn ngữ.
 *
 * Trước khi đăng nhập app chưa biết nhãn phiên bản (nhãn nằm trong /bootstrap), nên lúc đó
 * cứ dùng bản đang giữ để màn đăng nhập có chữ ngay; sau khi đăng nhập, nhãn lệch thì tải lại.
 */
export function docI18n(lang: string, nhan: string | undefined): BoChu | null {
  const muc = doc().i18n?.[lang];
  if (!muc) return null;
  if (nhan !== undefined && muc.nhan !== nhan) return null;
  return muc.boChu;
}

export function ghiI18n(lang: string, nhan: string | undefined, boChu: BoChu) {
  const cache = doc();
  ghi({ ...cache, i18n: { ...cache.i18n, [lang]: { nhan, boChu } } });
}

/**
 * Theme của hãng. Nhãn phiên bản nằm trong `/bootstrap`; trước khi đăng nhập app chưa biết
 * nhãn nên cứ dùng bản đang giữ để màn chào có màu ngay, đăng nhập xong lệch nhãn thì tải lại.
 */
export function docTheme(nhan: string | undefined): IotxTheme | null {
  const muc = doc().theme;
  if (!muc) return null;
  if (nhan !== undefined && muc.nhan !== nhan) return null;
  return muc.theme;
}

export function ghiTheme(nhan: string | undefined, theme: IotxTheme) {
  const cache = doc();
  ghi({ ...cache, theme: { nhan, theme } });
}

/* ------------------------------------------------------------------ */
/* ETag                                                                */
/* ------------------------------------------------------------------ */

export function docEtag(khoa: string): { etag: string; data: unknown } | null {
  return doc().etag?.[khoa] ?? null;
}

export function ghiEtag(khoa: string, etag: string, data: unknown) {
  const cache = doc();
  ghi({ ...cache, etag: { ...cache.etag, [khoa]: { etag, data } } });
}

/* ------------------------------------------------------------------ */
/* Dữ liệu của riêng người dùng                                        */
/* ------------------------------------------------------------------ */

/**
 * Ảnh chụp danh sách thiết bị của tài khoản đang đăng nhập, để mở app lúc mất mạng vẫn có
 * gì đó mà xem. Khóa riêng, KHÔNG dùng chung với dữ liệu mock (`lib/storage.ts`): trộn hai
 * nguồn thì người dùng thật thấy thiết bị mock nháy lên trước khi `/bootstrap` về.
 */
const KHOA_ANH_CHUP = "livotec-iotx-anh-chup";

export function docAnhChup(lang: string): AppData | null {
  if (typeof window === "undefined") return null;
  try {
    const goc = JSON.parse(localStorage.getItem(KHOA_ANH_CHUP) || "null") as Partial<AppData> | null;
    if (!goc || !Array.isArray(goc.devices) || !goc.spaces) return null;
    // Ảnh chụp không mang catalog (xem `ghiAnhChup`); gắn lại từ catalog đang giữ.
    const products = doc().products?.[lang]?.products ?? {};
    return { devices: goc.devices.map(device => ({ ...device, product: products[device.model] ?? null })), spaces: goc.spaces };
  } catch { return null; }
}

/** Bỏ `product` khỏi từng thiết bị: catalog đã nằm trong cache, chép thêm N lần chỉ tốn chỗ. */
export function ghiAnhChup(data: AppData) {
  if (typeof window === "undefined") return;
  const gon = { ...data, devices: data.devices.map(device => ({ ...device, product: undefined })) };
  try { localStorage.setItem(KHOA_ANH_CHUP, JSON.stringify(gon)); }
  catch { /* hết chỗ: bỏ qua, chỉ mất khả năng xem lúc ngoại tuyến */ }
}

/**
 * Xoá mọi thứ thuộc về tài khoản vừa rời đi: ảnh chụp thiết bị và các bản ETag của cửa cần
 * đăng nhập (`/bootstrap` mang email, mã khách hàng, toàn bộ thiết bị). Theme, bảng chữ và
 * catalog là dữ liệu công khai của hãng nên giữ lại cho lần đăng nhập sau.
 */
export function xoaCacheNguoiDung() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(KHOA_ANH_CHUP); } catch { /* bị chặn: không có gì để xoá */ }
  // Đọc lại từ localStorage thay vì tin bản nhớ: việc hiếm, và phải xoá cả thứ tab khác vừa ghi.
  banNho = null;
  const cache = doc();
  if (!cache.etag) return;
  const conLai = Object.fromEntries(Object.entries(cache.etag).filter(([khoa]) => !khoa.startsWith("bootstrap:")));
  ghi({ ...cache, etag: conLai });
}
