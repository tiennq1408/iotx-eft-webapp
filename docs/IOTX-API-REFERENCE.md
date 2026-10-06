# IoTX IBS API — bản trích xuất cho webapp

Nguồn: Mydocu `02 · Tài liệu API` (`/n/363`) và các trang con `/n/364`–`/n/367`.

- OpenAPI: `3.0.3`
- Tên hợp đồng: `IoTX IBS — API cho app người dùng cuối`
- Phiên bản hợp đồng: `1.0.0`
- Snapshot tài liệu: `main@83c6735`
- Ngày trích xuất: `18/09/2026`

## Máy chủ

| Base URL | Mục đích |
|---|---|
| `https://api.dev.happibot.net/v1` | Cửa API chính thức cho app/mobile |
| `https://web.dev.happibot.net/v1` | Same-origin cho webapp cũ |

Base URL đã gồm `/v1`. Webapp mới gọi same-origin `/v1`, sau đó Next.js proxy tới `api.dev.happibot.net`.

## Xác thực và phiên

1. `POST /auth/login` hoặc `POST /auth/register` trả `accessToken`, `refreshToken`, `expiresIn`.
2. Gửi `Authorization: Bearer <accessToken>` ở mọi endpoint có khóa.
3. Access token sống mặc định `300` giây.
4. Khi gặp `401`, gọi `POST /auth/refresh`, thay cả access và refresh token rồi thử lại request đúng một lần.
5. Refresh tiếp tục trả `401`: xóa phiên và quay về đăng nhập.

### Token response

```json
{
  "accessToken": "<JWT>",
  "refreshToken": "<REFRESH_TOKEN>",
  "expiresIn": 300,
  "tenant": "livotec"
}
```

`tenant` chỉ có trong login/register; refresh không bắt buộc trả lại tenant.

## Quy ước HTTP và lỗi

- `POST` thành công thường trả `201`.
- `GET`, `PATCH`, `PUT`, `DELETE` thành công thường trả `200`.
- `304`: dữ liệu không thay đổi theo `If-None-Match`; giữ cache hiện tại.
- `400`: request không hợp lệ; hiển thị `message` tiếng Việt.
- `401`: thiếu/sai/hết hạn token hoặc sai mật khẩu.
- `403`: bị chặn tạm do dò claim, hoặc product không cho hẹn giờ.
- `404 {"message":"not_found"}`: không tồn tại hoặc không thuộc người dùng; không suy diễn chi tiết để tránh IDOR.
- `409`: xung đột nghiệp vụ, email đã có hoặc chương trình đang chạy không thể sửa.
- Thân lỗi luôn có `message`.

## Public, theme và bootstrap

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/tenant/theme?tenant=livotec` | Theme, logo, màu, quota, login methods |
| GET | `/i18n?lang=vi&tenant=livotec` | Chuỗi đa ngôn ngữ và danh sách ngôn ngữ |
| POST | `/auth/register` | Đăng ký và nhận token ngay |
| POST | `/auth/login` | Đăng nhập |
| POST | `/auth/refresh` | Làm mới token |
| GET | `/me` | Hồ sơ, tenant, theme và ThingsBoard customer id |
| GET | `/bootstrap?lang=vi` | Devices, categories, hồ sơ, unread và nhãn phiên bản trong một request |
| GET | `/products?lang=vi&tenant=livotec` | Product catalog public |

`/bootstrap` trả:

```ts
{
  devices: Device[];
  categories: { kind: "house" | "room" | "grp"; name: string }[];
  me: Profile;
  unread: number;
  phienBan: { i18n: string; products: string; theme: string };
}
```

`phienBan` dùng để quyết định có cần tải lại theme, i18n hoặc product catalog. Endpoint hỗ trợ `ETag`/`If-None-Match`.

## Thiết bị và product-driven UI

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/devices?lang=vi` | Thiết bị sở hữu, được chia sẻ và thiết bị ảo |
| POST | `/claim` | Claim bằng tên + mã dùng một lần |
| POST | `/claim-mach-that` | Claim mạch thật bằng serial khi mạch online |
| PATCH | `/devices/{id}` | Đổi label, house, room, group, favorite, hidden |
| POST | `/devices/{id}/rpc` | Gửi lệnh RPC |
| POST | `/devices/{id}/muc/{cap}` | Thao tác một mục trong capability `list` |

### RPC

```http
POST /devices/{id}/rpc
Authorization: Bearer <token>
Idempotency-Key: <UUID>
Content-Type: application/json
```

```json
{
  "method": "setPower",
  "params": { "power": true }
}
```

- `method` phải nằm trong `product.capabilities[].rpc`.
- Mỗi thao tác thiết bị thật phải có `Idempotency-Key` UUID mới.
- Gửi lại cùng key không chạy lệnh lần hai; server có thể trả `replayed: true`.
- Sau lệnh tay, automation tạm nhường quyền điều khiển thiết bị.

### Capability

```ts
type Capability = {
  key: string;
  kind: "onoff" | "level" | "enum" | "sensor" | "list";
  label: string;
  rpc?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  unitSpace?: boolean;
  values?: string[];
  labels?: Record<string, string>;
};
```

### UI schema

```ts
type ProductUI = {
  renderer?: string;
  archetype?: string;
  skin?: string;
  controls?: string[];
  gauges?: string[];
  image?: string;
  slots?: Record<string, {
    nhom?: string;
    variant?: string;
    co?: number;
  }>;
};
```

Renderer không nhận diện được phải rơi về màn generic, không được để màn trắng.

### Capability list/vật tư

`POST /devices/{id}/muc/{cap}` nhận:

- `kieu: "them"`: thêm mục/lõi lọc.
- `kieu: "thay"`: đặt lại đồng hồ.
- `kieu: "tuoi"`: sửa tuổi thọ.
- `kieu: "bo"`: ngừng theo dõi.

Server trả `nguon: "server" | "mach"` để cho biết dữ liệu được giữ ở đâu.

## Hẹn giờ theo thiết bị

Chỉ chủ thiết bị được thao tác. Người được chia sẻ nhận `404 not_found`.

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/devices/{id}/hen-gio` | Toàn cảnh hẹn giờ và chương trình |
| PUT | `/devices/{id}/hen-gio/hen` | Đặt/thay hẹn bật hoặc tắt |
| DELETE | `/devices/{id}/hen-gio/hen` | Hủy hẹn |
| POST | `/devices/{id}/hen-gio/chuong-trinh` | Tạo chương trình |
| PUT | `/devices/{id}/hen-gio/chuong-trinh/{ctId}` | Sửa chương trình |
| DELETE | `/devices/{id}/hen-gio/chuong-trinh/{ctId}` | Xóa chương trình |
| POST | `/devices/{id}/hen-gio/chuong-trinh/{ctId}/dung` | Kích hoạt chương trình |
| DELETE | `/devices/{id}/hen-gio/dang-dung` | Dừng chương trình đang dùng |

### Đặt một hẹn

Gửi `bat` và đúng một trong `phut` hoặc `luc`:

```json
{ "bat": false, "phut": 60 }
```

hoặc:

```json
{ "bat": true, "luc": "06:30" }
```

### Giới hạn chương trình

- Tối đa 10 chương trình/thiết bị.
- Tối đa 8 bước/chương trình.
- Tối đa 5 hành động/bước.
- Tên tối đa 40 ký tự.
- `kieu`: `gio` hoặc `khoang`.
- `chay`: `motlan` hoặc `lap`.
- Các capability trong bước phải nằm trong `capChoPhep`.
- `GET /devices/{id}/hen-gio` trả `batDuoc`; false thì app phải giấu màn hẹn giờ.

## Nhà, phòng và nhóm

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/categories` | Danh sách house/room/group |
| POST | `/categories` | Thêm danh mục |
| PATCH | `/categories` | Đổi tên; trùng tên thì gộp |
| DELETE | `/categories/{kind}/{name}` | Xóa; thiết bị về chưa phân loại |

## Chia sẻ

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/shares` | Chia sẻ đã cấp và nhận từ người khác |
| POST | `/shares` | Chia sẻ house/room/device qua email |
| PATCH | `/shares/{id}` | Thay đổi quyền |
| DELETE | `/shares/{id}` | Thu hồi |

Quyền:

```ts
type Permission = {
  control?: boolean;
  create?: boolean;
  delete?: boolean;
};
```

Người được mời chưa đăng ký vẫn tạo share được; response có `pending: true`.

## Thông báo và push

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/notifications` | 50 thông báo mới nhất + unread |
| POST | `/notifications/read` | Đọc một thông báo hoặc tất cả |
| DELETE | `/notifications/{id}` | Xóa thông báo |
| POST | `/push/dang-ky` | Đăng ký FCM token Android/iOS |
| POST | `/push/huy` | Hủy FCM token khi đăng xuất |
| POST | `/push/thu` | Validate thử đường FCM, không gửi thật |

FCM token thuộc đúng một user; đăng nhập tài khoản khác trên cùng máy thì token chuyển sang chủ mới.

## Tự động hóa

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/rules` | Rules và nhóm chương trình từ thiết bị |
| POST | `/rules` | Tạo rule, mặc định `shadow=true` |
| PATCH | `/rules/{id}` | Sửa/bật/tắt rule |
| DELETE | `/rules/{id}` | Xóa rule |
| POST | `/rules/{id}/run` | Chạy tay |
| POST | `/rules/{id}/stop` | Dừng chương trình |
| GET | `/rules/{id}/runs` | 20 lần chạy gần nhất |
| POST | `/rules/simulate` | Mô phỏng điều kiện với telemetry hiện tại |

Giới hạn:

- 20 rule/người mặc định.
- 10 điều kiện `conds`.
- 5 điều kiện `gates`.
- 5 điều kiện `exclusions`.
- 20 actions.
- 12 stages.
- `shadow=true`: chỉ ghi log, không gửi lệnh.

Hai loại rule:

- `kind: "cond"`: If/Then dùng `conds`, `gates`, `exclusions`, `actions`.
- `kind: "sched"`: chương trình nhiều giai đoạn dùng `stages`.

## Thiết bị ảo

| Method | Endpoint | Mục đích |
|---|---|---|
| GET | `/virtual/places` | Danh sách thành phố nguồn thời tiết |
| GET | `/virtual` | Danh sách thiết bị ảo |
| POST | `/virtual` | Tạo external/state/button, tối đa 10 |
| PATCH | `/virtual/{id}` | Đổi tên |
| DELETE | `/virtual/{id}` | Xóa nếu không bị rule sử dụng |
| POST | `/virtual/{id}/state` | Bật/tắt trạng thái nhà |
| POST | `/virtual/{id}/press` | Bấm nút ảo; tự tắt sau 3 giây |

## Trạng thái thời gian thực

```http
GET /stream?thiet_bi=<id,id>
Authorization: Bearer <token>
Accept: text/event-stream
```

Sự kiện:

```text
event: trang-thai
data: {"deviceId":"<id>","key":"power","value":true,"ts":1756500000000}
```

- Heartbeat `: giu-ket-noi` tối đa mỗi 30 giây.
- Không hỗ trợ `Last-Event-ID` và không replay.
- Khi nối lại: gọi `GET /devices` hoặc `/bootstrap` để lấy `lastValues`, sau đó nghe tiếp.
- Nối lại có exponential backoff.

## Endpoint không dành cho app

Không gọi từ webapp/mobile:

- `/admin/*`
- `/internal/*`
- `/danh-muc/*`
- `/vat-tu/*`
- `/health`, `/live`, `/ready`

Đây là API quản trị/hạ tầng, sử dụng `x-admin-key` hoặc mTLS.

## Khoảng trống của webapp tại thời điểm trích xuất

Đã nối: login/register/refresh, bootstrap, product catalog, devices, RPC, categories, shares cơ bản, notifications, rules read, SSE và product-driven renderer.

Cần hoàn thiện theo hợp đồng:

- `ETag`/`If-None-Match` và cache theo `phienBan`.
- `PATCH /shares/{id}`.
- Hẹn giờ đầy đủ theo `/devices/{id}/hen-gio/*`.
- CRUD/run/stop/simulate và lịch sử rules.
- Thiết bị ảo.
- Push FCM (chỉ áp dụng app mobile hoặc PWA có FCM phù hợp).
- Capability kiểu `list` qua `/devices/{id}/muc/{cap}`.

