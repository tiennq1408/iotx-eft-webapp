# Việc: Hoàn thiện đăng ký · quên mật khẩu (mã qua email) · đăng nhập Google

- Trạng thái: **chưa làm** — phần lớn **không nằm ở webapp**
- Phạm vi: `IOT App - New UI` + IBS + Keycloak + Google Cloud
- Viết: 14/10/2026 · **đo lại và viết lại 16/10/2026**
- **PHƯƠNG ÁN ĐÃ CHỐT: B — IBS làm trung gian** (16/10/2026)
- Thay thế bản 14/10. Bỏ nhánh SMS khỏi đợt này (xem Phụ lục).

## Tóm tắt một đoạn

Ba luồng này **không chặn ở webapp**. Giao diện đã dựng sẵn cả ba màn, và mã đã có sẵn năm
chỗ cắm dạng `CUA_* = null` để khi có cửa thì **sửa đúng một dòng mỗi tính năng**. Thứ còn
thiếu nằm ở **Keycloak**, **IBS**, **SMTP** và **Google Cloud** — không nơi nào trong số đó
là việc của đội webapp.

---

## 0. Những câu đã chốt — IBS không phải hỏi lại

| Câu | Trả lời | Chốt ngày |
|---|---|---|
| Phương án A hay B? | **B — IBS làm trung gian** | 16/10/2026 |
| Quên mật khẩu gửi **link** hay **mã**? | **Mã 6 chữ số** — hợp đồng mục 5 giữ nguyên, đúng kiểu | 16/10/2026 |
| IBS đã có quyền gọi **Keycloak Admin REST API** chưa? | **Đã có đủ** — không phải xin thêm | 16/10/2026 |

Ba câu còn lại (`tenant`, `user_map`, email trùng) vẫn **chưa chốt** — xem Nhóm 0.

## 0b. Nghiệm thu 5 cửa IBS — đo ngày 19/10/2026

**IBS đã mở đủ 5 cửa, đúng tên và đúng hình dạng hợp đồng.** Đo trực tiếp trên
`web.dev.happibot.net`:

| Cửa | Kết quả |
|---|---|
| `POST /v1/auth/otp/gui` | ✅ có — `{ok:true, hetHanSau:300, guiLaiSau:60}` |
| `POST /v1/auth/otp/xac-nhan` | ✅ có — mã sai → 400 *"Mã không đúng hoặc đã hết hạn — gửi lại mã mới."* |
| `POST /v1/auth/dat-lai-mat-khau` | ✅ có — vé bịa → 400 *"Vé xác nhận không hợp lệ hoặc đã hết hạn"* |
| `GET /v1/auth/google/bat-dau` | ✅ có — *"Đăng nhập Google chưa bật."* (đúng, sadmin chưa khai) |
| `POST /v1/auth/google/doi-token` | ✅ có — 404 `not_found` cho thân rỗng |

**Ba ràng buộc bảo mật: ĐẠT CẢ BA.**

1. **Không lộ email.** Email không tồn tại và email có thật trả về **giống hệt nhau từng byte**:
   `200 {"ok":true,"hetHanSau":300,"guiLaiSau":60}`.
2. **Mã sống 300 giây**, mã sai trả câu chung không phân biệt "sai" với "hết hạn".
3. **Giới hạn tốc độ hai tầng, theo CẢ email LẪN IP:**

| Tầng | Ngưỡng đo được | Câu báo |
|---|---|---|
| Theo email — chờ gửi lại | lần thứ 2 trở đi trong 60s | *"Vừa gửi mã rồi — chờ 60 giây để gửi lại."* |
| Theo email — khoá | ~5 lần | *"Đã gửi mã quá nhiều lần cho email này — thử lại sau 15 phút."* |
| **Theo IP** | **10 lần** (email khác nhau) | *"Thiết bị của bạn gửi quá nhiều yêu cầu — thử lại sau 15 phút."* |

### Còn hai việc chưa xong

**a) `/auth/register` CHƯA đòi `veTam`.** Gửi thân thiếu trường, máy chủ đi thẳng từ
*"Thiếu email/số điện thoại đăng nhập"* sang *"Mật khẩu phải có tối thiểu 8 ký tự"* — **không
hề nhắc tới vé xác nhận**. Tức bước xác thực mã **chưa ghép vào luồng đăng ký**: hiện vẫn đăng
ký được mà không cần xác minh email. Cần hỏi IBS: dự định ghép theo hướng nào.

**b) `/auth/register` trả 409 cho lỗi kiểm tra đầu vào**, đáng lẽ 400. 409 nghĩa là "xung đột"
(email đã tồn tại), dùng cho "mật khẩu quá ngắn" là sai mã. Lỗi nhỏ, nhưng webapp phân nhánh
theo mã trạng thái nên sẽ hiểu nhầm.

### Chưa kiểm được, phải chờ SMTP

Bốn điều sau chỉ kiểm được khi nhận được thư thật (hoặc IBS mở một cửa đọc mã ở môi trường dev):

- Mã có đúng **6 chữ số** không
- Mã có thật sự **dùng một lần** không
- Mã có **lưu dạng băm** và **so sánh timing-safe** không
- `/dat-lai-mat-khau` có **thu hồi refresh token cũ** không ← quan trọng nhất

---

## 1. Hiện trạng — đo lại ngày 16/10/2026

### 1.1 Cửa API: không có gì mới

Thử **17 đường** ứng viên trên `web.dev.happibot.net`:

| Nhóm | Kết quả |
|---|---|
| `/auth/otp/gui`, `/auth/otp/xac-nhan`, `/auth/send-otp`, `/auth/verify-otp`, `/auth/otp/send`, `/auth/otp/verify` | `404 Cannot POST` — **cửa không tồn tại** |
| `/auth/forgot-password`, `/auth/quen-mat-khau`, `/auth/reset-password`, `/auth/doi-mat-khau`, `/auth/change-password` | `404 Cannot POST` |
| `/auth/google`, `/auth/google/bat-dau`, `/auth/google/start`, `/auth/google/doi-token` | `404 Cannot GET/POST` |
| `/auth/providers`, `/auth/methods` | `404 Cannot GET` |
| **`/auth/register`**, **`/auth/login`** | `404 {"message":"not_found"}` ← **khác hẳn** |

Chỗ khác nhau ở hàng cuối rất quan trọng: `Cannot POST /x` nghĩa là **đường không tồn tại**,
còn `{"message":"not_found"}` là **câu trả lời của chính IBS** cho thân request rỗng — tức
đường **có tồn tại**. Nhờ đó khẳng định được:

> **`/auth/register` ĐÃ CHẠY.** Đăng ký không phải xây mới — việc cần làm là **thêm bước xác
> thực mã email** vào luồng đã có.

Không đổi gì so với lần đo 08/10 và 14/10.

### 1.2 sadmin — TẤT CẢ cần gạt đều nằm ở đây

`https://iotsa.dev.happibot.net/sadmin#dnbaomat` → mục **Đăng nhập & Bảo mật**. Chính trang đó
tự mô tả: *"Cấu hình cho realm NGƯỜI DÙNG CUỐI (app). Bấm Lưu là áp ngay lên máy đăng nhập.
Phần cần nhà cung cấp ngoài (SMTP, cổng SMS, Google) để trống thì tính năng đó chờ tới khi
khai đủ."*

Nghĩa là **sadmin ghi xuyên xuống Keycloak**. Không phải vào thẳng Keycloak cho bất cứ việc nào
dưới đây.

Trạng thái đọc được ngày **16/10/2026**:

| Mục | Trạng thái |
|---|---|
| Giữ đăng nhập trên máy người dùng | **7 ngày** *(khớp với vé làm mới ≈6,38 ngày đã đo)* |
| 2FA | Tắt |
| Mật khẩu tối thiểu | 8 ký tự, không bật ràng buộc nào khác |
| **Cho phép tự đăng ký** | ✅ **ĐÃ BẬT** |
| **Cho phép quên mật khẩu** (gửi link/mã đặt lại) | ✅ **ĐÃ BẬT** |
| **Bắt xác minh khi đăng ký (OTP)** | ❌ tắt — *cần SMTP hoặc SMS* |
| Email + mật khẩu | ✅ bật (khoá, luôn bật) |
| Số điện thoại + mật khẩu | ❌ tắt — cần cổng SMS |
| **Google SSO** | ❌ tắt — **Client ID và Secret đều TRỐNG** |
| **Passkey** (vân tay/khuôn mặt) | ❌ tắt |
| **SMTP** | ❌ tắt — mọi ô trống, chỉ có cổng mặc định 587, bảo mật STARTTLS |
| Cổng SMS | ❌ tắt — trống (nhà cung cấp mặc định Twilio) |

**Hai điều quan trọng rút ra:**

1. **Đăng ký và quên mật khẩu đã bật sẵn** — không phải việc cần làm. Thứ còn thiếu để chúng
   chạy bằng mã email là **SMTP**, và công tắc *"Bắt xác minh khi đăng ký (OTP)"*.
2. **Có một cách đăng nhập thứ tư mà bản 14/10 bỏ sót: Passkey** (vân tay / khuôn mặt). Hiện
   tắt. Nếu sau này bật, `loginMethods` sẽ trả thêm nó và webapp phải vẽ được — đây là một lý
   do nữa để làm việc 4.6 cho tử tế thay vì cắm cứng ba nút.

sadmin còn ghi sẵn **địa chỉ redirect phải khai ở Google**:

```
https://sso.dev.happibot.net/realms/iot1/broker/google/endpoint
```

Và một câu rất đáng chú ý ngay dưới mục Cách đăng nhập:

> *"SĐT/Google/Passkey chỉ bật khi đã khai đủ thông tin; chưa đủ thì hệ tự để tắt."*

Tức là **`loginMethods` mà API trả về chính là phản chiếu của mục này**. Khai đủ Google thì nó
tự bật, webapp không phải sửa gì — **miễn là webapp chịu đọc `loginMethods`** (việc 4.6).

### 1.2b Một chỗ vênh cần kiểm chứng

sadmin nói *"Cho phép tự đăng ký"* và *"Cho phép quên mật khẩu"* **đang bật**. Nhưng trang đăng
nhập thật của realm Keycloak (mở qua `account-console`) **không có liên kết "Register" lẫn
"Forgot password?"** nào:

```
Trang hiện: "Sign in to your account · Username or email · Remember me · Sign In"
#kc-social-providers : KHÔNG CÓ   (đúng — Google chưa khai)
"Register"           : KHÔNG CÓ   ← vênh với sadmin
"Forgot password?"   : KHÔNG CÓ   ← vênh với sadmin
```

Hai cách giải thích, chưa phân định được:

- Ô tích trên sadmin đang hiện **giá trị mặc định của biểu mẫu**, chưa phải trạng thái thật đã lưu.
- Hoặc đã bấm Lưu nhưng **không ghi xuống được realm**.

**Việc phải làm trước khi tin bất cứ ô tích nào trên màn này:** bấm **Lưu cấu hình** một lần
(không đổi gì), rồi mở lại `https://sso.dev.happibot.net/realms/iot1/account/`. Nếu hai liên kết
mọc ra thì đường ghi xuống Keycloak hoạt động; nếu vẫn không có thì **sadmin không ghi được
xuống realm**, và đó là lỗi chặn toàn bộ kế hoạch — phải báo đội sadmin ngay.

Với phương án B người dùng không nhìn thấy trang Keycloak, nên hai liên kết đó không quan trọng
về mặt giao diện. Nhưng chúng là **phép thử rẻ nhất** để biết sadmin có thật sự ghi xuống
Keycloak hay không, mà cả kế hoạch đang đặt cược vào điều đó.

Realm có sẵn những thứ cần thiết khác:

| Khả năng | Có? |
|---|---|
| `authorization_code` | ✅ |
| PKCE `S256` | ✅ |
| `token-exchange` | ✅ |
| scope `email`, `phone` | ✅ |
| `password` (ROPC — app đang dùng) | ✅ |

### 1.3 Một rào cản mới phát hiện

Thử mở luồng `authorization_code` với client `iotx-ibs` và `redirect_uri` là web.dev:

```
Invalid parameter: redirect_uri
```

Client `iotx-ibs` **không khai redirect URI nào cho trình duyệt** — nó là client phía máy chủ,
chỉ dùng cho ROPC. Nghĩa là **Phương án A không chỉ là bật công tắc**: phải tạo thêm một
**public client mới** cho webapp, khai redirect URI và bật PKCE.

### 1.4 Webapp — đã sẵn sàng, không đổi gì từ 09/10

`lib/iotx/client.ts` còn nguyên năm chỗ cắm:

```ts
const CUA_QUEN_MAT_KHAU: string | null = null;      // dòng 18
const CUA_DANG_NHAP_GOOGLE: string | null = null;   // dòng 27
const CUA_DOI_MAT_KHAU: string | null = null;       // dòng 35
const CUA_DOI_TEN: string | null = null;            // dòng 44
const CUA_DOI_ANH_DAI_DIEN: string | null = null;   // dòng 45
```

`components/ui/LoginScreen.tsx` đã có đủ ba màn: `dangNhap` · `quenMatKhau` · `dangKy`,
hàm `guiMa()` và `dangKy()` đã viết, nút Google đã vẽ. Bấm vào thì hiện *"tính năng đang chờ bật"*.

---

## 2. Vì sao ROPC không đỡ được ba luồng này

App hiện đăng nhập bằng **password grant (ROPC)**: webapp gửi email + mật khẩu cho IBS, IBS
đổi lấy token với Keycloak. Kiểu này **không có chỗ** cho:

- **Google** — bắt buộc chuyển hướng trình duyệt sang Google rồi quay về. ROPC không có bước đó.
- **Mã xác thực** — cần một lượt gọi thứ hai sau lượt đầu. ROPC chỉ có một lượt.

Chính sadmin cũng ghi ở màn Đăng nhập & Bảo mật: *"Để BUỘC 2FA ngay trên màn đăng nhập của app
(ROPC) cần thêm bước nhập mã ở app — phần đó để sau."*

---

## 3. Quyết định đã chốt — PHƯƠNG ÁN B

> **Chốt ngày 16/10/2026: làm theo phương án B.** Webapp giữ nguyên màn đăng nhập đã dựng;
> IBS mở cửa `/v1/auth/*` và tự nói chuyện với Keycloak, SMTP và Google.
>
> Hai bảng dưới đây giữ lại **chỉ để ghi lý do**. Mọi việc trong tài liệu này đã viết theo B —
> không cần đọc lại phần so sánh trừ khi muốn xem lại căn cứ.

### Phương án A — Webapp chuyển sang `authorization_code` + PKCE

Người dùng bấm Đăng nhập → nhảy sang trang Keycloak → làm mọi thứ ở đó → quay về app.

| Ưu | Nhược |
|---|---|
| Keycloak làm **cả ba**: đăng ký, quên mật khẩu, Google — bật bằng ô tích | **Mất màn đăng nhập của app.** Màn vừa dựng theo mẫu coi như bỏ |
| IBS gần như **không phải viết cửa nào** | Thương hiệu phải làm lại bằng theme Keycloak |
| Realm đã có sẵn PKCE `S256` | **Phải tạo public client mới** (mục 1.3) |
| Chuẩn mực, hết hạn chế của ROPC | Người dùng thấy một tên miền khác giữa chừng |

### Phương án B — IBS làm trung gian, webapp giữ màn của mình

IBS mở cửa `/v1/auth/*`, tự nói chuyện với Keycloak / SMTP / Google. Webapp gọi cửa đó.

| Ưu | Nhược |
|---|---|
| **Giữ nguyên** màn đăng nhập và thương hiệu | IBS phải viết **5 cửa mới** |
| Webapp chỉ sửa vài dòng | Google vẫn cần một lần chuyển hướng — IBS ôm phần callback |
| Hợp `AGENTS.md` (app chỉ gọi `/v1`) | Nhiều việc hơn hẳn, lâu hơn |

**Căn cứ chọn B:** màn đăng nhập vừa dựng theo mẫu `login.html` và đã được duyệt dáng; bỏ đi
thì mất công đã làm và mất thương hiệu ở đúng màn đầu tiên khách hàng nhìn thấy. Chi phí phải
trả: **IBS viết 5 cửa mới**, và tiến độ phụ thuộc IBS chứ không phụ thuộc webapp.

---

## 4. Danh sách công việc

Xếp theo **người làm**, vì bốn nhóm này làm song song được, trừ chỗ ghi phụ thuộc.

### Nhóm 0 — Quyết định (chốt trước, ai cũng chờ cái này)

| # | Việc | Người quyết | Chặn ai |
|---|---|---|---|
| ~~0.1~~ | ~~Chốt phương án A hay B~~ | — | ✅ **XONG 16/10: chọn B** |
| 0.2 | `tenant` lấy từ đâu khi đăng nhập Google? (không có ô nhập tenant trong luồng Google) | Kiến trúc | **IBS việc 3.7** |
| 0.3 | Ai tạo `user_map` + customer ThingsBoard ở lần đăng nhập đầu? | Kiến trúc | IBS |
| 0.4 | Email trùng: đã có tài khoản mật khẩu, nay đăng nhập Google cùng email → gộp, chặn, hay tạo mới? | Kiến trúc + pháp lý | IBS |

> **0.3 không có cần gạt nào trên sadmin.** Mục *Quản trị → Người dùng* của sadmin là tài
> khoản quản trị của chính sadmin (`sadmin`, `phuong`, `tuyen`, `coder`…), **không phải người
> dùng cuối**. Toàn bộ là việc của IBS.
>
> **0.4 không có mặc định an toàn.** Gộp tự động = ai chiếm được email đó ở Google thì vào được
> tài khoản cũ. Chặn = người dùng kẹt. Tạo mới = hai tài khoản cùng email, thiết bị chia đôi.
> Phải có người quyết, đừng để lập trình viên tự chọn.

### Nhóm 1 — Hạ tầng (làm được ngay, không chờ 0.1)

Đây là phần **duy nhất** phải đi xin bên ngoài. Mọi thứ khác đã có sẵn cần gạt trên sadmin.

| # | Việc | Người làm | Ghi chú |
|---|---|---|---|
| 1.1 | Dựng **máy chủ SMTP** gửi được thư ra ngoài | Hạ tầng | không có cái này thì mã không đi đâu cả. Cần: máy chủ, cổng, tài khoản, mật khẩu, địa chỉ gửi từ |
| 1.2 | Cấu hình **SPF / DKIM / DMARC** cho tên miền gửi | Hạ tầng | thiếu thì thư rơi vào spam, người dùng tưởng hệ thống hỏng |
| 1.3 | Tạo **OAuth client** trên Google Cloud Console | Người có quyền tài khoản Google công ty | lấy `client_id` + `client_secret` |
| 1.4 | Khai **đúng** redirect URI ở Google | như trên | **sadmin đã ghi sẵn địa chỉ phải dùng** — chép nguyên văn, sai một ký tự là Google chặn:<br>`https://sso.dev.happibot.net/realms/iot1/broker/google/endpoint` |
| 1.5 | Làm tương tự cho **production** khi lên thật | như trên | địa chỉ khác, phải khai thêm |
| 1.6 | Soạn **mẫu thư** chứa mã xác thực (vi + en) | Nội dung / thiết kế | ghi rõ mã sống bao lâu |

### Nhóm 2 — sadmin · **chỉ một màn, một nút Lưu**

Tất cả nằm ở `iotsa.dev.happibot.net/sadmin#dnbaomat` → **Đăng nhập & Bảo mật**.
Không phải vào Keycloak.

| # | Việc | Ô trên sadmin | Phụ thuộc |
|---|---|---|---|
| 2.1 | Bấm **Lưu cấu hình** một lần rồi kiểm trang đăng nhập Keycloak | — | **làm TRƯỚC TIÊN**, xem mục 1.2b |
| 2.2 | Khai **SMTP**: bật, máy chủ, cổng, bảo mật, tài khoản, mật khẩu, gửi từ, tên hiển thị | *Email (SMTP) & OTP* | 1.1 |
| 2.3 | Bật **Bắt xác minh khi đăng ký (OTP)** | *Đăng ký & quên mật khẩu* | 2.2 |
| 2.4 | Dán **Client ID** + **Client Secret**, bật **Bật đăng nhập Google** | *Google SSO* | 1.3 |

**Không có trong danh sách vì đã bật sẵn:** *Cho phép tự đăng ký* và *Cho phép quên mật khẩu* —
cả hai đang ✅ (với điều kiện mục 1.2b kiểm xong và thấy đúng).

**Phép kiểm sau mỗi việc**, mở `https://sso.dev.happibot.net/realms/iot1/account/`:

| Sau việc | Trang đăng nhập Keycloak phải |
|---|---|
| 2.1 | mọc thêm liên kết **Register** và **Forgot password?** |
| 2.4 | mọc thêm **nút Google** |

Không thấy thì dừng lại, đừng sang bước sau — đó là dấu hiệu sadmin không ghi được xuống realm.

### Nhóm 3 — IBS ⟵ **khối việc lớn nhất; 3.1–3.6 BẮT ĐẦU ĐƯỢC NGAY**

> Tính tới 16/10, IBS **không còn gì chặn** để viết năm cửa: kiểu mã đã chốt là **6 chữ số** và
> quyền Admin REST API **đã có**. Chỉ riêng **việc 3.7** phải chờ ba quyết định 0.2–0.4.

Năm cửa. Hợp đồng đề xuất ở mục 5.

| # | Cửa | Dùng cho |
|---|---|---|
| 3.1 | `POST /v1/auth/otp/gui` | gửi mã tới email |
| 3.2 | `POST /v1/auth/otp/xac-nhan` | đổi mã lấy kết quả |
| 3.3 | `POST /v1/auth/dat-lai-mat-khau` | đặt mật khẩu mới sau khi xác thực mã |
| 3.4 | `GET /v1/auth/google/bat-dau` | trả URL để trình duyệt nhảy sang Google |
| 3.5 | `POST /v1/auth/google/doi-token` | đổi `code` lấy vé IoTX |
| 3.6 | Giới hạn tốc độ cho 3.1 | chống dò và chống spam thư |
| 3.7 | Hiện thực quyết định 0.2 / 0.3 / 0.4 | **phần khó nhất, không phải mấy cửa trên** — CHỜ Nhóm 0 |

### Nhóm 4 — Webapp *(nhỏ nhất, làm cuối)*

| # | Việc | Tệp |
|---|---|---|
| 4.1 | Điền đường dẫn vào `CUA_QUEN_MAT_KHAU` | `lib/iotx/client.ts:18` |
| 4.2 | Điền đường dẫn vào `CUA_DANG_NHAP_GOOGLE` + viết luồng chuyển hướng | `lib/iotx/client.ts:27, 280` |
| 4.3 | Thêm màn **nhập mã 6 số** (đếm ngược, nút gửi lại, dán được mã) | `components/ui/LoginScreen.tsx` |
| 4.4 | Thêm màn **đặt mật khẩu mới** | như trên |
| 4.5 | Ghép bước xác thực mã vào luồng `dangKy()` đã có | như trên |
| 4.6 | **Đọc `loginMethods`** để bật/tắt từng cách đăng nhập | xem mục 6 |
| 4.7 | Bài kiểm cho ba luồng | `tests/` |

---

## 5. Hợp đồng đề xuất cho năm cửa của IBS

Viết sẵn để IBS khỏi phải tự nghĩ. Giữ đúng nếp của hợp đồng hiện có: lỗi mơ hồ trả
`404 {"message":"not_found"}`, câu tiếng Việt soạn sẵn thì trả nguyên văn.

```
POST /v1/auth/otp/gui
  { tenant, kenh: "email", dinhDanh: "<email>", viec: "dangKy" | "quenMatKhau" }
  → 200 { ok: true, hetHanSau: 300, guiLaiSau: 60 }
  → 429 { message: "<câu tiếng Việt>" }        quá nhiều lần
  LUÔN trả 200 kể cả email không tồn tại — không được để lộ email nào có tài khoản.

POST /v1/auth/otp/xac-nhan
  { tenant, dinhDanh, ma: "123456", viec }
  → 200 { ok: true, veTam: "<token ngắn hạn>" }    veTam chỉ dùng cho bước kế tiếp
  → 400 { message: "<câu tiếng Việt>" }            mã sai hoặc hết hạn
  Mã dùng MỘT lần. Sai quá N lần thì huỷ mã, bắt gửi lại.

POST /v1/auth/dat-lai-mat-khau
  { tenant, veTam, matKhauMoi }
  → 200 { ok: true }
  → 400 { message: "<câu tiếng Việt>" }
  Đặt xong phải thu hồi mọi refresh token cũ của tài khoản đó.

GET  /v1/auth/google/bat-dau?tenant=livotec&quayVe=<url app>
  → 200 { url: "<địa chỉ Google>", state: "<chuỗi ngẫu nhiên>" }
  IBS giữ `state` để chống CSRF; webapp không tự sinh.

POST /v1/auth/google/doi-token
  { tenant, code, state }
  → 200 { accessToken, refreshToken, ... }      ĐÚNG hình dạng /auth/login trả về
  → 404 { message: "not_found" }
  Trả cùng hình dạng với /auth/login thì webapp dùng lại nguyên bộ xử lý phiên đang có.
```

**Ba ràng buộc bắt buộc, đừng bỏ:**

1. **`/auth/otp/gui` luôn trả 200**, kể cả email không tồn tại. Trả 404 cho email lạ là biến
   cửa này thành công cụ dò xem ai có tài khoản.
2. **Mã 6 chữ số, sống 5 phút, dùng một lần**, sai quá 5 lần thì huỷ.
3. **Giới hạn tốc độ theo cả email lẫn IP.** Không có nó thì một người có thể bắt máy chủ gửi
   hàng nghìn thư và làm tên miền bị liệt vào danh sách đen.

---

## 6. Một cảnh báo riêng về `loginMethods`

`lib/iotx/contracts.ts:15` khai:

```ts
loginMethods?: { eu?: string[]; staff?: string[] };
```

**Trường này chưa được đọc ở bất cứ đâu trong mã.** Hệ quả hiện tại: `LoginScreen.tsx` vẫn nhận
số điện thoại ở ô Tài khoản và gửi thẳng lên `/auth/login`, trong khi **sadmin đang TẮT đăng
nhập bằng số điện thoại**. Người dùng gõ số điện thoại thì nhận một câu lỗi chung chung, không
hiểu vì sao.

Việc 4.6 phải sửa đúng chỗ này: đọc `loginMethods.eu`, và **chỉ hiện cách đăng nhập nào máy
chủ nói là đang bật**. Làm xong thì nút Google cũng tự ẩn khi chưa bật — không phải cắm cứng.

---

## 7. Thứ tự làm

```
NGAY           0.2 0.3 0.4   chốt ba quyết định   ← IBS chờ cái này để viết 3.7
               1.1 → 1.3     SMTP + gửi thử       ┐
               1.4 → 1.5     Google Cloud         ├ ba nhánh chạy SONG SONG
               1.6           mẫu thư              ┘

NGAY           2.1  bấm Lưu trên sadmin → KIỂM hai liên kết ở trang Keycloak
                    (nếu không mọc ra: sadmin không ghi xuống realm — CHẶN hết)
Khi 1.1 xong   2.2  khai SMTP trên sadmin, rồi 2.3 bật xác minh OTP
Khi 1.3 xong   2.4  dán Google client vào sadmin → KIỂM nút Google

Khi 0.2–0.4    IBS làm 3.1 … 3.7
đã chốt        (3.7 là phần khó nhất — không phải mấy cái cửa)

Cuối           nhóm 4 (webapp) — 1–2 ngày sau khi IBS xong
```

**Đường găng là IBS, không phải webapp.** Nếu phải báo tiến độ hằng tuần, ba con số đáng theo
dõi là: **SMTP đã gửi được thư thật chưa (1.1)**, **ba quyết định 0.2–0.4 đã chốt chưa**, và
**IBS đã bắt đầu 3.7 chưa**. Webapp chỉ mất 1–2 ngày và luôn là khâu cuối.

---

## 8. Nghiệm thu

Luồng coi là xong khi làm được đủ các bước sau trên DEV, bằng một email thật:

**Đăng ký**
- [ ] Nhập email mới → nhận thư có mã trong vòng 60 giây, thư không vào hộp spam
- [ ] Nhập sai mã → báo lỗi rõ, vẫn ở màn nhập mã
- [ ] Nhập đúng mã → vào thẳng app, không phải đăng nhập lại
- [ ] Để quá 5 phút rồi mới nhập mã → báo mã hết hạn, gửi lại được
- [ ] Bấm gửi lại liên tục → bị chặn sau vài lần, có nói rõ chờ bao lâu

**Quên mật khẩu**
- [ ] Nhập email **không tồn tại** → màn hình nói y hệt như email có thật (không lộ)
- [ ] Nhập đúng mã → đặt được mật khẩu mới
- [ ] Mật khẩu mới dưới 8 ký tự → chặn tại chỗ
- [ ] Sau khi đổi, **phiên cũ trên máy khác bị đăng xuất**
- [ ] Mật khẩu cũ không dùng được nữa

**Google**
- [ ] Bấm "Tiếp tục với Google" → sang Google → chọn tài khoản → quay về app, đã đăng nhập
- [ ] Người dùng mới hoàn toàn → tạo được `user_map` + customer ThingsBoard (quyết định 0.3)
- [ ] Email đã có tài khoản mật khẩu → hành xử **đúng như quyết định 0.4**, không phải tuỳ hứng
- [ ] Bấm huỷ ở màn Google → quay về màn đăng nhập, không treo, không báo lỗi lạ

**Chung**
- [ ] `loginMethods` tắt cách nào thì màn đăng nhập **không hiện** cách đó
- [ ] Mọi lời gọi vẫn đi qua `/v1/*` (soát bằng `tests/kich-ban/a9-bao-mat.mjs`)

---

## Phụ lục — để sau, không làm đợt này

- **Mã qua SMS.** Cần tài khoản cổng SMS, cần số gửi đã đăng ký với nhà mạng, và tính tiền
  theo tin nhắn. Hợp đồng ở mục 5 đã chừa sẵn `kenh: "email" | "sms"` nên thêm sau không phải
  sửa cửa.
- **Đổi mật khẩu khi đã đăng nhập** (`CUA_DOI_MAT_KHAU`) — cùng họ nhưng là luồng khác, không
  cần mã email.
- **Sửa hồ sơ** (`CUA_DOI_TEN`, `CUA_DOI_ANH_DAI_DIEN`) — `GET /me` hiện chỉ trả email và
  tenant, chưa có tên hay ảnh, cũng chưa có cửa ghi.
- **Bắt buộc 2FA** — sadmin ghi rõ là để sau.

## Nhắc

Phần webapp (nhóm 4) thực thi ở **tab Code**. Các nhóm 0–3 là việc của người khác — tài liệu
này viết để gửi sang họ.
