# Kiến thức nền: gửi mã OTP qua SMS, và luồng đăng ký / quên mật khẩu theo số điện thoại

- Viết: 26/10/2026
- Phạm vi: kiến thức để ra quyết định + thiết kế luồng. Chưa phải lệnh thực thi.

## Tóm tắt một đoạn

SMS **không phải email có thêm chữ "SMS"**. Nó khác ở bốn điểm làm thay đổi hẳn thiết kế:
**mỗi tin tốn tiền thật**, **có quy định pháp lý ở Việt Nam**, **không bảo đảm tới nơi**, và
**bị một kiểu tấn công mà email không có**. Phần lớn công sức nằm ở bốn chỗ đó chứ không nằm ở
việc gọi API gửi tin.

---

## 1. Bốn khác biệt so với email

| | Email | SMS |
|---|---|---|
| Chi phí mỗi mã | ~0 | **tốn tiền thật mỗi tin** |
| Pháp lý | không | **phải đăng ký tên định danh (brandname)** |
| Tới nơi | gần như chắc chắn | **không bảo đảm** — nhà mạng có thể chặn, lọc, hoặc chậm |
| Bị lợi dụng | spam thư | **tấn công bơm SMS** — kẻ xấu *kiếm tiền* từ việc bắt anh gửi |

### 1.1 Tốn tiền — và đó là thứ đổi thiết kế nhiều nhất

Email sai thì tốn băng thông. SMS sai thì **tốn tiền mặt**. Nghĩa là mọi nút "Gửi mã" đều là
một nút tiêu tiền, và phải thiết kế như một nút tiêu tiền:

- Giới hạn tốc độ không còn là chuyện bảo mật, mà là **chuyện ngân sách**
- Phải đo được **chi phí mỗi lần đăng ký thành công**, không chỉ đếm số tin đã gửi
- Phải có **trần chi tiêu mỗi ngày**, chạm trần thì ngừng gửi và báo động

### 1.2 Không bảo đảm tới nơi

Email vào spam thì vẫn còn nằm đó, người dùng lục ra được. SMS **biến mất hẳn**. Nguyên nhân
hay gặp: nhà mạng lọc, số rác/ảo, số chuyển mạng, thuê bao hết hạn, roaming.

Hệ quả thiết kế: **luôn phải có đường thoát**. Hoặc chuyển sang email, hoặc nút "gọi điện đọc
mã" (voice OTP), hoặc tối thiểu là một câu nói rõ phải làm gì khi không nhận được.

---

## 2. Tấn công bơm SMS — thứ phải hiểu trước khi viết dòng nào

Đây là kiểu tấn công **không tồn tại với email**, và là lý do nhiều dự án lỗ nặng.

**Cách nó hoạt động:** kẻ tấn công điều khiển (hoặc thông đồng với) một dải số thuê bao mà
chúng được **chia doanh thu** trên mỗi tin nhắn đến. Chúng gọi cửa "gửi mã" của anh hàng chục
nghìn lần tới dải số đó. Anh trả tiền cho từng tin; chúng thu phần chia. **Chúng không cần đọc
mã, không cần chiếm tài khoản nào cả** — tiền của anh đi thẳng vào túi chúng.

Tên tiếng Anh: *SMS pumping*, *toll fraud*, *artificially inflated traffic*.

Dấu hiệu: hoá đơn tăng vọt, tỉ lệ "gửi mã / đăng ký thành công" rơi thảm hại, tin dồn vào vài
dải số lạ hoặc một quốc gia không có khách hàng.

### Năm lớp chặn, xếp theo hiệu quả trên chi phí

| | Biện pháp | Vì sao |
|---|---|---|
| 1 | **Chỉ cho gửi tới số Việt Nam (+84)** | app này bán ở VN. Một dòng kiểm tra chặn gần hết kiểu tấn công này |
| 2 | **Chỉ cho đầu số di động** `03 · 05 · 07 · 08 · 09` | số cố định không nhận được SMS; dải lạ cũng bị loại luôn |
| 3 | Giới hạn theo **số điện thoại** và theo **IP** — như đã làm với email | |
| 4 | **Trần chi tiêu mỗi ngày**, chạm trần thì ngừng và báo động | lớp chặn cuối khi bốn lớp trên thủng |
| 5 | Theo dõi **tỉ lệ gửi mã / xác nhận thành công** | tỉ lệ rơi đột ngột = đang bị bơm, dù chưa chạm trần |

> Lớp 1 và 2 là **rẻ nhất và mạnh nhất**. Làm hai cái đó trước mọi thứ khác.

---

## 3. Pháp lý ở Việt Nam — phần này tôi chưa chắc, nói rõ luôn

Tôi đọc ba trang của ba nhà cung cấp dịch vụ SMS. **Họ mâu thuẫn nhau ở những điểm quan trọng
nhất**, và không trang nào trích đúng điều khoản của nghị định. Tôi **chưa đọc văn bản gốc**
Nghị định 91/2020/NĐ-CP.

| Câu hỏi | Tình trạng |
|---|---|
| Brandname có **bắt buộc cho tin OTP** không? | **Mâu thuẫn.** Hai trang gắn quy định với **quảng cáo**; một trang khẳng định OTP cũng bắt buộc nhưng **không dẫn điều khoản nào** |
| Cơ quan tiếp nhận | **Mâu thuẫn ngay trong một trang**: chỗ ghi Cục An toàn thông tin (Bộ TT&TT), chỗ ghi Bộ Công An |
| Phí nhà nước | **Mâu thuẫn**: một trang dẫn Thông tư 269/2016/TT-BTC *"cấp lần đầu 200.000 đồng/lần, cấp lại 100.000 đồng/lần"*; trang khác ghi **"Miễn phí"** |
| Phí duy trì hằng năm | Không trang nào nêu phí nhà nước. Một trang ghi **1–3 triệu/năm** nhưng đó là **phí của đối tác**, không phải phí nhà nước |

**Việc cần làm:** đọc **văn bản gốc** Nghị định 91/2020/NĐ-CP và Thông tư 06/2023/TT-BTTTT,
hoặc hỏi thẳng nhà mạng. Đừng lấy trang bán hàng làm căn cứ pháp lý.

### Những điểm ba nguồn ĐỒNG Ý (tạm tin được)

- **Tên định danh tối đa 11 ký tự**
- Nộp hồ sơ **qua nhà cung cấp dịch vụ**, không tự nộp thẳng
- Duyệt mất khoảng **5–15 ngày làm việc** tuỳ nhà mạng
- Cần: giấy chứng nhận đăng ký doanh nghiệp, **chữ ký tươi + dấu đỏ**, mô tả mục đích sử dụng,
  giấy tờ người đại diện pháp luật

### Chỗ còn mâu thuẫn, phải hỏi nhà cung cấp

- Tên định danh có **buộc trùng khít** tên trên giấy phép kinh doanh không? Một trang nói buộc,
  hai trang nói được dùng tên thương hiệu nếu có giấy tờ nhãn hiệu
- Ký tự đặc biệt và phân biệt hoa/thường — ba trang nói ba kiểu

> **Ảnh hưởng tới kế hoạch:** 5–15 ngày làm việc là **đường găng**, không phải thủ tục phụ. Nếu
> định dùng SMS thì nộp hồ sơ **ngay hôm nay**, đừng đợi code xong.

---

## 4. Giá — không ai công bố

Tôi đọc hai trang báo giá của nhà cung cấp. **Không trang nào có một con số VNĐ nào.** Bảng giá
là liên kết chết (`href="#"`), mọi thứ dẫn về biểu mẫu "xin báo giá".

Thứ lấy được chỉ là lời quảng cáo: *"chi phí cực thấp"*, *"Nhanh & Rẻ"*. Và vài con số kỹ thuật:
gửi trong **5–10 giây**, thông lượng tới **500 tin/giây**.

**Bảy câu phải hỏi bằng văn bản trước khi chọn nhà cung cấp:**

1. Giá mỗi tin OTP, **tách theo từng nhà mạng** (Viettel · Vinaphone · MobiFone · Vietnamobile · Itel)
2. **Đã gồm VAT chưa**
3. Mua tối thiểu bao nhiêu? Tiền nạp có **hạn sử dụng** không?
4. Phí đăng ký brandname, phí duy trì — **nhà nước thu bao nhiêu, nhà cung cấp thu bao nhiêu**
5. **Tin gửi thất bại có bị tính tiền không?** ← câu quan trọng nhất về chi phí
6. Cam kết **tỉ lệ tới nơi** là bao nhiêu, đo thế nào
7. Có **webhook báo trạng thái** từng tin (đã gửi / đã nhận / thất bại) không?

Câu 5 và 7 quyết định luôn thiết kế: không có webhook thì không bao giờ biết tin có tới hay
không, và không phát hiện được mình đang bị bơm.

---

## 5. Chuẩn hoá số điện thoại — chỗ nhỏ mà hay sai

Một số Việt Nam có thể được gõ vào bằng **năm kiểu khác nhau**:

```
0912345678        +84912345678        84912345678
0912 345 678      (+84) 912.345.678
```

**Năm kiểu đó phải cùng ra một kết quả**, nếu không người dùng đăng ký bằng kiểu này rồi quên
mật khẩu gõ kiểu khác là hệ thống coi như hai người.

**Luật chuẩn hoá, theo đúng thứ tự:**

```
1. Bỏ hết khoảng trắng, dấu chấm, gạch ngang, ngoặc
2. "+84…" hoặc "84…"  →  "0…"
3. Kết quả phải khớp  ^0(3|5|7|8|9)\d{8}$   (đúng 10 chữ số)
4. Lưu vào máy chủ dạng E.164: "+84912345678"
```

**Bước 3 quan trọng:** chỉ `03 · 05 · 07 · 08 · 09` là **di động**. Đầu `02x` là **số cố định,
không nhận được SMS** — chặn ngay ở trình duyệt, đừng để tốn một tin.

> Mã hiện tại của webapp (`components/ui/LoginScreen.tsx`) đang dùng
> `/^(0|\+84)\d{9}$/` — **nhận cả số cố định** `02x`. Cần siết lại theo luật trên.

**Lưu dạng nào ở máy chủ?** Dùng **E.164** (`+84912345678`) vì đó là dạng mọi cổng SMS quốc tế
hiểu, và nó không nhập nhằng. Hiện ra cho người dùng thì vẫn hiện `0912345678` cho quen mắt.

---

## 6. Hệ thống hiện có gì rồi

Tin tốt: phần lớn đã có chỗ cắm sẵn, không phải xây lại.

| Chỗ | Trạng thái |
|---|---|
| **sadmin → Cổng SMS** | ✅ có sẵn: bật/tắt · nhà cung cấp (Twilio · eSMS.vn · Khác) · API key/SID · Brandname |
| **sadmin → Cách đăng nhập → Số điện thoại + mật khẩu** | ✅ có ô tích, **đang tắt** vì chưa khai cổng SMS |
| **Hợp đồng IBS** | ✅ đã chừa sẵn `kenh: "email" \| "sms"` trong `/auth/otp/gui` — **không phải sửa hợp đồng** |
| **IBS trả lỗi khi gọi `kenh:"sms"`** | đo 19/10: `400 {"message":"Hiện chỉ gửi mã qua email."}` — cửa đã biết tới SMS, chỉ chưa bật |
| **`loginMethods`** | ✅ đã có trường `sdt` |
| **Webapp** | ❌ chưa đọc `loginMethods`; regex số điện thoại còn lỏng |

Nghĩa là **phần kiến trúc đã xong**. Việc còn lại chia làm ba: hồ sơ brandname (ngoài kỹ
thuật), IBS nối cổng SMS, và webapp siết regex + đọc `loginMethods`.

---

## 7. Luồng đăng ký bằng số điện thoại

Giống luồng email đã làm, khác bốn chỗ:

```
Bước 1  Người dùng gõ số điện thoại  →  CHUẨN HOÁ NGAY TRÊN TRÌNH DUYỆT
        sai định dạng / số cố định   →  báo tại chỗ, KHÔNG gọi máy chủ
        (mỗi lần gọi nhầm là một tin mất tiền)

Bước 2  guiMaOtp(sdt, "dangKy", kenh:"sms")
        → 200 { hetHanSau, guiLaiSau }

Bước 3  Nhập mã 6 số  →  xacNhanMaOtp  →  veTam

Bước 4  register(sdt, matKhau, ten, veTam)
```

**Bốn chỗ khác email:**

1. **Chuẩn hoá và kiểm ở trình duyệt trước.** Với email, gọi nhầm chỉ tốn một request. Với SMS,
   gọi nhầm **tốn tiền**.
2. **Thời gian chờ gửi lại dài hơn.** Email 60 giây là hợp lý; SMS nên **90–120 giây**, vì tin
   có thể tới chậm và người dùng sốt ruột bấm lại là tốn gấp đôi.
3. **Phải có đường thoát.** Dưới ô nhập mã luôn có *"Không nhận được mã? Dùng email thay thế"*.
   SMS mất tin là chuyện bình thường, không phải ngoại lệ.
4. **Autofill mã.** Android điền được mã SMS tự động nếu nội dung tin có đúng định dạng
   (một dòng kết thúc bằng `#<tên miền> #<mã>`). iOS thì chỉ cần `autocomplete="one-time-code"`
   là đủ, **cái này webapp đã làm** ở màn nhập mã email. Nếu muốn Android tự điền, **nội dung
   tin phải do mình soạn** — hỏi nhà cung cấp có cho tuỳ biến không.

## 8. Luồng quên mật khẩu bằng số điện thoại

Giống hệt luồng email, chỉ đổi `kenh`. Nhưng **một luật bảo mật phải giữ nguyên tuyệt đối**:

> **Số không tồn tại vẫn trả `200`, giống hệt số có thật.**

Với SMS còn có thêm một bẫy mà email không có: **trả 200 nhưng ĐỪNG gửi tin cho số không có
tài khoản**. Gửi thật là vừa tốn tiền vừa làm phiền người lạ — và kẻ tấn công sẽ lợi dụng đúng
điều đó để bơm SMS.

Tức là: *im lặng với người dùng, nhưng không im lặng với ví tiền.*

---

## 9. Bốn quyết định phải chốt

| # | Quyết định | Ghi chú |
|---|---|---|
| 1 | **Có thật sự cần SMS không?** | Email đã chạy, miễn phí, không cần hồ sơ pháp lý. SMS chỉ đáng làm nếu khách hàng thật sự không dùng email |
| 2 | Dùng nhà cung cấp **trong nước hay Twilio?** | sadmin cho cả hai. Trong nước rẻ hơn và có brandname tiếng Việt; Twilio nhanh hơn để thử nhưng gửi về VN đắt và dễ bị lọc |
| 3 | Số điện thoại là **định danh chính** hay chỉ là cách đăng nhập thêm? | Hợp đồng hiện coi email là *"định danh chính, luôn bật"*. Nếu số điện thoại cũng thành định danh thì phát sinh: một người hai tài khoản, đổi số, số tái sử dụng |
| 4 | **Ngân sách SMS mỗi tháng** là bao nhiêu? | Quyết định trần chi tiêu ở mục 2 |

Quyết định 3 là cái dễ bị bỏ qua nhất mà hậu quả lâu dài nhất. **Số điện thoại ở Việt Nam được
tái sử dụng**: thuê bao bỏ số, nhà mạng thu hồi và bán cho người khác sau vài tháng. Người mới
nhận số đó bấm "quên mật khẩu" là **vào được tài khoản của người cũ**. Email không có vấn đề
này. Nếu chọn số điện thoại làm định danh chính thì phải có chính sách cho chuyện đó.

---

## 10. Thứ tự làm

```
NGAY       Chốt quyết định 1 (có làm SMS không) và 3 (định danh chính)
           Nếu làm → NỘP HỒ SƠ BRANDNAME NGAY (5–15 ngày làm việc, là đường găng)
           Gửi 7 câu hỏi ở mục 4 cho 2–3 nhà cung cấp, so báo giá

Song song  Webapp: siết regex số điện thoại (mục 5) + đọc loginMethods
           → làm được ngay, không chờ ai

Khi có     sadmin: khai Cổng SMS
brandname  IBS: nối kenh:"sms" vào /auth/otp/gui (hợp đồng đã chừa sẵn)
           IBS: thêm lớp chặn 1 và 2 ở mục 2 — +84 và đầu số di động

Cuối       Webapp: thêm lựa chọn "gửi mã qua SMS", đường thoát sang email
```

---

## 11. Những thứ KHÔNG nên làm

- **Đừng gửi SMS trước khi có brandname.** Tin từ đầu số lạ dễ bị nhà mạng chặn, và có thể
  vướng quy định.
- **Đừng để mã SMS sống lâu hơn mã email.** Tin nhắn nằm trên màn hình khoá, ai cầm máy cũng
  đọc được. 5 phút là tối đa, 3 phút thì tốt hơn.
- **Đừng ghi tên dịch vụ kèm mã trong một tin kiểu "Mã đăng nhập Livotec của bạn là 123456"**
  nếu có thể gọn hơn. Màn hình khoá hiện nguyên tin; càng ít thông tin càng tốt.
- **Đừng dùng SMS làm lớp bảo mật thứ hai (2FA) mà coi là chắc chắn.** SIM swap là chuyện có
  thật. SMS tốt cho *tiện lợi*, không tốt cho *bảo đảm*.
- **Đừng bật SMS khi chưa có trần chi tiêu và cảnh báo.** Đó là cách lỗ tiền nhanh nhất.

---

## 12. Các bước thực hiện

### Bước 0 — Ba quyết định, chốt trước (anh + sếp)

| | Quyết định | Chặn cái gì |
|---|---|---|
| 0.1 | **Có làm SMS không?** Email đã chạy, miễn phí, không hồ sơ pháp lý | chặn 0.2 → hết |
| 0.2 | SĐT là **định danh chính** hay chỉ là cách đăng nhập thêm? | chặn IBS |
| 0.3 | **Ngân sách SMS mỗi tháng** | chặn trần chi tiêu |

**Quyết định 0.1 = "không" thì dừng ở đây** — trừ nhánh C dưới, nhánh đó nên làm dù thế nào.

---

### Bước 1 — Ba nhánh chạy SONG SONG, bắt đầu ngay sau 0.1

#### Nhánh A — Hồ sơ brandname ⟵ **ĐƯỜNG GĂNG, làm trước nhất**

5–15 ngày làm việc. Mọi thứ khác xong trước nó cũng phải nằm chờ.

- [ ] Chọn tên định danh, **tối đa 11 ký tự** (ví dụ `LIVOTEC`)
- [ ] Hỏi nhà cung cấp: tên có **buộc trùng khít** giấy phép kinh doanh không — ba nguồn nói khác nhau
- [ ] Chuẩn bị: GCN đăng ký doanh nghiệp (sao y) · mô tả mục đích *"SMS OTP, xác thực tài khoản"* · giấy tờ người đại diện pháp luật · uỷ quyền nếu người nộp không phải đại diện
- [ ] **Chữ ký tươi + dấu đỏ** — ba nguồn đều nói hồ sơ hay bị trả vì thiếu
- [ ] Nộp **qua nhà cung cấp**, không tự nộp thẳng

> Song song, đọc **văn bản gốc** Nghị định 91/2020/NĐ-CP và Thông tư 06/2023/TT-BTTTT để
> biết OTP có thật sự bắt buộc brandname không (mục 3). Đừng lấy trang bán hàng làm căn cứ.

#### Nhánh B — Chọn nhà cung cấp

- [ ] Gửi **7 câu ở mục 4** cho **2–3** nhà cung cấp, yêu cầu trả lời bằng văn bản
- [ ] So sánh, chú ý hai câu quyết định thiết kế: **tin thất bại có tính tiền không** và
      **có webhook báo trạng thái không**
- [ ] Chốt nhà cung cấp → lấy API key/SID

#### Nhánh C — Webapp ⟵ **làm được NGAY, không chờ ai, và nên làm dù không chọn SMS**

Hai lỗi đang sống hôm nay, không liên quan gì tới việc có làm SMS hay không:

1. Regex `/^(0|\+84)\d{9}$/` **nhận cả số cố định `02x`** — số không nhận được SMS
2. `loginMethods` khai ở `contracts.ts:15` mà **chưa chỗ nào đọc**, nên màn đăng nhập vẫn nhận
   số điện thoại rồi gửi thẳng lên `/auth/login` trong khi sadmin đang **tắt** đăng nhập bằng SĐT

→ Lệnh cho tab Code ở cuối mục này.

---

### Bước 2 — Khi nhánh A và B xong

| | Việc | Ai |
|---|---|---|
| 2.1 | Khai **Cổng SMS** trên sadmin: bật · nhà cung cấp · API key/SID · brandname | anh |
| 2.2 | Bật **Số điện thoại + mật khẩu** ở mục *Cách đăng nhập* | anh |
| 2.3 | Nối `kenh:"sms"` vào `/auth/otp/gui` — **hợp đồng đã chừa sẵn**, không sửa hợp đồng | IBS |
| 2.4 | **Lớp chặn 1 + 2** (mục 2): chỉ `+84`, chỉ đầu số `03·05·07·08·09` | IBS |
| 2.5 | **Trần chi tiêu mỗi ngày** + cảnh báo khi chạm | IBS |
| 2.6 | Chờ gửi lại **90–120 giây** cho SMS, không phải 60 như email | IBS |

2.4 và 2.5 **không được coi là việc phụ** — đó là hai thứ chặn mất tiền.

Sau 2.1, **phép thử ngay**: gọi `/auth/otp/gui` với `kenh:"sms"`, số thật của anh. Hiện cửa
này trả `400 "Hiện chỉ gửi mã qua email."` — khi nào nhận được tin thật là 2.3 đã xong.

---

### Bước 3 — Webapp nối luồng SMS

Làm sau khi 2.3 chạy. Giống luồng email đã có, thêm:

- [ ] Ô chọn **Email / SMS** ở màn nhập, chỉ hiện cách nào `loginMethods` nói là đang bật
- [ ] Chuẩn hoá số **ngay trên trình duyệt**, sai thì báo tại chỗ, **không gọi máy chủ**
- [ ] Đường thoát dưới ô nhập mã: *"Không nhận được mã? Dùng email thay thế"*
- [ ] Chờ gửi lại 90–120s cho SMS

---

### Bước 4 — Nghiệm thu

- [ ] Nhận được tin thật, **đúng brandname** hiện ra làm người gửi
- [ ] Số cố định `02x` → **chặn ở trình duyệt**, không tốn tin nào
- [ ] Số nước ngoài → máy chủ từ chối
- [ ] Năm kiểu gõ (`0912345678` · `+84912345678` · `84912345678` · có dấu cách · có dấu chấm)
      đều ra **cùng một tài khoản**
- [ ] Số không tồn tại → vẫn `200` giống số thật, **nhưng không có tin nào được gửi**
- [ ] Bấm gửi lại liên tục → bị chặn, câu báo nói rõ chờ bao lâu
- [ ] Chạm trần chi tiêu ngày → ngừng gửi và có cảnh báo

---

### Lệnh cho tab Code — nhánh C, chạy được ngay hôm nay

```
Sửa hai lỗi ở màn đăng nhập, cả hai đang sống và không liên quan tới việc có làm
SMS hay không. Đọc docs/kien-thuc-otp-sms.md mục 5 và 6.

1. components/ui/LoginScreen.tsx — laSoDienThoai hiện là /^(0|\+84)\d{9}$/, nhận cả
   số cố định 02x là số KHÔNG nhận được SMS. Thay bằng: chuẩn hoá trước (bỏ khoảng
   trắng, dấu chấm, gạch ngang, ngoặc; "+84…"/"84…" → "0…"), rồi khớp
   ^0(3|5|7|8|9)\d{8}$. Viết thành một hàm dùng chung, có bài kiểm cho cả năm kiểu gõ.

2. lib/iotx/contracts.ts:15 khai loginMethods nhưng CHƯA CHỖ NÀO ĐỌC. Hệ quả: màn
   đăng nhập vẫn nhận số điện thoại rồi gửi thẳng lên /auth/login trong khi sadmin
   đang TẮT đăng nhập bằng SĐT — người dùng chỉ nhận một câu lỗi chung chung.
   Đọc loginMethods.eu và chỉ hiện cách đăng nhập nào máy chủ nói là đang bật.
   sadmin có BỐN cách: email+mk, SĐT+mk, Google, Passkey — đừng cắm cứng ba nút.

Xong chạy npm run lint, npm run build, npm test.
```

---

## Nguồn và mức tin cậy

Phần **chi phí, tấn công bơm SMS, chuẩn hoá số, thiết kế luồng** — kiến thức chung, chắc chắn.

Phần **pháp lý Việt Nam** — đọc từ ba trang của nhà cung cấp dịch vụ, **họ mâu thuẫn nhau** ở
cơ quan tiếp nhận, phí nhà nước, và việc OTP có bắt buộc brandname hay không. **Chưa đọc văn
bản gốc.** Trước khi dùng làm căn cứ, phải đọc Nghị định 91/2020/NĐ-CP và Thông tư
06/2023/TT-BTTTT, hoặc hỏi thẳng nhà mạng.

Phần **giá** — không có. Hai trang báo giá của nhà cung cấp không chứa một con số VNĐ nào;
bảng giá là liên kết chết. Phải xin báo giá bằng văn bản.
