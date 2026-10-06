import type { IotxBootstrap, IotxProduct, IotxTheme } from "./contracts";
import type { BoChu } from "./i18n";

type PhienBan = IotxBootstrap["phienBan"];
type NoiDungCache = {
  phienBan?: Partial<PhienBan>;
  products?: Record<string, IotxProduct>;
  i18n?: Record<string, { nhan?: string; boChu: BoChu }>;
  theme?: { nhan?: string; theme: IotxTheme };
  /** ETag đã nhận kèm thân phản hồi, để gửi lại If-None-Match và dùng lại khi máy chủ trả 304. */
  etag?: Record<string, { etag: string; data: unknown }>;
};

const KEY = "livotec-iotx-cache";

function doc(): NoiDungCache {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") as NoiDungCache; }
  catch { return {}; }
}

function ghi(value: NoiDungCache) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(value)); }
  catch { /* hết chỗ hoặc trình duyệt chặn: bỏ cache, không làm hỏng luồng chính */ }
}

/**
 * Catalog đang giữ, chỉ trả về khi nhãn phiên bản còn khớp với nhãn bootstrap vừa báo.
 * Lệch nhãn nghĩa là hãng đã đổi catalog — phải tải lại.
 */
export function docProducts(nhan: string | undefined): Record<string, IotxProduct> | null {
  const cache = doc();
  if (!nhan || cache.phienBan?.products !== nhan) return null;
  return cache.products ?? null;
}

export function ghiProducts(nhan: string | undefined, products: Record<string, IotxProduct>) {
  const cache = doc();
  ghi({ ...cache, products, phienBan: { ...cache.phienBan, products: nhan } });
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
