# Bộ đo tải — Livotec Home (theo kịch bản test bản 3, 09/10/2026)

Mục tiêu đổi từ *"ở mức X có đạt không"* sang *"đến mức nào thì gãy SLA"*. Mọi bài là
**thang bậc tăng dần tới khi hỏng**, và thứ cần ghi là **bậc cuối còn đạt** cùng
**triệu chứng khi gãy**.

Hai đường tải đi qua hai hệ khác nhau, nên có hai bộ công cụ khác nhau:

| | Đường NGƯỜI DÙNG | Đường THIẾT BỊ |
| --- | --- | --- |
| Đích | IBS `/v1` (HTTPS) | ThingsBoard (MQTT/TLS 8883) |
| Bài | B5, B6, B7, B9 | B1-01, B1-02, B2, B3, B4 |
| Công cụ | `do_phien.py`, `ban_rps.py` (Python) · `k6/` | `mqtt/` (bọc emqtt-bench) |
| Tổng hợp | `tong_hop.py` | CSV trong `ketqua/mqtt_*` + số phía broker |

B8 (cả hai cùng lúc) là ghép hai nhánh trên hai bộ máy phát.

## Bài nào chạy bằng lệnh nào

| Mã | Bài | Lệnh | Đích | Đã chạy thật? |
| --- | --- | --- | --- | --- |
| — | Thử mô phỏng phiên | `./loadtest/chay.sh thu` | IBS giả | ✅ |
| — | Thử bắn req/s, có 429 giả | `./loadtest/chay.sh thu-rps` | IBS giả | ✅ |
| B1-03, B1-04, B1-05 | Trần máy phát HTTP + lý lịch máy | `./loadtest/chay.sh b1` | IBS giả | ✅ |
| B1-01, B1-02 | Chi phí bắt tay TLS + trần một máy phát MQTT | `./loadtest/chay.sh mqtt-b1` | broker | ❌ chưa có emqtt-bench |
| B1-04, B1-05, B1-06 | Chỉ lý lịch máy phát (chạy trên TỪNG máy) | `./loadtest/mqtt/hieu_chuan.sh` | — | ✅ |
| — | Câu hỏi chặn: một tài khoản nhiều phiên? | `./loadtest/chay.sh kiem` | IBS | |
| B10.3 | Mốc chuẩn 100 phiên × 5 phút | `./loadtest/chay.sh moc` | IBS | |
| B2 | Thang bậc kết nối 1.000 → 1.000.000 | `./loadtest/chay.sh mqtt-b2` | broker | ❌ |
| B3-a | Bão nối lại, nối lại ngay | `./loadtest/chay.sh mqtt-b3a` | broker | ❌ |
| B3-b | Bão nối lại, có jitter | `./loadtest/chay.sh mqtt-b3b` | broker | ❌ |
| B4 | Telemetry khi đầy tải | `./loadtest/chay.sh mqtt-b4` | broker | ❌ |
| B5 | Thông lượng req/s 500 → 20.000 | `./loadtest/chay.sh b5` (k6) · `b5 python` | IBS | ❌ k6 chưa cài |
| B6 | Thang bậc phiên 1.000 → 50.000 | `./loadtest/chay.sh b6` | IBS | |
| B7 | Cao điểm: nền + 3 lần bơm 15.000 req/s | `./loadtest/chay.sh b7` | IBS | ❌ k6 chưa cài |
| B8 | Hai nhánh cùng lúc | `./loadtest/chay.sh b8` (in hướng dẫn) | cả hai | |
| B9 | Trình duyệt thật, mã React thật | `./loadtest/chay.sh b9` (= `6` cũ) | app :3000 | |
| — | Sinh CA test + lô chứng thư client | `./loadtest/chay.sh mqtt-ca` | — (cục bộ) | ✅ thử 3 chứng thư |

"✅" = đã chạy trên máy này, **chỉ** vào máy chủ giả cục bộ. Chưa lệnh nào bắn vào DEV.
Các script k6 và `mqtt/` mới chỉ kiểm cú pháp (và chạy logic `mqtt/` với một emqtt_bench
giả) — **chưa chạy thật lần nào**.

Lệnh cũ (mã kịch bản bản 1) vẫn chạy: `1`, `2`, `3`, `6`, `8`. Bài Soak (`8`) đã bị bỏ khỏi đợt này.

`chay.sh` tự: kiểm `pgrep` xem có bài nào đang chạy (B10 quy tắc 2), **hỏi xác nhận trước
mọi lệnh bắn vào máy chủ thật** (DEV dùng chung), nâng `ulimit`, đặt tên kết quả theo mốc
thời gian trong `loadtest/ketqua/` (đã `.gitignore`), và chạy `tong_hop.py` sau mỗi lượt.

## ⚠️ Chỗ lệch giữa tài liệu kịch bản và mã

Đã đối chiếu mã ngày 09/10/2026. Bộ đo đi theo **MÃ**, không theo tài liệu:

1. **App dùng CẢ SSE lẫn hỏi vòng**, không phải "không dùng SSE" như mục 1.2, A4 và ghi chú
   cuối mục 1.2 nói. `hooks/useDongBoNen.ts` vẫn giữ luồng `/v1/stream` qua
   `iotxClient.subscribe`, **và** hỏi vòng `GET /bootstrap?lang=..` nối đuôi (setTimeout sau
   khi xong lần trước): 2.500 ms khi đang mở màn chi tiết, 10.000 ms ở danh sách; tab nền
   không hỏi; quay lại tab / có mạng lại thì đồng bộ một lần (chặn 2 giây). Mỗi phiên vì thế
   giữ **một kết nối SSE mở** cộng 0,1–0,4 req/s — B6 phải đo cả hai. `do_phien.py` mặc định
   chạy cả hai; `--khong-sse` để so với kiểu web.dev (chỉ hỏi vòng), `--khong-hoi-vong` để
   quay về kiểu đo cũ.
2. **Nối lại SSE xong app gọi `/bootstrap`, không phải `/devices`** (`onReconnect` →
   `dongBoNhip` → `refreshDevices` → `/bootstrap`). `docs/IOTX-INTEGRATION.md` mục "Trình tự
   mở ứng dụng" bước 6 và bài 4 cũ của `kich_ban_6.py` vẫn ghi `/devices` — đã sửa bài 4.
3. **App làm mới vé SAU 401, không làm mới trước hạn.** Vé hết hạn thì request đầu tiên nhận
   401 → refresh đúng một lần → gửi lại. Bộ đo cũ làm mới trước hạn; bộ mới mặc định
   `--lam-moi sau-401`. Lần 401 đó ghi là *ghi nhận* `het_ve_401`, không tính là giao dịch hỏng.
4. **Mở app = 5 lời gọi**, không phải 1: `syncRemote()` gọi `/bootstrap`, `/products`, rồi
   `/notifications` + `/shares` + `/rules` song song. "p95 mở app" của B6 là dòng `mo_app`.
5. **App gửi `If-None-Match`**, máy chủ trả 304 thì app dùng lại bản đang giữ — 304 là thành
   công. (Tài liệu đúng ở chỗ: ETag tính SAU khi chạy hết truy vấn nên không giảm tải máy chủ.)
6. **B5 ghi "cần `--rps` trong `do_phien.py`"** — làm thành tệp riêng `ban_rps.py`, vì vòng mở
   theo đồng hồ và mô phỏng phiên là hai mô hình khác hẳn nhau.
7. **B3 "Giết tiến trình máy phát" KHÔNG giống "mất mạng phía khách hàng".** Giết tiến trình
   thì nhân hệ điều hành vẫn gửi FIN/RST, broker biết ngay phiên cũ chết. Muốn đúng tình huống
   tài liệu tả (broker chỉ biết sau keepalive × 1,5, rồi bị chiếm phiên) phải chặn FIN/RST đi
   ra trước khi giết: `CACH_CAT=im_lang` (Linux + root + iptables).
8. **emqtt-bench dùng MỘT chứng thư cho mọi kết nối của một tiến trình.** Với mTLS, mọi kết
   nối đó là CÙNG MỘT thiết bị trong ThingsBoard và chiếm phiên của nhau. Tức là mTLS + emqtt-bench
   chỉ đúng cho B1-01 và bài chia nhóm nhỏ (mỗi nhóm một chứng thư). B2/B3 quy mô lớn phải chọn:
   `MQTT_XAC_THUC=clientid` (TLS một phía, mỗi kết nối một clientId, **thiếu chi phí xác minh
   chứng thư client** — hệ quả mục 1.1d) hoặc viết bộ phát riêng hỗ trợ mỗi kết nối một chứng thư.
9. `kich_ban_6.py` (B9) dùng bộ chọn của thẻ thiết bị cũ (`footer .switch`, `.device-top`) — đã
   đổi sang thẻ mới (`.switch-hit`, `.dname`, `.dline`) và thêm hai bài tài liệu B9 đòi: **nhịp
   hỏi vòng 2,5 s / 10 s** và **tab nền ngưng hỏi**. Chưa chạy lại với app thật.

## Cài công cụ

Script **không tự cài gì**. Cài một lần, bằng tay:

```bash
# Python (nhánh người dùng): venv riêng trong loadtest/
python3 -m venv loadtest/.venv
loadtest/.venv/bin/python -m pip install aiohttp playwright
loadtest/.venv/bin/python -m playwright install chromium     # chỉ cho B9

# k6 (B5, B7) — https://grafana.com/docs/k6/latest/set-up/install-k6/
brew install k6                 # macOS;  Linux: gói k6 từ kho apt/dnf của Grafana

# emqtt-bench (B1-01, B1-02, B2–B4) — https://github.com/emqx/emqtt-bench
#   tải bản dựng sẵn ở trang Releases cho đúng hệ điều hành, hoặc dùng ảnh docker emqx/emqtt-bench
emqtt_bench conn --help         # XEM cờ bản này có: --cacertfile, --shortids, -m/--message,
                                # --num-retry-connect, --prometheus. Script chỉ dùng cờ có thật.
```

Máy phát MQTT nên là **Linux** (iptables cho `CACH_CAT=im_lang`, dải cổng tạm rộng, ulimit lớn).

Tài khoản đặt bằng biến môi trường, **không bao giờ ghi vào file trong repo**:

```bash
export IOTX_EMAIL='...'
export IOTX_PASSWORD='...'
export IOTX_BASE='https://web.dev.happibot.net/v1'   # bỏ trống = mặc định này; k6 BẮT BUỘC đặt
export IOTX_RPC_DEVICE='<id thiết bị ẢO>'             # tuỳ chọn; không đặt = không bắn lệnh nào
```

Nhiều tài khoản cho `ban_rps.py`: `--tai-khoan-tep tep.txt` (mỗi dòng một email, mật khẩu
chung lấy từ `IOTX_PASSWORD`).

## Thử mà không đụng vào DEV

```bash
./loadtest/chay.sh thu        # 25 phiên, SSE + hỏi vòng, cắt kết nối giây 35 — 1 phút
./loadtest/chay.sh thu-rps    # 50/100/200 req/s × 20 s, IBS giả sức chứa 25, 0,2% trả 429 — 1,5 phút
./loadtest/chay.sh b1         # B1-03: trần máy phát HTTP — đặt B1_BAC=..., B1_GIU=...
```

`ibs_gia.py` có thêm núm: `--ti-le-429` (giả bộ giới hạn tốc độ), `--suc-chua N` (chỉ N lời
gọi xử lý cùng lúc — tải vượt thì độ trễ tăng, để thấy bảng theo bậc gãy), `--ti-le-loi-rpc`,
`--ve-song`. Nó chỉ nghe ở 127.0.0.1. `chay.sh` từ chối dựng nếu cổng 4020 đã có máy chủ khác.

---

## Nhánh NGƯỜI DÙNG

### B1-03 — trần máy phát HTTP (làm trước mọi bài)

Không biết trần máy phát thì không phân biệt được "máy chủ gãy" với "máy phát gãy". Đo
09/10/2026 trên Mac này, HTTP loopback **không TLS**, vào IBS giả không giới hạn:

| Bậc | Đạt được | Máy phát trễ lịch p95 | Kết luận |
| --- | --- | --- | --- |
| 200 → 9.000 req/s | đúng nhịp | ≤ 1 ms | ✅ |
| 12.000 req/s | 7.557 req/s | — | ❌ máy phát bỏ 63.662 lời gọi |
| 15.000 req/s | 5.315 req/s | — | ❌ máy phát bỏ 142.294 lời gọi |

Đó là trần **tốt nhất có thể** của một tiến trình Python. Qua HTTPS và mạng thật thấp hơn
nhiều — đo lại trên đúng máy phát. Quy tắc B1: chỉ chạy ở **≤ 70% trần** đã đo.

### B5 — thông lượng req/s (`ban_rps.py`, `k6/b5_thong_luong.js`)

**Vòng mở**: lời gọi thứ k đi ra đúng lúc t0 + k/R, không đợi lời gọi trước — không mắc
*coordinated omission*. Độ trễ ghi ở `ms` tính **từ lúc lẽ ra phải gửi**; lúc máy phát tụt
lịch ghi riêng ở `tre`. Trộn mặc định `bootstrap=85,rpc=8,products=3,refresh=3,khac=1`
(`khac` = `/notifications`, `/rules`, hẹn giờ — **chỉ đọc**), chỉnh bằng `--tron` / `TRON`.
Không có thiết bị chỉ định thì phần rpc dồn sang bootstrap. Mỗi lệnh RPC một `Idempotency-Key`.
Pool vé đăng nhập sẵn (`--so-ve` / `SO_VE`), đăng nhập theo lô nhỏ để không tự tạo bão đăng nhập.

```bash
# k6 — các bậc thật của tài liệu, giữ 5 phút mỗi bậc
B5_BAC=500,1000,3000,6000,10000,15000,20000 ./loadtest/chay.sh b5 k6
#   thêm ABORT=1 để dừng thang ở bậc đầu tiên trượt ngưỡng (abortOnFail)
# Python — bậc thấp
B5_BAC=100,200,500 ./loadtest/chay.sh b5 python
```

k6: mỗi bậc là một kịch bản `constant-arrival-rate` (tag `bac`), có ngưỡng B-SLA theo từng
bậc, đếm riêng `so_429`, `so_4xx_khac`, `ti_le_5xx`, `qua_han_cho`, `khong_toi_duoc`. Ngưỡng
của k6 tính trên **cả bậc**; p95 cửa sổ trượt 1 phút lấy từ `tong_hop.py` trên tệp
`--out json=...json.gz`. `dropped_iterations` = máy phát thiếu VU → bậc đó "KHÔNG DÙNG ĐƯỢC".
Tệp json ở 15.000 req/s rất lớn (hàng chục triệu dòng mỗi giờ) — để đuôi `.gz`.

Số yêu cầu đang bay (định lý Little) ghi mỗi giây (`dang_bay`; k6 dùng `vus` làm xấp xỉ).

### B6 — thang bậc phiên (`do_phien.py`)

```bash
./loadtest/chay.sh b6                 # 1000 → 5000 → 10000 → 30000 → 50000, hỏi trước mỗi bậc ≥ 5000
B6_BAC="1000 5000" B6_XEM_KY=0.4 ./loadtest/chay.sh b6
```

Mỗi bậc: dựng N phiên trong N/50 giây (≥ 60), giữ 5 phút. `--xem-ky-ti-le` = tỉ lệ phiên đang
mở màn chi tiết (mặc định 0,25), `--nen-ti-le` = tỉ lệ tab nền. `tong_hop.py` in mục
**REQ/S THỰC TẾ SINH RA** — so số đo với tính toán mục 1.2, và với bản chỉnh "nối đuôi" (nhịp
thật = nhịp + độ trễ). Lệch > 15% = bộ mô phỏng chưa khớp app hoặc phiên bị rớt.

Một máy chỉ có ~16–28 nghìn cổng tạm tới một đích: bậc ≥ 30.000 phiên (mỗi phiên giữ một
luồng SSE) cần nhiều IP nguồn / nhiều máy phát (mục 1.4).

### B7 — cao điểm (`k6/b7_cao_diem.js`)

```bash
NEN_RPS=1000 ./loadtest/chay.sh b7            # nền req/s bằng k6
B7_PHIEN=5000 ./loadtest/chay.sh b7           # nền bằng 5000 phiên do_phien.py thật, k6 chỉ bơm
```

Nền giữ suốt bài; bơm `DINH` (15.000) req/s × 60 s, ba lần cách nhau 5 phút; quan sát thêm 5
phút. Tài liệu muốn nền = bậc cao nhất B6 còn đạt (tính bằng phiên) → dùng `B7_PHIEN`, đo được
cả "có mất phiên nền không". Đọc bảng cửa sổ trượt: sau mỗi lần bơm, p95 phải về mức nền ≤ 2 phút.

### B9 — trình duyệt thật

```bash
npm run build && npm start      # cửa sổ khác — B10 quy tắc 1: bản PRODUCTION
./loadtest/chay.sh b9           # thêm --cho-phep-bat-tat để chạy hai bài bật tắt quạt THẬT
```

Bảy bài: ngoại tuyến · vé hết hạn · luồng chết âm thầm · **nhịp hỏi vòng 2,5 s / 10 s** ·
**tab nền ngưng hỏi** · (tuỳ chọn) bấm đúp · mất mạng giữa chừng.

---

## Nhánh THIẾT BỊ (`mqtt/`)

Bộ `loadtest/` cũ không gửi được gói MQTT nào. `mqtt/` bọc **emqtt-bench**. Mọi biến ở đầu
`mqtt/chung.sh`; quan trọng nhất:

| Biến | Mặc định | Ghi chú |
| --- | --- | --- |
| `MQTT_HOST` | **không có** | bắt buộc đặt — để không ai lỡ tay bắn vào DEV |
| `MQTT_PORT` | 8883 | |
| `MQTT_XAC_THUC` | `mtls` | `mtls` · `clientid` · `token` — xem chỗ lệch số 8 |
| `MQTT_CERT`/`MQTT_KEY` hoặc `MQTT_CHUNG_THU_DIR` | | chứng thư client (mtls) |
| `MQTT_KEEPALIVE` | 120 | mặc định ESP-IDF — **vẫn phải hỏi firmware** (câu 1) |
| `NHIP_TELEMETRY_S` | 0 | 0 = chỉ giữ kết nối; AIOTEC thật ~600 (câu 2); bộ giả lập 3 s **không** đại diện |
| `MQTT_IFADDR` | | IP nguồn, cách nhau dấu phẩy — mỗi IP một tiến trình (mục 1.4) |
| `TOC_DO_NOI` | 500 | kết nối/giây mỗi tiến trình khi dựng tải |

Mỗi script kiểm `ulimit -n` và dải cổng tạm (`ip_local_port_range` / macOS
`net.inet.ip.portrange`) so với số IP nguồn, và cảnh báo nếu máy phát sẽ gãy trước broker.
Kết quả vào `ketqua/mqtt_<mốc>_<bài>/`: log từng tiến trình, `su_kien.csv` (mốc epoch để ghép
với đồ thị CPU/RAM/fd/GC của broker — B10 quy tắc 4), và bảng CSV của bài.

| Bài | Script | Biến riêng |
| --- | --- | --- |
| B1-01 | `b1_bat_tay.sh` | `SO_MOI_LAN` 1000, `LAN` 10, `NGHI` 30, `S_TIME` (đo thêm bằng `openssl s_time`) |
| B1-02 | `bac_ket_noi.sh` qua `chay.sh mqtt-b1` | `B1_MQTT_BAC`, `B1_MQTT_GIU` |
| B2 | `bac_ket_noi.sh` | `BAC`, `GIU` 300, `GIU_LON` 900 (bậc ≥ 100.000), `NGUONG_NOI` 99,9 |
| B3-a/b | `b3_bao_noi_lai.sh a\|b` | `BAC`, `ON_DINH` 300, `NHOM` 20, `JITTER_S` 60, `NGUONG_S` 120, `CACH_CAT` giet\|im_lang\|tay, `THU_LAI` |
| B4 | `b4_telemetry.sh` | `NEN`, `NHIP` "60 30 10 5", `GIU` 300 |
| CA test | `tao_chung_thu.sh` | `SO`, `BAT_DAU`, `TIEN_TO`, `SONG_SONG`, `--xoa` |
| B1-04/05/06 | `hieu_chuan.sh` | `MUC_TIEU`, `SO_DICH`, `TRAN_MAY_PHAT` |

**B3-b và jitter.** emqtt-bench không có backoff + jitter. Script chia kết nối thành `NHOM`
tiến trình, mỗi nhóm khởi động lệch ngẫu nhiên đều trong 0..`JITTER_S` (60 s < ngưỡng 120 s).
Độ mịn jitter = một nhóm; phần "tăng dần khi thất bại" không mô phỏng được. Báo cáo phải ghi
đây là xấp xỉ.

**Chứng thư.** `tao_chung_thu.sh` sinh **CA TEST riêng** (không qua sadmin/PKI thật, không
dùng cho sản xuất) và lô chứng thư client RSA-2048, CN = serial = clientId. Việc **đăng ký
vào ThingsBoard** (nạp CA vào device profile hoặc từng credentials X509) và **dọn sau bài**
(xoá danh tính trong TB, gỡ CA, rồi `--xoa`) là bước phải làm riêng — B10 quy tắc 8. Khoá
nằm trong `mqtt/chung-thu/` (đã `.gitignore`).

**Đo được và không đo được ở phía máy phát.** Máy phát cho: tỉ lệ nối được, tốc độ dựng, thời
gian hồi phục sau bão, số bản tin đã gửi. **Không** cho: p95 thời gian bắt tay (trừ khi bản
emqtt-bench có `--prometheus`), số bản tin broker nhận, độ trễ mạch gửi → `lastValues` đổi,
mất bản ghi — những thứ đó phải đo phía ThingsBoard/IBS.

Trên DEV: TB 1 nút 2 vCPU, heap 1,5 GB, đĩa ~38/50 GB (mục 0.2). **Xử lý đĩa trước B2.**

---

## Đọc kết quả (`tong_hop.py`)

```bash
python3 loadtest/tong_hop.py ketqua/<tệp>.jsonl          # do_phien.py / ban_rps.py
python3 loadtest/tong_hop.py ketqua/<tệp>.json.gz        # k6 --out json
python3 loadtest/tong_hop.py <tệp> --csv bang.csv --buoc 10
```

- **Bảng theo việc**: n, OK, `4xx` (trừ 429), **`429`** riêng, `5xx`, `h.giờ` (quá hạn chờ),
  **`kh.tới`** (không tới được máy chủ = **máy phát gãy**, không tính là lỗi IBS), p50/p95/p99/max.
- Tỉ lệ thành công **theo giao dịch**, không lấy trung bình cộng các loại việc.
- **Cửa sổ trượt 1 phút**: p95 bootstrap / rpc / login, req/s, 429, 5xx, đang bay, máy phát
  trễ lịch, và Đạt SLA từng cửa sổ. `*` = dưới 20 mẫu, không xét.
- **Theo bậc**: Đạt SLA? từng bậc, dùng cửa sổ 1 phút **xấu nhất** nằm trọn trong bậc, rồi
  **BẬC CUỐI CÒN ĐẠT SLA**. Bậc ngắn hơn 1 phút (chỉ để thử) dùng p95 cả bậc và ghi chú.
- Có `429` thì con số đo được là trần của **bộ giới hạn tốc độ**, không phải IBS — xin nới hoặc
  mở danh sách trắng cho IP máy phát rồi đo lại. 429 tính là KHÔNG thành công.
- **KẾT QUẢ KHÔNG DÙNG ĐƯỢC** khi `kh.tới` > 0,5%, máy phát trễ lịch p95 > 100 ms, hoặc máy phát
  phải bỏ lời gọi (k6: `dropped_iterations`). Bỏ kết quả đó, không đưa vào báo cáo.

Ngưỡng B-SLA (đường người dùng, **ĐỀ XUẤT, chưa được duyệt**): thành công theo giao dịch ≥ 99,9% ·
5xx ≤ 0,1% · `/bootstrap` p95 ≤ 1 s · `/rpc` p95 ≤ 1,5 s · `/auth/login` p95 ≤ 2 s · cửa sổ p95
trượt 1 phút. Đổi ở đầu `tong_hop.py` (`SLA_*`) và `k6/chung.js` (`nguong`) khi sếp duyệt.

## Quy tắc chạy (B10)

1. Bài trình duyệt chạy bản **production** (`npm run build && npm start`).
2. **Không chạy hai bài chồng nhau** — `chay.sh` và `mqtt/*.sh` tự kiểm
   `pgrep -fl do_phien.py` (và `ban_rps.py`, `k6 run`, `emqtt_bench`). Trừ B8.
3. **Mốc chuẩn trước và sau mỗi bài lớn**: người dùng `./loadtest/chay.sh moc` (100 phiên × 5
   phút); thiết bị `BAC=1000 GIU=300 ./loadtest/chay.sh mqtt-b2` với nhịp telemetry thật.
4. **Ghi số phía máy chủ song song**: CPU, RAM, fd, số kết nối, hàng đợi, GC.
5. `tong_hop.py` in "KẾT QUẢ KHÔNG DÙNG ĐƯỢC" → bỏ.
6. Báo cáo tỉ lệ **theo giao dịch**.
7. `kh.tới` là lỗi máy phát.
8. **Dọn sau mỗi bài thiết bị**: danh tính trong ThingsBoard + chứng thư (`tao_chung_thu.sh --xoa`).
9. `loadtest/thiet_bi_ao.py` và `chay.sh bia` **không tồn tại** — dọn thiết bị ảo phải làm tay.

## Khi báo cáo, nói rõ

- Một tài khoản mở N phiên là **N phiên của một người dùng**, không phải N người dùng — máy
  chủ có thể giữ trạng thái hoặc hạn mức theo người. Ghi rõ là xấp xỉ.
- Số đo trên DEV là **trần của DEV** (TB 1 nút, IBS 1 tiến trình Node, pool Postgres 10).
- `MQTT_XAC_THUC=clientid` thì chi phí bắt tay **thiếu** phần xác minh chứng thư client (1.1d).

## Chưa làm được

- **k6 và emqtt-bench chưa cài** trên máy viết bộ này → `k6/*.js` và `mqtt/*.sh` mới kiểm cú
  pháp; `mqtt/*.sh` chạy thử logic với một `emqtt_bench` giả. Lần chạy thật đầu tiên phải
  đọc kỹ log, nhất là định dạng dòng thống kê mà `dem_da_noi` đọc (`connect_succ total=` /
  `connected(..): total=`) và cách `--prefix` + `--shortids` đặt clientId.
- **Mỗi kết nối một chứng thư** (mTLS đúng nghĩa ở quy mô B2/B3) — emqtt-bench không làm được.
- **Điều phối nhiều máy phát + gộp kết quả** — chưa có; chạy tay trên từng máy, đồng bộ NTP,
  gộp `tong_hop.py` từng máy.
- **Độ trễ mạch gửi → `lastValues`** (B4, B-SLA p95 ≤ 5 s) và **mất bản ghi telemetry** — cần
  đo phía TB/IBS.
- **Tạo/dọn 1 triệu danh tính trong ThingsBoard** — cần công cụ gọi thẳng TB REST (câu 10).
