import type { NextRequest } from "next/server";

/**
 * Proxy same-origin cho /v1 → IBS.
 *
 * Vì sao không dùng rewrites() của next.config: hàm đó chạy MỘT LẦN lúc build và ghi
 * địa chỉ đích cứng vào routes-manifest, nên biến môi trường truyền lúc chạy không có
 * tác dụng. Route handler này đọc IOTX_API_UPSTREAM ở từng request, nhờ đó một ảnh
 * Docker dùng được cho DEV, staging và production.
 *
 * Ở môi trường thật, Caddy mới là chỗ định tuyến /v1 tới IBS; lớp này phục vụ lúc phát
 * triển và khi chạy container độc lập.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function upstream() {
  return (process.env.IOTX_API_UPSTREAM || "https://api.dev.happibot.net").replace(/\/$/, "");
}

// Header thuộc về tầng vận chuyển: chuyển tiếp nguyên si sẽ sai độ dài thân hoặc hỏng luồng.
const BO_QUA_REQUEST = new Set(["host", "connection", "content-length", "transfer-encoding", "accept-encoding"]);
const BO_QUA_RESPONSE = new Set(["content-encoding", "content-length", "transfer-encoding", "connection"]);

/**
 * Nhánh của IBS mà app người dùng cuối không bao giờ được gọi (AGENTS.md, IOTX-INTEGRATION.md).
 * Proxy này mở ra internet cùng app, nên phải tự chặn: trả đúng 404 nhập nhằng của hợp đồng
 * để không lộ nhánh nào tồn tại.
 */
const NHANH_CAM = new Set(["admin", "internal", "danh-muc", "vat-tu", "health", "live", "ready"]);

const khongThay = () => Response.json({ message: "not_found" }, { status: 404 });

async function chuyenTiep(request: NextRequest, path: string[]) {
  if (path.length === 0 || NHANH_CAM.has(path[0].toLowerCase())) return khongThay();
  const duong = path.map(encodeURIComponent).join("/");
  const dich = `${upstream()}/v1/${duong}${request.nextUrl.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!BO_QUA_REQUEST.has(key.toLowerCase())) headers.set(key, value);
  });

  const coThan = request.method !== "GET" && request.method !== "HEAD";
  let traLoi: Response;
  try {
    traLoi = await fetch(dich, {
      method: request.method,
      headers,
      body: coThan ? request.body : undefined,
      // Thân request là luồng, fetch của Node đòi khai báo nửa song công mới cho gửi.
      ...(coThan ? { duplex: "half" } : {}),
      redirect: "manual",
      signal: request.signal,
      cache: "no-store",
    } as RequestInit);
  } catch (loi) {
    // Máy không có mạng, hoặc IBS không với tới được. Nếu để lỗi này thoát ra ngoài,
    // Next trả 500 và trông như lỗi máy chủ — client sẽ chẩn đoán sai hoàn toàn.
    // 502 nói đúng bản chất: cửa trung gian không tới được nơi cần tới.
    if (request.signal.aborted) return new Response(null, { status: 499 });
    // Chi tiết lỗi chứa tên máy và cổng nội bộ — chỉ trả ra khi đang phát triển.
    const chiTiet = process.env.NODE_ENV === "production" ? undefined : (loi instanceof Error ? loi.message : String(loi));
    return Response.json(
      { message: "Không kết nối được máy chủ IoTX. Kiểm tra đường truyền rồi thử lại.", ...(chiTiet ? { chiTiet } : {}) },
      { status: 502 },
    );
  }

  const headerTra = new Headers();
  traLoi.headers.forEach((value, key) => {
    if (!BO_QUA_RESPONSE.has(key.toLowerCase())) headerTra.set(key, value);
  });

  // SSE phải chảy thẳng tới trình duyệt. Bất kỳ tầng nào gom lại thành khối là hỏng realtime.
  if (headerTra.get("content-type")?.includes("text/event-stream")) {
    headerTra.set("cache-control", "no-cache, no-transform");
    headerTra.set("x-accel-buffering", "no");
  }

  const khongCoThan = traLoi.status === 204 || traLoi.status === 304;
  return new Response(khongCoThan ? null : traLoi.body, { status: traLoi.status, headers: headerTra });
}

type NguCanh = { params: Promise<{ path: string[] }> };

async function xuLy(request: NextRequest, nguCanh: NguCanh) {
  const { path } = await nguCanh.params;
  return chuyenTiep(request, path ?? []);
}

export const GET = xuLy;
export const POST = xuLy;
export const PUT = xuLy;
export const PATCH = xuLy;
export const DELETE = xuLy;
export const HEAD = xuLy;
export const OPTIONS = xuLy;
