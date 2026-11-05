# Việc: điều khiển quạt, điều hoà qua Bluetooth (BLE) — đặc tả cho firmware ESP32-C3

- Trạng thái: **phía app đã làm 28/10/2026** (`lib/ble/dieuKhienBle.ts`, `components/ui/device/BleDieuKhien.tsx`,
  bài `tests/ble.mjs` chạy với máy giả đúng đặc tả này). **Firmware điều hoà: bản đầu đã viết
  28/10/2026** (mục 12) — build được, **chưa chạy trên mạch thật**. **Firmware quạt: chưa làm.**
- Yêu cầu gốc (27/10/2026): "muốn app này có thể điều khiển quạt qua blue". Mở rộng 28/10/2026:
  "tương tự với điều khiển điều hòa cũng cần có chức năng điều khiển bluetooth".
- **Điều kiện còn mở**: firmware điều hoà hiện **không** lưu mã 5 số trên tem. Bản firmware mới
  đọc mã ở `device_nvs` → namespace `device_label`, key `code` (mục 5); công cụ nạp ở nhà máy
  phải ghi mã này cạnh định danh MQTT. Chưa ghi thì máy trả `no_code` và không ai xác thực được.
- Nguồn bộ lệnh: catalog quạt, điều hoà trong tài liệu nền tảng IoTX ("IOTX — Toàn bộ tài liệu", mục *API —
  Ví dụ: Thiết bị*): `setPower`, `setSpeed`, `setMode`; telemetry `power`, `speed`, `mode`.

## 1. Vì sao cần đặc tả riêng

ESP32-C3 có sẵn BLE 5, nhưng chip chỉ là phần cứng: UUID của service/characteristic và định dạng
lệnh là do firmware tự đặt, không tra được từ datasheet hay ESP-IDF. Repo và tài liệu IoTX hiện
không có phần nào như vậy. Firmware điều hoà (`ESP_AirConditioner_C3`, ESP-IDF 5.4.4) trước đây
còn **tắt hẳn Bluetooth** và cài Wi-Fi qua SoftAP (`mzService_…`), không qua BLE. Tài liệu này đặt
ra giao thức đó.

## 2. Mục tiêu và phạm vi

- **Đường dự phòng**: bình thường lệnh vẫn đi `app → /v1 → ThingsBoard → MQTT → thiết bị`. Khi
  mất mạng (hoặc thiết bị mất Wi-Fi), người dùng đứng gần bấm "Điều khiển gần qua Bluetooth" trên
  màn chi tiết, điện thoại nói chuyện thẳng với thiết bị.
- **Áp dụng cho**: quạt (`productGroup: "fan"`) và điều hoà (`productGroup: "ac"`). Hai dòng máy
  dùng CHUNG giao thức này — cùng UUID, cùng xác thực, cùng hình lệnh; chỉ khác bộ lệnh (mục 6.2),
  mà bộ lệnh thì lấy từ catalog của từng sản phẩm.
- **Một bộ xử lý lệnh cho hai đường**: lệnh qua BLE có ĐÚNG hình của RPC qua ThingsBoard
  (`{ method, params }`), nên firmware chỉ cần thêm một lối vào cho cùng hàm xử lý RPC đang có.
- **Trình duyệt**: Web Bluetooth chỉ có trên Chrome/Edge (Android, Windows, macOS, ChromeOS),
  và chỉ trên HTTPS hoặc localhost. **iPhone/iPad (mọi trình duyệt) không có** — app ẩn hẳn khối
  này ở đó. App di động (Flutter) sau này dùng chung đặc tả.

## 3. Quảng bá (advertising)

| Mục | Giá trị |
|---|---|
| Khi nào | Luôn quảng bá khi KHÔNG có client BLE nào đang nối (kể cả sau khi đã cài Wi-Fi xong) |
| Gói quảng bá | Có UUID service `19800001-eb16-4e87-a18d-16008870c454` (128-bit, đặt trong adv hoặc scan response) |
| Tên | `LVT-` + 4 ký tự cuối serial, ví dụ `LVT-2185` (chỉ để người dùng nhận ra trong hộp chọn) |
| Số kết nối | Tối đa 1 client cùng lúc |
| Chu kỳ | 100–300 ms là đủ; có thể giãn ra 1 s sau 5 phút không ai nối để đỡ nhiễu |

App lọc hộp chọn của trình duyệt theo UUID service, nên thiết bị **bắt buộc** phải có UUID trong
gói quảng bá — không có thì thiết bị không hiện trong danh sách.

Nếu firmware có service provisioning BLE (`PROV_…`) thì không đụng tới: hai service độc lập.

## 4. GATT

Service: **`19800001-eb16-4e87-a18d-16008870c454`**

| Characteristic | UUID | Thuộc tính | Nội dung |
|---|---|---|---|
| INFO | `19800002-eb16-4e87-a18d-16008870c454` | Read | JSON thông tin máy, không cần xác thực |
| NONCE | `19800003-eb16-4e87-a18d-16008870c454` | Read | 16 byte ngẫu nhiên, sinh MỚI mỗi lần có client nối |
| CMD | `19800004-eb16-4e87-a18d-16008870c454` | Write (with response) | JSON lệnh, UTF-8 |
| EVT | `19800005-eb16-4e87-a18d-16008870c454` | Notify | JSON trả lời lệnh và trạng thái, UTF-8 |

- Mọi chuỗi là JSON UTF-8, **không** có ký tự kết thúc `\0`.
- MTU: firmware nên chấp nhận MTU 247 (NimBLE: `CONFIG_BT_NIMBLE_ATT_PREFERRED_MTU=247`). CMD
  phải nhận được tới 512 byte (hỗ trợ long write / prepare write). Mỗi gói notify trên EVT giữ
  **≤ 180 byte**; trạng thái dài thì chia thành nhiều gói `{"t":{…}}`.
- NONCE dùng bộ sinh ngẫu nhiên phần cứng (`esp_fill_random`).

### 4.1 INFO

```json
{ "v": 1, "sn": "fan72185", "model": "W-450", "fw": "1.0.0" }
```

`v` là phiên bản giao thức này (1). `sn` phải là ĐÚNG serial in trên tem / đã claim lên IoTX: app
so `sn` với serial của thiết bị đang mở, khác thì ngắt và báo "không phải thiết bị này" — tránh
điều khiển nhầm máy nhà bên (hay nhầm quạt với điều hoà trong cùng phòng).

## 5. Xác thực bằng mã trên tem

Khoá là **mã 5 số trên tem** (mã `c=` trong QR ② `#sn=…&c=…`). Firmware đọc mã ở phân vùng
`device_nvs`, namespace `device_label`, key `code` (chuỗi đúng 5 chữ số) — nhà máy ghi lúc nạp máy,
cùng lúc với định danh MQTT. Để thử trên bàn, Kconfig `APP_BLE_DEV_LABEL_CODE` cho một mã tạm khi
NVS chưa có; bản bán ra phải để trống. Mã không bao giờ được gửi qua sóng:

1. App đọc NONCE (16 byte).
2. App tính `mac = HMAC-SHA256(khoá = mã 5 số dạng chuỗi ASCII, dữ liệu = 16 byte NONCE)`, viết
   thành 64 ký tự hex chữ thường.
3. App ghi vào CMD: `{"id":1,"method":"auth","params":{"mac":"<64 hex>"}}`
4. Firmware tính lại, so (so sánh thời gian hằng — `mbedtls_ct_memcmp` hoặc tự viết), trả trên EVT:
   - đúng: `{"id":1,"ok":true}` rồi đẩy ngay trạng thái đầy đủ `{"t":{"power":true,"speed":2,"mode":"normal"}}`
   - sai: `{"id":1,"ok":false,"err":"auth"}`

Quy tắc:
- Chưa xác thực thì mọi lệnh khác trả `{"id":n,"ok":false,"err":"auth"}`, không làm gì.
- Sai **3 lần** trong một kết nối → trả `err:"locked"`, ngắt kết nối, khoá BLE điều khiển **60 giây**.
- NONCE đổi mỗi kết nối, nên một `mac` nghe lén được không dùng lại được ở kết nối sau.
- App không nhớ mã: lần nối nào cũng hỏi (mục 18). Mã bản trước còn trong localStorage bị xoá.

Ví dụ kiểm tay (mã `12345`, NONCE toàn byte `00`):
`HMAC-SHA256("12345", 00×16)` — tính bằng `openssl`:
`printf '%032d' 0 | xxd -r -p | openssl dgst -sha256 -hmac 12345`

## 6. Lệnh (CMD) và trả lời (EVT)

### 6.1 Hình dạng

App ghi vào CMD:

```json
{ "id": 7, "method": "setSpeed", "params": { "speed": 2 } }
```

- `id`: số nguyên tăng dần trong một kết nối (bắt đầu từ 1 với `auth`).
- `method`, `params`: **đúng như RPC qua ThingsBoard** — `method` là trường `rpc` của capability
  trong catalog, `params` là `{ <key của capability>: <giá trị> }`.

Firmware trả trên EVT, trong vòng **4 giây** (quá hạn app báo "thiết bị không trả lời"):

```json
{ "id": 7, "ok": true }
{ "id": 7, "ok": false, "err": "bad_params" }
```

### 6.2 Bộ lệnh (theo catalog của IoTX)

**Quạt** (catalog `fan`):

| method | params | Nghĩa |
|---|---|---|
| `setPower` | `{"power": true}` / `{"power": false}` | Bật / tắt |
| `setSpeed` | `{"speed": 1}` … `{"speed": 3}` | Tốc độ gió (catalog `fan`: min 1, max 3, bước 1) |
| `setMode` | `{"mode": "normal"}` / `"sleep"` / `"turbo"` | Chế độ gió: Thường / Ngủ / Mạnh |

**Điều hoà** (catalog `ac_1`; key có tiền tố `ac_`, đúng như telemetry lên ThingsBoard):

| method | params | Nghĩa |
|---|---|---|
| `setPower` | `{"ac_power_status": true}` | Bật / tắt |
| `setTempTarget` | `{"ac_temp_setting": 26}` | Nhiệt độ đặt (16–31) |
| `setMode` | `{"ac_ope_mode": "Cool"}` — `Heat` / `Cool` / `Dry` / `Fan` / `Auto` | Chế độ |
| `setSpeed` | `{"ac_fan_speed": "Low"}` — `Low` / `Mid` / `High` / `Turbo` / `Auto` | Tốc độ gió |
| `setSwingMode` | `{"ac_swing_mode": "r35"}` | Đảo gió |
| `setEcoMode`, `setSleepMode`, `setMuteMode`, `setIclean`, `setMildewMode`, `setIfeelMode` | `{"ac_…": true}` | Các chế độ bật/tắt |
| `setTimer` | `{"ac_timer_control": 60}` | Hẹn giờ |

Chú ý `setSpeed`/`setMode` trùng TÊN với quạt nhưng khác key và kiểu giá trị — firmware điều hoà
đọc đúng key `ac_…` của mình.

Các dòng quạt khác (`fan_ac`, `fan_bldc`) có thêm capability (`setSwing`, `setTimer`,
`setCoolSense`…) và dải giá trị khác (BLDC: tốc độ 0–100). Quy tắc chung không đổi: **mọi
capability nào catalog khai `rpc` thì app gửi qua BLE đúng `method` đó với `params` `{key: giá trị}`**,
y như qua mạng. Firmware hỗ trợ lệnh nào thì trả `ok`, chưa hỗ trợ thì trả `err:"bad_method"`.

Kiểu giá trị: bật/tắt là boolean JSON (`true`/`false`, không phải chuỗi), số là số, lựa chọn là chuỗi.

### 6.3 Trạng thái

Mỗi khi trạng thái đổi — **bất kể vì đâu**: lệnh BLE, lệnh qua mạng, nút trên thân máy, remote
hồng ngoại, hẹn giờ — firmware đẩy trên EVT:

```json
{ "t": { "speed": 3 } }
```

`t` có cùng key với telemetry gửi lên ThingsBoard (`power`, `speed`, `mode`…). Một gói có thể vừa
trả lời vừa mang trạng thái: `{"id":7,"ok":true,"t":{"speed":3}}` — app hiểu cả hai cách.

### 6.4 Mã lỗi

| `err` | Khi nào | App hiện |
|---|---|---|
| `auth` | Chưa xác thực, hoặc `mac` sai | "Sai mã trên tem…" và hỏi lại mã |
| `locked` | Sai quá 3 lần, đang khoá 60 s | "Thiết bị tạm khoá Bluetooth 60 giây" |
| `bad_method` | Lệnh chưa hỗ trợ | "Thiết bị chưa hỗ trợ lệnh này qua Bluetooth" |
| `bad_params` | Thiếu key, sai kiểu, ngoài dải | "Thiết bị từ chối giá trị này" |
| `busy` | Đang bận (ví dụ đang OTA) | "Thiết bị đang bận…" |
| `no_code` | Máy chưa được nạp mã tem (`device_label/code` trống) | "Thiết bị chưa được cài mã tem…" |

### 6.5 Chống lặp

Firmware nhớ `id` của ~8 lệnh gần nhất trong kết nối; nhận lại `id` đã xử lý thì trả lại kết quả
cũ, **không** làm lại (tương tự `Idempotency-Key` của `/v1`).

## 7. Đồng bộ với IoTX

- Lệnh tới qua BLE vẫn phải được **publish telemetry lên ThingsBoard như mọi thay đổi khác** khi
  thiết bị có mạng; mất mạng thì gửi trạng thái mới nhất ngay khi nối lại. Nhờ vậy các máy khác và
  lịch sử trên máy chủ không bị lệch.
- Phía app: khi đang nối BLE, giá trị thiết bị báo qua EVT thắng giá trị từ máy chủ (máy chủ có thể
  đang mất liên lạc với thiết bị), xem `apTrangThaiBle` trong `lib/ble/dieuKhienBle.ts`.
- BLE và MQTT chạy song song được trên ESP32-C3 (coexistence) — không phải ngắt Wi-Fi khi có
  client BLE.

## 8. Bảo mật — điều cần biết

- Ai đứng trong tầm sóng và **biết mã 5 số trên tem** thì điều khiển được, giống remote hồng ngoại.
  Không biết mã thì không làm gì được ngoài đọc INFO.
- Mã chỉ có 100 000 khả năng: kẻ nghe lén **một** lần xác thực có thể dò ra mã offline. Chấp nhận
  được cho một đường dự phòng điều khiển quạt, điều hoà; nếu sau này cần chặt hơn, thay mã tem bằng khoá
  riêng do IoTX cấp cho tài khoản (giao thức giữ nguyên, chỉ đổi khoá HMAC).
- Không có lệnh nào qua BLE đổi được Wi-Fi, claim, hay firmware — những việc đó vẫn chỉ qua
  provisioning / máy chủ.

## 9. Gợi ý cài trên ESP-IDF (NimBLE)

- Bật `CONFIG_BT_NIMBLE_ENABLED`, thêm một bảng `ble_gatt_svc_def` cho service ở mục 4 cạnh service
  provisioning.
- Ghi vào CMD: gom long write → `cJSON_Parse` → nếu `method == "auth"` thì kiểm HMAC
  (`mbedtls_md_hmac`), còn lại gọi **chung hàm xử lý RPC** mà đường MQTT đang dùng.
- EVT: `ble_gatts_notify_custom` với chuỗi JSON; gọi từ chỗ firmware đang publish telemetry.
- Sự kiện `BLE_GAP_EVENT_CONNECT`: sinh NONCE mới, đặt `da_xac_thuc = false`, đếm sai = 0.
  `BLE_GAP_EVENT_DISCONNECT`: quảng bá lại.

## 10. Kiểm tra

- **Không cần app**: nRF Connect (Android/iOS) → Scan → thấy `LVT-xxxx` → Connect → thấy service
  `19800001-…` với 4 characteristic; đọc INFO ra JSON; bật notify EVT; ghi `auth` rồi `setPower`.
- **Với app**: mở Livotec Home bằng Chrome trên Android (HTTPS) → màn chi tiết quạt / điều hoà → "Điều khiển
  gần qua Bluetooth" → chọn `LVT-xxxx` → nhập 5 số trên tem → các nút trên màn đi qua BLE.
- **Phía app tự động**: `node tests/ble.mjs` dựng một máy giả đúng đặc tả này trong trình
  duyệt (24 phép, cả quạt lẫn điều hoà). Firmware làm đúng các mục 3–6 thì app chạy với máy thật
  không cần sửa gì.

## 11. Phía app (đã làm)

| Tệp | Việc |
|---|---|
| `lib/ble/dieuKhienBle.ts` | UUID, kết nối + xác thực HMAC, gửi lệnh chờ `{id, ok}`, nghe EVT, sổ phiên dùng chung |
| `components/ui/device/BleDieuKhien.tsx` | Khối trên màn chi tiết quạt, điều hoà: nút nối, ô nhập mã tem, trạng thái, chọn kênh, cảnh báo mất Wi-Fi (không tự nối) |
| `components/ui/device/KenhKetNoi.tsx` | Chip/icon kênh ở đầu màn và trên thẻ; kênh đang dùng tô đặc, kênh chờ chỉ viền |
| `components/LivotecApp.tsx` | `guiLenh` / `doiNguon`: hỏi `phienDung` để chọn kênh; Wi-Fi hỏng vì đường truyền mà có phiên BLE thì gửi lại qua BLE |
| `hooks/useDuLieuIotx.ts` | Áp trạng thái thiết bị báo qua BLE; giá trị BLE thắng dữ liệu máy chủ khi đang nối |

Khối chỉ hiện khi: trình duyệt có Web Bluetooth, thiết bị là quạt hoặc điều hoà (`productGroup`
là `fan`/`ac`, hoặc `ui.renderer` bắt đầu bằng `fan`/`aircon` — xem `coDuongBle`), không phải
thiết bị ảo, và người dùng có quyền điều khiển. Rời màn chi tiết là ngắt.

### Chọn kênh Wi-Fi / Bluetooth (`kenhDung`)

| Thiết bị | Phiên BLE | Lệnh đi |
|---|---|---|
| Có Wi-Fi | không có | Wi-Fi |
| Có Wi-Fi | có | Bluetooth |
| Mất Wi-Fi | có | Bluetooth |
| Mất Wi-Fi | không có | khung cảnh báo; người dùng nhấn nút và nhập mã mới nối |
| Có Wi-Fi | có, nhưng BLE rớt / không trả lời | Wi-Fi (gửi lại lệnh vừa hỏng) |
| Máy chủ nói có Wi-Fi, nhưng mạch không báo lại lệnh trong 3 s | bất kỳ | Bluetooth nếu có phiên; không thì app đánh dấu "Mất Wi-Fi" và cảnh báo |

> Từ mục 18 app không còn tự nối: các đoạn dưới nói về nối ngầm, `noiLai`, `noiTuDong`, tự mở hộp chọn chỉ còn
> là lịch sử. Phần phát hiện mất Wi-Fi (đợi xác nhận 3 s, nhịp tim) vẫn dùng để hiện cảnh báo.

**Một cú bấm khi mạch mất Wi-Fi** (`guiQuaKenh` trong `components/LivotecApp.tsx`). Máy chủ chậm
vài phút mới biết mạch mất Wi-Fi (keepalive MQTT 120 s của firmware, rồi thời gian "không hoạt
động" của ThingsBoard), nên app không đợi cờ `online`: với máy có đường Bluetooth, mỗi lệnh qua
Wi-Fi được đợi tới khi máy chủ báo lại đúng giá trị vừa đặt (`SoLenhCho.choXacNhan`, tối đa
`CHO_WIFI_MS` = 3 s, hỏi lại `/bootstrap` ở 1,2 s và 2,4 s cho nhanh). Không thấy → `danhDauMatWifi`
(icon "Mất Wi-Fi", giữ 2 phút hoặc tới khi máy chủ có tin mới từ mạch), nối Bluetooth và gửi lại
lệnh đó — nối NGẦM nếu được (máy đã chọn trong lần mở trang này, hoặc `getDevices`).

Hộp chọn Bluetooth chỉ tự bật khi CHẮC mạch không còn đường Wi-Fi: máy chủ báo ngoại tuyến, hoặc
chính điện thoại không gửi được yêu cầu (`TypeError`). Mạch không báo lại, hay máy chủ trả
5xx/hết giờ, chỉ là NGHI (mạch có thể còn Wi-Fi mà không báo trạng thái; firmware cũng không trả
lời RPC) — khi đó không bật hộp chọn lên mặt người dùng, khối Bluetooth nhắc "Thiết bị không phản
hồi qua Wi-Fi. Chạm để điều khiển qua Bluetooth", lần bấm sau vẫn thử Wi-Fi lại. Mỗi lần nghi,
console ghi một dòng `[kenh] …` kèm lý do để soát trên máy thật.

**Nhịp tim — cách biết CHẮC mạch mất Wi-Fi.** Firmware gửi `{"hb": <giây chạy>}` lên telemetry mỗi
5 giây khi còn nối MQTT (`mqtt_app.c`, kèm keepalive MQTT 30 giây thay cho 120 giây). App ghi lúc
cuối cùng nghe thấy mạch (dữ liệu của nó trên máy chủ đổi, hoặc có sự kiện SSE — `ghiNgheMach`).
Mạch có khoá `hb` mà 20 giây không nghe gì (`soatNhipTim`, `NHIP_TIM_MAT_MS`) → chắc mất Wi-Fi:
icon tự thành "Mất Wi-Fi" không cần bấm gì, khối Bluetooth tự nối ngầm nếu được, và bấm bất kỳ nút
nào là mở hộp chọn rồi gửi qua Bluetooth. Có nhịp tim lại là tự về Wi-Fi. Mạch chạy firmware cũ
(chưa có `hb`) thì không xét theo cách này.

Đo trên DEV thật (28/10/2026): `hb` chỉ tới app qua luồng SSE, `/bootstrap` không trả khoá này. Nên
app nhớ riêng "mạch này có nhịp tim" (`livotec-co-hb:<id>` trong localStorage) và chỉ xét im lặng khi
chính luồng SSE đang thông (`datLuongThong`, báo từ `iotxClient.subscribe`). Thử trên mạch thật
(giữ mạch ở chế độ nạp để nó ngừng gửi): thẻ đổi sang "không phản hồi qua Wi-Fi" trong vòng 50 giây;
mạch chạy lại thì về "Trực tuyến qua Wi-Fi" ngay khi nhịp tim đầu tiên tới.
Chưa có mã tem thì báo nhập mã một lần ở khối Bluetooth.

Giả định cần kiểm trên IBS thật: `lastValues` chỉ đổi khi MẠCH báo telemetry, không phải khi máy
chủ nhận RPC. Nếu IBS tự ghi giá trị vừa đặt vào `lastValues` thì lệnh luôn "được xác nhận" và
việc tự chuyển này không bao giờ chạy. Mạch không báo trạng thái (ví dụ mạch thử trên bàn chưa nối
điều hoà) thì im lặng là chuyện thường của nó: app chỉ coi im lặng là mất Wi-Fi với mạch đã từng
báo lại một lệnh qua Wi-Fi trên trình duyệt đó (`daBietBaoLai`, nhớ trong localStorage).

- **Wi-Fi luôn được ưu tiên.** Nối tay khi máy đang có Wi-Fi nghĩa là người dùng chọn Bluetooth
  (`PhienBle.tuChon`); nút "Ưu tiên Wi-Fi" / "Dùng Bluetooth" đổi qua lại. Nối lúc mất Wi-Fi thì
  ở chế độ tự động: Wi-Fi về là lệnh về Wi-Fi.
- **Tự nối khi mất Wi-Fi** (`PhienBle.noiLai`): Web Bluetooth bắt một cú chạm cho hộp chọn, nên
  chỉ tự nối được máy đã chọn trong lần mở trang này, hoặc máy trình duyệt đã cho phép
  (`navigator.bluetooth.getDevices`, nếu trình duyệt có), và cần mã tem đã nhớ. Không được thì
  hiện lời nhắc kèm nút — một chạm là nối. Bấm **bất kỳ nút điều khiển nào** lúc mất Wi-Fi cũng
  tự nối (`noiTuDong`: cú bấm đó cho phép mở hộp chọn) rồi gửi luôn lệnh qua BLE.
- Chrome 156 trên máy tính chưa bật `getDevices` mặc định (cần cờ
  `chrome://flags/#enable-web-bluetooth-new-permissions-backend`). Không có nó thì sau khi tải lại
  trang, lần nối đầu luôn cần một cú chạm.
- **Không có Bluetooth thì về Wi-Fi:** phiên BLE đóng là lệnh đi Wi-Fi (kể cả khi đã chọn
  Bluetooth); lệnh qua BLE hỏng vì `timeout`/`ngat` mà máy còn Wi-Fi thì gửi lại qua Wi-Fi.
- `online` của máy chủ có độ trễ: lệnh qua Wi-Fi hỏng vì đường truyền (mạng, 408, 5xx) mà đang có
  phiên BLE chờ sẵn thì gửi lại qua BLE. Lỗi nghiệp vụ (quyền, giá trị sai) không chuyển.

## 12. Firmware điều hoà (bản đầu, 28/10/2026)

Dự án `ESP_AirConditioner_C3` (ESP-IDF 5.4.4, ESP32-C3). Bản gốc sao lưu ở
`D:\esp\sao-luu\ESP_AirConditioner_C3-goc-20261028`.

| Tệp | Việc |
|---|---|
| `components/mid/ble_ctl/ble_ctl.c/.h` (mới) | NimBLE GATT đúng mục 3–6: quảng bá `LVT-` + 4 ký tự cuối client id, INFO `{"v":1,"sn":<client id>,"model":"AC","fw":…}`, NONCE mới mỗi kết nối, HMAC kiểm thời gian hằng, sai 3 lần khoá 60 s, nhớ 8 `id` gần nhất, EVT ≤ 180 byte. Lệnh xử lý ở task riêng (lệnh UART mất ~1 s, không chặn task host NimBLE). |
| `components/mid/esp_send/esp_send.c/.h` | Tách `esp_send_rpc(method, params)` trả `NULL` / `bad_method` / `bad_params` / `busy`, dùng chung cho MQTT và BLE (có mutex). Thêm bảng trạng thái mới nhất (`esp_send_state_snapshot`) và lắng nghe trạng thái; telemetry đi qua bảng và BLE **cả khi MQTT đang mất**. |
| `components/app/zapp/zapp.c` | `esp_send_open()` lên đầu; `ble_ctl_open()` ngay sau `wifi_prov_open()`, **trước** khi chờ Wi-Fi. |
| `components/CMakeLists.txt`, `main/Kconfig.projbuild`, `sdkconfig` | Thêm `bt`, mục *Bluetooth control* (`APP_BLE_CONTROL`, `APP_BLE_DEV_LABEL_CODE`); bật NimBLE (1 kết nối, MTU 247, chỉ vai trò peripheral, tắt Security Manager vì đã xác thực ở tầng ứng dụng). Đổi tối ưu biên dịch sang **kích thước** (`-Os`) — với `-Og` cũ, ảnh firmware có BLE chỉ còn 4 % trống. |

Kích thước `zenFWCore.bin`: gốc (`-Og`, không BLE) 0x137720 = 1,28 MB; có BLE + `-Os` 0x1483d0 =
1,34 MB, còn 15 % trống trong phân vùng 1,5 MB.

Lưu ý khi thử:
- `sn` trong INFO là **client id MQTT** (ví dụ `DHL0000010A2`). App so `sn` với serial của thiết
  bị trên IoTX: hai giá trị phải trùng, nếu không app báo "không phải thiết bị này".
- Đảo gió: catalog `ac_1` gửi `r20`…, firmware chỉ hiểu `A20`… — cả MQTT lẫn BLE trả `bad_params`
  cho tới khi một bên được sửa.

## 13. Một chế độ mỗi lúc: Wi-Fi HOẶC Bluetooth (29/10/2026)

Firmware không còn chạy song song hai đường:

| Tình huống | Mạch làm gì |
|---|---|
| Khởi động, đã có Wi-Fi lưu | Chỉ Wi-Fi; Bluetooth khởi tạo nhưng KHÔNG quảng bá |
| Mất Wi-Fi 10 giây (`WIFI_LOST_TO_BLE_US`) | Tắt hẳn Wi-Fi (`esp_wifi_stop`), bật quảng bá Bluetooth |
| App gửi `setWifi` qua Bluetooth | Trả `ok`, ngắt Bluetooth, nối Wi-Fi (mạng mới hoặc mạng đã lưu) |
| `setWifi` mà 30 giây không có IP (`WIFI_TRY_BACK_US`) | Quay lại Bluetooth để vẫn điều khiển được |
| Chưa có Wi-Fi nào (mạch mới) | Mạng cài đặt `mzService_…`, Bluetooth không quảng bá |

Lệnh mới trên CMD: `{"id":n,"method":"setWifi","params":{"ssid":"…","password":"…"}}`. `ssid`
trống/không có = dùng mạng đã lưu. `bad_params` khi ssid > 32 ký tự, mật khẩu 1–7 hoặc > 64 ký tự,
hoặc có mật khẩu mà không có ssid; `busy` khi mạch không ở chế độ Bluetooth.

Sau mỗi lệnh điều khiển thành công qua Bluetooth, mạch đẩy ngay `{"t":{<khoá>:<giá trị vừa đặt>}}`
để nút trên app sáng đúng, không đợi điều hoà trả lời qua UART.

App: ghép tay giờ là **nối máy trước, nhập mã tem sau** (`PhienBle.chonMay` rồi `xacThuc`; mã đã
nhớ thì xác thực luôn, sai thì giữ kết nối để nhập lại). Đang nối Bluetooth có nút **Pair Wi-Fi**
(`components/ui/device/BleDieuKhien.tsx`). App coi mạch mất Wi-Fi sau 15 giây không có nhịp tim
(`NHIP_TIM_MAT_MS`) — lúc đó mạch đã bật Bluetooth (10 giây).

Thử trên mạch thật (bleak, `thu-che-do.py`): router không có → 10 giây sau tự sang Bluetooth;
`setEcoMode` được trả `ok` và đẩy ngay `{"t":{"ac_eco_mode":true}}`; `setWifi` mật khẩu ngắn →
`bad_params`; `setWifi {}` → `ok`, Bluetooth ngắt sau 0,6 giây, không quảng bá trong lúc thử Wi-Fi,
mạng cũ không có → Bluetooth bật lại sau ~31 giây.

**Luồng tính năng ở chế độ Bluetooth giống Wi-Fi.** Điều hoà chỉ gửi lại toàn bộ tính năng khi mạch
báo "đã kết nối" (`0x76 = 0x02`, lúc MQTT nối). Ở chế độ Bluetooth, điện thoại xác thực xong thì
mạch cũng gửi `0x02` (ngắt Bluetooth thì `0x00`), điều hoà gửi lại đủ tính năng, từng giá trị đi
qua `esp_send` → `ble_state_listener` → app, và log in `BLE state: {...}` như `MQTT accepted`.
Thử trên mạch thật: 25 tính năng về điện thoại trong 10 giây sau khi xác thực.

App: trạng thái thường của khối Bluetooth có hai nút — **Điều khiển gần qua Bluetooth** và **Cài đặt
Wi-Fi** (nối Bluetooth rồi mở luôn form Wi-Fi).

**Nút "Cài đặt Wi-Fi" = luồng cài đặt ban đầu.** App nối Bluetooth (nếu chưa) rồi gửi
`{"method":"startWifiSetup"}`. Mạch trả `ok`, khởi động lại với cờ `force_prov`
(`wifi_prov_request_reprovision`): tắt Bluetooth, phát mạng `mzService_<serial>` và trang cài đặt
`http://172.217.28.1/` (không giới hạn thời gian). Người dùng chọn Wi-Fi ở đó; mạch vào mạng mới ở
chế độ Wi-Fi. Ở chế độ Bluetooth, Wi-Fi tắt hẳn và chỉ bật lại bằng nút này. Thử trên mạch thật:
`provisioned=0 reprovision=1` → `START PROVISION` → `Provisioning AP: mzService_DHL0000010A2`, quét
Bluetooth không còn thấy mạch. (`setWifi` vẫn còn trong firmware cho ai cần gửi mạng thẳng qua Bluetooth.)

## 14. Một luồng điều khiển mỗi lúc, Bluetooth luôn chờ sẵn (29/10/2026)

- Bluetooth **luôn quảng bá chờ** (kể cả khi đang Wi-Fi) để nút "Điều khiển gần qua Bluetooth" nối
  được. Chờ thì không điều khiển gì.
- Điện thoại xác thực Bluetooth đúng mã → `wifi_prov_use_ble`: mạch **tắt Wi-Fi** (hoặc tắt mạng cài
  đặt nếu đang phát), chỉ Bluetooth điều khiển. Nối hỏng thì Wi-Fi vẫn chạy như cũ.
- Mất Wi-Fi 10 giây → chế độ Bluetooth (Wi-Fi tắt), như trước.
- Về Wi-Fi: nút "Cài đặt Wi-Fi" → mạng cài đặt `mzService_…`. Cài xong (hoặc Wi-Fi nhận lại quyền) →
  ngắt điện thoại Bluetooth (`ble_ctl_drop_client`), Bluetooth lại chờ.
- App: có phiên Bluetooth là lệnh đi Bluetooth (`kenhDung`); bỏ hai nút "Ưu tiên Wi-Fi / Dùng Bluetooth".
- Độ trễ: bỏ chờ cứng 1 giây sau mỗi khung UART (chỉ giữ cách nhau 150 ms) và tắt Wi-Fi modem sleep
  (`WIFI_PS_NONE`). Ping tới mạch qua hotspot: trước 3–1663 ms (TB 474 ms), sau 2–56 ms (TB 20 ms);
  khi Bluetooth quảng bá chờ: TB 33 ms, tối đa 79 ms.


## 15. OTA an toàn (29/10/2026)

Bản sao lưu trước khi sửa: `D:\esp\sao-luu\ESP_AirConditioner_C3-truoc-ota-20261029`. Build ở
`D:\esp\build-ota` (sdkconfig chép từ `build-ble-thu`, thêm rollback).

| Lỗi | Sửa |
|---|---|
| Bảng phân vùng `factory` + `ota_0`: chạy `ota_0` rồi thì không còn ô trống, mọi lần OTA sau hỏng (`ESP_ERR_OTA_PARTITION_CONFLICT`) | `partitions.csv` đổi thành `ota_0` + `ota_1`, **giữ nguyên địa chỉ** (0x10000, 0x190000). Chỉ có tác dụng với mạch nạp qua cáp. |
| Mạch đã xuất xưởng (bảng cũ) | `zota.c`: chạy `ota_0` mà không còn ô trống thì ghi dấu `bounce_sha` vào `device_nvs`, khởi động vào ảnh factory; factory tải bản mới vào `ota_0`. Về lại `ota_0` thì dấu chuyển thành `done_sha` (mỗi yêu cầu chỉ vòng một lần). |
| Firebase GET hỏng hoặc thiếu trường `ota` → `xSemaphoreTake(portMAX_DELAY)` treo mãi, MQTT không bao giờ chạy | Bỏ semaphore; `firebase_get_data()` vốn đồng bộ. |
| Điện thoại nối Bluetooth đúng mã giữa lúc tải → `wifi_prov_use_ble` tắt Wi-Fi, bản tải hỏng | `zapp.c` tắt Bluetooth trong lúc `zota_update`, hỏng thì bật lại. |
| Ảnh mới lỗi khởi động → lặp khởi động, không cứu được | Bật `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE`; `zota_open()` (sau khi có Wi-Fi) gọi `esp_ota_mark_app_valid_cancel_rollback()`. Reset trước lúc đó thì về ảnh cũ. Bootloader chỉ thay khi nạp cáp. |

| Firebase có `ota_id` nhưng firmware nhận diện theo URL: thay file ở cùng URL thì mạch coi như đã cập nhật | `zapp.c` gọi `zota_update_with_id(url, ota_id)`. Mạch đã cập nhật theo URL sẽ tải lại **một lần** khi `ota` còn `true`. |

Bộ nhớ: log `Heap before OTA` / `OTA failed` in heap trống, khối liên tục lớn nhất, mức thấp nhất.
Ảnh 0x149890 = 1,35 MB (+2 KB), còn 14 % trống; bootloader 0x5260, còn 36 % trống; DRAM tĩnh dùng
143 704 / 321 296 byte.

Thử trên mạch thật (DHL0000010A2, mạng pnckt): nạp cáp → khởi động `ota_0`, Firebase, MQTT bình
thường. OTA tới DieuHoa.bin (1,27 MB, bản 22/10) qua Dropbox: ghi `ota_1` trong ~64 s, khởi động
`ota_1`, bản cũ báo đã cập nhật, không tải lại. Heap trước OTA: trống 78 180, khối lớn nhất 23 552,
thấp nhất 29 292 byte — **sát**: TLS cần một khối ~16 KB; bước chuyển hướng Dropbox mất ~33 s.
Reset → bootloader rollback về `ota_0` vì bản 22/10 không gọi `esp_ota_mark_app_valid_cancel_rollback`.

OTA lần 2 (`ota_id` V1.0.4, cùng DieuHoa.bin): bản mới ghi `ota_1` rồi khởi động bản 22/10. Bản
22/10 nhận diện theo URL nên tưởng là yêu cầu mới, tải tiếp vào `ota_0` (vẫn đổi ô đúng), nhưng
đứt ở 442 KB (`errno 128`) và OTA hỏng. Nạp lại cáp; bản mới thấy V1.0.4 đã xong, không tải lại.
Tải chậm vì mỗi khung 512 byte in một dòng log (~2 500 dòng mỗi lần tải) → nay chỉ in mỗi 64 KB.

**Quy tắc phát hành:** từ giờ mọi ảnh OTA phải build từ mã có `zota_open()` mới (gọi mark valid);
ảnh cũ chạy được tới lần reset sau rồi tự quay về bản trước.

Còn mở: mạch **đang chạy `ota_0` với firmware cũ** (chưa có đoạn vòng qua factory) không OTA được nữa
— phải nạp cáp. `components/app/ota/ble_ota.c` và `ota.c` không được biên dịch (không nằm trong
`CMakeLists.txt`).

## 16. Đổi chế độ bằng một chạm: hàng nút "Wi-Fi | Bluetooth" (30/10/2026)

Vẫn **một đường điều khiển mỗi lúc**, nhưng người dùng tự chọn và đổi qua lại bằng hàng nút ở đầu khối
điều khiển (`BleDieuKhien`, lớp `.ble-chedo`, dùng lại `.seg-btn`, cao 44 px, `aria-pressed`):

| Đang ở | Bấm | App làm | Mạch (firmware ≥ 1.1.4) làm |
|---|---|---|---|
| Wi-Fi | **Bluetooth** | Hộp chọn / nối ngầm, xác thực mã tem (mã đã nhớ thì không hỏi) | Tắt Wi-Fi, lệnh đi Bluetooth |
| Bluetooth | **Wi-Fi** | Gửi `setWifi {}` rồi ngắt Bluetooth; báo "đang chuyển về Wi-Fi"; không tự nối Bluetooth lại cho tới khi máy có Wi-Fi | Về mạng đã lưu ngay (không khởi động lại), ngắt điện thoại; 30 s không có IP thì bật lại Bluetooth |
| Bluetooth | (điện thoại ngắt / ra khỏi tầm) | — | Thử lại Wi-Fi sau **2 s** (trước: chờ lượt 60 s) |

Lúc khởi động cả hai cùng sẵn: mạch đã có Wi-Fi thì vào Wi-Fi và Bluetooth quảng bá chờ; mạch mới thì
vừa phát mạng cài đặt vừa bật Bluetooth. "Cài đặt Wi-Fi" giờ chỉ để đổi sang mạng khác
(`startWifiSetup`). Bỏ nút "Ngắt Bluetooth" (nút Wi-Fi thay nó).

Thử trên mạch thật (1.1.4): `setWifi {}` → `Back to Wi-Fi mode` và ngắt điện thoại sau 30 ms; mạng
không có → 30 s sau về Bluetooth. Điện thoại bị ngắt → `trying the stored Wi-Fi again` đúng 2,0 s sau.
Test: `ble.mjs` 45/45, `ble-wifi.mjs` 23/23.

### 16.1 Mất Wi-Fi: khung cảnh báo với hai lựa chọn (30/10/2026)

Không có Wi-Fi mà chưa điều khiển qua Bluetooth → khung `.ble-canh-bao` (`role="alert"`, viền vàng):
"Thiết bị mất Wi-Fi" (hoặc "không phản hồi qua Wi-Fi" khi mới nghi), hướng dẫn hai cách và hai nút
44 px: **Điều khiển gần qua Bluetooth** (ở gần, khoảng 10 m) và **Cài đặt Wi-Fi** (vào lại Wi-Fi hoặc
đổi mạng). Không nút chế độ nào sáng khi mất Wi-Fi.

Đã từng ghép Bluetooth (mã tem đã nhớ) → app tự chuyển như trước; trong lúc nối khung báo "đang tự
chuyển sang Bluetooth…", xong thì báo "app đã tự chuyển sang điều khiển qua Bluetooth". Trình duyệt bắt
chạm (không `getDevices`) → khung vẫn hiện, người dùng chạm nút.

Vừa bấm Wi-Fi: 40 s đầu (firmware thử mạng 30 s + vào lại máy chủ) không hiện cảnh báo, chỉ dòng "đang
chuyển về Wi-Fi" khi app chưa thấy Wi-Fi. Test: `ble.mjs` 48/48, `ble-wifi.mjs` 23/23.

### 16.2 Nối tự động không tắt Wi-Fi (firmware 1.1.5, 30/10/2026)

Lỗi gặp khi thử: Wi-Fi đã nối mà mạch vẫn sang Bluetooth, phải "Cài đặt Wi-Fi" mới về. Nguyên nhân: mạch
khởi động lại (hoặc mạng chập chờn) làm nhịp tim ngắt quá `NHIP_TIM_MAT_MS` (15 s) → app tự nối Bluetooth
dự phòng → firmware coi MỌI lần xác thực là người dùng chọn Bluetooth → `wifi_prov_use_ble()` tắt Wi-Fi
vừa nối xong (hoặc đóng luôn mạng cài đặt).

Sửa: `auth` có thêm `"chon": true` khi người dùng tự bấm (`PhienBle.tuChon`: hộp chọn, nút Bluetooth,
"Cài đặt Wi-Fi"); nối tự động (`noiLai` từ khối mất Wi-Fi, `guiQuaKenh`) thì không gửi.
Firmware ≥ 1.1.5: chỉ `chon` mới tắt Wi-Fi / đóng mạng cài đặt và dừng tự thử lại Wi-Fi; phiên tự động
để Wi-Fi chạy tiếp, chế độ Bluetooth vẫn thử lại Wi-Fi mỗi 60 s (`try_stored_wifi`: không ngắt điện thoại
khi bắt đầu thử, chỉ ngắt khi đã có IP). App: có Wi-Fi lại thì tự ngắt phiên tự động; phiên người dùng
chọn thì giữ tới khi họ bấm Wi-Fi. Test: `ble.mjs` 50/50 (kiểm `chon` có/không), `ble-wifi.mjs` 23/23.

Trên mạch (1.1.5, không có Wi-Fi): một kết nối giữ suốt 150 s mà mạch vẫn thử lại Wi-Fi ở giây 75 và
165 (1.1.4 dừng thử khi có điện thoại). Bước xác thực chưa kiểm trên máy tính được: Windows đọc thiếu
dịch vụ GATT (cả với 1.1.4 đã chạy tốt trước đó) — phải thử bằng điện thoại.

## 17. Dọn firmware và tăng độ ổn định (firmware 1.1.6, 03/11/2026)

Bản sao lưu trước khi dọn: `D:\esp\sao-luu\ESP_AirConditioner_C3-truoc-don-20261103` (firmware không có git).

Bỏ code không build hoặc không ai gọi: quạt (`send_frame`), `dc_motor`, `btn`, cảm biến nhiệt, OLED, ESP-NOW,
SmartConfig, `esp_frame`, `utility`, `app/ota`, `desktop.ini`. Bỏ NTP và `zschedule`: không gì đặt lịch, không gì
khác dùng đồng hồ, TLS không kiểm ngày (`MBEDTLS_HAVE_TIME_DATE` tắt), và lịch cũ gửi lệnh tốc độ quạt `0x03`
cho điều hoà. Bỏ `AT`, `AT+GMR`, `AT+CWMODE?` gửi xuống điều hoà lúc khởi động.

| Vấn đề | Sửa |
|---|---|
| `uart_read_bytes(256 byte, 100 ms)` chỉ trả về khi đủ 256 byte hoặc hết hạn: mọi trạng thái điều hoà tới trễ ~100 ms | Ngủ tới byte đầu rồi lấy hết phần đang có |
| Tự nối lại MQTT cả khi Wi-Fi tắt: mỗi lần chặn ~19 s ở DNS, Wi-Fi về rồi MQTT vẫn có thể trễ ~29 s | `disable_auto_reconnect`; `mqtt_app_tick` nối lại ngay khi có IP, rồi mỗi 10 s, không có IP thì không thử |
| Nhịp tim chạy trong `esp_timer`, có thể bị khoá MQTT chặn trong lúc ghi TLS, kéo theo timer Wi-Fi và NimBLE | Task riêng `zapp_tick` |
| `sys_evt` 2304 byte mà nay gọi vào Bluetooth; task UART 4096 byte mà ghi TLS và đẩy Bluetooth | `sys_evt` 4096, UART 6144 |
| Không biết còn bao nhiêu RAM và stack khi chạy thật | Log `Health:` sau 1 phút rồi mỗi 5 phút: heap (trống, thấp nhất, khối lớn nhất), stack còn lại từng task |
| Log `PUBLISHED`, `DISCONNECTED` lặp mỗi lần thử | `PUBLISHED` hạ xuống debug; `DISCONNECTED` chỉ khi đang nối mà rớt |

## 18. Chỉ nối khi nhấn, lần nào cũng hỏi mã; AA 60; `ac_capacity` (firmware 1.1.7, 05/11/2026)

**Đo đường lệnh trên A4** (điều hoà thật, Wi-Fi HOMICHI, máy tính cùng LAN, 19 lệnh `setTempTarget`): app → mạch
trung vị 198 ms (cao nhất 434), mạch → điều hoà báo lại 208 ms (551), mạch → app 150 ms (322), tổng 565 ms (1109). Lệnh
gửi 1,7 s sau khi MQTT vừa nối mất 3,8 s: lúc đó điều hoà đang gửi lại toàn bộ trạng thái. Hai lần có phiên
Bluetooth tự nối trong lúc còn Wi-Fi, MQTT rớt sau 8–10 s (`No PING_RESP`).

**App:** bỏ `noiLai`, `noiTuDong`, `getDevices`, mã tem đã nhớ. Nối chỉ khi nhấn Bluetooth hoặc Cài đặt Wi-Fi: hộp chọn →
nối → nhập mã → `auth` luôn có `chon: true`. Mất Wi-Fi chỉ hiện cảnh báo. Lệnh không tới được máy chủ thì hoàn tác và
báo lỗi; lệnh đã tới máy chủ mà mạch im lặng thì giữ giá trị và cảnh báo.

**AA 60:** trước đây mạch gửi AA 60 ngay khi nhận AB 60 rồi khởi động lại. Giờ chỉ đổi chỗ gửi: khi cài Wi-Fi xong
(`WIFI_PROV_CRED_SUCCESS`) hoặc OTA thành công (ảnh mới đã chạy, `zota_confirm_boot`).

**`ac_capacity`** (W) = `ac_voltage` × `ac_current`, gửi khi có khung 0x77 hoặc 0x78 và đã có đủ hai giá trị. Đây là công
suất biểu kiến, chưa tính hệ số công suất.

## 19. Lưu nhiều mạng Wi-Fi (firmware 1.1.7, 05/11/2026)

Firmware tự lưu tối đa 5 mạng đã từng cấp IP (`wifi_prov.c`, NVS `wifi_list/nets`), mạng dùng gần nhất đứng đầu; đầy thì bỏ mạng
lâu không dùng nhất. Mạng sai mật khẩu không được lưu. Thêm mạng bằng cách cài Wi-Fi như cũ: mạng cũ vẫn giữ.

Mất mạng: thử lại mạng đang dùng trước; hỏng thì quét, chọn mạng đã lưu có sóng mạnh nhất, hỏng tiếp thì mạng kế. Thời gian tới khi sang
Bluetooth là 10 s, cộng 5 s cho mỗi mạng thêm. Ở chế độ Bluetooth vẫn thử lại mỗi 60 s như cũ. Chỉ một mạng thì hành vi như trước.

Chưa làm: màn xem và xoá mạng đã lưu; mạng ẩn tên chỉ thử được khi đang là mạng hiện tại; có mạng lại không tự quay về mạng ưu tiên.
