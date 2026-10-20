# Yêu cầu hạ tầng: SMTP gửi thư và Google OAuth client

- Gửi: đội Hạ tầng · người giữ tài khoản Google của công ty
- Người yêu cầu: TienQuang — IoTX / Livotec Home
- Ngày: 16/10/2026
- Môi trường: **DEV** trước, production sau

## Vì sao cần

App Livotec Home sắp mở ba luồng: **đăng ký có mã xác thực qua email**, **quên mật khẩu bằng
mã email**, và **đăng nhập bằng tài khoản Google**.

Phần cấu hình trong hệ thống đã sẵn sàng — bảng quản trị có đủ ô để khai, chỉ còn **trống thông
tin**. Không có hai thứ dưới đây thì **mã xác thực không gửi đi đâu** và **nút Google không bật
được**. Hiện hai luồng này đang chặn ở đúng chỗ đó, không chặn ở phần lập trình.

---

# PHẦN A — Máy chủ gửi thư (SMTP)

## A1. Tám thông tin cần cung cấp

Đây là đúng tám ô mà hệ thống cần. Xin điền đủ cả tám.

| # | Thông tin | Ví dụ | Ghi chú |
|---|---|---|---|
| 1 | **Máy chủ (host)** | `smtp.sendgrid.net` | |
| 2 | **Cổng** | `587` | hệ thống mặc định 587 |
| 3 | **Bảo mật** | `STARTTLS (587)` | chọn 1 trong 3: **STARTTLS (587)** · **SSL (465)** · **Không** |
| 4 | **Tài khoản** | `apikey` | tên đăng nhập SMTP |
| 5 | **Mật khẩu** | — | **xem mục A4 về cách bàn giao** |
| 6 | **Gửi từ** | `noreply@happibot.net` | địa chỉ hiện ở ô "From" |
| 7 | **Tên hiển thị** | `Livotec Home` | tên người dùng thấy trong hộp thư |
| 8 | **Giới hạn gửi** | `vd: 100 thư/giờ, 2.000 thư/ngày` | **quan trọng — xem A3** |

## A2. Ba việc kèm theo, không thể bỏ

| | Việc | Vì sao |
|---|---|---|
| a | **SPF** cho tên miền gửi | thiếu → thư vào thẳng spam |
| b | **DKIM** | như trên |
| c | **DMARC** | như trên |

Mã xác thực mà rơi vào spam thì người dùng không đăng ký được, và họ sẽ báo là *"app hỏng"* chứ
không ai nghĩ tới thư mục spam. Với luồng này, **vào được hộp thư chính là yêu cầu bắt buộc**,
không phải tối ưu thêm.

## A3. Vì sao hỏi giới hạn gửi

Mỗi lần người dùng đăng ký hoặc bấm quên mật khẩu là **một thư**. Người dùng bấm "gửi lại mã"
cũng là thêm một thư. Nếu nhà cung cấp chặn ở mức thấp, đúng giờ cao điểm hệ thống sẽ ngưng gửi
và người dùng kẹt.

Cho chúng tôi con số thật để đặt giới hạn tốc độ phía ứng dụng cho khớp — thà chặn sớm có báo rõ
ràng, còn hơn bị nhà cung cấp cắt giữa chừng.

Cũng xin cho biết: **nhà cung cấp có bắt địa chỉ "Gửi từ" phải trùng tài khoản đăng nhập không?**
Nhiều dịch vụ bắt, và đó là lỗi hay gặp khi khai lần đầu.

## A4. Cách bàn giao mật khẩu — xin đọc kỹ

**Đừng gửi mật khẩu SMTP qua chat hoặc email thường.** Vui lòng dùng một trong ba cách:

1. Nhập thẳng vào ô "Mật khẩu" của bảng quản trị — chúng tôi mở màn, bên hạ tầng tự gõ vào.
2. Gửi qua trình quản lý mật khẩu của công ty.
3. Gửi qua một liên kết dùng một lần, tự huỷ.

Chúng tôi **không cần biết** mật khẩu đó. Chỉ cần nó nằm đúng chỗ trong cấu hình.

## A5. Nghiệm thu phần A

Xong khi: gửi thử một thư tới **một hộp thư Gmail** và **một hộp thư Outlook**, cả hai **vào
Inbox, không vào Spam**. Xin gửi kèm ảnh chụp để xác nhận.

---

# PHẦN B — Google OAuth client

## B1. Hai thông tin cần cung cấp

| # | Thông tin | Ghi chú |
|---|---|---|
| 1 | **Client ID** | dạng `…apps.googleusercontent.com` |
| 2 | **Client Secret** | bàn giao theo cách ở mục A4 |

## B2. Địa chỉ chuyển hướng — CHÉP NGUYÊN VĂN

Trong Google Cloud Console, mục **Authorized redirect URIs**, thêm đúng chuỗi này:

```
https://sso.dev.happibot.net/realms/iot1/broker/google/endpoint
```

**Sai một ký tự là Google chặn toàn bộ luồng đăng nhập**, kèm câu lỗi `redirect_uri_mismatch`.
Xin chép dán, đừng gõ tay.

Không cần khai "Authorized JavaScript origins" — luồng này chạy phía máy chủ.

Khi lên production sẽ cần thêm một địa chỉ nữa; chúng tôi sẽ gửi sau, **không** dùng lại địa chỉ
DEV ở trên.

## B3. Màn hình đồng ý (OAuth consent screen)

Google bắt khai màn hình này trước khi client hoạt động. Cần quyết:

| Mục | Cần gì |
|---|---|
| **Loại người dùng** | **External** nếu khách hàng dùng Gmail cá nhân · **Internal** nếu chỉ nội bộ công ty |
| Tên ứng dụng | tên người dùng nhìn thấy khi bấm đăng nhập |
| Email hỗ trợ người dùng | công khai |
| Email liên hệ nhà phát triển | |
| Authorized domain | `happibot.net` |
| Logo ứng dụng | tuỳ chọn, nhưng nên có |
| Scope | chỉ cần ba: `openid`, `email`, `profile` — **không xin thêm** |

> ⚠️ **Một cái bẫy phải biết trước.** Nếu chọn **External** mà để trạng thái **"Testing"** thì
> **chỉ những tài khoản được thêm vào danh sách test mới đăng nhập được**, tối đa 100 tài khoản.
> Người ngoài danh sách sẽ thấy màn báo lỗi của Google.
>
> Dùng cho DEV thì "Testing" là đủ — xin **thêm sẵn các email sẽ dùng để kiểm thử**.
> Trước khi mở cho khách hàng thật thì phải chuyển sang **"In production"**, và bước đó Google có
> thể **yêu cầu xét duyệt, mất vài ngày**. Xin tính thời gian này vào kế hoạch ngay từ bây giờ,
> đừng để sát ngày phát hành mới làm.

## B4. Nghiệm thu phần B

Xong khi: chúng tôi dán Client ID + Secret vào bảng quản trị, lưu, rồi mở
`https://sso.dev.happibot.net/realms/iot1/account/` và thấy **nút "Google" hiện ra** ở trang
đăng nhập.

---

# Mẫu để điền và gửi lại

```
── SMTP ──
Máy chủ (host)      :
Cổng                :
Bảo mật             :  STARTTLS(587) / SSL(465) / Không
Tài khoản           :
Mật khẩu            :  (gửi riêng theo mục A4)
Gửi từ              :
Tên hiển thị        :
Giới hạn gửi        :        thư/giờ,          thư/ngày
"Gửi từ" có buộc trùng tài khoản không?  Có / Không
SPF đã cấu hình     :  Rồi / Chưa
DKIM đã cấu hình    :  Rồi / Chưa
DMARC đã cấu hình   :  Rồi / Chưa

── GOOGLE ──
Client ID           :
Client Secret       :  (gửi riêng theo mục A4)
Redirect URI đã khai:  Rồi / Chưa
Loại người dùng     :  Internal / External
Trạng thái          :  Testing / In production
Nếu Testing, email đã thêm vào danh sách test:

── THỜI GIAN ──
Dự kiến xong phần SMTP   :
Dự kiến xong phần Google :
```

---

# Mức ưu tiên

**SMTP gấp hơn.** Nó chặn **hai** luồng (đăng ký có mã, quên mật khẩu), còn Google chỉ chặn một.
Nếu phải chọn làm trước một việc, xin làm **SMTP**.

Phần lập trình hai bên (IBS và webapp) đã bắt đầu được rồi và không chờ hai thứ này — nhưng đến
khâu chạy thử thì không có cách nào đi tiếp nếu thiếu.
