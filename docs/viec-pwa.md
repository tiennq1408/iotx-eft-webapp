# Việc: cho webapp cài được như một app (PWA)

*28/10/2026 · thực thi ở tab Code*
*Nền: `kien-thuc-dieu-khien-offline.md` · `dac-ta-ble-webapp.md`*

---

## 0. Phạm vi

Chia hai phần, làm được độc lập:

| Phần | Mục tiêu | Bắt buộc? |
|---|---|---|
| **A** | Chrome Android cho phép **cài** app vào màn hình chính | ✅ phần anh hỏi |
| **B** | App **chạy được khi mất mạng** | Là lý do thật để làm PWA, nhưng tách được |

Làm xong A là máy cài được. Nhưng **cài được ≠ dùng được khi mất mạng** — mở ra vẫn trắng màn nếu chưa làm B.

---

## 1. Hiện trạng đo được

Soát repo ngày 28/10/2026, Next **16.3.5**:

| Điều kiện | Trạng thái |
|---|---|
| HTTPS | ✅ *(có điều kiện — xem 4.1)* |
| `viewport` khai đúng | ✅ `app/layout.tsx:14` |
| `themeColor` | ✅ `#fadcbe`, `app/layout.tsx:18` |
| `appleWebApp` cho iOS | ✅ `app/layout.tsx:10` — đã khai `capable: true` |
| Icon vuông 192 và 512 | ✅ `app/icon-192.png` (192×192), `app/icon-512.png` (512×512) — **nhưng sai chỗ, xem 2.1** |
| **Web app manifest** | ❌ chưa có |
| **Service worker có `fetch` handler** | ❌ chưa có, `package.json` cũng không có `next-pwa` / `serwist` / `workbox` |

---

## 2. Phần A — cài được

### 2.1 Chuyển hai tệp icon sang `public/` ⟵ **làm trước**

**Vấn đề:** thư mục `app/` của Next **không phục vụ tệp tĩnh**. Nó chỉ nhận một số tên theo quy ước: `favicon.ico`, `icon.png`, `apple-icon.png`, và bản đánh số `icon1.png`, `icon2.png`…

Hậu tố được chấp nhận là **đúng một chữ số**. Kiểm trong mã Next:

```js
// node_modules/next/dist/lib/metadata/is-metadata-route.js:146
const variantsMatcher = '\\d?';
```

`icon-192` có `-192`, **không khớp `\d?`**. Nên hai tệp vừa thêm sẽ **không được phục vụ ở bất kỳ địa chỉ nào** — manifest trỏ tới sẽ nhận 404, và Chrome im lặng không cho cài.

**Cách sửa:**

```bash
mkdir -p public/pwa
git mv app/icon-192.png public/pwa/icon-192.png
git mv app/icon-512.png public/pwa/icon-512.png
```

Sau đó chúng có địa chỉ `/pwa/icon-192.png` và `/pwa/icon-512.png`.

**Giữ nguyên `app/icon.png`** (229×79) — nó là favicon trên thanh tab, đúng quy ước, vẫn chạy. Không đụng vào.

### 2.2 Thêm `app/manifest.ts`

Next 16 có route riêng cho manifest. Tạo tệp mới:

```ts
// app/manifest.ts
import type { MetadataRoute } from "next";

/**
 * Manifest cho PWA. Next phục vụ tệp này tại /manifest.webmanifest.
 *
 * NHƯNG nó KHÔNG tự chèn <link rel="manifest"> vào <head> — phải khai tay ở layout,
 * xem mục 2.2b. Thiếu thẻ đó là trình duyệt không bao giờ tìm thấy manifest.
 *
 * `id` đặt tường minh ngay từ đầu: mặc định nó lấy theo `start_url`, nên sau này đổi
 * `start_url` là máy coi như một app KHÁC — người dùng có hai biểu tượng.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Livotec Home",
    short_name: "Livotec",
    description: "Điều khiển ngôi nhà thông minh Livotec",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Nền màn chờ lúc mở app. Lấy mép trên màn đăng nhập, khớp `themeColor` ở layout.
    background_color: "#fadcbe",
    theme_color: "#fadcbe",
    orientation: "portrait",
    lang: "vi",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
```

**Về `purpose: "maskable"`:** Android cắt biểu tượng theo hình của launcher (tròn, vuông bo, giọt nước). Icon `any` bị cắt mất góc. Muốn đẹp thì cần một bản **maskable** riêng, nội dung nằm gọn trong vòng tròn bán kính **40% cạnh** — với icon 512 là vòng tròn đường kính 410px ở giữa.

Chưa có bản đó thì **cứ để `any`** — vẫn cài được, chỉ là biểu tượng có thể bị cắt mép. Đừng khai `purpose: "any maskable"` cho cùng một tệp: icon không chừa lề sẽ bị cắt mất chữ.

### 2.2b Khai `manifest` trong layout ⟵ **thiếu cái này là hỏng hết**

Tạo `app/manifest.ts` mới chỉ **phục vụ** tệp ở `/manifest.webmanifest`. Nó **không** tự chèn thẻ `<link rel="manifest">` vào `<head>`.

Kiểm trong mã Next 16.3.5 — thẻ chỉ được sinh ra khi `metadata.manifest` có giá trị:

```js
// node_modules/next/dist/lib/metadata/metadata.js:291
if (metadata.manifest) {
    ... rel: "manifest", href: metadata.manifest.toString()
}
```

và mặc định nó là rỗng:

```js
// node_modules/next/dist/lib/metadata/default-metadata.js:51
manifest: null,
```

Không có thẻ đó thì trình duyệt **không bao giờ biết manifest tồn tại** — và Chrome **im lặng không cho cài**, y như bẫy icon ở mục 2.1. Hai cái bẫy này cùng một kiểu: mọi thứ trông như đã làm xong, mà lời mời cài không bao giờ hiện.

Sửa `app/layout.tsx`, thêm một dòng vào `metadata` đang có:

```ts
export const metadata: Metadata = {
  title: "Livotec Home",
  description: "Điều khiển ngôi nhà thông minh Livotec",
  manifest: "/manifest.webmanifest",          // ← thêm dòng này
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Livotec Home" },
};
```

### 2.2c Thêm `app/apple-icon.png` cho iPhone

iOS **không đọc `icons` trong manifest**. Nó dùng `<link rel="apple-touch-icon">`, mà Next sinh ra từ quy ước tệp `app/apple-icon.(png|jpg)`. Hiện **chưa có tệp đó**.

Hệ quả hôm nay: khách iPhone bấm Chia sẻ → Thêm vào màn hình chính thì iOS lấy tạm ảnh chụp màn hình hoặc favicon `229×79` — ra một biểu tượng méo.

Sửa: chép icon vuông đã có.

```bash
cp public/pwa/icon-512.png app/apple-icon.png
```

Apple khuyên 180×180; 512×512 vẫn chạy, iOS tự thu. Lưu ý iOS **không bo góc hộ** — nếu muốn đẹp thì làm một bản nền đặc, không trong suốt.

Đây là việc 30 giây, và nó là thứ duy nhất ở phần A có ích cho iPhone.

### 2.3 Service worker

Chrome đòi **một service worker có `fetch` handler**, và nó phải trả lời được `start_url` khi offline. Không có thì không hiện lời mời cài.

Tạo `public/sw.js`:

```js
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
```

### 2.4 Đăng ký service worker

Tạo `components/DangKySW.tsx`:

```tsx
"use client";
import { useEffect } from "react";

/**
 * Chỉ đăng ký ở bản dựng thật. `next dev` thay bó mã liên tục, service worker giữ bản cũ
 * rồi phục vụ mã đã chết — mất hàng giờ mới nghĩ ra đó là thủ phạm.
 */
export default function DangKySW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => { /* không chặn app */ });
  }, []);
  return null;
}
```

Gắn vào `app/layout.tsx`, trong `<body>`:

```tsx
<html lang="vi" suppressHydrationWarning>
  <body>
    {children}
    <DangKySW />
  </body>
</html>
```

### 2.5 Nút "Cài ứng dụng"

Chrome bắn sự kiện `beforeinstallprompt`. Phải `preventDefault()` rồi giữ lại, hiện nút của mình, bấm mới gọi `prompt()`.

```tsx
"use client";
import { useEffect, useState } from "react";

type SuKienCai = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function NutCaiApp() {
  const [sk, datSk] = useState<SuKienCai | null>(null);
  useEffect(() => {
    const bat = (e: Event) => { e.preventDefault(); datSk(e as SuKienCai); };
    const xong = () => datSk(null);
    window.addEventListener("beforeinstallprompt", bat);
    window.addEventListener("appinstalled", xong);
    return () => { window.removeEventListener("beforeinstallprompt", bat); window.removeEventListener("appinstalled", xong); };
  }, []);
  if (!sk) return null;          // iPhone, Firefox, hoặc đã cài rồi — không hiện gì
  return (
    <button className="btn gh" onClick={async () => { await sk.prompt(); datSk(null); }}>
      Cài ứng dụng
    </button>
  );
}
```

Đặt trong menu tài khoản, **không** đặt ở màn đăng nhập.

**iPhone không có sự kiện này.** Safari chỉ cài qua Chia sẻ → *Thêm vào màn hình chính*. Nút sẽ không hiện, và đó là đúng. Nếu muốn, hiện một dòng hướng dẫn riêng khi nhận ra Safari iOS — nhưng đừng hiện một nút bấm vào không làm gì.

---

## 3. Phần B — chạy được khi mất mạng

Bốn việc này không cần cho "cài được", nhưng thiếu chúng thì app cài xong mở ra lúc mất mạng vẫn vô dụng.

### 3.1 `lib/iotx/cache.ts:48` — một dòng, nợ lâu nhất

```ts
export function docProducts(lang: string, nhan: string | undefined): Record<string, IotxProduct> | null {
  const muc = doc().products?.[lang];
  if (!muc || !nhan || muc.nhan !== nhan) return null;   // ← `!nhan` là chỗ hỏng
  return muc.products;
}
```

Mất mạng thì `/bootstrap` hỏng nên `nhan` luôn `undefined` → trả `null` → **không dựng nổi giao diện dù catalog vẫn nằm nguyên trong localStorage**. App ra màn trắng.

`docI18n` ở dòng 66 lại nới hơn (`if (nhan !== undefined && …`), nên chữ vẫn hiện — đúng cái bất đối xứng khiến lỗi này khó thấy.

Sửa theo đúng cách `docI18n` làm: chưa biết nhãn thì **cứ dùng bản đang giữ**; biết nhãn mà lệch thì mới bỏ.

### 3.2 Cache ảnh của catalog

Ảnh ô và ảnh màn trỏ về `https://media.dev.happibot.net`, **khác gốc**, nên service worker ở mục 2.3 **cố ý bỏ qua**. Mất mạng là lưới ra một mảng xám trắng.

Đo thật trên catalog: 20 ảnh duy nhất, tổng **33.502 B**. Nhỏ, cache được hết.

Cách: thêm một nhánh riêng trong `fetch` cho gốc `media.dev.happibot.net`, dùng **cache trước** (ảnh có băm trong tên nên không đổi). Lưu ý response khác gốc là `opaque` — không đọc được `ok`, nên đừng lọc theo `r.ok`, và chúng chiếm chỗ nhiều hơn kích thước thật.

### 3.3 Chế độ cục bộ — dừng nhịp đồng bộ

`hooks/useDongBoNen.ts:38` chạy SSE **và** hỏi `/bootstrap` mỗi 2,5 giây. Mất mạng là hai cái hỏng liên tục: tốn pin, đầy log lỗi, và che mất lỗi thật.

Cần: nhận ra mất máy chủ → **dừng hẳn** cả hai → hiện màn "Mất kết nối máy chủ" → có mạng lại thì tự chạy lại.

### 3.4 Câu báo lỗi sai khi đang ở Wi-Fi của thiết bị

`lib/iotx/client.ts:200` chỉ quy lỗi mạng về `status 0` **khi `navigator.onLine === false`**:

```ts
if (loi instanceof TypeError && typeof navigator !== "undefined" && navigator.onLine === false) {
  throw new IotxApiError(0, "offline");
}
throw loi;
```

Nhưng khi điện thoại nối Wi-Fi của cái quạt thì nó **đang ở trên một mạng** — `navigator.onLine` là `true`. Lỗi rơi xuống nhánh `TypeError`, và `errors.ts:15` hiện ra:

> *"Trình duyệt không gửi được yêu cầu. Nếu đang mở bằng http:// trên máy khác, hãy thử https:// hoặc localhost."*

Vô nghĩa trong tình huống đó, và dẫn sai hướng chẩn đoán.

Sửa: `navigator.onLine === false` **hoặc** đã từng gọi được máy chủ trong phiên này mà giờ hỏng → coi là lỗi đường truyền, hiện `CAU_MANG`. Đừng tin `navigator.onLine` một mình — nó chỉ nói "có nối vào mạng nào đó", không nói "ra được Internet".

**Tin tốt:** phiên đăng nhập **không bị đá ra**. `laHetPhien` (`errors.ts:42`) chỉ nhận status 401, mà offline không sinh 401. Chỗ này code đã đúng sẵn.

---

## 4. Bốn cái bẫy

### 4.1 Service worker chỉ cài được trên HTTPS

Chạy `npm run dev` rồi mở `http://192.168.1.x:3000` trên điện thoại thì **service worker không cài**, và PWA không thử được. Cùng họ với lỗi ở `viec-loi-khong-ket-noi.md`.

Thử PWA phải qua **tunnel HTTPS** (`cloudflared`) hoặc bản dựng có chứng chỉ thật. `localhost` được miễn, nhưng localhost thì không phải điện thoại.

### 4.2 Đừng đăng ký service worker ở chế độ dev

Đã chặn bằng `process.env.NODE_ENV` ở mục 2.4. Bỏ chốt đó ra là service worker giữ bó mã cũ rồi phục vụ mã đã chết, và rất khó lần ra.

Nếu lỡ cài nhầm: DevTools → Application → Service Workers → **Unregister**, rồi xoá luôn Cache Storage.

### 4.3 `output: "standalone"` nghĩa là trang dựng từ máy chủ

App không phải thư mục tệp tĩnh. Service worker phải cache **HTML đã dựng** của các màn cần dùng offline — cẩn thận hơn một trang tĩnh. Mục 2.3 cache `/` làm chỗ lùi cho mọi điều hướng, đủ cho một SPA; nếu sau này có màn dựng riêng ở máy chủ thì phải cache thêm.

### 4.3b Kiểm tra trên điện thoại thật

DevTools ở mục 5 là của máy tính. Nhưng điều kiện cài phải nghiệm trên **Chrome Android thật**, vì máy tính và điện thoại không giống nhau ở chỗ này.

Cách: nối điện thoại bằng cáp, bật **Tùy chọn nhà phát triển → Gỡ lỗi USB**, rồi trên máy tính mở `chrome://inspect/#devices`. Từ đó mở được DevTools của đúng tab trên điện thoại — xem được Application → Manifest và Service Workers như bình thường.

Không có cáp thì vẫn xem được phần lớn bằng Lighthouse trên máy tính ở chế độ Mobile, nhưng **lời mời cài thì phải thử trên máy thật**.

### 4.4 Đổi bản mới

`self.clients.claim()` ở mục 2.3 cho service worker mới tiếp quản ngay. **Không** dùng `skipWaiting()`: nó thay bó mã giữa lúc người dùng đang thao tác, trang đang chạy mã cũ đi gọi tệp đã biến mất.

Mỗi lần phát hành **phải đổi `SO_HIEU`**. Quên là máy khách giữ bản cũ mãi.

---

## 5. Nghiệm thu

| # | Việc | Đạt khi |
|---|---|---|
| 1 | `npm run lint` và `npm run build` | Sạch |
| 2 | Mở `/manifest.webmanifest` | Trả về JSON đúng, không 404 |
| 2b | Xem mã nguồn trang, tìm `rel="manifest"` | **Có thẻ đó trong `<head>`** — đây là bẫy 2.2b |
| 2c | Tìm `rel="apple-touch-icon"` | Có — đây là bẫy 2.2c |
| 3 | Mở `/pwa/icon-192.png` và `/pwa/icon-512.png` | Hiện ảnh, **không 404** — đây là bẫy 2.1 |
| 4 | DevTools → Application → Manifest | Không có cảnh báo nào |
| 5 | DevTools → Application → Service Workers | Trạng thái `activated and is running` |
| 6 | **Chrome Android**, mở app qua HTTPS, thao tác vài giây | Hiện lời mời cài, hoặc nút "Cài ứng dụng" bật lên |
| 7 | Cài xong, mở từ màn hình chính | Chạy toàn màn hình, **không có thanh địa chỉ**, biểu tượng đúng |
| 8 | **iPhone**, mở app | **Không** hiện nút "Cài ứng dụng", không lỗi. Chia sẻ → Thêm vào màn hình chính vẫn chạy |
| 9 | Bật chế độ máy bay rồi mở app đã cài | Mở được, hiện thiết bị ở trạng thái cuối *(cần 3.1 và 3.2)* |
| 10 | Ở chế độ máy bay, xem Console | **Không** có luồng lỗi lặp mỗi 2,5 giây *(cần 3.3)* |
| 11 | Đổi `SO_HIEU`, phát hành lại, mở lại app | Nhận bản mới sau một lần tải lại |

Bước 3, 8 và 10 hay bị bỏ nhất. Bước 9 và 10 chỉ đạt khi đã làm phần B.

---

## 6. Chưa chắc

1. **Chrome 2026 có còn bắt buộc service worker không** — ba nguồn đọc được đều nói có, nhưng không nguồn nào xác nhận riêng cho 2026. Cứ làm thì chắc chắn đúng.
2. **Ngưỡng tương tác** trước khi Chrome bắn `beforeinstallprompt` — một nguồn nói cần một cú chạm và "lịch sử là ~30 giây". Không ép được, nên nút cài có thể không hiện ngay lần đầu.
3. **Từ chối 2 lần thì Chrome lùi 90 ngày** — một nguồn nói vậy, chưa đối chiếu. Nếu đúng thì đừng mời cài quá sớm.
4. **Kích thước cache ảnh khác gốc** — response `opaque` chiếm chỗ nhiều hơn kích thước thật, chưa đo bao nhiêu.
5. **Bản icon maskable** chưa có. Cài vẫn được, chỉ là biểu tượng có thể bị cắt mép trên một số máy Android.
