# Việc: Ghép OTP (email/SĐT) và đăng nhập Google vào màn đăng nhập

- Trạng thái: **chưa làm** — phần lớn **không nằm ở webapp**
- Phạm vi: `IOT App - New UI` + IBS + sadmin + Google Cloud
- Viết: 14/10/2026

## Hiện trạng đo được hôm nay (14/10/2026)

| Kiểm | Kết quả |
|---|---|
| `POST /v1/auth/otp/*`, `send-otp`, `verify-otp` | `404 Cannot POST` — **cửa không tồn tại** |
| `POST /v1/auth/google` | `404 Cannot POST` |
| `POST /v1/auth/forgot-password`, `quen-mat-khau` | `404 Cannot POST` |
| Trang đăng nhập realm `iot1` | chỉ có ô tài khoản + mật khẩu, **không có nút Google**, không có liên kết đăng ký / quên mật khẩu |
| `/v1/tenant/theme` → `loginMethods` | vẫn khai `["password","otp","google"]` — **khai nhiều hơn thực tế** |
| `lib/iotx/client.ts` | `CUA_QUEN_MAT_KHAU`, `CUA_DANG_NHAP_GOOGLE` … vẫn `= null` |

`Cannot POST` là NestJS nói **không có route**, không phải lỗi quyền. Nghĩa là IBS chưa viết.

### Soi lại sadmin ngày 14/10 — **không có gì thay đổi so với 08/10**

Mục Đăng nhập & Bảo mật, từng ô một:

| Ô | Trạng thái 14/10 |
|---|---|
| Bật gửi email qua SMTP | ❌ tắt · Máy chủ, Tài khoản, Mật khẩu, Gửi từ, Tên hiển thị đều **trống** |
| Bật gửi SMS | ❌ tắt · API key/SID **trống**, Brandname **trống** |
| Bật đăng nhập Google | ❌ tắt · Client ID, Client Secret **trống** |
| Bắt xác minh khi đăng ký (OTP) | ❌ tắt |
| Số điện thoại + mật khẩu | ❌ tắt |
| Passkey (vân tay/khuôn mặt) | ❌ tắt |
| Xác thực hai lớp (2FA) | ❌ Tắt |
| Cho phép tự đăng ký | ✅ bật |
| Cho phép quên mật khẩu | ✅ bật — **nhưng SMTP tắt nên vô hiệu** |
| Giữ đăng nhập | **7 ngày** (mặc định ghi trên màn là 90) |
| Mật khẩu tối thiểu | 8 ký tự, không bắt HOA/thường/số/đặc biệt |

Menu sadmin vẫn đúng 24 mục như cũ, **không có mục mới nào**.

### Và một phát hiện quan trọng: sadmin KHÔNG có màn cho `user_map`

Mục **Quản trị → Người dùng** của sadmin là **tài khoản quản trị của chính sadmin**
(`sadmin`, `phuong`, `tuyen`, `coder`…), **không phải người dùng cuối của app**. Nghĩa là
vấn đề 2.3b — ai tạo `user_map` + customer ThingsBoard khi người dùng đăng nhập Google lần
đầu — **không có cần gạt nào trên sadmin**. Hoàn toàn là việc của IBS.

## Việc của webapp chỉ là phần cuối và nhỏ nhất

Giao diện đã dựng sẵn: nút Google, liên kết Quên mật khẩu, và các hằng `CUA_* = null` để khi
có cửa thì **sửa một dòng mỗi tính năng**. Thứ còn thiếu nằm ở ba nơi khác: **Google Cloud**,
**sadmin**, và **IBS**.

---

## 0. Quyết định phải chốt TRƯỚC — nếu không mọi việc sau đều sai hướng

App hiện đăng nhập bằng **password grant (ROPC)**: webapp gửi email + mật khẩu cho IBS, IBS đổi
lấy token với Keycloak. Cách này **không có chỗ** cho cả hai tính năng:

- **Google** bắt buộc phải chuyển hướng trình duyệt sang Google rồi quay về — ROPC không có bước đó.
- **OTP** cần một bước thứ hai sau mật khẩu — ROPC chỉ có một lượt gọi.

Chính sadmin cũng đã ghi điều này ở màn Đăng nhập & Bảo mật: *"Để BUỘC 2FA ngay trên màn đăng
nhập của app (ROPC) cần thêm bước nhập mã ở app — phần đó để sau."*

Hai đường đi, **chọn một**:

### Phương án A — Webapp chuyển sang `authorization_code` + PKCE

Người dùng bấm Đăng nhập → nhảy sang trang của Keycloak → đăng nhập ở đó → quay về app.

| Ưu | Nhược |
|---|---|
| Keycloak làm **tất cả**: Google, OTP, quên mật khẩu, 2FA — bật bằng ô tích | **Mất màn đăng nhập của app**; người dùng thấy trang Keycloak |
| IBS gần như **không phải viết gì** | Thương hiệu phải làm lại bằng theme của Keycloak |
| Chuẩn mực, hết hạn chế của ROPC | Màn đăng nhập vừa dựng xong coi như bỏ |
| Realm đã bật sẵn `S256` | |

### Phương án B — IBS làm trung gian, webapp giữ màn của mình

IBS mở cửa `/v1/auth/*`, tự nói chuyện với Keycloak / SMTP / SMS. Webapp gọi cửa đó.

| Ưu | Nhược |
|---|---|
| **Giữ nguyên** màn đăng nhập và thương hiệu | IBS phải viết **4–6 cửa mới** |
| Webapp chỉ sửa vài dòng | Google vẫn cần một lần chuyển hướng — IBS phải ôm phần callback |
| Hợp với `AGENTS.md` (app chỉ gọi `/v1`) | Nhiều việc hơn hẳn, và lâu hơn |

**Khuyến nghị: phương án B**, vì màn đăng nhập vừa dựng theo mẫu và sếp đã duyệt dáng. Nhưng
phải nói rõ với IBS đây là 4–6 cửa chứ không phải một.

Phần còn lại của tài liệu viết theo **phương án B**.

---

## 1. Đường OTP — nhận mã qua email hoặc SĐT

### Bước 1.1 — sadmin: khai nhà cung cấp *(không có bước này thì mã không gửi đi đâu)*

Vào **Quản trị → Đăng nhập & Bảo mật**:

| Mục | Việc | Hiện trạng |
|---|---|---|
| Email (SMTP) | khai Máy chủ, Cổng, Bảo mật, Tài khoản, Mật khẩu, Gửi từ, Tên hiển thị → bật **Bật gửi email qua SMTP** | ❌ đang tắt, mọi trường trống |
| Cổng SMS | chọn Twilio / eSMS.vn, khai API key/SID, Brandname → bật **Bật gửi SMS** | ❌ đang tắt, trống |
| Xác minh khi đăng ký | bật **Bắt xác minh khi đăng ký (OTP)** | ❌ đang tắt |
| Đăng nhập bằng SĐT | bật **Số điện thoại + mật khẩu** | ❌ đang tắt (phụ thuộc cổng SMS) |

**Kiểm sau bước này:** nhờ sadmin gửi thử một email và một SMS. Chưa gửi được thì đừng sang bước 1.2.

### Bước 1.2 — IBS: mở hai cửa

Đề xuất hợp đồng để IBS viết thẳng (tên và thân có thể đổi, nhưng **phải chốt trước khi webapp làm**):

```http
POST /v1/auth/otp/gui
{ "tenant": "livotec", "dinhDanh": "ten@congty.com | 0912345678", "viec": "dang-ky | quen-mat-khau" }
→ 201 { "ok": true, "guiToi": "e***@congty.com", "hetHanSau": 600, "guiLaiSau": 60 }
→ 400  định dạng sai
→ 429  xin mã quá nhiều lần
```

```http
POST /v1/auth/otp/xac-nhan
{ "tenant": "livotec", "dinhDanh": "...", "ma": "123456", "viec": "dang-ky" }
→ 201 { "ok": true, ...bộ token }           // nếu là đăng ký/đăng nhập
→ 201 { "ok": true, "veDatLai": "..." }     // nếu là quên mật khẩu
→ 400  mã sai hoặc hết hạn — MỘT câu chung, không phân biệt
→ 429  thử quá nhiều lần
```

Năm điểm IBS phải chốt, **hỏi ngay khi giao việc**:

1. **Mã sống bao lâu?** Đề xuất 10 phút (mẫu HTML của anh đã ghi "hiệu lực trong 10 phút").
2. **Gửi lại sau bao lâu?** Đề xuất 60 giây — webapp cần con số này để đếm ngược.
3. **Sai bao nhiêu lần thì khoá?** Và khoá bao lâu.
4. **Chống dò**: xin mã cho email không tồn tại phải trả **giống hệt** như email có tồn tại.
   Khác nhau là lộ danh sách người dùng.
5. **`guiToi` che thế nào?** `e***@congty.com` / `09****678` — để webapp hiện lại cho người dùng
   biết mã đi đâu mà không lộ đủ địa chỉ.

### Bước 1.3 — Webapp

| Việc | Chi tiết |
|---|---|
| Điền hai hằng | `CUA_OTP_GUI`, `CUA_OTP_XAC_NHAN` trong `lib/iotx/client.ts` |
| Màn nhập mã | 6 ô số, tự nhảy ô, dán được cả chuỗi, bàn phím số trên di động |
| Đếm ngược | dùng `guiLaiSau` máy chủ trả, **không** cắm cứng 60 |
| Hiện nơi nhận | dùng `guiToi` máy chủ trả, không tự ghép |
| Chọn email hay SĐT | theo `loginMethods` — ⚠️ xem cảnh báo mục 3 |

Màn "Đã gửi mã" đã có sẵn trong `LoginScreen.tsx` từ đợt dựng theo `docs/mau/login.html`, chỉ
cần nối vào cửa thật.

---

## 2. Đường Google

### Bước 2.1 — Google Cloud Console *(người có quyền trên tài khoản Google của công ty làm)*

1. Tạo project (hoặc dùng project sẵn có) → **APIs & Services → Credentials**
2. **Create credentials → OAuth client ID → Web application**
3. **Authorized redirect URI** điền đúng dòng sadmin đã in sẵn:
   ```
   https://sso.dev.happibot.net/realms/iot1/broker/google/endpoint
   ```
4. Lấy **Client ID** và **Client Secret**
5. Màn **OAuth consent screen**: điền tên app, logo, email hỗ trợ. Nếu muốn người ngoài công ty
   đăng nhập được thì phải đưa app sang chế độ **Production** — việc này Google có thể **duyệt
   vài ngày**, tính vào lịch.

### Bước 2.2 — sadmin: bật Google SSO

Dán Client ID + Secret vào mục **Google SSO**, bật **Bật đăng nhập Google**, Lưu.

**Kiểm ngay sau bước này:** mở `https://sso.dev.happibot.net/realms/iot1/account/`. Trang đăng
nhập phải **mọc thêm nút Google**. Không có nghĩa là identity provider chưa được tạo — dừng lại,
đừng sang bước sau.

### Bước 2.3 — Ba quyết định phải chốt, không có mặc định an toàn

| # | Vấn đề | Vì sao quan trọng |
|---|---|---|
| **a** | **Tenant lấy ở đâu?** Realm `iot1` chứa user của **mọi** tenant; token Keycloak **không có claim tenant** (đã kiểm). Luồng Google cũng không mang tenant theo | Không chốt thì user Google vào không biết thuộc hãng nào |
| **b** | **Ai tạo `user_map` + customer ThingsBoard?** `POST /auth/register` hiện tạo cả ba (Keycloak + TB + user_map). Google thì **Keycloak tự tạo user** ở lần đăng nhập đầu, **không đi qua `/register`** | Không nối thì user có token hợp lệ nhưng `GET /bootstrap` trượt — đăng nhập được mà app trống |
| **c** | **Trùng email thì sao?** Đã đăng ký `abc@gmail.com` bằng mật khẩu, sau bấm Google cùng email | Keycloak mặc định báo *"User with email already exists"* và **chặn**, trừ khi bật tự nối tài khoản |

Điểm **b** là chỗ chắc chắn vỡ nếu bỏ qua. Cách xử lý: Keycloak có bước **"first broker login"**
— IBS gắn vào đó để tạo `user_map` và customer ThingsBoard, hoặc IBS tự tạo khi thấy user lạ
ở lần gọi `/bootstrap` đầu tiên.

### Bước 2.4 — IBS: mở hai cửa

```http
GET /v1/auth/google/bat-dau?tenant=livotec&ve=<đường quay lại trong app>
→ 302 chuyển hướng sang Keycloak broker
```

```http
GET /v1/auth/google/ket-qua?code=...&state=...
→ 302 quay về app kèm một MÃ DÙNG MỘT LẦN (không phải token)
```

```http
POST /v1/auth/google/doi-token
{ "ma": "<mã dùng một lần>" }
→ 201 bộ token như /auth/login
```

**Vì sao ba cửa chứ không hai:** không được trả token thẳng trên URL. Phần trước `#` đi vào
nhật ký máy chủ, phần sau `#` nằm lại trong lịch sử trình duyệt. Trả **mã dùng một lần**, app
đổi lấy token bằng `POST` — đây là cách chuẩn.

### Bước 2.5 — Webapp

| Việc | Chi tiết |
|---|---|
| Điền hằng | `CUA_DANG_NHAP_GOOGLE` trong `lib/iotx/client.ts` |
| Nút Google | đang báo "chờ bật" → đổi thành mở `/v1/auth/google/bat-dau` |
| Màn quay về | nhận mã dùng một lần, gọi `doi-token`, cất phiên, vào màn chính |
| Lỗi | người dùng bấm Huỷ ở Google → quay về màn đăng nhập, báo nhẹ nhàng, **không** treo |

---

## 3. Một cảnh báo về `loginMethods`

`/v1/tenant/theme` đang trả `loginMethods: { eu: ["password","otp","google"] }` trong khi
**cả `otp` lẫn `google` đều chưa chạy được** — không có cửa, sadmin tắt, realm chưa có IdP.

Nên webapp **không được** chỉ dựa vào trường này để hiện nút. Hỏi IBS:

> `loginMethods` là **khai báo ý định** hay **năng lực thật**? Nếu là ý định thì cần thêm một
> trường nữa nói cái gì đang thật sự bật.

Trước khi có câu trả lời: webapp giữ cách hiện tại (hiện nút, bấm vào báo "đang chờ bật").

---

## Thứ tự làm và ai làm

| # | Việc | Ai | Chặn bởi |
|---|---|---|---|
| 0 | Chốt phương án A hay B | sếp + IBS + anh | — |
| 1 | Tạo OAuth client trên Google Cloud | người quản trị Google của công ty | — |
| 2 | Khai SMTP + cổng SMS trên sadmin | hạ tầng | mua dịch vụ SMS |
| 3 | Dán Client ID/Secret, bật Google SSO | hạ tầng | bước 1 |
| 4 | Chốt 3 quyết định ở mục 2.3 + 5 điểm ở 1.2 | IBS + anh | — |
| 5 | Viết 2 cửa OTP | IBS | bước 2, 4 |
| 6 | Viết 3 cửa Google | IBS | bước 3, 4 |
| 7 | Nối webapp | tab Code | bước 5, 6 |
| 8 | Chạy A1-10 … A1-14 trong `docs/kich-ban-test.md` | anh | bước 7 |

**Việc của webapp (bước 7) chỉ chiếm khoảng một phần mười công sức cả hạng mục.** Đây là điều
cần nói rõ khi báo tiến độ — nhìn vào màn hình thì tưởng là việc giao diện.

## Không làm

- ❌ Webapp gọi thẳng Keycloak hay Google — `AGENTS.md` cấm, và sẽ phải viết lại khi đổi IdP.
- ❌ Trả token trên URL ở bước quay về từ Google (mục 2.4).
- ❌ Phân biệt "email này chưa đăng ký" với "mã sai" ở cửa OTP — lộ danh sách người dùng.
- ❌ Cắm cứng 60 giây đếm ngược hay 10 phút hết hạn — lấy từ máy chủ.
- ❌ Bật Google trên sadmin trước khi có Client ID thật — sadmin sẽ tự để tắt.
