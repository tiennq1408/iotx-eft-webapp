# Làm SMS giống như đã làm SMTP — và chỗ chặn phải gỡ trước

**Ngày:** 26/10/2026
**Người viết:** phiên khảo sát (tab này)
**Thực thi:** đội sadmin (mục 4), anh Tiến (mục 5), tab Code (mục 6)
**Doc liên quan:** `kien-thuc-otp-sms.md` (kiến thức nền + luồng), `yeu-cau-ha-tang-smtp-google.md` (mẫu yêu cầu hạ tầng), `viec-otp-google.md` (phương án B đã chốt)

---

## 0. Một đoạn tóm tắt

SMTP đi được tới đích vì sadmin có **đủ 8 ô** để cấu hình một máy chủ SMTP thật. SMS **không đi được theo cùng con đường**, vì sadmin chỉ có **4 ô**, và không có nhà cung cấp SMS nào ở Việt Nam chạy được với 4 ô đó. Cụ thể: ô bí mật chỉ có **một**, trong khi mọi nhà cung cấp đều cần **hai** (ApiKey + SecretKey, hoặc Account SID + Auth Token).

Nên việc đầu tiên **không phải** đi ký hợp đồng nhà cung cấp, mà là **đưa đặc tả ở mục 4 cho đội sadmin**. Song song đó có một việc dài ngày phải khởi động ngay hôm nay: **hồ sơ brandname** (mục 5.1), vì nó mất 5–15 ngày làm việc và không ai rút ngắn được.

---

## 1. Hiện trạng đo được

Đọc `GET /sadmin/api/dnbaomat` sau khi đăng nhập sadmin (26/10/2026, buổi sáng):

```json
"smtp": { "bat": true, "host": "smtp.gmail.com", "cong": 587, "baoMat": "starttls",
          "taiKhoan": "tien.nq@effectik.dev", "guiTu": "tien.nq@effectik.dev",
          "tenHienThi": "Livotec Home Test" },
"coSmtpMatKhau": true,
"xacMinhKhiDangKy": true,

"sms":  { "bat": false, "ncc": "twilio", "apiKey": "", "guiTu": "" },
"coSmsApiKey": false,

"google": { "bat": false, "clientId": "" },
"coGoogleSecret": false,

"cach": { "email": true, "sdt": false, "google": false, "passkey": false }
```

Đếm số ô trên giao diện (lấy từ script inline của trang `#dnbaomat`):

| Khối | Số ô | Id các ô |
|---|---|---|
| SMTP | **8** | `dnbm-smtp-bat`, `-host`, `-cong`, `-bm`, `-tk`, `-mk`, `-tu`, `-ten` |
| Google | **3** | `dnbm-gg-bat`, `-id`, `-sec` |
| SMS | **4** | `dnbm-sms-bat`, `-ncc`, `-key`, `-tu` |

**Điểm cần ghi nhận:** `xacMinhKhiDangKy: true` giờ đã an toàn, vì SMTP đã bật thật. Cảnh báo từ hai tuần trước (bật xác minh khi chưa có kênh gửi) coi như đã gỡ.

---

## 2. Nhà cung cấp cần gì — đo từ tài liệu chính thức

### 2.1 eSMS.vn (phương án nội địa khả dĩ nhất)

Endpoint gửi mã tự động, phương thức **GET**, tham số truyền qua query string:

```
https://rest.esms.vn/MainService.svc/json/SendMessageAutoGenCode_V4_get
    ?Phone={Phone}
    &ApiKey={ApiKey}
    &SecretKey={SecretKey}
    &Brandname={Brandname}
    &Type=2
    &message={OTP} la ma xac minh ...
    &TimeAlive={phut}
    &NumCharOfCode={so ky tu}
    &IsNumber={0|1}
```

Bắt buộc: `Phone`, `ApiKey`, `SecretKey`, `Brandname`, `Type`, `message`.
Tùy chọn: `TimeAlive` (mặc định 5 phút), `NumCharOfCode` (mặc định 6), `IsNumber` (`1` = chỉ số).

Mã trả về: `100` = nhận lệnh, `101` = `Authorize Failed` (sai ApiKey/SecretKey). Có API `CHECKCODE` riêng để đối chiếu mã, `117` = mã đã dùng hoặc hết hạn.

Tài liệu ghi rõ: **brandname và template phải đăng ký trước khi dùng API này.**

Hai trang tài liệu mâu thuẫn nhau ở `TimeAlive`: bản tiếng Việt ghi 2–10 phút, bản tiếng Anh ghi 2–15 phút. **Phải hỏi lại nhà cung cấp**, đừng tự chọn.

### 2.2 Twilio (nhà cung cấp đang để mặc định trong `sms.ncc`)

Cần **Account SID** + **Auth Token** (hai giá trị, dùng làm HTTP Basic Auth), cộng số gửi `From` và endpoint `https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json`. Twilio gửi về Việt Nam phải qua nhà mạng trung gian, giá cao hơn và brandname vẫn phải đăng ký trong nước.

### 2.3 Đối chiếu với 4 ô của sadmin

| Thứ nhà cung cấp cần | Ô sadmin tương ứng | Trạng thái |
|---|---|---|
| Bật/tắt | `dnbm-sms-bat` | ✅ có |
| Chọn nhà cung cấp | `dnbm-sms-ncc` | ✅ có |
| Khóa công khai (ApiKey / Account SID) | `dnbm-sms-key` | ✅ có |
| **Khóa bí mật (SecretKey / Auth Token)** | — | ❌ **thiếu — chặn cứng** |
| Brandname / số gửi | `dnbm-sms-tu` | ⚠️ có, nhưng tên ô là "gửi từ", cần đổi nhãn |
| **Endpoint URL** | — | ❌ thiếu |
| **Mẫu tin (template có `{OTP}`)** | — | ❌ thiếu |
| **Hạn mã, độ dài mã** | — | ❌ thiếu |
| **Trần chi tiêu / ngày** | — | ❌ thiếu |
| **Danh sách đầu số được phép** | — | ❌ thiếu |

**Kết luận: không nhà cung cấp nào chạy được với cấu hình hiện tại.** Hai dòng ❌ đầu là chặn cứng; các dòng còn lại là chặn mềm (hard-code được, nhưng sẽ phải sửa code mỗi lần đổi nhà cung cấp).

---

## 3. Vì sao không hard-code cho xong

Ba lý do, xếp theo mức đau:

1. **Trần chi tiêu không phải tính năng cho đẹp.** SMS tốn tiền thật, và tấn công bơm SMS (SMS pumping) là cách rút tiền nhanh nhất khỏi một form đăng ký công khai. Không có trần chi tiêu thì một đêm bị bơm là hết hạn mức. Trần phải nằm ở chỗ **sửa được lúc 2 giờ sáng mà không cần deploy** — tức là sadmin.
2. **Mẫu tin bị nhà mạng duyệt.** Mỗi lần sửa chữ trong tin là một lần đăng ký lại template. Nếu mẫu tin nằm trong code thì mỗi lần duyệt lại là một lần build.
3. **Đổi nhà cung cấp là việc sẽ xảy ra.** Đã có sẵn ô `ncc` nghĩa là người thiết kế sadmin cũng tính vậy — chỉ là chưa làm nốt các ô đi kèm.

---

## 4. Đặc tả cho đội sadmin

Viết theo đúng khuôn khối SMTP đang chạy tốt, để đội sadmin copy được.

### 4.1 Các ô cần thêm vào tab `#dnbaomat`, khối SMS

| Id ô | Nhãn | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|---|
| `dnbm-sms-sec` | Khóa bí mật | password | ✅ | Hành xử **giống hệt** `dnbm-smtp-mk`: không trả về khi GET, chỉ trả cờ `coSmsSecret` |
| `dnbm-sms-url` | Endpoint API | text | ✅ | Mặc định theo `ncc` đã chọn, cho phép sửa |
| `dnbm-sms-mau` | Mẫu tin | textarea | ✅ | Bắt buộc chứa chuỗi `{OTP}`; chặn lưu nếu thiếu |
| `dnbm-sms-han` | Hạn mã (phút) | number | ✅ | Mặc định 5; min 2 |
| `dnbm-sms-dai` | Độ dài mã | number | ✅ | Mặc định 6; min 4, max 8 |
| `dnbm-sms-chiso` | Mã chỉ gồm chữ số | checkbox | — | Mặc định bật |
| `dnbm-sms-tran` | Trần tin / ngày | number | ✅ | Chạm trần thì **từ chối gửi**, không phải chỉ cảnh báo |
| `dnbm-sms-tran-sdt` | Trần tin / số / ngày | number | ✅ | Mặc định 5 |
| `dnbm-sms-dauso` | Đầu số được phép | text | ✅ | Mặc định `03,05,07,08,09` — chặn landline và số nước ngoài |

Đồng thời **đổi nhãn** `dnbm-sms-tu` từ "Gửi từ" thành "Brandname / số gửi", vì với eSMS đây là brandname đã đăng ký chứ không phải một số điện thoại.

### 4.2 JSON mở rộng

`GET /sadmin/api/dnbaomat` trả về:

```json
"sms": {
  "bat": false,
  "ncc": "esms",
  "apiKey": "",
  "guiTu": "LIVOTEC",
  "url": "https://rest.esms.vn/MainService.svc/json/SendMessageAutoGenCode_V4_get",
  "mau": "{OTP} la ma xac minh Livotec Home cua ban. Khong chia se ma nay.",
  "han": 5,
  "dai": 6,
  "chiSo": true,
  "tran": 2000,
  "tranSdt": 5,
  "dauSo": ["03","05","07","08","09"]
},
"coSmsApiKey": false,
"coSmsSecret": false
```

Hai khóa bí mật (`apiKey` của eSMS cũng nên coi là bí mật) **không bao giờ trả ra trong GET** — chỉ hai cờ `coSmsApiKey` / `coSmsSecret`. Đây đúng là cách khối SMTP đang làm với `coSmtpMatKhau`, nên không phải phát minh gì mới.

### 4.3 Kiểm tra khi lưu

- `bat: true` mà thiếu bất kỳ ô bắt buộc nào → **chặn lưu**, chỉ rõ ô nào thiếu.
- `mau` không chứa `{OTP}` → chặn lưu.
- `cach.sdt: true` mà `sms.bat: false` → chặn lưu. (Đây đúng là lỗi `xacMinhKhiDangKy` đã gặp với email: bật cách đăng nhập trước khi có kênh gửi.)
- `dauSo` có phần tử không phải 2 chữ số → chặn lưu.

### 4.4 Nút "Gửi thử"

Khối SMTP có cách để biết cấu hình đúng hay sai mà không phải chờ người dùng thật. SMS cần đúng như vậy, và cần hơn, vì mỗi lần thử là mất tiền thật:

`POST /sadmin/api/dnbaomat/thusms` với body `{"sdt":"09xxxxxxxx"}` → gửi một tin thật tới số đó, trả về nguyên văn mã và thông báo lỗi của nhà cung cấp (ví dụ `101 Authorize Failed`), **không nuốt lỗi**.

Giới hạn: tối đa 5 lần thử mỗi ngày, và đếm cả vào `tran`.

### 4.5 Nhật ký

Mỗi lần gửi ghi một dòng: thời điểm, số điện thoại **đã che giữa** (`09xx xxx 484`), nhà cung cấp, mã trả về, chi phí ước tính. Không ghi nội dung mã OTP. Có màn xem được, lọc theo ngày — nếu không, đến lúc bị bơm SMS sẽ không có gì để nhìn.

---

## 5. Việc anh làm song song, **không chờ sadmin**

### 5.1 Hồ sơ brandname — đường găng, bắt đầu hôm nay

5–15 ngày làm việc, không rút ngắn được, và mọi thứ khác đều chờ nó. Cần chuẩn bị:

- Tên brandname: **tối đa 11 ký tự**, không dấu, không khoảng trắng. Đề xuất `LIVOTEC`.
- Giấy phép kinh doanh (bản sao công chứng).
- Giấy ủy quyền nếu brandname không trùng tên công ty trên giấy phép.
- **Mẫu tin** đăng ký cùng lúc — và mẫu tin này phải khớp từng chữ với ô `dnbm-sms-mau` ở mục 4.1. Đăng ký một đằng, gửi một nẻo là bị nhà mạng chặn.

Mẫu đề xuất, không dấu để chắc chắn mỗi tin chỉ tính 1 SMS:

```
{OTP} la ma xac minh Livotec Home cua ban. Khong chia se ma nay.
```

Đếm: 62 ký tự + 6 ký tự mã + brandname. Dưới 160 ký tự GSM-7, tức **1 tin/lần gửi**. Nếu thêm dấu tiếng Việt thì tụt xuống bảng mã Unicode, giới hạn còn 70 ký tự, tin này sẽ thành **2 tin** — gấp đôi tiền. Đây là lý do nên giữ không dấu.

### 5.2 Bảy câu hỏi gửi nhà cung cấp

Không nhà cung cấp nào công bố giá, nên phải hỏi thẳng (chi tiết ở `kien-thuc-otp-sms.md` mục 4):

1. Đơn giá một tin OTP brandname tới Viettel / VinaPhone / MobiFone — ba con số riêng.
2. Có phí thuê bao brandname hằng tháng không.
3. Mức cam kết tối thiểu mỗi tháng.
4. Thời gian duyệt brandname + template, tính từ lúc nhận đủ hồ sơ.
5. `TimeAlive` tối đa thực tế là 10 hay 15 phút (hai trang tài liệu của chính họ ghi khác nhau).
6. Có cơ chế trần chi tiêu phía nhà cung cấp không, đặt được ở mức nào.
7. Tỷ lệ tới nơi (delivery rate) cam kết, và có webhook báo trạng thái từng tin không.

### 5.3 Một chỗ đừng lặp lại

Khi đọc `/sadmin/api/cauhinh` thấy cấu hình S-Factory đang để `"login": "vinh.ld@effectik.dev"` — tài khoản cá nhân của một đồng nghiệp dùng làm thông tin đăng nhập hệ thống. SMTP cũng đang dùng `tien.nq@effectik.dev`, chấp nhận được vì đang test, nhưng **tài khoản eSMS thì nên đăng ký bằng email dùng chung của công ty ngay từ đầu** — vì nó gắn với hợp đồng, hóa đơn và hạn mức tiền, không phải thứ đổi được khi người đó nghỉ.

---

## 6. Thứ tự làm, và cái gì chặn cái gì

```
Hôm nay ──┬── 5.1 Hồ sơ brandname ──────────── 5–15 ngày ──┐
          │                                                │
          ├── 5.2 Hỏi giá 7 câu ── chọn NCC ── ký ─────────┤
          │                                                │
          ├── Mục 4 gửi đội sadmin ── sadmin thêm ô ───────┤
          │                                                ▼
          └── Mục 6.1 webapp (chạy ngay) ──────────► Điền cấu hình
                                                     Bấm "Gửi thử"
                                                     Bật cach.sdt
                                                     Nghiệm thu
```

Ba nhánh trên chạy song song. Nhánh dài nhất là brandname, nên **ngày bắt đầu brandname quyết định ngày xong cả việc** — hoãn nó một tuần là trễ cả tháng.

### 6.1 Phần webapp làm được ngay, không chờ ai

Việc này đáng làm **kể cả nếu cuối cùng không chọn SMS**, vì nó sửa một lỗi đang có:

`components/ui/LoginScreen.tsx:28`

```ts
const laSoDienThoai = (v: string) => /^(0|\+84)\d{9}$/.test(v.replace(/[\s.-]/g, ""));
```

Biểu thức này **nhận cả số cố định** `02x` — tổng đài không gửi SMS tới số cố định được, nên người dùng nhập số bàn sẽ chờ mãi một tin không bao giờ tới. Phải siết về đúng đầu số di động `03·05·07·08·09`, và chuẩn hóa sang E.164 (`+84…`) trước khi gửi lên server, vì `0901888484` và `+84901888484` phải là **cùng một tài khoản**.

Chi tiết và lệnh cho tab Code: `kien-thuc-otp-sms.md` mục 5 và mục 12, nhánh C.

---

## 7. Nghiệm thu — làm giống lúc test SMTP

| # | Việc | Đạt khi |
|---|---|---|
| 1 | Bấm "Gửi thử" tới số của anh | Tin tới trong 30 giây, brandname hiện đúng `LIVOTEC`, không phải đầu số lạ |
| 2 | Nhập sai khóa bí mật rồi gửi thử | sadmin hiện nguyên văn `101 Authorize Failed`, không hiện "có lỗi xảy ra" |
| 3 | Đăng ký bằng số di động thật | Nhận mã, nhập đúng → vào được; nhập sai 5 lần → khóa |
| 4 | Gửi lại mã 6 lần liên tiếp cho cùng một số | Lần thứ 6 bị từ chối do chạm `tranSdt` |
| 5 | Nhập số cố định `0243…` | Bị chặn **ở trình duyệt**, không tốn một tin nào |
| 6 | Mã hết hạn rồi mới nhập | Báo hết hạn, không cho vào |
| 7 | Nhật ký | Có đủ 6 dòng trên, số điện thoại đã che giữa, không có dòng nào chứa mã OTP |

Mục 2 và mục 5 là hai mục hay bị bỏ qua nhất, và là hai mục duy nhất trong bảng này trực tiếp giữ tiền.

---

## 8. Bốn thứ còn chưa chắc

Ghi ra để không ai tưởng là đã chốt:

1. `TimeAlive` tối đa 10 hay 15 phút — tài liệu eSMS tự mâu thuẫn, phải hỏi.
2. Giá mỗi tin — chưa có con số nào, và nó quyết định `tran` đặt bao nhiêu.
3. Chưa xác nhận sadmin sẽ nhận làm mục 4, hay đội đó yêu cầu đi đường khác (ví dụ biến SMS thành một service riêng).
4. Chưa quyết ai tạo `user_map` + customer ThingsBoard khi người dùng đăng ký bằng số điện thoại — đây vẫn là một trong ba quyết định kiến trúc còn treo từ phần email (xem `viec-otp-google.md`).
