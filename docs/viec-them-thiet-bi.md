# Việc: Luồng thêm thiết bị — theo cơ chế web.dev, giữ giao diện local

- Trạng thái: **đã làm 08/10/2026** (dựng lại lần hai sau khi bị revert nhầm; thêm quét camera và ghép nối Bluetooth theo yêu cầu bổ sung)
- Phạm vi: `IOT App - New UI`
- Làm ở đâu: **tab Code**
- Viết: 08/10/2026, sau khi đi hết luồng thêm thiết bị trên `web.dev.happibot.net`

## Mục tiêu

Luồng thêm thiết bị ở webapp local chạy đúng như bản tham chiếu web.dev về **cơ chế**
(chia nhánh, dữ liệu nhập, lời gọi API, xử lý lỗi), nhưng **giữ nguyên giao diện hiện
có** của local: `full-panel`, `panel-head`, thanh `progress`, `method-card`,
`field`, `primary full`, `success-hero`, `finished`.

## Lỗi nặng nhất đang có

`components/manage/AddDevice.tsx:37`:

```tsx
: await iotxClient.claim(name.trim() || code.trim(), code.trim());
```

`name` ở đây là **tên hiển thị người dùng tự đặt ở bước 4** (mặc định `"Quạt mới"`),
còn hợp đồng `/claim` đòi `name` = **tên thiết bị in trên tem**
(`docs/iotx-openapi-extracted.yaml`: "Tên thiết bị in trên tem/QR"). Trên web.dev ô này
ghi rõ `Device name (e.g. fan81029)`.

Nghĩa là **nhánh QR của local hiện không bao giờ nhận được thiết bị** — luôn `404`.
Màn hình chỉ có **một** ô `code` nên cũng không có chỗ nhập tên tem.

## Sự thật đã đo trên web.dev (08/10/2026, tài khoản `p`)

Vào bằng nút **＋ Add device** ở đầu màn Devices. Bảng chọn: *"Which kind are you adding?"*

**Nhánh 1 — "Device with a QR label"** (*"The label shows the device name and a 5-digit
code. Includes WiFi setup over Bluetooth."*) — 6 bước, thanh tiến trình 6 đoạn:

| Bước | Nội dung |
|---|---|
| 1/6 | *"Scan the QR code on the device (or type it in)."* — khung camera, nút **Open camera to scan QR**, và **hai ô**: `Device name (e.g. fan81029)` + `5-digit code on the label` |
| 2/6 | *"Pairing over Bluetooth with fan00000"* — **"The web version simulates this step. Real BLE pairing needs the Flutter app on iOS."** Nút `Paired →` |
| 3/6 | *"The device found these 2.4GHz WiFi networks (it cannot use the 5GHz band)"* — danh sách **mô phỏng** 4 mạng kèm cột cường độ và nhãn `2.4G` |
| 4/6 | Ô mật khẩu Wi-Fi — *"sent straight to the device over Bluetooth, never through the server"*. Nút `Send settings →` |
| 5/6 | *"Device is connecting to the server… Last step: link the device to your account."* Nút `Link to my account` → **gọi `POST /v1/claim`** |
| 6/6 | Chưa đo được (cần một thiết bị chưa có chủ). Suy ra là màn báo thành công. |

**Nhánh 2 — "Real board — enter serial"** (*"WiFi and certificate are already loaded.
You only need the serial printed on the case."*) — **một màn duy nhất**, không có bước
Wi-Fi, không ghép nối, không đặt tên:

- *"Enter the serial printed on the case, or scan the QR label. **The board must be powered on and online.**"*
- khung camera + nút `Scan the QR label`, ô `Serial (vd. 40A00008909)`, nút `Claim this board`
- dòng giải thích: *"Why the board must be online: that is how the system knows you are next to it."*

### Hai lời gọi đo được

| Thao tác | Lời gọi | Kết quả |
|---|---|---|
| `Link to my account` với tên/mã sai | `POST /v1/claim` | `404` |
| `Claim this board` với serial không có | `POST /v1/claim-mach-that` | `400` |

Thân `400` của `/claim-mach-that`, web.dev hiện **nguyên văn** trong khung đỏ dưới ô serial:

> Không nhận được mạch này. Kiểm lại serial in trên vỏ; nếu đúng rồi thì mạch có thể đã thuộc tài khoản khác.

### Điều này chốt luôn một câu hỏi đang treo

Tài liệu `Ket_noi_thiet_bi_WiFi_Bluetooth.md` để ngỏ `name` trong `/claim` là gì.
Đo được rồi: **`name` là tên thiết bị kiểu `fan81029`, KHÔNG phải serial.** Serial chỉ
dùng cho `/claim-mach-that`. Bảng dữ liệu tem ở mục 3.2 của tài liệu đó thiếu cột này
và QR② cũng thiếu — cần bổ sung.

## Cấu trúc đề nghị cho local

Giữ y nguyên lớp CSS và dáng màn hiện có, chỉ đổi số bước và nội dung:

```
bước 0  chọn cách thêm                     (giữ nguyên hai .method-card)
   │
   ├─ QR ─ 1  tên trên tem  +  mã 5 số     ← HAI ô, thay cho một ô `code`
   │       2  ghép nối Bluetooth           ← nói rõ là mô phỏng
   │       3  chọn Wi-Fi 2,4 GHz + mật khẩu ← nói rõ là mô phỏng
   │       4  đặt tên hiển thị + phòng  →  claim(tenTrenTem, maSo)
   │                                       →  updateDevice(label, house, room, grp)
   │       5  xong
   │
   └─ serial ─ 1  serial  →  claimBoard(serial) NGAY
               4  đặt tên hiển thị + phòng  →  updateDevice(...)
               5  xong
```

Nhánh serial **bỏ hẳn** bước Wi-Fi và ghép nối, đúng như web.dev — mạch thật đã có sẵn
Wi-Fi và chứng thư, bắt người dùng đi qua hai màn giả là vô nghĩa.

Vì giờ có ô "tên trên tem" riêng ở bước 1, ô "tên" ở bước 4 trở thành **tên hiển thị**
thuần tuý, không còn lẫn lộn. `claim` lấy tên tem; `updateDevice` lấy tên hiển thị.

## Tệp phải sửa

| Tệp | Sửa gì |
|---|---|
| `components/manage/AddDevice.tsx` | tách ô nhập, sửa lời gọi `claim`, đổi thứ tự bước, nhánh serial đi tắt |
| `lib/newui/strings.ts` | ~6 khoá mới × 3 ngôn ngữ, sửa vài khoá cũ |
| `app/globals.css` | chỉ nếu cần, cố gắng dùng lại lớp sẵn có |
| `tests/them-thiet-bi.mjs` | tệp mới |
| `tests/may-chu-gia.mjs` | thêm `POST /claim` và `POST /claim-mach-that` |
| `tests/chay.mjs` | thêm bài mới vào nhóm `api` |

## Các bước

1. **Tách ô nhập ở bước 1 (nhánh QR).** Thay state `code` bằng `tenTem` và `maSo`.
   Chặn `Tiếp tục` khi `maSo` không đúng 5 chữ số. Bỏ giá trị gieo sẵn
   `MAC_DINH.ma = "LV-SB614-2026"` — nó trông như serial và dạy người dùng sai.
2. **Sửa lời gọi claim:**
   ```tsx
   const claimed = method === "serial"
     ? await iotxClient.claimBoard(serial.trim())
     : await iotxClient.claim(tenTem.trim(), maSo.trim());
   ```
3. **Dùng `dangNoi` ở nhánh serial.** `claimBoard` trả `{ok, id, name, type, dangNoi}`;
   local đang bỏ qua `dangNoi`. Nếu `dangNoi === false` thì nhận xong vẫn nhắc một dòng
   "đã nhận nhưng chưa thấy mạch online — kiểm tra nguồn và Wi-Fi".
4. **Nói thật về phần mô phỏng.** Hai bước Bluetooth và danh sách Wi-Fi ở nhánh QR là giả
   — web.dev ghi thẳng điều đó lên màn. Local cũng phải ghi, bằng chữ của local. Danh
   sách `MANG_WIFI` cắm cứng và ô mật khẩu hiện **thu rồi vứt đi**, không gửi đi đâu;
   đừng để người dùng tưởng là thật.
5. **Nhánh serial đi tắt:** bước 1 gọi `claimBoard` ngay, thành công thì nhảy tới bước đặt
   tên, bỏ qua Wi-Fi và ghép nối.
6. **Thanh tiến trình theo nhánh.** Đầu màn đang in cứng `{n}/5` và `[0,1,2,3,4].map`.
   Nhánh serial ít bước hơn — tính theo nhánh thay vì cố định 5.
7. **Giữ nguyên cách báo lỗi hiện có của local** (`moTaLoi` + `.form-message`). Xem mục
   "Không chép" bên dưới.
8. **Chuỗi mới** (ba ngôn ngữ vi/en/tl):
   `add.tenTem`, `add.tenTemPh` ("vd. fan81029"), `add.maSo`, `add.maSoPh`
   ("Mã 5 số trên tem"), `add.moPhong` ("Bản web mô phỏng bước này — ghép nối Bluetooth
   thật cần app di động"), `add.machPhaiOnline` ("Mạch phải đang cắm điện và online"),
   `add.chuaOnline`. Sửa `add.wifiPassPh` — chú thích "bản mock" hiện sai ngữ cảnh.

## Bổ sung sau khi làm xong (08/10/2026, theo yêu cầu thêm)

- **Quét bằng camera** ở cả hai nhánh (`components/manage/QuetQR.tsx`): `getUserMedia` →
  `BarcodeDetector` nếu có, không thì jsQR. Nội dung tem đọc bằng `lib/newui/qrTem.ts` theo
  §3.2 của `Ket_noi_thiet_bi_WiFi_Bluetooth.md` (mã ② `#sn=…&c=…`, mã ① `WIFI:…`, JSON, chuỗi rời).
- **Ghép nối Bluetooth theo tên tem** ở bước 2 nhánh QR khi trình duyệt có Web Bluetooth
  (`requestDevice` lọc theo tên tem, tên `PROV_…`, tiền tố `PROV_`); không có (iPhone,
  Firefox, hoặc trang mở qua `http://` không phải localhost) thì nói rõ và mô phỏng. Gửi
  Wi-Fi qua `prov-config` vẫn mô phỏng — chưa có đặc tả Security 2 từ firmware.
- Bài kiểm thêm: `tests/quet-ma.mjs` (camera giả của Chromium, hai nhánh Bluetooth).

## Hai lỗi của web.dev — **KHÔNG chép**

1. **Nhánh QR nuốt lỗi.** Khi `/claim` trả `404`, web.dev **nhảy ngược về bước 1/6 và
   không hiện chữ nào** — tôi đã soi cả cây DOM, không có thông báo ở đâu. Người dùng
   không biết mình sai mã hay thiết bị đã có chủ. Nhánh serial thì lại hiện lỗi đàng
   hoàng. Local hiện đã hiện lỗi đúng — **giữ nguyên, đừng bắt chước**.
2. **Lỗi chữ:** web.dev có hai chỗ dính chữ do nối chuỗi thiếu dấu cách —
   `"never through the server.Bluetooth."` và `"next to it.Knowing the serial…"`.

## Cách kiểm chứng

```bash
npx tsc --noEmit
npm run lint
npm run build
node tests/chay.mjs api
```

Bài kiểm mới `tests/them-thiet-bi.mjs` (máy chủ giả cần thêm hai cửa claim):

1. Nhánh QR, nhập tên tem `fan81029` + mã `12345` → máy chủ giả nhận đúng
   `{name:"fan81029", secret:"12345"}`, **không phải** tên hiển thị.
2. Máy chủ giả trả `404` → màn **vẫn ở bước đang đứng** và **hiện câu lỗi chung**.
3. Nhánh serial: nhập serial → gọi `POST /claim-mach-that` ngay, **không** qua màn Wi-Fi.
4. Máy chủ giả trả `400` kèm `message` tiếng Việt → hiện **nguyên văn** câu đó.
5. `claimBoard` trả `dangNoi:false` → có dòng nhắc mạch chưa online.
6. Nhận xong → có `PATCH /devices/{id}` mang `label` = **tên hiển thị**, kèm `house`,
   `room`, `grp`.
7. Mã 5 số nhập 4 chữ số → nút tiếp tục khoá.

Soi mắt: ở bề rộng 390px không tràn ngang, mọi nút ≥44px, và thanh tiến trình nhánh
serial không hiện 5 chấm trong khi chỉ đi 3 bước.

## Ràng buộc (AGENTS.md)

- Đọc `docs/IOTX-INTEGRATION.md` trước khi đụng phần nhận thiết bị.
- `404` của `/claim` **cố ý nhập nhằng** — chỉ được nói một câu chung, không phân biệt
  sai mã / đã có chủ. `moTaLoi` đã làm đúng, đừng "cải tiến".
- `400` của `/claim-mach-that` thì ngược lại: hiện **nguyên văn** `message` của máy chủ.
- Vùng chạm ≥44px, không tràn ngang, tương phản đạt WCAG.
- Chạy `npm run lint` và `npm run build` trước khi bàn giao.

## Không làm

- ❌ Đổi giao diện sang giống web.dev. Chỉ lấy cơ chế; dáng màn giữ của local.
- ❌ Chép hai lỗi của web.dev ở mục trên.
- ❌ Dựng Web Bluetooth thật. iPhone không chạy được — xem phân tích trong
  `Ket_noi_thiet_bi_WiFi_Bluetooth.md`. Bước ghép nối vẫn là mô phỏng, chỉ cần nói thật.
  *(Đã nới 08/10: ghép nối thật khi trình duyệt có Web Bluetooth, mô phỏng ở nơi khác.)*
- ❌ Gửi mật khẩu Wi-Fi lên máy chủ. Nó không được rời khỏi máy người dùng.
- ❌ Giữ giá trị gieo sẵn `LV-SB614-2026` và danh sách `MANG_WIFI` như dữ liệu thật.
