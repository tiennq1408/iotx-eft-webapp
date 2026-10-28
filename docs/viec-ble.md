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
- App nhớ mã trên máy người dùng (localStorage) sau lần nối đúng đầu tiên; sai thì app xoá và hỏi lại.

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
| `components/ui/device/BleDieuKhien.tsx` | Khối trên màn chi tiết quạt, điều hoà: nút nối, ô nhập mã tem, trạng thái, nút ngắt |
| `components/LivotecApp.tsx` | `guiLenh` / `doiNguon`: có phiên BLE thì gửi qua BLE thay cho `/v1` |
| `hooks/useDuLieuIotx.ts` | Áp trạng thái thiết bị báo qua BLE; giá trị BLE thắng dữ liệu máy chủ khi đang nối |

Khối chỉ hiện khi: trình duyệt có Web Bluetooth, thiết bị là quạt hoặc điều hoà (`productGroup`
là `fan`/`ac`, hoặc `ui.renderer` bắt đầu bằng `fan`/`aircon` — xem `coDuongBle`), không phải
thiết bị ảo, và người dùng có quyền điều khiển. Rời màn chi tiết là ngắt.

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
