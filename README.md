# Livotec Home – Next.js 16

Ứng dụng người dùng cuối của nền tảng IoTX, chuyển từ prototype HTML Livotec Home sang React components thật, không dùng iframe.

Kiến trúc đã được căn chỉnh theo tài liệu IOTX:

- Web gọi API qua `/v1` same-origin; proxy nằm ở `app/v1/[...path]/route.ts`.
- Mock `localStorage` và IoTX API được tách riêng.
- Lớp API có refresh token, retry một lần, idempotency cho RPC và SSE reconnect có jitter.
- TypeScript contracts và mapper chuyển dữ liệu `/bootstrap` sang model UI hiện tại.
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

## Cloud Run

Để có một địa chỉ cố định gửi người khác xem, không phụ thuộc máy ai đang bật:

```bash
gcloud auth login
gcloud config set project <ten-project>
./trien-khai-cloudrun.sh
```

Script in ra link `https://<ten>-<ma>.asia-southeast1.run.app` ở dòng cuối. Mỗi lần chạy lại,
link **giữ nguyên** — khác hẳn quick tunnel của Cloudflare vốn đổi địa chỉ mỗi lần khởi động.

Hai tham số không hiển nhiên, lý do nằm trong chú thích của script: `--timeout 3600` vì app
dùng SSE mà Cloud Run mặc định cắt request ở 300 giây, và `--min-instances 1` để khách bấm
link không gặp khởi động nguội. Xong đợt demo thì hạ về 0 cho khỏi tốn:

```bash
gcloud run services update livotec-home --region asia-southeast1 --min-instances 0
```

## Các lệnh kiểm tra

```bash
npm run lint
npx tsc --noEmit
npm run build
```
