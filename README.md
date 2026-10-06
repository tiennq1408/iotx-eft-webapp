# Livotec Home – Next.js 16

Ứng dụng người dùng cuối của nền tảng IoTX, chuyển từ prototype HTML Livotec Home sang React components thật, không dùng iframe.

Giao diện hiện tại dựng theo prototype `livotec-home-new-ui.html` (5 tab, menu phải, màn
điều hòa flagship, 3 ngôn ngữ). Cách ánh xạ prototype → components, những chỗ cố ý làm
khác bản thiết kế và các lỗi đã chặn: xem `docs/GIAO-DIEN-MOI.md`.

Kiến trúc đã được căn chỉnh theo tài liệu IOTX:

- Web gọi API qua `/v1` same-origin; proxy nằm ở `app/v1/[...path]/route.ts`.
- Mock `localStorage` và IoTX API được tách riêng.
- Lớp API có refresh token, retry một lần, idempotency cho RPC và SSE reconnect có jitter.
- TypeScript contracts và mapper chuyển dữ liệu `/bootstrap` sang model UI hiện tại.
- Màn điều khiển dựng từ `product.capabilities`; sản phẩm lạ rơi về màn chung.
- Chi tiết tại `docs/IOTX-INTEGRATION.md`.

```bash
npm install
npm run dev
```

Mặc định chạy ở chế độ IoTX và kết nối API DEV.

Để cấu hình môi trường local:

```bash
cp .env.example .env.local
```

## Tài sản tĩnh

- `public/images/livotec/*` — ảnh sản phẩm, logo, cờ, icon nav (bóc ra từ prototype, trước
  đây nhúng base64 vào mã chạy).
- `public/data/ac-features.<lang>.json` — 114 tính năng nâng cao của điều hòa, tải lười khi
  người dùng mở màn đó.

## Biến môi trường: lúc build và lúc chạy

Phân biệt hai nhóm này, nhầm là dính bẫy im lặng.

| Biến | Có tác dụng khi | Đổi bằng cách |
|---|---|---|
| `NEXT_PUBLIC_IOTX_MODE` | lúc build | build lại (`--build-arg`) |
| `NEXT_PUBLIC_IOTX_API_BASE` | lúc build | build lại |
| `NEXT_PUBLIC_IOTX_TENANT` | lúc build | build lại |
| `NEXT_PUBLIC_IOTX_LANG` | lúc build | build lại |
| `IOTX_API_UPSTREAM` | **lúc chạy** | `-e` khi `docker run` |

Mọi biến `NEXT_PUBLIC_*` được nướng vào mã chạy trong trình duyệt nên bắt buộc có mặt lúc build.

`IOTX_API_UPSTREAM` thì khác: proxy `/v1` là một route handler đọc biến này ở **từng request**, nên một ảnh Docker dùng được cho DEV, staging và production. Trước đây đường này khai bằng `rewrites()` trong `next.config.ts` — hàm đó chỉ chạy lúc build và ghi địa chỉ cứng vào manifest, khiến biến truyền lúc chạy không có tác dụng.

Ở môi trường thật, Caddy mới là chỗ định tuyến `/v1` tới IBS; lớp proxy này phục vụ lúc phát triển và khi chạy container độc lập.

## Docker

```bash
docker build -t livotec-home:dev .
docker run --rm -p 3000:3000 \
  -e IOTX_API_UPSTREAM=https://api.dev.happibot.net \
  livotec-home:dev
```

Chạy chế độ offline (không cần IBS):

```bash
docker build --build-arg NEXT_PUBLIC_IOTX_MODE=mock -t livotec-home:mock .
```

Ảnh dùng `output: "standalone"` nên tầng runner không cài lại phụ thuộc, chạy bằng `node server.js` với người dùng `node`, và có `HEALTHCHECK` gọi vào trang chủ.

## Các lệnh kiểm tra

```bash
npm run lint
npx tsc --noEmit
npm run build
```
# iotx-eft
