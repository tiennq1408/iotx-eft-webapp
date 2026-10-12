# Kết quả Phần A — test chức năng tự động

Ngày chạy: 08:40:09 10/10/2026 · Bản webapp (commit): `e6c1a3f` · Môi trường: **máy chủ giả** (`tests/may-chu-gia.mjs`) qua proxy `/v1` thật của app, bản production (`next build` + `next start`)

Theo `kich-ban-test.md` bản 3 (09/10/2026). Bộ này đo **hành vi của webapp**, không đo IBS thật: ca nào cần
phần cứng, Safari, tài khoản thứ hai hay DEV thì ghi **Test tay** kèm việc cần làm.

## Tổng

| Trạng thái | Số ca |
|---|---|
| Đạt | 56 |
| Hỏng | 3 |
| Test tay | 17 |
| Phủ bởi bài khác | 10 |
| Chưa có tính năng | 4 |
| Lỗi đã biết | 1 |
| Chưa chạy | 0 |
| **Tổng** | **91** |

## Hỏng — cần xem

- **A3-02 — Thanh mức chỉ gửi khi thả tay:** sai: không gửi lệnh trong lúc kéo (gửi 9); thả tay thì gửi đúng 1 lệnh (gửi 0) — thanh "Hẹn giờ tắt" của fan63903
- **A5-07 — Máy được chia sẻ:** sai: người nhận không có quyền sửa → không thấy sao ghim (đang hiện 1); máy được chia sẻ nhưng perms đủ quyền → vẫn hiện 5 nút sửa (tài liệu đòi ẩn hẳn) — app ẩn bút + ô gán theo perms.create/control, không theo cờ shared; sao ghim luôn hiện vì là lựa chọn riêng của người dùng (PATCH /devices "theo NGƯỜI DÙNG"); bài dau-man.mjs lại đang đổi tên chính máy chia sẻ SBI314 — cần chốt quy tắc
- **A8-04 — Lỗi máy chủ:** sai: có nút thử lại — hiện chỉ có nút × đóng; app tự thử lại theo nhịp hỏi vòng và khi quay lại tab

## Còn phải test tay

- [ ] **A3-07 — Cánh quạt xoay:** cánh quạt xoay quanh đúng trục, không nhoè — phải nhìn bằng mắt khi quạt đang chạy
- [ ] **A5-02 — Mời ở phạm vi nhà:** mời tài khoản 2 ở phạm vi nhà, tài khoản 2 thấy lời mời — cần tài khoản thứ hai trên IBS thật
- [ ] **A5-03 — Phạm vi phòng / thiết bị:** phạm vi phòng / thiết bị, tài khoản 2 chỉ thấy đúng phạm vi — cần tài khoản thứ hai trên IBS thật
- [ ] **A5-04 — Đổi quyền:** đổi quyền xem / điều khiển / chặn xoá rồi thử bằng tài khoản 2 — cần tài khoản thứ hai trên IBS thật
- [ ] **A6-03 — Luật thật kích điều kiện:** bật luật thật rồi kích điều kiện bằng thiết bị thật, xem lịch sử chạy — cần IBS + mạch thật
- [ ] **A7-01 — Mã ① bằng camera iPhone:** quét mã ① bằng camera iPhone → "Kết nối mạng mzService" — trang portal chạy trên mạch, cần mạch thật + điện thoại
- [ ] **A7-02 — Mã ① bằng Android:** quét mã ① bằng camera 2–3 dòng Android — trang portal chạy trên mạch, cần mạch thật + điện thoại
- [ ] **A7-03 — Mã ① bằng Zalo:** quét mã ① bằng Zalo — ghi tự kết nối hay chỉ hiện chữ WIFI:… — trang portal chạy trên mạch, cần mạch thật + điện thoại
- [ ] **A7-04 — Portal tự bật:** vào mạng mzService → trang portal tự bật lên — trang portal chạy trên mạch, cần mạch thật + điện thoại
- [ ] **A7-05 — Danh sách Wi-Fi:** danh sách Wi-Fi trên portal: chỉ 2,4 GHz, sắp theo sóng, không trùng tên — trang portal chạy trên mạch, cần mạch thật + điện thoại
- [ ] **A7-06 — Sai mật khẩu Wi-Fi:** nhập sai mật khẩu Wi-Fi → báo rõ, thử lại không phải rút điện mạch — trang portal chạy trên mạch, cần mạch thật + điện thoại
- [ ] **A7-07 — Mật khẩu Wi-Fi < 8:** mật khẩu Wi-Fi dưới 8 ký tự → chặn ngay trên trang portal — trang portal chạy trên mạch, cần mạch thật + điện thoại
- [ ] **A7-08 — Mật khẩu Wi-Fi đúng:** mật khẩu đúng → "Đã vào Wi-Fi" hoặc "Mất kết nối với thiết bị" — trang portal chạy trên mạch, cần mạch thật + điện thoại
- [ ] **A7-09 — Tự quay về Wi-Fi nhà:** điện thoại tự quay về Wi-Fi nhà; mạch tắt mzService — trang portal chạy trên mạch, cần mạch thật + điện thoại
- [ ] **A7-10 — Mạng ẩn:** "Mạng của tôi không có trong danh sách" → nhập được tên mạng ẩn — trang portal chạy trên mạch, cần mạch thật + điện thoại
- [ ] **A7-11 — Mạng không mật khẩu:** mạng không mật khẩu → không hỏi mật khẩu — trang portal chạy trên mạch, cần mạch thật + điện thoại
- [ ] **A9-04 — Sửa id thiết bị:** webapp không có URL theo thiết bị (app một trang) — thử bằng curl GET/PATCH /v1/devices/<id máy người khác> trên DEV, mong đợi 404 {"message":"not_found"}

## Chi tiết từng ca

### A1 — Đăng nhập và phiên

| Mã | Việc | Kết quả | Ghi chú |
|---|---|---|---|
| A1-01 | Đăng nhập đúng | Đạt | danh sách thiết bị hiện sau 120 ms (≤ 2000); vào màn chính — đo trên máy chủ giả — số trên DEV phải đo tay |
| A1-02 | Đăng nhập sai mật khẩu | Đạt | 401 → câu chung ở cảnh báo đầu form; 404 → CÙNG câu đó (không lộ tài khoản có tồn tại); không gắn lỗi vào riêng ô mật khẩu |
| A1-03 | Đứng yên 6 phút rồi bấm thiết bị | Đạt | vẫn trong app, không bị đá ra; mở được thiết bị; đúng 1 lượt /auth/refresh (đếm được 1) — vé hết hạn dựng bằng 401 thay cho chờ 6 phút; bản chờ thật 6 phút làm tay |
| A1-04 | Mở app khi vé đã hết hạn | Đạt | mở lại app khi vé hết hạn → vào được; đúng 1 lượt /auth/refresh, không phải 2 (đếm được 1) |
| A1-05 | Xoá refresh token rồi thao tác | Đạt | về màn đăng nhập; không lặp vô hạn (0 request /v1 trong 5 s sau đó) |
| A1-06 | Đăng xuất | Đạt | đăng xuất → về màn đăng nhập; bấm Back không vào lại được app |
| A1-07 | Đổi ngôn ngữ trên màn đăng nhập | Đạt | số mục bằng langs máy chủ (3/3: en, th, vi); vi → en: chữ đổi ngay ("Sign in"); chọn được th; chưa cần đăng nhập — chữ tiếng Thái lấy từ /i18n máy chủ — máy giả không có bản Thái, xem tay trên DEV |
| A1-08 | Nút con mắt ở ô mật khẩu | Đạt | password → text; aria-label đổi theo (Hiện mật khẩu → Ẩn mật khẩu) |
| A1-09 | Bỏ trống từng ô | Đạt | bỏ trống → lỗi dưới đúng từng ô; gõ lại thì lỗi của chính ô đó biến mất |
| A1-10 | Quên mật khẩu → Gửi mã | Đạt | báo "tính năng đang chờ bật"; không nhảy sang màn "Đã gửi mã" |
| A1-11 | Tiếp tục với Google | Đạt | báo "tính năng đang chờ bật"; không điều hướng, không treo |
| A1-12 | Gõ số điện thoại vào ô Tài khoản | Lỗi đã biết | app gửi thẳng SĐT lên /auth/login (đã quan sát thấy) trong khi sadmin đang tắt đăng nhập bằng SĐT; máy chủ trả câu chung. Xem docs/bao-cao/2026-10-09.md mục 3 |
| A1-13 | Đăng ký: mật khẩu 7 ký tự | Đạt | mật khẩu 7 ký tự → chặn tại chỗ; không gửi request |
| A1-14 | Đăng ký: hai mật khẩu khác nhau | Đạt | hai ô mật khẩu khác nhau → báo lỗi tại chỗ |

### A2 — Danh sách thiết bị

| Mã | Việc | Kết quả | Ghi chú |
|---|---|---|---|
| A2-01 | Thẻ có tên, trạng thái, online/offline | Đạt | 10 thẻ đều có tên, dòng trạng thái và chấm online/offline · 4 máy ngoại tuyến đều ghi chữ "Ngoại tuyến" |
| A2-02 | Trạng thái dựng theo capability | Đạt | dòng trạng thái dựng theo capability, không có chữ viết cứng cho quạt; điều hoà hiện đơn vị của capability ("Bật · 25°C · 29°C") — cảm biến / máy lọc thật chưa có trong dữ liệu giả — soát thêm bằng tay trên DEV |
| A2-03 | Chưa có giá trị → "—" | Đạt | thẻ không bịa số ("Tắt"); màn chi tiết hiện "—" cho ô chưa có giá trị; màn chi tiết không hiện "0" thay cho "chưa có" |
| A2-04 | Tên dài ở 360 px | Đạt | thẻ ở 360px còn đủ chỗ cho ≥ 9 ký tự (91px, cần 63px); đầu màn chi tiết không cắt còn 2–3 ký tự (126px) |
| A2-05 | Nút xoá/ẩn | Đạt | thẻ không có nút xoá/ẩn bấm nhầm (0); nút ẩn ở màn chi tiết ≥44×44 (177×57) và nói đúng việc nó làm; có chỗ bỏ ẩn: nút mắt "Thiết bị đã ẩn" trên hàng lọc — nút ẩn nằm ở màn chi tiết, không nằm trên thẻ |
| A2-06 | Ẩn rồi đăng nhập lại | Đạt | đăng nhập lại (ngữ cảnh trình duyệt mới) → máy vẫn ẩn; máy nằm trong danh sách "Thiết bị đã ẩn" — ẩn lưu ở máy chủ (PATCH hidden), không chỉ ở trình duyệt |
| A2-07 | Kéo làm mới | Chưa có tính năng | app chưa có cử chỉ kéo để làm mới; danh sách tự cập nhật bằng nhịp hỏi vòng và khi quay lại tab (1 lượt /bootstrap). Sau đồng bộ không nhân đôi thẻ: 10 → 10 |

### A3 — Điều khiển thiết bị

| Mã | Việc | Kết quả | Ghi chú |
|---|---|---|---|
| A3-01 | Bật/tắt | Đạt | công tắc trên thẻ đổi trạng thái sau 39 ms (≤ 1 s); gửi đúng 1 lệnh tới thiết bị (1) — phần "thiết bị thật phản hồi" phải test tay với quạt thật |
| A3-02 | Thanh mức chỉ gửi khi thả tay | Hỏng | sai: không gửi lệnh trong lúc kéo (gửi 9); thả tay thì gửi đúng 1 lệnh (gửi 0) — thanh "Hẹn giờ tắt" của fan63903 |
| A3-03 | Chọn chế độ | Đạt | chip "Thường" chuyển sang đang chọn; lệnh gửi đi (1, {"method":"setMode","params":{"mode":"normal"}}) |
| A3-04 | Cảm biến chỉ đọc | Đạt | fan63903 · "Nhiệt độ phòng" chỉ đọc; fan63903 · "Độ ẩm phòng" chỉ đọc; 22022026A1 · "Danh sách lỗi" chỉ đọc; 22022026A1 · "Voltage" chỉ đọc |
| A3-05 | Bấm đúp nhanh | Đạt | 2 lần bấm → 2 lệnh (2); mỗi lệnh một Idempotency-Key khác nhau; trạng thái cuối khớp lần bấm cuối (true → true, lệnh cuối {"power":true}) |
| A3-06 | Điều khiển máy offline | Đạt | có nhắc "đang ngoại tuyến"; vẫn gửi được lệnh (1) |
| A3-07 | Cánh quạt xoay | Test tay | cánh quạt xoay quanh đúng trục, không nhoè — phải nhìn bằng mắt khi quạt đang chạy |
| A3-08 | Không hiện khoá kỹ thuật | Đạt | không hiện khoá kỹ thuật ở 10 màn chi tiết (kể cả "Xem thêm") |
| A3-09 | Lưới ui.boCuc 4 cột | Đạt | lưới ui.boCuc vẽ 4 cột |
| A3-10 | Đổi tên / ghim / gán chỗ | Đạt | bút đổi tên → PATCH label (SBI814 thử); sao ghim → PATCH fav; ba ô gán → PATCH house / room / grp |

### A4 — Cập nhật thời gian thực

| Mã | Việc | Kết quả | Ghi chú |
|---|---|---|---|
| A4-01 | Hai trình duyệt | Đạt | trình duyệt 2 (đang mở màn chi tiết) cập nhật sau 2.3 s (≤ 3 s) |
| A4-02 | Nhịp 2,5 s / 10 s | Đạt | màn chi tiết: nhịp 2.51 s (2.5, 2.5, 2.5, 2.5) ≈ 2,5 s; danh sách: nhịp 10.01 s (10.0, 10.0) ≈ 10 s |
| A4-03 | Mất Wi-Fi 60 s | Đạt | mất mạng 60 s rồi có lại → tự hỏi lại /bootstrap; không dồn một chùm request (1 request /v1 trong 3 s đầu); vẫn trong app, danh sách còn nguyên |
| A4-04 | Tab chạy nền | Đạt | tab chạy nền 25 s → không hỏi /bootstrap (0 lượt); quay lại tab → cập nhật ngay (≤ 2,5 s) — rút 10 phút của tài liệu còn 25 s (hơn hai nhịp 10 s) |
| A4-05 | Vé hết hạn giữa lúc hỏi vòng | Đạt | vé hết hạn giữa lúc hỏi vòng → làm mới đúng 1 lần (1); không đá ra màn đăng nhập; nhịp hỏi chạy tiếp bằng vé mới (1 lượt) |
| A4-06 | Nút vừa bấm không bị lật | Đạt | nút vừa bấm giữ trạng thái mới suốt 4,5 s chờ phản hồi (0/15 mẫu bị lật ngược) |

### A5 — Chia sẻ

| Mã | Việc | Kết quả | Ghi chú |
|---|---|---|---|
| A5-01 | Chưa có nhà | Đạt | có hướng dẫn "tạo nhà trước"; không hiện form mời khi chưa có nhà |
| A5-02 | Mời ở phạm vi nhà | Test tay | mời tài khoản 2 ở phạm vi nhà, tài khoản 2 thấy lời mời — cần tài khoản thứ hai trên IBS thật |
| A5-03 | Phạm vi phòng / thiết bị | Test tay | phạm vi phòng / thiết bị, tài khoản 2 chỉ thấy đúng phạm vi — cần tài khoản thứ hai trên IBS thật |
| A5-04 | Đổi quyền | Test tay | đổi quyền xem / điều khiển / chặn xoá rồi thử bằng tài khoản 2 — cần tài khoản thứ hai trên IBS thật |
| A5-05 | Thu hồi | Đạt | bấm thu hồi → hỏi xác nhận bước hai; chưa xác nhận thì chưa gửi gì; xác nhận → DELETE /shares/{id} — "mất quyền ngay" phía tài khoản 2 phải thử tay trên IBS thật |
| A5-06 | Mời email không tồn tại | Đạt | có báo lỗi ("Không mời được — kiểm tra lại email"); câu báo không lộ email có tài khoản hay không |
| A5-07 | Máy được chia sẻ | Hỏng | sai: người nhận không có quyền sửa → không thấy sao ghim (đang hiện 1); máy được chia sẻ nhưng perms đủ quyền → vẫn hiện 5 nút sửa (tài liệu đòi ẩn hẳn) — app ẩn bút + ô gán theo perms.create/control, không theo cờ shared; sao ghim luôn hiện vì là lựa chọn riêng của người dùng (PATCH /devices "theo NGƯỜI DÙNG"); bài dau-man.mjs lại đang đổi tên chính máy chia sẻ SBI314 — cần chốt quy tắc |

### A6 — Luật, hẹn giờ, thông báo

| Mã | Việc | Kết quả | Ghi chú |
|---|---|---|---|
| A6-01 | Luật mới mặc định shadow | Đạt | lưu luật mới gửi POST /rules; mặc định ở chế độ thử (shadow = true) |
| A6-02 | Mô phỏng luật | Đạt | bấm mô phỏng gọi /rules/simulate (1); hiện kết quả luật có kích hay không ("Chưa chạy — Điều kiện "Nếu" chưa đúng.") — kết quả mô phỏng do máy chủ giả trả — nội dung thật soát trên DEV |
| A6-03 | Luật thật kích điều kiện | Test tay | bật luật thật rồi kích điều kiện bằng thiết bị thật, xem lịch sử chạy — cần IBS + mạch thật |
| A6-04 | Hẹn giờ trên máy sở hữu | Phủ bởi bài khác | tests/hen-gio.mjs (37 phép: tạo · kích hoạt · thôi dùng · sửa · xoá) — chạy nhóm api |
| A6-05 | Sửa motlan đang chạy → 409 | Phủ bởi bài khác | tests/hen-gio.mjs — 409 "Chương trình đang chạy giữa chừng — dừng rồi hãy sửa" hiện nguyên văn |
| A6-06 | Đủ hạn mức luật | Phủ bởi bài khác | tests/quyet-dinh.mjs — đủ hạn mức luật thì khoá nút Nếu–Thì và nói con số |
| A6-07 | Thông báo | Đạt | số đếm trên chuông đúng ("Thông báo (2)"); danh sách hiện 2 thông báo; mở ra thì đánh dấu đã đọc (POST /notifications/read); chấm đỏ tắt sau khi đọc |

### A7 — Thêm thiết bị

| Mã | Việc | Kết quả | Ghi chú |
|---|---|---|---|
| A7-01 | Mã ① bằng camera iPhone | Test tay | quét mã ① bằng camera iPhone → "Kết nối mạng mzService" — trang portal chạy trên mạch, cần mạch thật + điện thoại |
| A7-02 | Mã ① bằng Android | Test tay | quét mã ① bằng camera 2–3 dòng Android — trang portal chạy trên mạch, cần mạch thật + điện thoại |
| A7-03 | Mã ① bằng Zalo | Test tay | quét mã ① bằng Zalo — ghi tự kết nối hay chỉ hiện chữ WIFI:… — trang portal chạy trên mạch, cần mạch thật + điện thoại |
| A7-04 | Portal tự bật | Test tay | vào mạng mzService → trang portal tự bật lên — trang portal chạy trên mạch, cần mạch thật + điện thoại |
| A7-05 | Danh sách Wi-Fi | Test tay | danh sách Wi-Fi trên portal: chỉ 2,4 GHz, sắp theo sóng, không trùng tên — trang portal chạy trên mạch, cần mạch thật + điện thoại |
| A7-06 | Sai mật khẩu Wi-Fi | Test tay | nhập sai mật khẩu Wi-Fi → báo rõ, thử lại không phải rút điện mạch — trang portal chạy trên mạch, cần mạch thật + điện thoại |
| A7-07 | Mật khẩu Wi-Fi < 8 | Test tay | mật khẩu Wi-Fi dưới 8 ký tự → chặn ngay trên trang portal — trang portal chạy trên mạch, cần mạch thật + điện thoại |
| A7-08 | Mật khẩu Wi-Fi đúng | Test tay | mật khẩu đúng → "Đã vào Wi-Fi" hoặc "Mất kết nối với thiết bị" — trang portal chạy trên mạch, cần mạch thật + điện thoại |
| A7-09 | Tự quay về Wi-Fi nhà | Test tay | điện thoại tự quay về Wi-Fi nhà; mạch tắt mzService — trang portal chạy trên mạch, cần mạch thật + điện thoại |
| A7-10 | Mạng ẩn | Test tay | "Mạng của tôi không có trong danh sách" → nhập được tên mạng ẩn — trang portal chạy trên mạch, cần mạch thật + điện thoại |
| A7-11 | Mạng không mật khẩu | Test tay | mạng không mật khẩu → không hỏi mật khẩu — trang portal chạy trên mạch, cần mạch thật + điện thoại |
| A7-12 | Tem QR: POST /claim | Phủ bởi bài khác | tests/them-thiet-bi.mjs — POST /claim mang name = TÊN TRÊN TEM, PATCH /devices mang tên hiển thị |
| A7-13 | Mạch thật: /claim-mach-that | Phủ bởi bài khác | tests/them-thiet-bi.mjs — nhánh mạch thật gọi /claim-mach-that NGAY, không qua màn Wi-Fi |
| A7-14 | Deep-link khi đã đăng nhập | Chưa có tính năng | app chưa có deep-link mã ② — mở link (#claim=…, ?claim=…, /them-thiet-bi#…) chỉ vào màn chính |
| A7-15 | Deep-link khi chưa đăng nhập | Chưa có tính năng | phụ thuộc A7-14: chưa có deep-link nên chưa có "đăng nhập xong quay về đúng màn, giữ tên + mã" |
| A7-16 | Mã claim không lọt request | Chưa có tính năng | phụ thuộc A7-14: chưa có link mã ② để soát mã claim trong request |
| A7-17 | Nhận hợp lệ | Đạt | nhận hợp lệ (201) → màn báo đã thêm; thiết bị xuất hiện trong danh sách (10 → 11 thẻ) |
| A7-18 | Mã sai / đã có chủ | Phủ bởi bài khác | tests/them-thiet-bi.mjs — 404 → ở lại bước, hiện câu chung "Không tìm thấy, hoặc bạn không có quyền" |
| A7-19 | Sai quá 10 lần | Đạt | tem QR: 403 → câu dễ hiểu, nói chờ rồi thử lại ("Bạn đã thử sai quá nhiều lần. Thử lại sau 10 phút."); mạch thật: 400 quá 10 lần → hiện nguyên văn câu máy chủ ("Bạn đã thử quá 10 lần trong 10 phút. Thử lại sau 1…") |
| A7-20 | Nhận lại máy vừa nhận | Đạt | nhận lại thiết bị vừa nhận → 404, câu chung ("Không tìm thấy, hoặc bạn không có quyền với mục này."); không báo đã thêm |
| A7-21 | Serial sai | Phủ bởi bài khác | tests/them-thiet-bi.mjs — serial sai → 400, hiện NGUYÊN VĂN message tiếng Việt của máy chủ |
| A7-22 | dangNoi: false | Phủ bởi bài khác | tests/them-thiet-bi.mjs — dangNoi:false → có dòng nhắc mạch chưa online |

### A8 — Giao diện chung

| Mã | Việc | Kết quả | Ghi chú |
|---|---|---|---|
| A8-01 | 360 / 375 / 430 px | Đạt | không tràn ngang ở 360 / 375 / 430 px trên 13 màn — chữ đè nhau phải soát bằng mắt |
| A8-02 | Vùng bấm ≥ 44 px | Phủ bởi bài khác | tests/a11y.mjs, tests/a11y-toi.mjs (16 trạng thái màn, đo cả ::before) và tests/menu.mjs — vùng chạm ≥ 44×44 |
| A8-03 | Mạng chậm | Đạt | không màn trắng trong lúc tải (0 mẫu trắng sau khi có nội dung); bấm Đăng nhập trên mạng chậm có trạng thái đang tải |
| A8-04 | Lỗi máy chủ | Hỏng | sai: có nút thử lại — hiện chỉ có nút × đóng; app tự thử lại theo nhịp hỏi vòng và khi quay lại tab |
| A8-05 | Nền tối | Phủ bởi bài khác | tests/a11y-toi.mjs — 16 màn ở giao diện tối, 0 chỗ thiếu tương phản. Màn đăng nhập cố ý giữ bảng màu riêng trên ảnh nền (đo bởi tests/a11y.mjs) |

### A9 — Bảo mật và hợp đồng

| Mã | Việc | Kết quả | Ghi chú |
|---|---|---|---|
| A9-01 | Chỉ gọi /v1/* | Đạt | không gọi ra ngoài trang (0); mọi lời gọi dữ liệu đi qua /v1/* (14 request); không Keycloak, không ThingsBoard, không admin/*, internal/* |
| A9-02 | URL và lịch sử | Đạt | 3 địa chỉ đã đi qua không chứa vé, mật khẩu, mã claim — lịch sử có 2 mục — app một trang, không đẩy URL mới theo màn |
| A9-03 | Mã nguồn và bản build | Đạt | 85 tệp nguồn không chứa mật khẩu, khoá, token; 10 tệp build (.next/static) sạch; thật sự đã quét (> 50 tệp nguồn) |
| A9-04 | Sửa id thiết bị | Test tay | webapp không có URL theo thiết bị (app một trang) — thử bằng curl GET/PATCH /v1/devices/<id máy người khác> trên DEV, mong đợi 404 {"message":"not_found"} |
| A9-05 | Console | Đạt | 0 dòng console không in vé hay mật khẩu |
| A9-06 | Lách proxy bằng .. | Đạt | 10 đường thử admin/internal/.. qua proxy đều bị chặn — đo proxy /v1 của webapp; Caddy trên DEV phải thử thêm bằng curl --path-as-is |

### A10 — Popup tài khoản

| Mã | Việc | Kết quả | Ghi chú |
|---|---|---|---|
| A10-01 | Bấm avatar | Đạt | bấm avatar → popup mở; tên + email đúng tài khoản đang đăng nhập ("p", "p@p") |
| A10-02 | Đổi tên | Đạt | Đổi tên → báo "tính năng đang chờ bật" |
| A10-03 | Đổi ảnh đại diện | Đạt | Đổi ảnh đại diện → báo "tính năng đang chờ bật" |
| A10-04 | Đổi mật khẩu | Đạt | Đổi mật khẩu → báo "tính năng đang chờ bật" |
| A10-05 | Ngôn ngữ / Cỡ chữ / Giao diện | Đạt | áp ngay: cỡ lon, giao diện toi, chữ "ACCOUNT"; giữ sau khi tải lại: cỡ lon, giao diện toi, tiếng Anh true |
| A10-06 | Công tắc Thông báo | Đạt | bật/tắt được (true → false); giữ trạng thái sau khi tải lại (false) |
| A10-07 | Đăng xuất xoá dữ liệu tài khoản | Đạt | xoá vé / phiên; xoá ảnh chụp danh sách thiết bị; xoá cache /bootstrap (nhãn ETag bootstrap:*); không còn hồ sơ (email) trong bộ nhớ; giữ cài đặt của máy: giao diện / cỡ chữ; giữ ngôn ngữ (en) — khoá còn lại sau đăng xuất: livotec-cai-dat, livotec-lang, livotec-iotx-cache-v2 |
