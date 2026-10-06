# Tích hợp Livotec Home với nền tảng IoTX

Tài liệu này chốt kiến thức đã đối chiếu với bộ tài liệu IOTX trên Mydocu ngày 16/09/2026. Mốc tài liệu nền tảng: `main@83c6735`, môi trường DEV `*.dev.happibot.net`.

## Vai trò của webapp

Web này là ứng dụng người dùng cuối (`web`) chạy Next.js 16 / React 19. Web không gọi trực tiếp Keycloak, ThingsBoard, PostgreSQL hay PKI. Mọi nghiệp vụ đi qua IBS (NestJS) bằng API `/v1` cùng origin:

```text
Browser → Caddy/TLS → web.dev.happibot.net
                    ├── Next.js web
                    └── /v1/* → IBS

Thiết bị → MQTT/TLS 8883 → ThingsBoard → IBS internal telemetry
IBS → SSE /v1/stream → Browser
```

Web hiện dùng `/v1` same-origin và Next.js proxy tới `https://api.dev.happibot.net/v1` qua biến `IOTX_API_UPSTREAM`. Container web không còn phụ thuộc IBS local.

## Chế độ dữ liệu

- `NEXT_PUBLIC_IOTX_MODE=mock`: UI tiếp tục dùng `localStorage`; phù hợp phát triển giao diện.
- `NEXT_PUBLIC_IOTX_MODE=iotx`: dùng `lib/iotx/client.ts` với IBS.
- Không đưa URL bí mật, admin key, mật khẩu, refresh token hoặc tài khoản Mydocu vào source.

File `.env.example` là mẫu duy nhất được commit. `.env.local` phải nằm ngoài Git.

## Trình tự mở ứng dụng thật

1. Trước đăng nhập, gọi `GET /tenant/theme?tenant=livotec` và `GET /i18n?lang=vi&tenant=livotec`.
2. Đăng nhập/đăng ký qua IBS; không gọi Keycloak trực tiếp.
3. Lưu `accessToken`, `refreshToken`, `expiresIn`. Access token sống 300 giây.
4. Gọi `GET /bootstrap?lang=vi` để lấy một lần: thiết bị, danh mục, hồ sơ, số thông báo chưa đọc và nhãn phiên bản.
5. Mở `/stream` để nhận SSE `trang-thai`.
6. Khi SSE đứt: tự nối lại có backoff; sau khi nối lại gọi `/devices` vì server không hỗ trợ `Last-Event-ID`.

`lib/iotx/client.ts` đã hiện thực refresh token và retry request đúng một lần. Refresh tiếp tục nhận `401` thì xóa phiên và trả người dùng về đăng nhập.

## Quy ước bắt buộc

- POST thành công thường trả `201`; GET/PATCH/DELETE trả `200`.
- Mọi lỗi có `message`; câu tiếng Việt có thể hiển thị trực tiếp.
- `404 {"message":"not_found"}` cố ý gộp “không tồn tại” và “không thuộc người dùng” để chống dò/anti-IDOR. UI không được suy diễn chi tiết hơn.
- RPC thật gửi `Idempotency-Key` UUID để chống bấm đúp hoặc gửi lại do mạng chập.
- Danh sách thiết bị gồm thiết bị sở hữu, được chia sẻ và thiết bị ảo. Luôn tôn trọng `perms.control/create/delete`.
- UI thiết bị nên dựng từ `product.capabilities` và `product.ui`. Renderer lạ hoặc `product=null` phải rơi về màn điều khiển chung, tuyệt đối không trắng màn.
- Tạo luật tự động hóa mặc định `shadow=true` (chế độ thử, ghi log nhưng chưa gửi lệnh).
- App chỉ gọi API người dùng cuối. Không gọi `admin/*`, `internal/*`, `danh-muc/*`, `vat-tu/*`, `health`, `live`, `ready`.

## Ánh xạ chức năng UI → API

| Chức năng | API |
|---|---|
| Theme/ngôn ngữ | `GET /tenant/theme`, `GET /i18n` |
| Đăng ký/đăng nhập | `POST /auth/register`, `/auth/login`, `/auth/refresh` |
| Mở Home | `GET /bootstrap` |
| Catalog động | `GET /products` |
| Danh sách thiết bị | `GET /devices` |
| Claim QR/mã | `POST /claim` |
| Claim serial mạch thật | `POST /claim-mach-that` |
| Đổi tên/phân loại | `PATCH /devices/{id}` |
| Điều khiển | `POST /devices/{id}/rpc` |
| Nhà/Phòng/Nhóm | CRUD `/categories` |
| Thành viên | CRUD `/shares` |
| Thông báo | `/notifications`, `/notifications/read` |
| Hẹn giờ thiết bị | `/devices/{id}/hen-gio/*` |
| If–Then/chương trình | CRUD `/rules`, `/rules/simulate`, `/rules/{id}/run|stop` |
| Trạng thái thời gian thực | `GET /stream` (SSE) |

## Giới hạn nghiệp vụ cần phản ánh trong UI

- Tối đa mặc định 20 luật/người.
- Luật: 10 điều kiện If, 5 Only When, 5 Except When, 20 hành động, 12 giai đoạn.
- Hẹn giờ theo thiết bị: 10 chương trình/thiết bị, 8 bước/chương trình, 5 hành động/bước.
- Thiết bị ảo: tối đa 10/người.
- Thông báo: tối đa 50 bản mới nhất; lịch sử chạy luật: 20 lần.

## Chất lượng giao diện

Theo cổng kiểm IOTX:

- Không cuộn ngang.
- Vùng chạm app tối thiểu 44 px.
- Tương phản WCAG: 4.5:1 cho chữ thường, 3:1 cho chữ lớn/control.
- Hit-test bằng click thật tại tâm control ở hai cỡ màn hình.
- Kiểm tra renderer lạ rơi về generic UI.
- Golden screenshot chỉ cập nhật có chủ ý, ở commit riêng/cùng PR có người duyệt.
- Báo cáo test không được chứa mật khẩu/token; tắt trace/video nếu không cần và quét artifact trước khi tải lên.

## Lộ trình nối backend

1. Chuyển Login sang `iotxClient.login/register` và render theme/i18n public.
2. Sau login gọi `bootstrap`, dùng `mergeBootstrap` để cấp dữ liệu cho UI hiện tại.
3. Thay từng mutation local bằng API tương ứng; triển khai optimistic UI có rollback.
4. Dựng control động theo catalog/capabilities; giữ fan renderer làm renderer chuyên biệt.
5. Nối SSE và cập nhật `lastValues`; refetch khi reconnect.
6. Thêm Playwright cho hai viewport, lint vùng chạm/overflow/contrast và test chống lặp RPC.

## Nguồn tham chiếu

- Tổng quan: <https://mydocu-production-8fa0.up.railway.app/n/360>
- Kiến trúc: <https://mydocu-production-8fa0.up.railway.app/n/361>
- API tổng quan: <https://mydocu-production-8fa0.up.railway.app/n/364>
- Xác thực: <https://mydocu-production-8fa0.up.railway.app/n/365>
- Thiết bị: <https://mydocu-production-8fa0.up.railway.app/n/366>
- OpenAPI: <https://mydocu-production-8fa0.up.railway.app/n/367>
- Kiểm thử UI: <https://mydocu-production-8fa0.up.railway.app/n/380>
