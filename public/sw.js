/* Service worker — Livotec Home.
   Đổi SO_HIEU mỗi lần phát hành để máy khách lấy bản mới. */
const SO_HIEU = "livotec-v1";
const VO_APP = ["/", "/manifest.webmanifest", "/pwa/icon-192.png", "/pwa/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SO_HIEU).then(c => c.addAll(VO_APP)));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ten => Promise.all(ten.filter(t => t !== SO_HIEU).map(t => caches.delete(t))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", e => {
  const q = e.request;
  const url = new URL(q.url);

  // KHÔNG đụng vào: khác gốc, không phải GET, và toàn bộ /v1.
  // /v1 chở token và trạng thái thiết bị — cache lại là hiện dữ liệu cũ như thật.
  // /v1/stream là SSE, cache hay đệm vào là luồng chết.
  if (url.origin !== self.location.origin) return;
  if (q.method !== "GET") return;
  if (url.pathname === "/v1" || url.pathname.startsWith("/v1/")) return;

  // Bó mã của Next có băm trong tên nên không bao giờ đổi nội dung: lấy cache trước.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.match(q).then(co => co || mangTruoc(q)));
    return;
  }

  // Trang và tài nguyên còn lại: mạng trước, hỏng thì lấy bản đã giữ.
  // Điều hướng mà không có bản nào thì trả về "/" — đây là điều kiện Chrome đòi:
  // service worker phải trả lời được start_url khi offline.
  e.respondWith(
    mangTruoc(q).catch(() =>
      caches.match(q).then(co => co || (q.mode === "navigate" ? caches.match("/") : undefined)),
    ),
  );
});

async function mangTruoc(q) {
  const r = await fetch(q);
  if (r && r.ok && r.type === "basic") {
    const ban = r.clone();
    caches.open(SO_HIEU).then(c => c.put(q, ban));
  }
  return r;
}
