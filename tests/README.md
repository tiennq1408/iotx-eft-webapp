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
| `khoa-chu.mjs` | Quét 11 màn tìm khóa i18n lọt ra giao diện (`cap.power`, `routine.title`…) |
| `rpc.mjs` | 13 phép nối lệnh: mỗi kiểu control gửi đúng `method` và đúng KIỂU tham số, mỗi lệnh một `Idempotency-Key`, lệnh hỏng thì hoàn trạng thái |
| `dong-bo.mjs` | 4 phép đồng bộ: đổi trạng thái khi tab chạy nền, quay lại tab thì tự cập nhật, không dồn request |

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
những chỗ khó: sản phẩm `ac` có 28 capability và **không** khai `ui`, `fan_sbi314` khai
`ui` thiếu `uuTien`, nhãn là `"cap.power"`, phần lớn thiết bị có `house`/`room` rỗng.
