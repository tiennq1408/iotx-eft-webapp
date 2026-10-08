# Việc: Dựng lại màn đăng nhập theo mẫu HTML

- Trạng thái: **chưa làm**
- Phạm vi: `IOT App - New UI`
- Làm ở đâu: **tab Code**
- Viết lại: 08/10/2026 — thay cho bản "giống hệt web.dev"; yêu cầu đã đổi sang mẫu HTML riêng
- Mẫu tham chiếu: **`docs/mau/login.html`** (mở bằng trình duyệt để xem)

## Mục tiêu

Lấy **cấu trúc, bố cục và các thành phần** của `docs/mau/login.html`. Giữ lại ba thứ của local:

1. **Ảnh nền**
2. **Logo / wordmark**
3. **Toàn bộ logic gọi API** — `iotxClient.login/register`, `laLoiDangNhap`, `moTaLoi`,
   luật 401/404 nói cùng một câu

CSS cũ giữ lại rồi sửa dần, không viết lại từ đầu.

## Bốn quyết định đã chốt (08/10/2026)

| Chỗ | Chốt |
|---|---|
| Màu & phông | **Giữ màu local**, chỉ lấy dáng của mẫu. `colorPrimary` vẫn từ `/tenant/theme`. **Không** cắm cứng `#0B5E51`, **không** tải Be Vietnam Pro từ Google Fonts |
| Quên mật khẩu | **Dựng đủ hai màn**, chờ API. Biết trước là nút "Gửi mã" sẽ lỗi cho tới khi IBS mở cửa và SMTP được bật |
| Ghi nhớ đăng nhập | **Giữ ô tích**, chưa nối gì |
| Email / SĐT | **Theo `loginMethods` của `/tenant/theme`.** Chưa bật SĐT thì nhãn và phép kiểm chỉ nhận email |

## Cấu trúc lấy từ mẫu

Ba màn, chuyển qua lại bằng **state của React** (không dùng `location.hash` như mẫu — app
là SPA một khung, đổi hash sẽ đụng phần điều hướng sẵn có):

```
┌ ĐĂNG NHẬP ──────────────────────────────┐
│ .topbar   logo + tên app · chọn ngôn ngữ │
│ .head     h1 "Đăng nhập" + .lead         │
│ form      .alert (lỗi chung, role=alert) │
│           .field  nhãn + ô + .err        │
│           .field  nhãn + ô mật khẩu      │
│                   + nút con mắt          │
│           .row    [ghi nhớ] [quên mk?]   │
│           .btn    Đăng nhập              │
│ .foot     Chưa có tài khoản? Đăng ký ngay│
└──────────────────────────────────────────┘

┌ QUÊN MẬT KHẨU ──┐   bước 1: .badge + h1 + .lead + ô định danh + nút Gửi mã
│ .topbar  nút ‹  │   bước 2: .badge + "Đã gửi mã" + nút Nhập mã + Gửi lại
└─────────────────┘

┌ ĐĂNG KÝ ────────┐   họ tên · định danh · mật khẩu + con mắt + .hint
│ .topbar  nút ‹  │   nhập lại mật khẩu · ô tích điều khoản · nút Đăng ký
└─────────────────┘
```

Thành phần đáng lấy nguyên:

- **Nhãn nằm trên ô** (`.field > label`) chứ không chỉ placeholder — đọc màn hình mới hiểu được.
- **Nút con mắt** hiện/ẩn mật khẩu, 48×48, đổi cả `aria-label`.
- **Hai tầng báo lỗi**: `.alert` chung ở đầu form (`role="alert"`) và `.err` dưới từng ô,
  kèm viền đỏ `.invalid` và `aria-invalid` trên ô sai.
- **Kiểm ngay khi gõ**: `input` thì xoá lỗi của chính ô đó.
- Số đo: ô nhập cao `52px`, nút cao `52px`, `.check` và `.row a` `min-height:44px`,
  bo `12px`. Mẫu này đã đạt ngưỡng chạm 44px — giữ nguyên, **đừng hạ xuống**.

## Sáu chỗ mẫu va vào thực tế — xử lý thế nào

### 1. ❌ Bỏ hẳn: đếm số lần thử còn lại

Mẫu có `attemptsLeft = 5` và câu *"Bạn còn {n} lần thử trước khi tài khoản bị tạm khóa"*.
Con số đó **do client tự đếm** — máy chủ không trả về gì như vậy. Hợp đồng `/auth/login`
chỉ có `401` (sai mật khẩu) và `404`; luật "sai quá 10 lần trong 10 phút → 403" là của
cửa **claim**, không phải đăng nhập.

Hiện một con số bịa cho người dùng là tệ hơn không hiện gì. **Bỏ cả biến lẫn câu chữ.**

### 2. ❌ Bỏ: tách riêng lỗi "Mật khẩu không đúng"

Mẫu gắn lỗi vào đúng ô mật khẩu. Hợp đồng cố ý **không** phân biệt: sai mật khẩu `401`,
sai tenant `404`, cả hai phải nói **cùng một câu** — đó là lý do `laLoiDangNhap` tồn tại.
Tách ra là lộ "email này có tồn tại".

Giữ hai tầng báo lỗi của mẫu, nhưng:
- `.err` dưới từng ô **chỉ dùng cho lỗi định dạng ở client** (bỏ trống, email sai dạng,
  mật khẩu < 8 ký tự).
- Lỗi từ máy chủ **luôn** vào `.alert` chung, nội dung do `moTaLoi`/`laLoiDangNhap` quyết.

### 3. Số điện thoại — đọc `loginMethods`

`GET /v1/tenant/theme` trả:

```json
"loginMethods": { "eu": ["password","otp","google"], "staff": ["password","sso"] }
```

**Cảnh báo:** trường này đang khai nhiều hơn thực tế. Đo ngày 08/10 trên sadmin
(Quản trị → Đăng nhập & Bảo mật): "Số điện thoại + mật khẩu" **đang TẮT**, cổng SMS trống;
Google SSO **đang TẮT**, Client ID/Secret trống. Nên **đừng tin `loginMethods` một mình** —
nếu IBS có trường nào nói rõ hơn thì dùng, không thì mặc định **chỉ email** và hỏi IBS xem
trường nào mới là nguồn thật.

Chưa bật SĐT thì: nhãn ghi "Email", placeholder chỉ ví dụ email, phép kiểm chỉ nhận email.
Bật rồi thì nhãn thành "Email hoặc số điện thoại" và nhận thêm `isPhone` như mẫu.

### 4. `.hint` mật khẩu — sửa cho đúng chính sách thật

Mẫu ghi *"Tối thiểu 8 ký tự, gồm chữ và số."* Sadmin đang đặt: tối thiểu **8 ký tự**,
**không** tích chữ HOA / chữ thường / chữ số / ký tự đặc biệt.

Viết đúng: **"Tối thiểu 8 ký tự."** Và chặn ngay ở client — hợp đồng gộp lỗi này vào `409`
chung với "email đã đăng ký", người dùng không đoán được mình sai gì.

### 5. Quên mật khẩu — dựng nhưng phải thất bại tử tế

Đã chốt là dựng đủ hai màn. Nhưng tới hôm nay: `/v1` **không có cửa** gửi mã, và SMTP trong
sadmin **đang tắt**. Nên nút "Gửi mã xác nhận" sẽ hỏng.

Yêu cầu: gọi cửa thật khi có; chưa có thì bắt lỗi và hiện trong `.alert` một câu nói rõ
*"Chưa gửi được mã — tính năng đang chờ bật"*, **không** nhảy sang màn "Đã gửi mã". Màn
bước 2 vẫn dựng sẵn, chỉ không tới được.

Đặt tên cửa ở một chỗ trong `lib/iotx/client.ts` kèm chú thích "chờ IBS", để sau này nối
vào chỉ sửa một nơi.

### 6. Liên kết Điều khoản / Chính sách bảo mật

Mẫu trỏ `#terms`, `#privacy` — chưa có trang nào. Hoặc trỏ tới trang thật, hoặc bỏ hai
liên kết và chỉ để chữ thường. **Đừng** để liên kết chết.

## Tệp phải sửa

| Tệp | Sửa gì |
|---|---|
| `components/newui/LoginScreen.tsx` | dựng lại ba màn theo cấu trúc trên |
| `app/globals.css` | sửa khối `.login-*` sẵn có theo số đo của mẫu; thêm `.field/.err/.alert/.input-wrap/.eye/.check/.row/.foot/.badge` trong phạm vi màn đăng nhập |
| `components/LivotecApp.tsx` | truyền `tenHang`, `lang`, `langs`, `onLang` (cả bốn đã có trong `useDuLieuIotx`) |
| `lib/newui/strings.ts` | chuỗi mới cho ba màn, ba ngôn ngữ |
| `lib/iotx/client.ts` | chỗ đặt sẵn cho cửa quên mật khẩu |
| `tests/` | cập nhật bài đang ghim màn đăng nhập cũ (`thanh-loc.mjs`, `e2e.mjs`, `khoa-chu.mjs`) |

## Cách kiểm chứng

```bash
npx tsc --noEmit
npm run lint
npm run build
node tests/chay.mjs giao-dien
```

Bài kiểm:

1. Màn đăng nhập có đủ: topbar (logo + chọn ngôn ngữ), h1 + lead, hai ô có **nhãn riêng**,
   nút con mắt, hàng [ghi nhớ | quên mật khẩu], nút Đăng nhập, dòng chân.
2. Bấm con mắt → `type` đổi `password` ↔ `text`, `aria-label` đổi theo.
3. Bỏ trống ô → `.err` dưới đúng ô đó, ô có `aria-invalid="true"`; gõ lại thì lỗi biến mất.
4. Mật khẩu 7 ký tự ở màn đăng ký → chặn tại chỗ, **không** gửi request.
5. Máy chủ trả 401 → câu lỗi vào `.alert` chung, **không** vào `.err` của ô mật khẩu.
6. **Không có phần tử nào chứa chữ "lần thử"** — xem mục 1.
7. `loginMethods` không có `phone` → nhãn chỉ "Email", gõ số điện thoại bị chặn tại chỗ.
8. Quên mật khẩu: bấm Gửi mã khi chưa có cửa → `.alert` báo chưa bật, **không** sang bước 2.
9. Đăng ký: hai ô mật khẩu khác nhau → báo lỗi tại chỗ.
10. Đăng ký: chưa tích điều khoản → nút Đăng ký không gửi.
11. Số mục ngôn ngữ bằng đúng `langs` máy chủ trả; đổi sang `en` → chữ đổi ngay, chưa cần đăng nhập.
12. Mọi phần tử bấm được ≥44px; ô nhập và nút cao 52px.
13. `a11y.mjs` trên cả ba màn: không còn cảnh báo tương phản — chữ xám `.lead`/`.hint` nằm
    trên **ảnh nền** của local, không phải nền phẳng như mẫu, nên đây là chỗ dễ trượt nhất.

Soi mắt: mở `docs/mau/login.html` cạnh app ở 390px, so khoảng cách từng khối.

## Ràng buộc (AGENTS.md)

- `/i18n` và `/tenant/theme` là cửa public, gọi được trước đăng nhập — `client.ts` đã đúng.
- Không gọi thẳng Keycloak; mọi đường đăng nhập qua `/v1/auth/*`.
- `401` và `404` nói **cùng một câu** — `laLoiDangNhap` giữ nguyên.
- Vùng chạm ≥44px, không tràn ngang, tương phản đạt WCAG.

## Không làm

- ❌ Đếm số lần thử còn lại (mục 1).
- ❌ Gắn lỗi máy chủ vào ô mật khẩu (mục 2).
- ❌ Cắm cứng `#0B5E51` hay bất kỳ màu nào — màu nhấn đến từ `theme.colorPrimary`.
- ❌ Tải Be Vietnam Pro từ Google Fonts.
- ❌ Dùng `location.hash` để chuyển màn.
- ❌ Bọc thêm một khung `.app max-width:390px` — app đã có khung `.phone`.
- ❌ Bỏ ảnh nền hoặc logo của local.
- ❌ Để liên kết Điều khoản / Chính sách trỏ vào chỗ không có.
