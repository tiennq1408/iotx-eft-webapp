# Bộ đo phía app — Livotec Home

Đo **phía app**: phiên người dùng, luồng trạng thái, vé, và cách app cư xử khi mạng
hỏng. Không đo đường đi của lệnh xuống mạch — phần đó đội GSH đã có bộ riêng.

Chạy trên **máy Mac của anh**, bằng terminal thường. Không chạy được từ trong Cowork:
cả hai shell ở đó đều không ra được `api.dev.happibot.net`.

## Kịch bản nào chạy bằng lệnh nào

Bốn kịch bản 1, 2, 3, 8 dùng chung một công cụ (`do_phien.py`), chỉ khác tham số — nên
nhìn vào thư mục dễ tưởng chỉ có kịch bản 6 được test. Dùng `chay.sh` để gọi theo số:

| Kịch bản | Lệnh | Mất bao lâu |
| --- | --- | --- |
| Thử bộ đo bằng IBS giả | `./loadtest/chay.sh thu` | 1 phút |
| Câu hỏi chặn cả ngày | `./loadtest/chay.sh kiem` | 3 phút |
| 1 — Bão đăng nhập | `./loadtest/chay.sh 1` | 20–35 phút |
| 2 — Giữ phiên dài | `./loadtest/chay.sh 2` | 2 giờ |
| 3 — Bão nối lại (nửa client) | `./loadtest/chay.sh 3` | 15 phút |
| 6 — Mạng kém, thao tác hỏng | `./loadtest/chay.sh 6` | 4 phút |
| 8 — Soak qua đêm | `./loadtest/chay.sh 8` | 12 giờ, chạy nền |

`chay.sh` tự kiểm tra biến môi trường, tự nâng `ulimit`, tự đặt tên file kết quả theo
mốc thời gian vào `loadtest/ketqua/`, và tự chạy `tong_hop.py` sau mỗi lượt. Trước lượt
1000 phiên nó hỏi lại một câu, vì DEV là môi trường dùng chung.

Kịch bản 4, 5, 7 và nửa server của kịch bản 3 chưa chạy được — lý do ở cuối tài liệu.

## Cài một lần

```bash
cd "<thư mục dự án>"
python3 -m venv loadtest/.venv
source loadtest/.venv/bin/activate
python3 -m pip install aiohttp playwright
python3 -m playwright install chromium
```

Tài khoản đặt bằng biến môi trường, **không bao giờ ghi vào file trong repo**:

```bash
export IOTX_EMAIL='tien.nq@effectik.dev'
export IOTX_PASSWORD='...'
```

## Trước khi chạy quy mô: nới giới hạn của máy

Mỗi phiên giữ một kết nối mở. macOS mặc định cho 256 tệp mở — chưa tới 300 phiên đã
gãy, và anh sẽ tưởng máy chủ hỏng trong khi chính máy phát tải hỏng.

```bash
ulimit -n 65536        # đặt trong ĐÚNG cái terminal sắp chạy test
ulimit -n              # xác nhận
```

Giới hạn thứ hai không nới được: mỗi máy chỉ có khoảng **28.000 cổng tạm** tới *một*
đích. Quá số đó phải thêm IP nguồn hoặc thêm máy. Với vài trăm đến vài nghìn phiên thì
chưa chạm.

Trong kết quả, cột `kh.tới` (mã HTTP = 0) là **máy phát tải gãy**, không phải máy chủ
gãy. Thấy cột đó nhảy lên thì dừng, sửa giới hạn, chạy lại.

## Thử bộ đo mà không đụng vào DEV

Trước khi bắn vào máy chủ thật, chạy thử với IBS giả để chắc máy của anh chạy được.
Nó dựng đủ sáu cửa, có nhịp giữ kết nối và thỉnh thoảng đứt luồng.

```bash
python3 loadtest/ibs_gia.py &
export IOTX_EMAIL=thu@example.com IOTX_PASSWORD=matkhau123
export IOTX_BASE=http://127.0.0.1:4020/v1
python3 loadtest/do_phien.py --sessions 25 --ramp 8 --duration 60 --cut-at 35 --out thu.jsonl
python3 loadtest/tong_hop.py thu.jsonl
kill %1
```

Chạy đúng thì tỉ lệ theo giao dịch phải trên 99%, và bảng phải có dòng **Thời gian
hồi phục sau khi đứt** — đó là vòng nối lại đang hoạt động. Nhớ `unset IOTX_BASE`
trước khi chuyển sang máy chủ thật.

---

## Bước 1 — Câu hỏi chặn cả ngày (3 phút)

```bash
python3 loadtest/kiem_tra_phien.py
```

Hỏi đúng một điều: **một tài khoản có mở được nhiều phiên độc lập không?**

- **DÙNG ĐƯỢC** → chạy tiếp tất cả bằng một tài khoản, khỏi tạo tài khoản hàng loạt.
- **KHÔNG DÙNG ĐƯỢC** → máy chủ xoay vòng refresh token theo người dùng, các phiên
  tranh nhau. Phải xin IBS cấp một dải tài khoản trước khi chạy quy mô.

Script này chỉ dùng thư viện chuẩn nên chạy được ngay, chưa cần cài gì.

## Bước 2 — Kịch bản 6: mạng kém, thao tác hỏng (2 giờ)

Chạy được ngay, không phụ thuộc ai. Đây là chỗ lỗi client lộ ra.

```bash
npm run dev                                   # cửa sổ khác
python3 loadtest/kich_ban_6.py                # năm bài, bỏ qua bài đụng phần cứng
python3 loadtest/kich_ban_6.py --cho-phep-bat-tat   # gồm cả bài bật tắt thật
```

Năm bài: thiết bị ngoại tuyến · vé hết hạn rồi mới thao tác · luồng chết âm thầm
(cắt mạng 42 giây, quá đồng hồ canh lặng 35 giây) · bấm đúp công tắc · mất mạng giữa
chừng. Bài 4 mất khoảng 70 giây, đừng tưởng treo.

Hai bài cuối **gửi lệnh thật xuống quạt** nên phải thêm cờ, và quạt sẽ bật tắt thật.

## Bước 3 — Kịch bản 1 và 3: dựng phiên và bão nối lại (2 giờ)

Chạy thang bậc, dừng ở chỗ gãy đầu tiên. Đừng nhảy thẳng lên số lớn.

```bash
python3 loadtest/do_phien.py --sessions 100  --ramp 60  --duration 600 --out kb1_100.jsonl
python3 loadtest/do_phien.py --sessions 300  --ramp 120 --duration 600 --out kb1_300.jsonl
python3 loadtest/do_phien.py --sessions 1000 --ramp 300 --duration 900 --out kb1_1000.jsonl
```

Nửa phía client của kịch bản 3 — cắt sạch kết nối ở giây thứ 300 rồi xem app nối lại
thế nào:

```bash
python3 loadtest/do_phien.py --sessions 300 --ramp 60 --duration 900 --cut-at 300 --out kb3_300.jsonl
```

Nửa phía server (thời gian hồi phục sau khi IBS khởi động lại) cần IBS bấm nút, chưa
làm được một mình.

## Bước 4 — Kịch bản 2 và 8: chạy qua đêm

Rò rỉ cần thời gian đồng hồ, không cần công sức. Bật lúc cuối ngày, sáng đọc.

```bash
nohup python3 loadtest/do_phien.py --sessions 200 --ramp 120 --duration 43200 \
  --out kb8_qua_dem.jsonl > kb8.log 2>&1 &
```

## Đọc kết quả

```bash
python3 loadtest/tong_hop.py kb1_300.jsonl
python3 loadtest/tong_hop.py kb1_300.jsonl --csv kb1_300.csv
```

Hai quy ước cố ý khác báo cáo của GSH:

- Tỉ lệ thành công tính **theo giao dịch**, không lấy trung bình cộng các bài. Báo cáo
  GSH ra 89,39% theo trung bình và 99,86% theo giao dịch — chênh mười điểm phần trăm
  chỉ vì một bài có đúng một mẫu.
- Luôn in **p50/p95/p99/max kèm n**. Bảng tiêu chí của GSH chỉ có mức 95% cho
  App→Backend, nên ở bài Loop ON/OFF một cái đuôi 8 giây lọt lưới.

Ba dòng đáng nhìn trước tiên: **đỉnh luồng giữ mở đồng thời**, **số lần người dùng bị
văng khỏi app**, và **luồng chết âm thầm**.

## Khi báo cáo, nói rõ hai điều

Chạy ở quy mô thu nhỏ **không đo năng lực hệ thống** — nó đo tính đúng đắn của client
dưới áp lực. Con số năng lực là của IBS và hạ tầng. Đừng để hai thứ bị gộp làm một.

Nếu dùng một tài khoản mở N phiên thì đó là **N phiên của một người dùng**, không phải
N người dùng khác nhau. Máy chủ có thể giữ trạng thái hoặc đặt hạn mức theo từng người.
Ghi rõ đây là phép xấp xỉ.

## Chưa làm được

Kịch bản 4 (cao điểm điều khiển) chồng lấn với bài Rate/Burst/Loop của GSH — để họ lo.
Kịch bản 5 cần ít nhất một thiết bị **sở hữu**. Kịch bản 7 cần tài khoản có 50 và 200
thiết bị; thiết bị ảo trần 10 cái nên không tự dựng được. Nửa server của kịch bản 3
cần IBS khởi động lại dịch vụ.
