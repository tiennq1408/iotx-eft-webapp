/* Service worker — Livotec Home.
   Đổi SO_HIEU mỗi lần phát hành để máy khách lấy bản mới. */
const SO_HIEU = "livotec-v2";
const VO_APP = ["/", "/manifest.webmanifest", "/pwa/icon-192.png", "/pwa/icon-512.png"];
/* Ảnh catalog (docs/viec-pwa.md 3.2): tên tệp có băm nên không bao giờ đổi nội dung — kho
   riêng, KHÔNG xoá khi đổi SO_HIEU, đỡ tải lại cả bộ ảnh mỗi lần phát hành. */
const KHO_ANH = "livotec-anh-v1";
const GOC_ANH = "https://media.dev.happibot.net";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SO_HIEU).then(async c => {
    await c.addAll(VO_APP);
    // Lần mở đầu tiên service worker CHƯA điều khiển trang (chỉ tiếp quản sau `clients.claim()`),
    // nên bó mã trang vừa tải không đi qua `fetch` bên dưới và không vào cache. Thiếu chúng thì
    // mở app lúc mất mạng chỉ thấy HTML của "/" đứng ở màn chờ. Lấy ngay danh sách bó mã mà
    // HTML của "/" trỏ tới và giữ luôn.
    const html = await (await c.match("/"))?.text() ?? "";
    const boMa = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+\.(?:js|css)/g) ?? [])];
    await c.addAll(boMa).catch(() => { /* thiếu một tệp thì vẫn cài được, lần tải sau bù */ });
  }));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ten => Promise.all(ten.filter(t => t !== SO_HIEU && t !== KHO_ANH).map(t => caches.delete(t))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", e => {
  const q = e.request;
  const url = new URL(q.url);

  // Ảnh catalog ở gốc khác: cache trước. Thẻ <img>/ảnh nền CSS tải kiểu no-cors nên phản hồi
  // là `opaque` — không đọc được `ok`/`status`, đừng lọc theo đó, cứ giữ. Chỉ bỏ phản hồi
  // KHÔNG opaque mà hỏng (404 đọc được). Yêu cầu kiểu cors (ảnh `crossOrigin` để đọc điểm ảnh)
  // không được nhận bản opaque — trình duyệt sẽ từ chối nó — nên đi mạng như thường.
  if (url.origin === GOC_ANH && q.method === "GET") {
    e.respondWith(caches.open(KHO_ANH).then(c => c.match(q).then(co => {
      if (co && !(co.type === "opaque" && q.mode === "cors")) return co;
      return fetch(q).then(r => {
        if (r.type === "opaque" || r.ok) c.put(q, r.clone()).catch(() => { /* hết hạn mức: chỉ mất ảnh lúc offline */ });
        return r;
      });
    })));
    return;
  }

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
