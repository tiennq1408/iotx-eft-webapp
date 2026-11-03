# Đặc tả cấu hình sadmin — Cổng SMS + Cổng Zalo ZNS

*29/10/2026 · TienQuang · Livotec Home / IoTX*
*Bổ sung cho `claude/otp-sms.md`. Thay phần cấu hình trong `docs/dac-ta-sms-sadmin.md`.*

---

## Tóm tắt

| Khối | Làm gì bây giờ | Trạng thái lưu |
|---|---|---|
| **Cổng SMS** | Bổ sung đủ ô, **để trống**, `bat: false`. Điền khi có nhà cung cấp và brandname | Lưu được khi trống |
| **Cổng Zalo ZNS** | **Làm mới từ đầu**, đây là kênh chính | Bật khi đủ ô và gửi thử thành công |
| **Chính sách OTP** *(khối mới, dùng chung)* | Hạn mã, độ dài, thứ tự kênh, giới hạn, trần chi tiêu, đầu số | Có giá trị mặc định |

Hạn mã, độ dài mã, trần chi tiêu và đầu số cho phép trước đây định đặt trong khối SMS. Nay chuyển sang khối **Chính sách OTP** dùng chung, vì Zalo và SMS đều cần, và hai kênh phải gửi **cùng một mã**.

**Thứ tự kênh mặc định: Zalo → SMS.** ZNS khoảng 330đ/tin, chỉ tính tin thành công. SMS khoảng 790đ/tin, cộng 200.000đ/tháng duy trì brandname. Khi SMS còn trống, kênh số điện thoại chạy **chỉ bằng Zalo**. Người không dùng Zalo được hướng sang email.

---

## 1. Khối Chính sách OTP (dùng chung)

| Ô | Khoá JSON | Mặc định | Ghi chú |
|---|---|---|---|
| Thứ tự kênh cho số điện thoại | `thuTuKenh` | `["zalo","sms"]` | Kênh chưa bật thì bỏ qua |
| Hạn mã (giây) | `hetHanGiay` | `300` | **Tối đa 300.** Tin hiện trên màn hình khoá |
| Độ dài mã | `doDaiMa` | `6` | 4–8 |
| Chờ gửi lại (giây) | `choGuiLaiGiay` | `90` | Email giữ 60 |
| Tối đa lần gửi / số / giờ | `toiDaMoiSoGio` | `5` | Lần thứ 6 bị từ chối |
| Tối đa lần gửi / IP / giờ | `toiDaMoiIpGio` | `20` | |
| Chỉ số Việt Nam | `chiVietNam` | `true` | **Không cho tắt trên giao diện** |
| Đầu số cho phép | `dauSo` | `["03","05","07","08","09"]` | Chặn số cố định `02x` |
| Trần chi tiêu / ngày (đ) | `tranNgayVnd` | `200000` | Gộp cả Zalo và SMS. Chạm trần thì ngừng gửi và cảnh báo |
| Email nhận cảnh báo | `emailCanhBao` | — | Email chung của công ty |

**Cách tính trần:** IBS cộng dồn chi phí theo đơn giá ở mỗi khối (`donGiaVnd`). Không chờ hoá đơn nhà cung cấp.

---

## 2. Khối Cổng SMS — đủ ô, để trống

Giữ 4 ô cũ, thêm 4 ô. Tất cả **được phép trống** khi `bat: false`.

| Ô | Khoá JSON | Bí mật | Bắt buộc khi bật | Ghi chú |
|---|---|---|---|---|
| Bật | `bat` | | | *đã có* |
| Nhà cung cấp | `ncc` | | ✅ | *đã có*. Đổi mặc định `twilio` → `esms`. Danh sách: `esms`, `speedsms`, `vietguys`, `khac` |
| Khoá công khai | `apiKey` | | ✅ | *đã có*. Nhãn theo `ncc`: ApiKey / Access token / Username |
| **Khoá bí mật** | `secretKey` | 🔒 | ✅ theo `ncc` | **Mới.** eSMS cần SecretKey. SpeedSMS chỉ cần một token, khi đó ô này ẩn |
| Brandname | `guiTu` | | ✅ | *đã có*. Đổi nhãn "Gửi từ" → "Brandname". Tối đa 11 ký tự, không dấu |
| **Endpoint** | `endpoint` | | ✅ | **Mới.** Điền sẵn theo `ncc`, sửa được |
| **Mẫu tin** | `mauTin` | | ✅ | **Mới.** Phải chứa `{OTP}`. Khớp từng chữ với mẫu đã đăng ký nhà mạng. Đếm ký tự, báo khi có dấu tiếng Việt (thành 2 tin) |
| **Đơn giá (đ/tin)** | `donGiaVnd` | | ✅ | **Mới.** Dùng tính trần chi tiêu |

JSON trả về từ `GET /sadmin/api/dnbaomat`:

```json
"sms": {
  "bat": false, "ncc": "esms", "apiKey": "", "guiTu": "",
  "endpoint": "", "mauTin": "", "donGiaVnd": 0
},
"coSmsApiKey": false,
"coSmsSecretKey": false
```

---

## 3. Khối Cổng Zalo ZNS — làm mới

### 3.1. Kết nối trực tiếp Zalo hay qua nhà cung cấp

| | **Trực tiếp Zalo** (đề xuất) | Qua nhà cung cấp (eSMS đa kênh) |
|---|---|---|
| Giá | Giá gốc ZNS | Có thêm phần nhà cung cấp |
| Cấu hình | App ID, App Secret, refresh token, template | ApiKey, SecretKey, `MultiChannelTempId` |
| Token | **IBS tự làm mới token**, đây là phần khó | Nhà cung cấp lo |
| Chuyển sang SMS khi Zalo lỗi | IBS tự làm | Nhà cung cấp làm, cùng mã |
| Phụ thuộc | Chỉ Zalo | Một nhà cung cấp cho cả hai kênh |

Đặc tả dưới đây theo **trực tiếp Zalo**. Nếu sau này chọn eSMS đa kênh, khối ZNS chỉ còn 3 ô và chuyển vào khối SMS.

### 3.2. Điều kiện trước khi điền

1. Zalo OA của Livotec đã **xác thực**, có gói **Tăng trưởng** trở lên. Gói này mới gửi được mẫu tin qua tài khoản ZBS (2.500.000đ/năm).
2. Một **Zalo App** trên developers.zalo.me, liên kết với OA, đã cấp quyền gửi ZNS.
3. **Mẫu ZNS loại "Xác thực"** đã được duyệt, có một tham số chứa mã. Ví dụ:
   `Ma xac minh Livotec Home cua ban la <otp>. Ma co hieu luc 5 phut. Khong chia se ma nay.`
4. **Callback URL** của sadmin đã khai trong cài đặt Zalo App (cho nút "Kết nối OA", mục 3.4).

### 3.3. Các ô

| Ô | Khoá JSON | Bí mật | Bắt buộc khi bật | Ghi chú |
|---|---|---|---|---|
| Bật | `bat` | | | |
| App ID | `appId` | | ✅ | |
| **App Secret** | `appSecret` | 🔒 | ✅ | Gửi trong header `secret_key` khi làm mới token |
| OA ID | `oaId` | | | Chỉ đọc, lấy được sau khi kết nối OA |
| Template ID (OTP) | `templateId` | | ✅ | Kèm nút "Kiểm tra mẫu": báo đã duyệt / chờ duyệt / bị từ chối |
| Tên tham số chứa mã | `thamSoMa` | | ✅ | Mặc định `otp`. Phải trùng tên tham số trong mẫu |
| Tham số phụ cố định | `thamSoPhu` | | | JSON chuỗi→chuỗi, ví dụ `{"thoi_gian":"5 phut"}`. Mọi giá trị phải là chuỗi |
| Endpoint gửi | `endpoint` | | ✅ | Mặc định `https://business.openapi.zalo.me/message/template` |
| Đơn giá (đ/tin) | `donGiaVnd` | | ✅ | Mặc định `330` (300 + VAT) |
| Chế độ thử | `cheDoThu` | | | Gửi với `mode: "development"`: không trừ hạn mức, chỉ tới tài khoản thử của App. **Không cho bật cùng lúc với chạy thật** |

**Refresh token không phải ô nhập thường.** Nó đổi mỗi lần dùng (mục 3.4), nên lưu ở bảng trạng thái của IBS, không lưu trong cấu hình.

### 3.4. Token — phần dễ hỏng nhất

Quy tắc của Zalo OA:

- Access token sống **khoảng 25 giờ**.
- Refresh token sống **khoảng 3 tháng** và **chỉ dùng được một lần**. Mỗi lần làm mới, Zalo trả cặp token mới; token cũ hết hiệu lực.
- Làm mới: `POST https://oauth.zaloapp.com/v4/oa/access_token`, header `secret_key: <App Secret>`, body dạng form `app_id`, `grant_type=refresh_token`, `refresh_token`.

Hệ quả bắt buộc cho IBS:

1. **Một chỗ làm mới duy nhất.** Khoá hàng trong DB (`SELECT … FOR UPDATE`) hoặc kiểm tra `phienBan` trước khi ghi. Hai tiến trình cùng làm mới thì tiến trình thứ hai làm hỏng chuỗi token, và **phải kết nối lại OA bằng tay**.
2. **Ghi refresh token mới trong cùng giao dịch** với lúc nhận về. Mất bản ghi này là mất kết nối.
3. **Làm mới chủ động** trước hạn 10 phút, không đợi tới lúc gửi mã mới làm.
4. **Cảnh báo** qua `emailCanhBao` khi: làm mới thất bại; refresh token còn dưới 14 ngày (OA không gửi tin nào suốt 3 tháng sẽ hết hạn); Zalo trả lỗi token không hợp lệ (`-216`).

Lấy token lần đầu, hai cách:

| | Cách | Khi nào |
|---|---|---|
| **v1** | Ô "Dán refresh token" (chỉ ghi, dùng một lần) lấy từ công cụ API Explorer của Zalo → IBS đổi ngay sang cặp token mới | Làm trước, nhanh |
| **v2** | Nút **"Kết nối Zalo OA"**: chạy OAuth có PKCE → quản trị OA đồng ý → callback về sadmin → IBS lưu token | Làm sau, để kết nối lại không cần dev |

Phần trạng thái hiển thị trên khối (chỉ đọc):

```json
"znsKetNoi": {
  "coRefreshToken": true,
  "oaId": "…", "tenOa": "Livotec Home",
  "accessHetHan": "2026-10-30T10:00:00+07:00",
  "refreshHetHan": "2027-01-27T09:00:00+07:00",
  "lanLamMoi": "2026-10-29T09:00:00+07:00",
  "loiGanNhat": null
}
```

### 3.5. JSON khối ZNS

```json
"zns": {
  "bat": false, "appId": "", "templateId": "", "thamSoMa": "otp",
  "thamSoPhu": {}, "endpoint": "https://business.openapi.zalo.me/message/template",
  "donGiaVnd": 330, "cheDoThu": false
},
"coZnsAppSecret": false
```

### 3.6. Gửi một tin ZNS

```
POST https://business.openapi.zalo.me/message/template
access_token: <access token>
Content-Type: application/json

{ "phone": "84912345678",
  "template_id": "<templateId>",
  "template_data": { "otp": "482913" },
  "tracking_id": "<id ngẫu nhiên, không chứa mã>" }
```

- Số điện thoại dạng `84…`: không `+`, không `0` đầu. Lưu ở IBS vẫn là E.164 `+84…`; chỉ đổi lúc gửi.
- `error: 0` là Zalo đã nhận. Mã lỗi chính:

| Mã | Nghĩa | IBS xử lý |
|---|---|---|
| `-216` | Access token sai/hết hạn | Làm mới token một lần rồi gửi lại. Vẫn lỗi → cảnh báo |
| `-223` | Hết hạn mức ZNS | Chuyển SMS, cảnh báo |
| `-224` | Mẫu không tồn tại / chưa duyệt | **Không thử lại.** Cảnh báo |
| `-225` | Số không hợp lệ / không dùng Zalo | Chuyển SMS |
| `-226`, `-227` | Sai dữ liệu / lệch mẫu | **Không thử lại.** Cảnh báo |

*Danh sách mã lấy từ SDK cộng đồng. Đối chiếu tài liệu ZNS chính thức trước khi viết code.*

---

## 4. Luồng gửi mã cho số điện thoại

```
Trình duyệt chuẩn hoá số  ──►  IBS kiểm: +84, đầu số, giới hạn, trần ngày
                                   │
                    ┌──── Zalo bật? ────┐
                    │ có                │ không
                    ▼                   │
             Gửi ZNS cùng mã            │
          ok ──► kenhDaGui:"zalo"       │
          -225/-223 ──┐                 │
                      ▼                 ▼
                 SMS bật? ── có ──► Gửi SMS cùng mã ──► kenhDaGui:"sms"
                      │ không
                      ▼
          400 "Chưa gửi được mã tới số này. Vui lòng dùng email."
```

- **Cùng một mã** cho cả hai kênh. Người dùng nhận cả hai tin vẫn nhập được.
- **Quên mật khẩu, số không có tài khoản:** trả `200` giống hệt, có cả `kenhDaGui: "zalo"`, nhưng **không gửi gì**. Không để lộ số có tài khoản hay không qua việc tin có tới hay không.
- Lỗi `400` cuối chỉ dùng khi **cả hai kênh đều tắt**, không phụ thuộc số điện thoại, nên không lộ thông tin.

### Thay đổi hợp đồng IBS

| | Hiện tại | Đề xuất |
|---|---|---|
| Yêu cầu `/auth/otp/gui` | `kenh: "email" \| "sms"` | Giữ nguyên. `"sms"` hiểu là "gửi tới số điện thoại", IBS tự chọn kênh theo `thuTuKenh` |
| Trả về | `{ hetHanSau, guiLaiSau }` | Thêm `kenhDaGui: "email" \| "zalo" \| "sms"`. **Chỉ thêm trường**, app cũ không vỡ |
| Gửi lại ép kênh | — | Thêm tuỳ chọn `uuTien: "sms"` cho nút "Không nhận được qua Zalo? Gửi SMS". Chỉ hiện khi SMS bật |

Webapp hiện theo `kenhDaGui`: *"Đã gửi mã qua **Zalo** tới 0912 *** 678"*. Người dùng không thấy tin SMS sẽ biết mở Zalo.

---

## 5. Quy tắc chung cho cả hai khối

**Bí mật** (`secretKey`, `appSecret`, refresh token):
- Chỉ ghi. `GET` không bao giờ trả giá trị, chỉ trả `coX: true/false`. Giống `coSmtpMatKhau` đang có.
- Ô để trống khi lưu nghĩa là **giữ giá trị cũ**. Có nút "Xoá" riêng.
- Lưu mã hoá. Không ghi vào log, kể cả log lỗi.

**Lưu và bật:**
- `bat: false` → lưu được với mọi ô trống. Đây là cách Cổng SMS chờ điền sau.
- `bat: true` → kiểm đủ ô bắt buộc. Thiếu thì báo đúng ô, không lưu.
- Nên bắt **"Gửi thử" thành công** trước khi cho bật lần đầu.

**Gửi thử** (mỗi khối một nút):
- Ô nhập số + nút "Gửi thử". Gửi một mã giả, **không tạo phiên OTP**.
- Hiện **nguyên văn** phản hồi nhà cung cấp, ví dụ `101 Authorize Failed` hay `-224`. Không nuốt lỗi.
- Có tính vào trần chi tiêu. Tối đa 10 lần/giờ.

**Nhật ký gửi** (xem được trên sadmin): thời gian, kênh, số đã che giữa (`0912***678`), mã lỗi, chi phí. **Không dòng nào chứa mã OTP.**

---

## 6. Nghiệm thu

| # | Việc | Đạt khi |
|---|---|---|
| 1 | Lưu Cổng SMS với mọi ô trống, `bat: false` | Lưu được. Kênh số điện thoại vẫn chạy bằng Zalo |
| 2 | Bật Cổng SMS khi thiếu khoá bí mật | Báo đúng ô thiếu, không lưu |
| 3 | `GET /sadmin/api/dnbaomat` | Không có giá trị bí mật nào, chỉ có `coX` |
| 4 | ZNS "Kiểm tra mẫu" với template chưa duyệt | Báo "chờ duyệt", không cho bật |
| 5 | ZNS gửi thử tới số của mình | Tin Zalo tới trong 10 giây, đúng mẫu |
| 6 | Xoá access token trong DB rồi gửi mã | IBS tự làm mới token, tin vẫn tới |
| 7 | Hai tiến trình IBS cùng làm mới token | Chỉ một lần gọi Zalo. Token vẫn dùng được |
| 8 | Số không dùng Zalo, SMS tắt | `400` hướng sang email |
| 9 | Số không dùng Zalo, SMS bật | Tới bằng SMS, `kenhDaGui: "sms"`, **cùng mã** |
| 10 | Quên mật khẩu với số không có tài khoản | `200` giống số thật, **không tin nào gửi đi**, nhật ký không ghi chi phí |
| 11 | Chạm `tranNgayVnd` | Ngừng gửi cả hai kênh và có email cảnh báo |
| 12 | Số `0243…` hoặc `+1…` | Bị chặn, không tốn tin |
| 13 | Nhật ký | Số đã che, không có mã OTP |

---

## 7. Còn phải xác nhận

1. **Mã lỗi và endpoint ZNS** lấy từ SDK và bài viết cộng đồng. Đối chiếu tài liệu chính thức developers.zalo.me trước khi viết code.
2. **Webhook trạng thái tin ZNS** (người dùng đã nhận tin) cần đăng ký trong Zalo App. Có webhook thì đo được tỉ lệ tới nơi và phát hiện bị lạm dụng. Chưa đưa vào v1.
3. **Ai giữ OA Livotec**, và ai có quyền quản trị để bấm "Kết nối OA". Kết nối lại 3 tháng/lần nếu OA im lặng lâu.
4. **Zalo ZNS có bắt mẫu xác thực phải đi kèm brandname/OA đã xác thực doanh nghiệp không.** Hỏi khi đăng ký mẫu.
5. **Đội sadmin có nhận làm** khối Chính sách OTP dùng chung không, hay muốn giữ trong từng khối.
