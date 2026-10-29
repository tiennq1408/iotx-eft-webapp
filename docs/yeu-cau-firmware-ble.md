# Yêu cầu firmware: điều khiển thiết bị qua Bluetooth (BLE)

*Gửi: đội firmware · Từ: đội webapp Livotec Home · 28/10/2026*
*Tự chứa — không cần đọc tài liệu nào khác.*

---

## 0. Tóm tắt một đoạn

Cần mạch mở một **GATT server BLE** để điện thoại nối thẳng vào và điều khiển, **không qua Internet, không qua Wi-Fi**.

Phía điện thoại là **webapp Livotec đã cài dạng app (PWA)** trên Android — nó đã mang sẵn giao diện và catalog trong máy, nên **BLE chỉ chở trạng thái và lệnh**, không chở giao diện, không chở ảnh. Dữ liệu rất nhỏ.

Lệnh giữ **nguyên văn** thứ mạch đang nhận qua MQTT hôm nay, nên phần xử lý lệnh không phải viết lại — chỉ thêm một cửa vào.

*Ghi nhận: nghe nói chip đã phát được BLE. Nếu đó là `network_provisioning` ở chế độ BLE thì đó là service khác, nhưng nghĩa là trong máy **đã có NimBLE + protocomm** — phần nền đã xong.*

---

## 1. Một câu xin trả lời trước

**Mạch đang quảng bá service gì?** Nếu đã bật `network_provisioning` chế độ BLE thì cho biết nó đang chiếm bao nhiêu RAM, và mục 2 có dùng lại được stack đó không.

Kèm hai số xin đo giúp: **RAM trống** trước và sau khi bật BLE (`esp_get_free_heap_size()`), và **flash còn trống**.

---

## 2. Hợp đồng GATT — một service, năm characteristic

Dùng **NimBLE** (nhẹ hơn Bluedroid, và mình không cần Bluetooth Classic).

**Service UUID:** `0000b77b-8b45-4e98-8517-ab86cddd0995`

| Characteristic | UUID | Thuộc tính | Dùng để |
|---|---|---|---|
| `info` | `0001b77b-…` | **Read** | Nhận dạng mạch |
| `state` | `0002b77b-…` | **Notify** | Mạch đẩy thay đổi trạng thái |
| `cmd` | `0003b77b-…` | **Write Without Response** | Điện thoại gửi lệnh / yêu cầu |
| `resp` | `0004b77b-…` | **Notify** | Mạch trả lời cho `cmd` |
| `seq` | `0005b77b-…` | **Read + Notify** | Số thứ tự trạng thái, 4 byte |

*(Phần `…` giống hệt service UUID. Năm characteristic chỉ khác 4 chữ số đầu.)*

**Vì sao `cmd` và `resp` tách đôi:** BLE không có khái niệm "trả lời". Viết vào một characteristic chỉ là viết, không có chỗ nhét câu trả lời. Nên một lượt hỏi-đáp là hai nhịp: điện thoại **ghi** `cmd`, mạch **đẩy** `resp`.

### 2.1 `info` — Read

```json
{"serial":"LV-FAN-000123","model":"fan_sbi314","label":"Quạt phòng khách","fw":"1.4.2"}
```

`model` phải đúng mã sản phẩm trong catalog (`fan_sbi314`, `ac_1`…). Không có `label` thì trả `null`.

### 2.2 `cmd` — Write Without Response

Bốn loại yêu cầu, phân biệt bằng `op`:

```jsonc
{"op":"auth",  "chuKy":"<base64 HMAC-SHA256>"}        // bắt tay, xem mục 3
{"op":"state", "offset":0}                             // xin trạng thái đầy đủ
{"op":"rpc",   "id":7, "khoa":"8f3a1c7e",              // lệnh điều khiển
               "method":"setSpeed", "params":{"speed":5}}
{"op":"ping"}                                          // giữ kết nối
```

`id` là số do điện thoại đặt, mạch **trả lại nguyên vẹn** trong `resp` để ghép cặp hỏi-đáp.
`khoa` là `Idempotency-Key` — BLE không có header nên nó nằm trong thân.

### 2.3 `resp` — Notify

```jsonc
{"id":7,"ok":true,"seq":1833,"v":{"power":"on","speed":5,"mode":"normal"}}
{"id":7,"ok":false,"loi":"unauthorized"}
```

**Bắt buộc trả luôn `v`** sau khi thi hành. Không trả thì điện thoại phải hỏi lại, và trên sóng BLE chập chờn người dùng sẽ thấy nút nhảy về giá trị cũ rồi mới đúng — lỗi này đã gặp thật trên web.

### 2.4 `state` — Notify

Đẩy **chỉ thứ vừa đổi**, không đẩy cả khối:

```json
{"seq":1834,"v":{"speed":6}}
```

Đẩy mỗi khi trạng thái đổi **dù lệnh đến từ đâu** — app, điều khiển cầm tay, nút trên máy, hẹn giờ nội bộ.

### 2.5 Giới hạn 512 byte và cách cắt mảnh

Mỗi characteristic tối đa **512 byte**. Lệnh và thông báo delta thoải mái. Nhưng **trạng thái đầy đủ** của máy lạnh (`ac_1`, 29 thuộc tính) khoảng **700 byte** — vượt.

Nên `{"op":"state"}` trả về qua `resp` theo mảnh:

```json
{"id":3,"ok":true,"manh":0,"cuoi":false,"payload":"…"}
{"id":3,"ok":true,"manh":1,"cuoi":true,"payload":"…"}
```

Điện thoại nối các `payload` lại rồi mới phân tích JSON. Quạt `fan_sbi314` (8 thuộc tính) lọt **một mảnh**; máy lạnh **hai mảnh**.

Chỉ cần cắt mảnh ở đây. Phía bên kia, Web Bluetooth tự lo tầng dưới nên điện thoại làm việc ở đơn vị 512 byte, không phải 20 byte.

---

## 3. Bắt tay bảo mật — bắt buộc, và không phụ thuộc Internet

Không có bước này thì **ai trong tầm sóng cũng mở một trang web và điều khiển được** thiết bị trong nhà khách.

### 3.1 Cách làm

1. Nhà máy sinh một **bí mật ngẫu nhiên riêng từng mạch** (16 byte), ghi NVS, **in lên tem dạng mã QR**.
2. Lần đầu dùng, khách quét QR trên tem; app nhớ theo serial, lần sau không hỏi lại.
3. **Ngay khi nối**, mạch sinh một **nonce ngẫu nhiên 16 byte** và đẩy qua `resp`:
   ```json
   {"op":"nonce","giaTri":"<base64 16 byte>"}
   ```
4. Điện thoại ghi vào `cmd`: `{"op":"auth","chuKy":"<base64 HMAC-SHA256(biMat, nonce)>"}`
5. Mạch tính lại và so. **Khớp** → `{"ok":true}`, mở khoá. **Sai hoặc quá 10 giây** → **ngắt kết nối**.
6. Trước khi bắt tay xong, mọi `op` khác trả `{"ok":false,"loi":"unauthorized"}`.

### 3.2 Vì sao HMAC chứ không so mật khẩu trực tiếp

**Bí mật không bao giờ đi qua sóng.** Ai nghe lén chỉ thấy nonce và chữ ký; dùng lại không được vì nonce đổi mỗi lần nối.

### 3.3 Hai điều đã biết và chấp nhận

- Đường truyền **không mã hoá** ở tầng BLE, nên người nghe lén **đọc được trạng thái** (tốc độ quạt, nhiệt độ). Với sản phẩm này chấp nhận được. Nếu bật **LE Secure Connections** rẻ thì bật, nhưng **không bắt buộc**.
- Mất mạng thì mạch **không kiểm tra thu hồi được**. Bí mật trên tem là bí mật lâu dài; mất tem là mất quyền kiểm soát thiết bị đó.

### 3.4 Điều kiện chặn cứng

**Bí mật phải riêng từng mạch.** Hiện mọi mạch dùng chung `mzService` / `mz12345678`. Dùng chung thì ai biết một con là điều khiển được **mọi con Livotec trong tầm sóng** — và ở đường BLE **không có mật khẩu Wi-Fi làm hàng rào** như đường AP. Đây là hàng rào duy nhất.

---

## 4. Từ vựng lệnh — không phải đặt mới

`method` và `params` lấy thẳng từ catalog: `method` là trường `rpc` của capability, `params` là `{ <key của capability>: giá trị }`. **Đúng thứ mạch đang nhận qua MQTT hôm nay**, nên chỉ cần đưa vào cùng bộ xử lý lệnh đã có.

| Sản phẩm | `key` | `kind` | `rpc` | Thân gửi xuống |
|---|---|---|---|---|
| `fan_sbi314` | `power` | onoff | `setPower` | `{"method":"setPower","params":{"power":"on"}}` |
| `fan_sbi314` | `speed` | level 0–12 | `setSpeed` | `{"method":"setSpeed","params":{"speed":5}}` |
| `fan_sbi314` | `mode` | enum `normal·breeze·sleepy·turbo` | `setMode` | `{"method":"setMode","params":{"mode":"breeze"}}` |
| `ac_1` | `ac_temp_setting` | level 16–31 | `setTempTarget` | `{"method":"setTempTarget","params":{"ac_temp_setting":24}}` |
| `ac_1` | `ac_ope_mode` | enum `Cool·Dry·Fan·Auto` | `setMode` | `{"method":"setMode","params":{"ac_ope_mode":"Cool"}}` |

---

## 5. `seq` và chống lặp lệnh

### 5.1 `seq`

Số nguyên **tăng dần do mạch sinh**, tăng mỗi lần trạng thái đổi, **bất kể lệnh đến từ đâu** — BLE, HTTP, MQTT, điều khiển cầm tay, nút trên máy.

**`seq` không được giảm sau khi khởi động lại.** Cơ chế tuỳ đội firmware (ghi NVS định kỳ, hoặc ghép số lần khởi động vào byte cao). Không có Internet thì **`seq` là thứ duy nhất phân xử được bên nào mới hơn** khi mạng về.

### 5.2 `Idempotency-Key`

Mạch nhớ **16 khoá gần nhất** (~600 byte RAM). Gặp lại khoá cũ thì **trả kết quả cũ, không thi hành lần hai**.

Sóng BLE đứt giữa chừng là chuyện thường, điện thoại sẽ gửi lại — thiếu chỗ này là bấm một lần tăng hai nấc.

---

## 6. Hàng đợi báo lên đám mây

Trong kịch bản này **mạch không có Internet** lúc nhận lệnh BLE. Nên:

1. Thi hành
2. Tăng `seq`
3. Trả `resp` qua BLE
4. **Giữ lại trạng thái mới + `seq`**; khi nào có mạng thì đẩy lên máy chủ

Thực ra chỉ cần giữ **trạng thái cuối cùng và `seq` cuối cùng** — đó là thứ đám mây cần để đồng bộ. Hàng đợi đầy đủ chỉ cần nếu sau này muốn lịch sử.

**Thiếu bước 4 thì:** mạng về, đám mây vẫn giữ trạng thái cũ, máy chủ "đồng bộ" ép xuống, và **quạt tự đổi về tốc cũ ngay trước mặt người dùng**. Lỗi này rất khó chịu và rất khó giải thích.

---

## 7. Khi nào bật BLE

Đề xuất: **quảng bá liên tục, công suất thấp**, với hai ngoại lệ:

- Khi mạch **đang phát SoftAP** và có máy nối (chế độ trang điều khiển cục bộ) → **tắt BLE**. Bảng coexistence của Espressif đánh dấu SoftAP-đã-nối + BLE là `C1` — *hỗ trợ nhưng hiệu năng không ổn định*. Hai đường loại trừ nhau.
- Khi ở **STA** hoặc **không có Wi-Fi** → `Y`, chạy chung thoải mái.

Nếu vẫn chạy chung, cấu hình bắt buộc: bật `CONFIG_ESP_COEX_SW_COEXIST_ENABLE`; đặt task controller và host BT **cùng một CPU**, task Wi-Fi ở **CPU kia** (`CONFIG_BT_NIMBLE_PINNED_TO_CORE_CHOICE` / `CONFIG_ESP_WIFI_TASK_CORE_ID`).

**Quảng bá phải kèm serial trong Manufacturer Data**, để webapp lọc hộp thoại chọn thiết bị của Chrome xuống đúng một máy — khách bấm một phát thay vì dò trong danh sách.

Tên quảng bá: `LIVOTEC-A1B2C3` (3 byte cuối MAC).

---

## 8. Những gì **không** yêu cầu

- ❌ **Chở giao diện, bố cục, hay ảnh qua BLE.** PWA đã có sẵn catalog trong máy.
- ❌ **Bonding / lưu khoá ghép nối BLE.** Bắt tay HMAC ở mục 3 làm việc đó rồi.
- ❌ **Chạy nền.** Không nối thì không cần làm gì ngoài quảng bá.
- ❌ **Nhiều điện thoại cùng lúc.** Một máy một lúc là đủ.
- ❌ **Hẹn giờ, kịch bản, chia sẻ, thêm thiết bị mới** qua BLE.
- ❌ **Bluetooth Classic.** Chỉ BLE, nên dùng NimBLE.

---

## 9. Nghiệm thu

| # | Việc | Đạt khi |
|---|---|---|
| 1 | Quét bằng nRF Connect trên Android | Thấy `LIVOTEC-xxxxxx`, có service `0000b77b-…`, đủ 5 characteristic |
| 2 | Đọc `info` | Trả JSON đúng serial và model |
| 3 | Gửi `op:"rpc"` **trước khi** bắt tay | Trả `{"ok":false,"loi":"unauthorized"}`, **không** thi hành |
| 4 | Bắt tay sai chữ ký | Mạch **ngắt kết nối** |
| 5 | Bắt tay đúng rồi `setSpeed` | Quạt đổi tốc **dưới 100 ms**, `resp` có `v` và `seq` mới |
| 6 | Gửi lại **đúng khoá cũ** | Trả kết quả cũ, **không** tăng thêm một nấc |
| 7 | Bấm nút trên thân máy | `state` tự đẩy sang điện thoại, `seq` tăng |
| 8 | `op:"state"` trên máy lạnh `ac_1` | Về **2 mảnh**, ghép lại ra JSON hợp lệ |
| 9 | Rút điện mạch rồi cắm lại, đọc `seq` | **Lớn hơn** giá trị trước khi rút |
| 10 | Điều khiển qua BLE lúc không mạng, rồi cho mạng về | Máy chủ nhận trạng thái mới, **không** ép giá trị cũ xuống |
| 11 | Mạch đang phát SoftAP có máy nối | BLE đã tắt |
| 12 | Hai mạch cạnh nhau | Mỗi con một bí mật khác nhau; chữ ký của con này **không** mở được con kia |

Bước 3, 6, 9, 10 và 12 hay bị bỏ nhất, và là năm bước duy nhất có thể làm hỏng sản phẩm đã xuất xưởng.

---

## 10. Việc nhà máy đi kèm

| | Việc |
|---|---|
| 1 | Sinh **bí mật ngẫu nhiên 16 byte riêng từng mạch**, ghi NVS |
| 2 | **In mã QR** chứa bí mật đó lên tem, cạnh serial |
| 3 | Tên quảng bá riêng từng mạch: `LIVOTEC-` + 3 byte cuối MAC |

Việc 1 và 3 đã nằm trong tài liệu cấp Wi-Fi từ 08/10 nhưng **chưa thực thi**. Giờ nó là điều kiện chặn của cả tính năng này.
