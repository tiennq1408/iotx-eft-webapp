# Bộ kiểm thử Livotec Home

Chạy bằng Playwright trên Chromium. Không cần dịch vụ ngoài: nhóm API dùng một **máy chủ
giả** trả đúng hình dạng dữ liệu đo được trên `api.dev.happibot.net` — chuỗi thay vì
số/boolean (`"true"`, `"12"`), nhãn capability là khóa i18n (`"cap.power"`), nhà/phòng
rỗng. Chính những chỗ đó từng làm app hiểu sai dữ liệu.

## Chạy

```bash
node tests/chay.mjs              # tất cả
node tests/chay.mjs giao-dien    # chỉ nhóm giao diện
node tests/chay.mjs api          # chỉ nhóm nối API
```

Bộ chạy tự dựng `next dev` (và máy chủ giả khi cần) rồi dọn sạch khi xong. Hai nhóm cần
hai cấu hình khác nhau, mà biến `NEXT_PUBLIC_*` được nhúng lúc biên dịch, nên mỗi nhóm
khởi động lại máy chủ một lần — đó là lý do chạy đủ mất khoảng hai phút.

Đổi cổng khi bị chiếm: `CONG_APP=3222 CONG_GIA=3333 node tests/chay.mjs`.

## Các bài

| Bài | Đo gì |
|---|---|
| `e2e.mjs` | 28 kịch bản màn chi tiết: bố cục theo `ui.slots`, da theo `ui.skin`, bấm đổi được giá trị, "Xem thêm", trạng thái ngoại tuyến và chỉ-xem |
| `a11y.mjs` | 14 trạng thái màn: vùng chạm 44px và tương phản chữ |
| `vat-tu.mjs` | 9 phép trên khối vật tư: danh sách lõi, thanh tuổi thọ, sửa tuổi thọ, xác nhận trước khi ngừng theo dõi |
| `khung.mjs` | 9 phép khung máy ở khổ RỘNG: màn chi tiết, tấm hẹn giờ và hộp thoại phải nằm trong khung `.phone`, không `position:fixed` neo theo cửa sổ — bọ này vô hình ở khổ hẹp |
| `goc-ngoai.mjs` | 7 phép `allowedDevOrigins`: điện thoại cùng LAN và tunnel Cloudflare phải tải được bó `/_next/*`, origin lạ thì vẫn phải bị chặn. Thiếu khai báo này, `next dev` trả 403, JS không tải nổi và app đứng ở màn "Đang khởi động" |
| `khoa-chu.mjs` | Quét 11 màn tìm khóa i18n lọt ra giao diện (`cap.power`, `routine.title`…) |
| `rpc.mjs` | 13 phép nối lệnh: mỗi kiểu control gửi đúng `method` và đúng KIỂU tham số, mỗi lệnh một `Idempotency-Key`, lệnh hỏng thì hoàn trạng thái |
| `nhip-hoi.mjs` | 8 phép nhịp hỏi lại: đổi dữ liệu trên máy chủ mà KHÔNG phát SSE thì màn chi tiết đang mở vẫn phải bắt kịp; nút vừa bấm không bị nhịp hỏi lại lật ngược; quá cửa sổ giữ thì máy chủ thắng; tab chạy nền thì ngưng hỏi |
| `hen-gio.mjs` | 27 phép hẹn giờ (hợp đồng D4): thanh ghim hiện/ẩn và nói đúng trạng thái, đặt và huỷ hẹn, trình soạn chặn từng ràng buộc (trùng mốc giờ, mốc khoảng phải tăng dần và ≤1440, lặp lại cần ngày, khoảng+lặp cần giờ bắt đầu), lưu · kích hoạt · thôi dùng · xoá |
| `catalog-song.mjs` | 7 phép catalog sống: sửa `ui.boCuc` trên sadmin lúc màn chi tiết ĐANG MỞ thì lưới phải tự vẽ lại (ô dời chỗ, ô bị bỏ biến mất, skin đổi) mà không phải tải lại trang. Bắt được vì nhịp đồng bộ hỏi `/bootstrap` — chỉ chỗ đó mới mang `phienBan.products` |
| `dong-bo.mjs` | 4 phép đồng bộ: đổi trạng thái khi tab chạy nền, quay lại tab thì tự cập nhật, không dồn request |
| `anh-dai-dien.mjs` | 8 phép ảnh đại diện: `product.icon` khi là URL thì vẽ ảnh, khi là emoji thì vẽ chữ, thẻ và màn chi tiết phải ra cùng một thứ |
| `bo-cuc.mjs` | 61 phép lưới `ui.boCuc`: ô nằm đúng cột/hàng catalog khai, `moiHang` chia chip đúng số, `gtIco` hiện theo từng giá trị, `skin` đổi màu nhấn, chạm gửi đúng lệnh, vùng chạm 44px, sản phẩm không khai lưới vẫn đi đường khuôn. Có nhóm phép ghim theo bản tham chiếu web.dev: chuỗi `d` của cung tròn phải khớp **từng ký tự** với DOM thật đọc được ở đó |

## Vì sao bài a11y đo tương phản bằng điểm ảnh

Cách thường làm là đi ngược cây DOM tìm màu nền. Cách đó **không thấy `background-image`**,
nên chữ trắng trên nền gradient bị báo nhầm ~1,1:1. Bài này chụp đúng vùng phần tử rồi lấy
màu nền là màu hay gặp nhất *sau khi bỏ những điểm gần giống màu chữ* — nếu không, tiêu đề
chữ to sẽ tự lấy chính mình làm nền và ra tỉ số 1,00.

Hai cái bẫy khác đã xử lý, vì cả hai đều tạo cảnh báo giả: toạ độ ô là theo khung nhìn còn
ảnh cắt theo trang (lệch khi cuộn), và độ mờ của tổ tiên không xuất hiện trong kiểu tính
của phần tử con — tấm băng quảng cáo đang ẩn có `opacity:0` nhưng chữ bên trong vẫn báo 1.

## Dữ liệu giả

`du-lieu/bootstrap.json` và `du-lieu/products.json` chụp lại từ DEV thật, giữ nguyên
những chỗ khó: sản phẩm `ac` có 28 capability và **không** khai `ui`, nhãn là
`"cap.power"`, phần lớn thiết bị có `house`/`room` rỗng.

Icon: `gtIco` của catalog DEV đã bỏ emoji, chuyển sang tham chiếu kho icon (`@wind`, `@leaf`).
Máy chủ giả có `/v1/icons/{ten}` trả SVG, và `fan_sbi314.mode` dùng đúng quy ước đó.

Hẹn giờ: máy chủ giả cài THẬT trong bộ nhớ (không phải stub) nên dựng được cả ba nhánh chối
của hợp đồng — `403` sản phẩm tắt hẹn giờ (`fan_smart` không khai `henGio`), `404` máy được
chia sẻ (`Điều hòa L1 - 2` có `shared: true`), `409` sửa `motlan` đang chạy.

Hai sản phẩm mang `ui.boCuc` thật của DEV: `ac_1` (dial01 3×3, power01 dọc cột 4, ba hàng
chip có `gtIco`, skin `sunset`) và `fan_sbi314` (readout01, dial01, power01, chip 2/hàng,
hai công tắc nửa–nửa, step01). `fan_smart` cố ý **không** khai `boCuc`, để đường khuôn cũ
còn được `rpc.mjs` canh giữ. `fan_sbi314.icon` là ảnh data-URI, `ac.icon` là emoji — hai
nhánh của `anh-dai-dien.mjs`.
