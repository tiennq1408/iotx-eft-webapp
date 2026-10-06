# Giao diện mới (theo `livotec-home-new-ui.html`)

Bản prototype HTML mới đã được chuyển thành React components thật. Tài liệu này ghi lại
cách ánh xạ, những chỗ cố ý làm khác prototype, và các lỗi đã sửa khi chuyển.

## Bố cục mã

| Việc | Tệp |
|---|---|
| Vỏ ứng dụng, 5 màn chính, modal, SSE, bootstrap | `components/LivotecApp.tsx` |
| Thanh trên, nav dưới, tấm trượt, hàng cờ | `components/newui/shell.tsx` |
| Banner, hàng lọc, thẻ thiết bị, dòng trạng thái | `components/newui/home.tsx` |
| Màn chào / đăng nhập | `components/newui/LoginScreen.tsx` |
| Drawer menu, hồ sơ, thông báo, chọn phòng, thêm thiết bị | `components/newui/modals.tsx` |
| Bộ icon một nét | `components/newui/Icon.tsx` |
| Bảng chữ 3 ngôn ngữ (dự phòng cho `/i18n`) | `lib/newui/strings.ts` + `components/newui/chu.tsx` |
| Chọn màn điều khiển theo sản phẩm | `lib/newui/uiType.ts` |
| Màn điều hòa (dial, đặc biệt, 114 tính năng) | `components/newui/device/AirconDetail.tsx` |
| Lọc nước / quạt / bếp từ / nồi cơm / bình nóng lạnh | `components/newui/device/DeviceDetail.tsx` |
| Sản phẩm lạ → màn chung theo capability | `components/device/DynamicDevicePanel.tsx` |
| Nhà/Phòng/Nhóm, Thành viên, Hẹn giờ, Kịch bản, wizard thêm thiết bị | `components/legacy/panels.tsx` |
| Catalog giả cho chế độ mock | `lib/newui/mockCatalog.ts` |

## Dữ liệu: prototype → API thật

Prototype cắm cứng 6 thiết bị với `uiType` cố định. Bản này **không** cắm cứng:

1. Thiết bị đến từ `GET /bootstrap` (và `GET /devices` sau khi SSE nối lại).
2. `lib/newui/uiType.ts` chọn màn điều khiển theo thứ tự
   `product.ui.renderer` → `product.ui.archetype` → `product.category` → `type/model` → tên.
3. Mỗi khối điều khiển tra capability theo danh sách tên khóa có thể gặp
   (`temp` / `setTemp` / `nhietDo`…). **Không tìm thấy capability thì ẩn hẳn khối đó**,
   thay vì vẽ một control không gửi được lệnh.
4. Sản phẩm lạ, `product = null`, hoặc catalog không khai capability nào → rơi về
   `DynamicDevicePanel`. Không màn nào trắng.
5. Mọi lệnh đi qua `POST /devices/{id}/rpc` với `Idempotency-Key` (đã có sẵn trong
   `lib/iotx/client.ts`), có optimistic UI và rollback khi máy chủ từ chối.
6. `perms.control === false` hoặc thiết bị ngoại tuyến → control bị khoá, không ẩn.

Chế độ `NEXT_PUBLIC_IOTX_MODE=mock` dùng `lib/newui/mockCatalog.ts`: đúng 6 thiết bị của
prototype, **kèm capabilities đầy đủ**, nên bản mock và bản nối IBS chạy cùng một đường mã.

## Tài sản

Prototype nhúng ~700KB ảnh base64 và 97KB JSON vào mã chạy. Đã tách:

- ảnh → `public/images/livotec/*` (21 tệp), tham chiếu qua `lib/newui/assets.ts`;
- 114 tính năng điều hòa × 3 ngôn ngữ → `public/data/ac-features.<lang>.json`,
  **chỉ tải khi mở màn "Tính năng nâng cao"** (`lib/newui/acFeatures.ts`).

## Cố ý làm khác prototype

| Prototype | Bản này | Lý do |
|---|---|---|
| Đăng nhập điền sẵn `Ngocthuy` / `123`, bấm là vào | Ô trống, gọi `POST /auth/login` \| `/auth/register` | Đây là app thật, không phải bản demo |
| Nút quét khuôn mặt cho vào thẳng | Chạy hiệu ứng rồi báo "chưa có ở máy chủ" | `/v1` chưa có cửa nhận diện khuôn mặt; không dẫn người dùng tới chỗ không có gì |
| Tên thiết bị lấy từ khoá `dev_ac1`… | Lấy `label` của thiết bị | Tên do người dùng đặt, không dịch được |
| Thẻ máy lọc nước không có công tắc (cắm cứng) | Không có công tắc vì catalog không khai `power` | Cùng kết quả, nhưng theo dữ liệu |
| Núm trên vành nhiệt độ đứng yên một chỗ | Núm chạy theo nhiệt độ trên cung 270° | Núm đứng yên khi giá trị đổi là lỗi giao diện |
| Chế độ/tốc độ đang chọn dùng cam nhạt `#E8A87C` + chữ trắng | Nền `#A85B22` | Trắng trên `#E8A87C` chỉ đạt ~1,9:1; cổng kiểm IOTX yêu cầu 4,5:1 |
| Các vạch tick đều một màu | Vạch sáng dần theo nhiệt độ | Cho biết đang ở đâu trong dải 16–30°C |
| "Thêm thiết bị" chỉ hiện toast giả lập | Dẫn vào wizard ghép nối 5 bước có thật | Đã có sẵn `POST /claim`, `/claim-mach-that` |
| Không có Thành viên / Hẹn giờ / Kịch bản / Thiết bị ảo | Giữ nguyên, mở từ drawer menu | Các màn này đã nối API; bỏ đi là mất tính năng |

## Lỗi của prototype đã chặn khi chuyển

- `handleAction` đọc `state.modal.id` cho mọi lệnh điều hòa/quạt/bếp — bấm khi `modal`
  đã đóng là ném `TypeError`. Bản React truyền thẳng `device` vào panel nên không có
  đường nào đọc trúng `null`.
- `fan-speed` đặt `d.on = d.params.speed > 0` nhưng `toggle-power` lại không đụng tới
  `speed`: tắt quạt xong tốc độ vẫn hiện 3. Bản này để `power` và `speed` là hai
  capability riêng, mỗi cái một lệnh RPC.
- Banner chạy bằng `setInterval` sửa thẳng DOM; sau mỗi `render()` các lớp `active` bị
  ghi đè nên ảnh nhảy lung tung. Bản này để chỉ số banner trong state React.
- Vòng lặp `setInterval` không bao giờ bị dọn. Bản này dọn trong `useEffect`.
- `ac-adv-prev/next` chạy vòng qua cả 114 mục, nhưng nhãn nhóm ở đầu màn không đổi theo
  — đã sửa: tiêu đề lấy theo nhóm của chính mục đang xem.

## Kiểm tra đã chạy

- `npm run lint` — sạch.
- `npx tsc --noEmit` — sạch.
- `npm run build` — thành công (chạy trong môi trường linux; `node_modules` trên máy Mac
  không có SWC cho linux nên build trên máy Mac dùng `node_modules` của máy đó).
- Playwright ở 320 / 360 / 390 / 430 px: không cuộn ngang, không vùng chạm dưới 44px,
  không request lỗi, 15 nhóm × 114 tính năng tải đúng.

---

# Biên bản soát lỗi (vòng 2)

Soát ba mặt: giao diện, logic, đấu nối API. Cách làm: đọc mã đối chiếu
`docs/IOTX-API-REFERENCE.md` + `docs/iotx-openapi-extracted.yaml`, chạy 65 kịch bản bấm
thật bằng Playwright ở chế độ mock, và đo vùng chạm / tương phản bằng máy trên 20 trạng
thái màn hình (kể cả các panel kế thừa).

## Đã sửa

### Logic và đấu nối API

| Lỗi | Sửa |
|---|---|
| `doiNguon` đoán `setPower` / khoá `power` khi sản phẩm không khai nguồn điện — gửi một lệnh chắc chắn bị máy chủ từ chối | Không khai nguồn thì không gửi gì; lạc quan UI cũng ghi đúng khoá của capability |
| `giaTriEnum` trả về tên chế độ tự nghĩ ra khi catalog chưa khai `values` | Trả `undefined`; khối chế độ / tốc độ gió tự ẩn thay vì gửi mã lạ |
| Màn điều hòa vẽ vòng dial ở 16°C khi thiết bị chưa báo số đo — trông như một giá trị thật | Chưa có số đo thì hiện ảnh + một dòng nói rõ chưa có số đo |
| Trần luật cắm cứng 20 | Lấy `theme.quotas.rules` từ `/me`, thiếu mới về 20 |
| Mục menu "Hẹn giờ & kịch bản" trỏ vào `smart`, làm màn `Timers` không có đường nào mở | Tách thành hai mục: Hẹn giờ thiết bị và Kịch bản theo thời gian |
| Không còn đường gỡ thiết bị khỏi danh sách (bản cũ có nút xoá trên thẻ) | Thêm nút "Ẩn thiết bị khỏi danh sách" trong màn chi tiết, hỏi lại một lần, tôn trọng `perms.delete` |
| `VirtualPanel` gọi `/virtual` và `/virtual/places` cả khi chạy mock → hai lỗi 403 mỗi lần mở | Chế độ mock không gọi, hiện một dòng nói rõ màn này cần nối IBS |
| `favicon.ico` 404 | Thêm `app/icon.png` |

### Giao diện

| Lỗi | Sửa |
|---|---|
| Nút đặc màu `--teal` + chữ trắng chỉ đạt 3,4:1 (Thêm thiết bị, Nếu–Thì, Chia sẻ, Tạo, Lưu…) | Các nút có chữ trắng dùng `--teal-dark`, nay là `#0A6A61` (trắng trên nền này 6,5:1) |
| Chữ teal trên nền `--teal-soft` đạt 4,38:1 | Cùng một lần làm đậm `--teal-dark` → 5,6:1 |
| Chữ `.segment button` 4,45:1 và chỉ cao 42px | Đổi màu `#495956`, cao 44px |
| Hero "Khám phá": chữ trắng trên đầu dải teal sáng 3,5:1 | Dải đổi thành `#0A776C → #08403C` (7,6:1 đo bằng ảnh chụp) |
| Màn chào: chữ trắng trên dải cam nhạt 1,3:1 — gần như không đọc được | Giữ hướng cam → teal nhưng phủ tối dần từ chỗ bắt đầu có chữ; đo lại bằng ảnh chụp: tiêu đề 5,0:1, phụ đề 6,1:1, tab 10,0:1 |
| `.login-seg button` cao 40px; `.ac2-sp-switch` cao 30px; công tắc trong panel kế thừa 38×23px | Nới lên 44px (công tắc nhỏ dùng lớp `::before` trong suốt, không đổi hình vẽ) |
| **CSS của trình soạn Nếu–Thì bị bỏ quên khi chuyển**: `.rule-row`, `.rule-row-head`, `.rule-add`, `.rule-grid.two/.four`, `.cho-sau`, `.smart-editor` không có luật nào | Bổ sung đầy đủ theo bảng màu mới; nút xoá từng dòng nay đủ 44px |
| Tên thiết bị ảo sửa bằng `<strong onClick>` — bàn phím không tới được | Đổi thành `<button class="ao-ten">` |
| Lưới về một cột ngay ở 360px, hẹp hơn bản thiết kế | Ngưỡng hạ xuống 330px; 360px vẫn hai cột |

## Kết quả đo lần cuối

- 65/65 kịch bản bấm thật đạt; **không còn lỗi console hay HTTP nào** trong toàn bộ luồng.
- 20/20 trạng thái màn hình: không còn vùng chạm nào dưới 44px.
- Tương phản: mọi cảnh báo còn lại của bộ đo là dương tính giả (chữ nằm trên `background-image`
  nên bộ đo không thấy nền thật). Đo lại bằng cách lấy màu pixel của nền: 5,0 – 10,0:1.
- Không cuộn ngang ở 320 / 360 / 390 / 430px.
- `npm run lint`, `npx tsc --noEmit`, `npm run build` đều sạch.

## Còn nợ (đã làm xong ở vòng 3 — xem dưới)

1. **Hẹn giờ và Kịch bản chỉ ghi `localStorage`** — chưa nối `/devices/{id}/hen-gio/*`.
   Hợp đồng còn yêu cầu đọc `batDuoc` để giấu màn hẹn giờ với sản phẩm không hỗ trợ, và
   người được chia sẻ phải nhận `404`.
2. **`GET /tenant/theme` chưa được gọi** — logo, màu chính và `loginMethods` của hãng chưa
   chi phối giao diện; hiện màu đang cắm trong CSS.
3. **Chưa dùng `ETag` / `If-None-Match`** cho `/bootstrap`, `/products`, `/i18n`; mới chỉ
   so nhãn `phienBan`.
4. **Capability kiểu `list`** (`POST /devices/{id}/muc/{cap}`) chưa có giao diện — màn máy
   lọc nước mới chỉ đọc tuổi thọ lõi, chưa thay/đặt lại được.
5. **`/rules/simulate`, `/rules/{id}/runs`, `/rules/{id}/stop`** đã có trong `client.ts`
   nhưng chưa có chỗ nào trên giao diện mới gọi tới.
6. Panel kế thừa (Thành viên, Hẹn giờ, Kịch bản, Thiết bị ảo) dùng câu tiếng Việt mặc định
   trong mã; đổi sang English/Filipino chỉ đổi được khi máy chủ `/i18n` có khoá tương ứng.


---

# Vòng 3 — nối nốt phần còn nợ

## 1. Theme của hãng — `GET /tenant/theme`

- Gọi **trước đăng nhập** (cửa công khai) nên màn chào đã đúng màu và logo; sau
  `/bootstrap` so nhãn `phienBan.theme`, khớp thì thôi tải lại. Cache ở
  `lib/iotx/cache.ts` (`docTheme`/`ghiTheme`).
- `colorPrimary` áp vào `--teal`. **Không** dùng thẳng màu đó cho nút có chữ trắng: màu
  Livotec `#02b6ac` chỉ đạt 2,6:1. `lib/newui/theme.ts` làm đậm dần màu chính cho tới khi
  chữ trắng đạt 4,5:1 rồi mới gán vào `--teal-dark`, và trộn với trắng để ra `--teal-soft`.
- `logoUrl` thay wordmark ở màn chào và logo ở hero Khám phá. Địa chỉ đến lúc chạy nên
  dùng `<img>` chứ không khai trước được cho `next/image`.
- `quotas.rules` thay con số 20 cắm cứng ở màn Tự động.

## 2. ETag / If-None-Match

`request()` nhận thêm `etagKey`. Có khoá thì gửi `If-None-Match`, nhận `200` thì lưu
`ETag` + thân, nhận `304` thì trả lại bản đang giữ. Mất cache mà vẫn nhận `304` thì hỏi
lại **không kèm** `If-None-Match` — trả `undefined` ra ngoài là app trắng dữ liệu.

Đã bật cho: `/tenant/theme`, `/i18n`, `/products`, `/bootstrap`.

## 3. Capability kiểu `list` — `POST /devices/{id}/muc/{cap}`

`components/newui/device/VatTu.tsx` dựng khối vật tư cho **mọi** capability `kind: "list"`,
dùng được ở cả màn chuyên biệt lẫn màn chung. Bốn lệnh của hợp đồng: `them` (tên tự do hoặc
serial chính hãng), `thay` (đặt lại đồng hồ), `tuoi` (sửa tuổi thọ ngày), `bo` (ngừng theo
dõi). Mỗi mục đọc phòng thủ (`ten|name|sanPham|serial`, `phanTram` hoặc `conLai/tuoiTho`)
vì hợp đồng để mở. Mục dưới 20% tô đỏ; mục không có serial chính hãng đeo nhãn *chưa xác thực*.

Catalog mock của máy lọc nước đổi ba cảm biến lõi thành một capability `list` cho giống
catalog thật; màn lọc nước tự bỏ ba thanh cảm biến khi đã có danh sách vật tư.

## 4. Mô phỏng, lịch sử chạy và dừng luật

- `POST /rules/simulate` vốn đã có trong trình soạn Nếu–Thì — giữ nguyên.
- Thẻ luật (`components/newui/RuleCard.tsx`) mở được **20 lần chạy gần nhất**
  (`GET /rules/{id}/runs`), có nhãn *chạy thử* cho lần chạy shadow.
- Luật `kind: "sched"` có thêm nút **Dừng chương trình** (`POST /rules/{id}/stop`).

## 5. Hẹn giờ theo thiết bị — `/devices/{id}/hen-gio/*`

Hai màn cũ chỉ ghi `localStorage` đã **bị gỡ hẳn** (`Timers`, `SmartPrograms`), cùng với
`timers`/`smartPrograms`/`ifPrograms` trong `lib/storage.ts` và các kiểu tương ứng. Bản
thật là `components/newui/device/HenGioPanel.tsx`:

- `GET /hen-gio` đọc `batDuoc` — sản phẩm tắt hẹn giờ thì màn này không hiện gì để thao tác.
- **Hẹn bật/tắt**: `PUT /hen-gio/hen` với `bat` + đúng một trong `phut` (1–720) hoặc
  `luc` ("HH:MM"); `DELETE` để huỷ. Màn nói rõ mỗi thiết bị chỉ giữ một hẹn.
- **Chương trình**: tạo/sửa/xoá, kích hoạt (`/chuong-trinh/{id}/dung`) và thôi dùng
  (`DELETE /dang-dung`). Trần 10 chương trình, 8 bước, 5 hành động/bước, tên 40 ký tự đều
  chặn ngay ở client.
- Bước dựng theo `capChoPhep` của chính thiết bị: `onoff` → Bật/Tắt, `enum` → danh sách
  giá trị của catalog, `level` → ô số theo `min/max/step`. Không có capability nào được
  phép thì nút tạo bị khoá kèm lời giải thích.
- Chương trình có `capThuHoi` được đeo cảnh báo; `dangChay` hiện số bước đã xong.

Đường vào: nút **Hẹn giờ** trong màn chi tiết từng thiết bị, và nút **Theo thời gian** ở
màn Tự động (chọn thiết bị trước, vì hẹn giờ là chuyện của từng máy).

## Kiểm tra vòng 3

- 72/72 kịch bản bấm thật đạt (thêm 7 kịch bản cho vật tư, hẹn giờ và chọn thiết bị);
  không có lỗi console hay HTTP nào.
- 20/20 trạng thái màn hình không còn vùng chạm dưới 44px; cảnh báo tương phản còn lại đều
  là dương tính giả trên nền gradient (đo bằng pixel: 5,0–10,0:1).
- `npm run lint`, `npx tsc --noEmit`, `npm run build` sạch.

## Vẫn còn nợ

- **Push FCM** (`/push/dang-ky`, `/push/huy`, `/push/thu`) — chỉ có nghĩa với app mobile
  hoặc PWA có FCM; webapp hiện chưa có service worker.
- Panel kế thừa (Thành viên, Thêm thiết bị, Thiết bị ảo) vẫn dùng câu tiếng Việt mặc định
  trong mã; đổi sang English/Filipino chỉ đổi được khi bảng `/i18n` của máy chủ có khoá.
- Luật `kind: "sched"` (chương trình nhiều giai đoạn ở mức tài khoản, dùng `stages`) chưa
  có trình soạn riêng — mới chạy/dừng/xoá được cái do nơi khác tạo.

---

# Vòng 4 — bản `MasterDetail-Livotec.html`: chín màn thiết bị

## 1. Chín loại giao diện thay vì sáu

`lib/newui/uiType.ts` tách hai họ máy mà bản trước gộp làm một, và thêm máy hút mùi:

| Loại | Vì sao tách riêng |
|---|---|
| `waterheater_indirect` | có bình chứa: thêm thanh nước nóng còn lại, thanh magie, hẹn giờ 0–720 phút |
| `waterheater_direct` | đun tức thời: dải nhiệt hẹp (35–48°C), nút Boost, huy hiệu ELCB |
| `fan_ac` | 5 nấc gió rời rạc |
| `fan_bldc` | 0–100% bước 5, thêm CoolSense / FreshCare / HumanSense |
| `hood` | dải chấm tốc độ, cảm biến tự động, tắt trễ, kiểu thoát khí, lưới lọc mỡ |

Tên loại cũ (`waterheater`, `fan`) vẫn nhận, ánh xạ về `waterheater_indirect` / `fan_ac`,
nên catalog chưa cập nhật vẫn không rơi về màn chung.

`nhomCuaThietBi()` lấy nhóm từ `product.category` của catalog trước, rồi mới tới `group`
của thiết bị, cuối cùng mới suy từ loại giao diện — hãng đổi cách xếp nhóm là danh sách
đổi theo, không phải sửa mã.

## 2. Một khung, chín thân

- `components/newui/device/ManThietBi.tsx` giữ toàn bộ phần chung: thanh tiêu đề và nút
  quay lại ba cấp, màn **tính năng nâng cao** (danh sách theo nhóm → chi tiết có prev/next),
  khối vật tư, nút Hẹn giờ, nút Ẩn thiết bị, hàng cờ ngôn ngữ, chỗ hiện lỗi lệnh và câu
  "chỉ có quyền xem". Mỗi màn chỉ khai phần thân của nó qua một hàm con.
- `components/newui/device/parts.tsx` là bộ phần tử dùng lại: `Dial`, `DialControl`,
  `Steppers`, `OptionGrid`, `DotScale`, `SpeedDial`, `SwitchCard`, `SwitchRow`, `TimerRow`,
  `Bar`, `StatCards`, `Banner`, `PowerButton`, `Hero`, và `tuCap()` — hàm dựng danh sách
  lựa chọn **thẳng từ `values`/`labels` của catalog**.
- Hệ quả: catalog không khai `values` thì khối đó biến mất, thay vì hiện một nút gửi mã
  lệnh tự nghĩ ra cho máy chủ từ chối.

Màu của từng loại máy chỉ là ba token CSS (`--ac-orange`, `--ac-orange-fill`, `--ac-peach`)
đặt trên `.ac2-screen.<theme>`; vòng dial, vạch chia, nhãn và ô chọn tự đổi theo. Mọi giá
trị `--ac-orange` đều đã đo tương phản ≥ 5:1 với nền trắng, nên vừa làm chữ trên nền trắng
vừa làm nền cho chữ trắng đều đạt WCAG AA.

## 3. Những chỗ dễ sai đã xử lý

- **Khóa trẻ em** (bếp từ, bình nóng lạnh) dùng được cả khi máy đang tắt, nên khối của nó
  không bao giờ bị làm mờ; khóa bật thì mọi nút nấu/chỉnh nhiệt và cả nút nguồn bị vô hiệu.
- **Booster / Boost** đẩy luôn mức hoặc nhiệt độ lên cao nhất, để con số hiện trên màn đúng
  với việc máy đang chạy hết công suất.
- **Dải chấm hút mùi**: bấm lại đúng nấc đang chọn là lùi một nấc, nên vẫn hạ được về 0 mà
  không cần thêm một nút "tắt hút" riêng.
- **Huy hiệu ELCB** chỉ hiện khi máy thật sự báo; không có số đo thì không vẽ — một huy
  hiệu "an toàn" tự bịa là thứ nguy hiểm nhất có thể để trên màn này.
- **Hiệu suất lọc nước** chỉ tính khi đo được cả TDS vào lẫn ra; thiếu một đầu thì không
  hiện %.
- **Số ngày còn lại của lõi** suy từ `tuoiTho × phanTram` khi máy chủ không trả thẳng; cả
  hai đều thiếu thì trả `undefined` chứ không phải 0 — 0 nghĩa là "hết hạn", không phải
  "chưa biết".
- **Số giờ giữ ấm** chỉ hiện khi giữ ấm đang bật.
- Máy đang tắt hoặc chưa có số đo thì thay vòng điều khiển bằng ảnh sản phẩm (`HERO`) —
  không bao giờ hiện một con số mặc định như thể máy đã báo về.

## 4. Bộ lọc Nhà và Nhóm

`FilterRow` nay có ba hộp chọn thật (nhà, phòng, nhóm), dùng chung `LocPickerModal`. Ba bộ
lọc cộng dồn; nút nào đang lọc thì sáng lên để người dùng biết vì sao danh sách ngắn, và
kết quả rỗng vẫn hiện khối hướng dẫn thay vì trắng màn.

## 5. Dữ liệu mẫu và tệp tính năng

- `lib/newui/mockCatalog.ts`: 9 sản phẩm khai đủ capability + `values`/`labels`, 9 thiết bị
  trải trên 2 nhà. Khóa `localStorage` lên `livotec-home-v5`.
- 27 tệp `public/data/<loai>-features.<vi|en|fil>.json` (aircon 114 mục, bếp từ 54, bình
  gián tiếp 44, bình trực tiếp 43, lọc nước 39, nồi cơm 30, quạt BLDC 27, quạt AC 25, hút
  mùi 24). `lib/newui/features.ts` chỉ tải tệp của đúng loại đang mở, đúng ngôn ngữ đang
  dùng — mở trang chủ không phải trả phí cho 340KB dữ liệu tra cứu.

## Kiểm tra vòng 4

- `e2e2.mjs`: **63/63 kịch bản bấm thật đạt**, không lỗi console hay HTTP — gồm cả ba bộ
  lọc, chín màn thiết bị, khóa trẻ em, booster, boost, dải chấm, và màn nâng cao đổi ngôn
  ngữ giữa chừng.
- `a11y2.mjs`: **20/20 trạng thái màn hình không còn vùng chạm dưới 44px**. 10 cảnh báo
  tương phản còn lại đều trên nền gradient — `pix2.mjs` đo bằng chính điểm ảnh đã render
  cho 4,77–10,33:1, tức đều đạt.
- `npm run lint`, `npx tsc --noEmit`, `npm run build` sạch.

---

# Vòng 5 — màn chi tiết dựng từ API, không còn cắm cứng

## 1. Vấn đề

Chín màn của vòng 4 đẹp nhưng **cứng**: mỗi màn tự quyết khối nào vẽ trước, tra capability
qua một bảng tên khóa nằm trong mã (`KHOA`), và tự chọn màu theo loại máy. Hãng thêm một
chức năng vào catalog thì app vẫn không hiện — phải sửa mã và phát hành lại.

Trong khi đó hợp đồng IoTX **đã mô tả sẵn giao diện** mà app bỏ qua gần hết:

```ts
product.ui = {
  renderer, archetype, skin, image,
  controls: string[],   // capability nào là nút điều khiển, theo thứ tự này
  gauges:   string[],   // capability nào là đồng hồ / số đo
  slots: { [capKey]: { nhom, variant, co } },
}
```

## 2. Cách làm

- **`lib/newui/layout.ts`** — bộ giải bố cục, thuần logic, không React. Nhận `product.ui` +
  `capabilities`, trả về danh sách nhóm đã xếp thứ tự, mỗi khối đã chốt `variant` và `co`.
- **`components/newui/device/LayoutRenderer.tsx`** — vẽ danh sách đó bằng bộ phần tử ở
  `parts.tsx`. **Không có một dòng nào biết đây là điều hòa hay bếp từ.**
- **`DeviceDetail.tsx`** còn đúng 45 dòng: dựng bố cục, giao cho bộ dựng, thêm nút nguồn.

Đã xóa: `AirconDetail.tsx`, cả thư mục `device/screens/` (7 tệp), `DynamicDevicePanel.tsx`,
và phần lớn `lib/newui/uiType.ts` (bảng `KHOA`, `AC_SPECIAL_KEYS`, kiểu `UiType`).

### Bộ từ vựng `variant` mà app hiểu

| `kind` | variant điều khiển | variant chỉ đọc (dùng được cho mọi kind) |
|---|---|---|
| `level` | `dial`, `stepper`, `slider`, `dots`, `timer` | `stat`, `bar`, `badge`, `banner` |
| `enum` | `grid`, `segment` | ” |
| `onoff` | `switch`, `card`, `boost`, `power`, `lock` | ” |
| `list` | `supplies` | ” |

`nhom`: `alarm` → `hero` → `status` được ghim chỗ vì ý nghĩa; `lock` luôn cuối. Mọi nhóm
còn lại — kể cả tên hãng tự đặt — xếp theo vị trí khối đầu tiên của nó trong
`controls`/`gauges`.

### Khi catalog im lặng

Suy từ `kind`: mức có đơn vị thời gian → hàng hẹn giờ; mức khác → vòng ở khối chính, thanh ±
ở nơi khác; enum ≤ 3 giá trị → dải phân đoạn, nhiều hơn → lưới; cảm biến `%` → thanh đo,
có đơn vị → thẻ số, không đơn vị → huy hiệu. Variant lạ rơi về mặc định của `kind`;
`product = null` hay không có capability nào thì màn vẫn có tên máy, hẹn giờ và nút ẩn.
**Không có đường nào dẫn tới màn trắng.**

### Nguyên tắc: không giấu chức năng

Capability không nằm trong `controls`/`gauges` vẫn được vẽ, xếp cuối nhóm của nó. Giấu đi
thì người dùng mất một chức năng máy có thật; vẽ thừa thì cùng lắm thừa một khối.

## 3. Những thứ khác cũng chuyển sang API

| Thứ | Trước | Nay |
|---|---|---|
| Màu | bảng theme theo loại máy | `ui.skin` — tên da, **hoặc thẳng mã màu**; mã màu lạ được tự làm đậm tới khi chữ trắng đạt 4,5:1 |
| Ảnh | bảng `HERO` theo loại | `ui.image` (URL, data URI hoặc emoji); tệp tĩnh chỉ còn là dự phòng |
| Nhãn | chuỗi trong mã | `cap.label` / `cap.labels`, có chặn khóa i18n thô (`cap.speed`) lọt ra màn |
| Icon | bảng từ khóa | `cap.icon` của catalog; không khai mới đoán |
| Dòng trạng thái trên thẻ | `switch` theo 9 loại máy | đọc chính bố cục catalog — cùng một nguồn sự thật với màn chi tiết |
| Nhóm ở trang chủ | bảng theo loại | `product.category` → `grp` → mới tới suy đoán |

### Danh mục tính năng nâng cao

**Hợp đồng không có endpoint cho danh mục này** — các đường dẫn chỉ tới `/products`. Nên:
đọc từ chính đối tượng sản phẩm khi máy chủ gửi kèm (`product.tinhNang` / `product.features`
/ `ui.features`, có thể tách theo ngôn ngữ — `SanPham` và `KhuonUi` đều mở
`additionalProperties`), không có thì rơi về 27 tệp tĩnh trong `public/data/`. Không tự
nghĩ ra một đường dẫn nào.

### `keoTheo` — hành vi liên động

Ô `slots` mở thêm trường, nên máy chủ có thể khai
`{ variant: "boost", keoTheo: [{ key: "zone1", giaTri: "max" }] }`: bật Boost thì đẩy luôn
vùng bếp lên mức cao nhất. Không gửi thì không có hành vi gì thêm — app không tự đoán.

### Khóa an toàn

Capability có `variant: "lock"` (hoặc tên khóa trông như khóa trẻ em) được tách khỏi lưới:
khối của nó **không bao giờ bị làm mờ** khi máy tắt, và khi bật thì chặn mọi điều khiển
khác, kể cả nút nguồn.

## Kiểm tra vòng 5

- `e2e3.mjs`: **46/46 kịch bản đạt**, không lỗi console/HTTP. Gồm ba kịch bản then chốt:
  - *sửa `slots` ngay trong trình duyệt* rồi tải lại → màn đổi bố cục, đổi kiểu vẽ, xuất
    hiện nhóm mới, **không sửa một dòng mã nào**;
  - gửi `skin` là một mã màu lạ (`#7A1FA2`) → đo được 8,25:1 cho chữ trắng;
  - đặt `product.ui = null` → vẫn dựng đủ khối từ `kind`, vẫn có nút nguồn, không trắng màn.
- `a11y2.mjs`: 20/20 màn, **0 vùng chạm dưới 44px**; 10 cảnh báo tương phản còn lại vẫn là
  dương tính giả trên nền gradient (`pix2.mjs` đo pixel: 4,77–10,33:1).
- `npm run lint`, `npx tsc --noEmit`, `npm run build` sạch.

## Việc cho phía máy chủ

Màn chi tiết nay chỉ đẹp bằng mức catalog mô tả. Để bản chạy thật giống bản mock, catalog
cần khai `ui.skin`, `ui.controls`, `ui.gauges` và `ui.slots` cho từng sản phẩm —
`lib/newui/mockCatalog.ts` khai đủ chín sản phẩm, dùng làm mẫu được ngay.

---

# Vòng 6 — gỡ nốt các khối không đến từ API

Vòng 5 làm phần **thân** màn chi tiết động theo catalog, nhưng phần **chân màn** vẫn vẽ vô
điều kiện. Vòng này soát lại từng khối và gắn điều kiện từ máy chủ cho tất cả.

| Khối | Trước | Nay |
|---|---|---|
| Nút **Hẹn giờ** | luôn vẽ | chỉ khi `product.henGio.bat !== false`. Hợp đồng có cờ này từ đầu mà app chưa hề đọc — sản phẩm không hỗ trợ hẹn giờ vẫn hiện nút, bấm vào là màn rỗng |
| Nút **Tính năng nâng cao** | luôn vẽ; nội dung từ 27 tệp tĩnh | chỉ khi catalog đính kèm danh mục; đọc đồng bộ từ sản phẩm nên biết ngay có gì để mở |
| **Ảnh hero** | `ui.image`, thiếu thì rơi về bảng `HERO` theo renderer | chỉ `ui.image`. Đã xóa `HERO`, `PRODUCT_PHOTOS`, `MODEL_PHOTOS` |
| **Ảnh trên thẻ** | bảng ảnh theo renderer + mã model | chỉ `ui.image`; không có thì thẻ vẽ vòng tròn trống |
| **Icon từng khối** | bảng ~20 từ khóa đoán theo tên capability | chỉ `cap.icon`. Không khai thì khối không icon — một icon app tự nghĩ ra không phải dữ liệu sản phẩm, và đoán sai còn tệ hơn không có |
| **Hàng cờ ngôn ngữ** | vẽ ở cuối mọi màn thiết bị | bỏ hẳn — không phải dữ liệu thiết bị, và đã có sẵn ở menu lẫn trang chủ |
| Nút **Ẩn thiết bị** | `perms.delete !== false` | giữ nguyên. Đây thuộc quan hệ NGƯỜI DÙNG–thiết bị (`PATCH /devices/{id} { hidden }`), không thuộc sản phẩm, nên điều kiện đúng là `perms` chứ không phải catalog |

## Danh mục tính năng nâng cao

Bỏ hẳn lớp dự phòng đọc `public/data/*.json`, và bỏ luôn toàn bộ máy móc tải bất đồng bộ đi
kèm (`useEffect`, trạng thái `đang tải`, bộ nhớ đệm theo loại × ngôn ngữ). Nay đọc thẳng từ
đối tượng sản phẩm đã có sẵn trong bộ nhớ — đồng bộ, nên nút chỉ vẽ khi thật sự có nội dung.

**27 tệp trong `public/data/` vẫn còn trên đĩa** nhưng app không tham chiếu tới nữa; giữ lại
để bên máy chủ dùng làm nguồn nạp vào catalog. Tương tự, 9 tệp ảnh sản phẩm trong
`public/images/livotec/` nay cũng không được app dùng.

Dạng máy chủ cần gửi (đính vào sản phẩm trong `GET /products` — `SanPham` mở
`additionalProperties`, hợp đồng không có endpoint riêng cho danh mục này):

```jsonc
"tinhNang": {                      // hoặc "features"; cũng nhận mảng phẳng
  "vi": [{ "g": "Nhóm", "f": "Tên tính năng", "d": "Mô tả", "v": "Thông số",
           "c": "Điều kiện", "n": "Ghi chú" }],
  "en": [ /* … */ ]
}
```

## Còn lại gì không đến từ API

Ba thứ, và đều là *phương án cuối* chứ không phải khối vẽ ra màn:

1. **Suy đoán khi `slots` vắng** — tên khóa trông như nguồn/khóa trẻ em, đơn vị phút/giờ,
   khóa chứa `err`/`alarm`/`elcb`. Chỉ chạy khi catalog im lặng; catalog khai đủ thì không
   đụng tới.
2. **Bảng màu của 7 da** (`skin-ck`, `skin-fan`…) — máy chủ *chọn* da qua `ui.skin`, app
   giữ bảng màu. Gửi thẳng mã màu thì app dựng token tại chỗ, không cần bảng.
3. **Banner khuyến mãi ở trang chủ** — nội dung tiếp thị, không phải dữ liệu thiết bị.

## Kiểm tra vòng 6

`e2e3.mjs`: **57/57 đạt**, không lỗi console/HTTP. Thêm 9 kịch bản cho chính việc này —
sản phẩm khai `henGio.bat = false` thì nút Hẹn giờ biến mất; sản phẩm không đính danh mục
thì nút Nâng cao biến mất; gỡ `ui.image` thì màn không vẽ ảnh và cũng không để lại khung
rỗng; màn thiết bị không còn hàng cờ. `a11y2.mjs`: 20/20 màn, 0 vùng chạm dưới 44px.
`lint` / `tsc` / `build` sạch.

---

# Vòng 7 — gỡ sạch view của màn chi tiết

Theo yêu cầu: **xoá toàn bộ khối view trong màn chi tiết thiết bị, chưa đổ view gì cả — không
từ API, không từ dữ liệu tĩnh.**

## Còn lại gì

`components/newui/device/DeviceDetail.tsx` — 46 dòng, chỉ có thanh tiêu đề và nút quay lại.
Giữ nút quay lại vì không có nó thì mở thiết bị là mắc kẹt, không thoát ra được.

Chữ ký props giữ nguyên (`onCommand`, `onVatTu`, `onHenGio`, `onAn`, `onLang`) nên
`LivotecApp` không phải sửa, và lớp view mới cắm vào là chạy — mọi đường tới API đã sẵn sàng
ở phía trên.

## Đã xoá

| Tệp | Nội dung |
|---|---|
| `device/LayoutRenderer.tsx` | bộ dựng khối theo `ui.slots` (dial, stepper, dots, grid, switch, bar, stat, badge, banner, supplies) |
| `device/ManThietBi.tsx` | khung màn, màn tính năng nâng cao hai cấp, nút hẹn giờ |
| `device/parts.tsx` | toàn bộ phần tử giao diện dùng chung |
| `device/NutAn.tsx` | nút ẩn thiết bị |
| `lib/newui/features.ts` | đọc danh mục tính năng nâng cao |
| `device/VatTu.tsx` → `VatTuBlock` | khối vật tư (giữ lại `GuiVatTu`, `danhSachMuc`, `docSo`, `ngayConLai` vì `LivotecApp` còn dùng) |

Bản lưu sáu tệp đã gửi vào cuộc trò chuyện (`man-chi-tiet-da-go.tar.gz`) — dự án không có
git nên không khôi phục lại được từ repo.

## Cố ý KHÔNG đụng tới

- `lib/newui/layout.ts` — trang chủ vẫn dùng `dungBoCuc` cho dòng trạng thái trên thẻ và để
  biết capability nào là nguồn điện.
- `device/HenGioPanel.tsx` — vẫn vào được từ màn Tự động, không phải chỉ từ màn chi tiết.
- CSS trong `app/globals.css` — các lớp `.ds-*` và `.ac2-*` nay không có markup nào dùng,
  nhưng để lại thì lớp view mới dựng nhanh hơn nhiều; CSS không có markup thì vô hại.
- Thẻ thiết bị ở trang chủ, ba bộ lọc, đổi ngôn ngữ, màn Tự động, hẹn giờ — không thuộc màn
  chi tiết nên giữ nguyên.

## Kiểm tra vòng 7

`e2e3.mjs` viết lại: **58/58 đạt**, không lỗi console/HTTP. Với cả tám thiết bị, kiểm tra
màn chi tiết mở được, tiêu đề đúng tên máy, **ngoài thanh tiêu đề không còn phần tử con nào**,
không còn dấu vết khối cũ (`.ds-nhom`, `.ac2-dial`, `.ac2-power`, `.ac2-hero-arch`,
`.ac2-adv-toggle`, `.btn-full`, `.vat-tu-row`, `.ac-flags` đều bằng 0), chỉ còn đúng một nút
trên màn, và quay lại được. Kèm hai kịch bản chứng minh phần còn lại vẫn sống: bật/tắt từ thẻ
và mở màn Tự động. `lint` / `tsc` / `build` sạch.

---

# Vòng 8 — dựng lại màn chi tiết, viết mới từ đầu

Sau khi gỡ sạch ở vòng 7, lớp view được **viết lại từ đầu** (không khôi phục bản cũ). Kết
quả gọn hơn hẳn: **2 tệp** thay cho 6, và ranh giới rõ ràng — một tệp *đọc* API, một tệp *vẽ*.

## `lib/newui/manHinh.ts` — đọc

`docManHinh(device, lang)` là **nơi duy nhất ra quyết định** về màn chi tiết. Nó nhận dữ liệu
máy chủ và trả về đúng một mô tả màn hình:

```ts
{ khu[], nguon?, khoaAnToan?, anh, da, tinhNang[], coHenGio, rong }
```

Đọc từ: `product.capabilities`, `ui.controls`, `ui.gauges`, `ui.slots{nhom,variant,co}`,
`ui.skin`, `ui.image`, `product.henGio.bat`, `product.tinhNang`, `device.lastValues`,
`device.perms`. Muốn biết "vì sao màn hiện thế này" thì đọc đúng một tệp.

## `components/newui/device/DeviceDetail.tsx` — vẽ

Đổi mô tả đó thành DOM, hết. Không tra cứu, không đoán, không có một dòng nào biết đây là
điều hòa hay bếp từ. Mọi phần tử (`VeO`) là một `switch` trên `kieu` mà bộ đọc đã chốt.

Khác bản cũ: gộp `ManThietBi` + `LayoutRenderer` + `parts` + `NutAn` vào một tệp, vì chúng
chỉ có một nơi dùng; tách ra chỉ tạo thêm đường vòng. Màn tính năng nâng cao thành một
component con ngay trong tệp thay vì một cấp điều hướng riêng.

`lib/newui/layout.ts` đã xoá — `manHinh.ts` thay thế, và trang chủ dùng chung nó nên thẻ
thiết bị với màn chi tiết luôn ưu tiên giống nhau.

## Quy tắc giữ nguyên từ vòng 5–6

- Capability không có tên trong `controls`/`gauges` vẫn được vẽ, xếp cuối khu — không giấu
  chức năng máy có thật.
- `variant` lạ rơi về mặc định của `kind`; `ui = null` thì suy từ `kind`; không capability
  nào thì nói thẳng. Không có đường nào dẫn tới màn trắng.
- `enum` chưa khai `values` → ẩn hẳn, tuyệt đối không tự nghĩ ra mã lệnh.
- `skin` là mã màu lạ → tự làm đậm tới khi chữ trắng đạt 4,5:1.
- Khóa an toàn không bao giờ bị làm mờ; bật thì chặn mọi thứ kể cả nút nguồn.
- Ảnh chỉ từ `ui.image`; icon chỉ từ `cap.icon`; hẹn giờ theo `henGio.bat`; tính năng nâng
  cao chỉ khi catalog đính danh mục.

## Kiểm tra vòng 8

- `e2e3.mjs`: **53/53 đạt**, không lỗi console/HTTP. Gồm 4 kịch bản sửa catalog ngay trong
  trình duyệt rồi tải lại: đổi `slots` → màn đổi bố cục và kiểu vẽ; `skin` là `#7A1FA2` →
  đo được 8,25:1; gỡ `ui.image` → không vẽ ảnh, không khung rỗng; `ui = null` và
  `capabilities = []` → vẫn không trắng màn.
- `a11y2.mjs`: 17 trạng thái màn, **0 vùng chạm dưới 44px**. 8 cảnh báo tương phản còn lại
  đều ở màn đăng nhập và banner trang chủ (nền gradient, bộ đo DOM không thấy) — không có
  cái nào trên màn chi tiết.
- `lint` / `tsc` / `build` sạch.

---

# Vòng 9 — sửa lỗi "bấm nút không ăn" trên màn chi tiết

## Lỗi gốc

```css
.ac2-section.ac-dim{opacity:.45;pointer-events:none;}
```

Màn làm mờ mọi khu khi `device.on === false`, và lớp `ac-dim` **chặn luôn sự kiện chạm**.
Hậu quả: mở bất kỳ thiết bị nào đang tắt là toàn bộ nút chết lặng — trừ nút nguồn nằm ngoài
các khu. Không có một dòng nào giải thích, nên trông đúng như app hỏng.

Sai ở hai tầng:

1. **Máy tắt không phải lý do để cấm chạm.** Chỉnh nhiệt độ trước rồi mới bật là việc bình
   thường; máy chủ mới là nơi quyết định nhận hay từ chối. Nay `ac-dim` chỉ còn làm mờ
   (`opacity:.72`, đo lại vẫn đủ tương phản), và có một dòng nhắc "máy đang tắt".
2. **Chặn mà không nói lý do.** `gui()` trước đây `return` im lặng khi thiếu `rpc` hoặc
   không có quyền.

## Bốn lý do, bốn câu trả lời

Màn nay phân biệt rõ và nói thẳng ngay dưới tiêu đề:

| Lý do | Nguồn | Câu hiện ra |
|---|---|---|
| Ngoại tuyến | `device.active` | "Thiết bị đang ngoại tuyến — lệnh sẽ không tới nơi. Kiểm tra nguồn điện và kết nối mạng." |
| Chỉ có quyền xem | `device.perms.control` | "Bạn chỉ được xem thiết bị này. Nhờ chủ nhà cấp quyền trong mục Thành viên." |
| Khóa an toàn đang bật | `lastValues[khóa]` | "Khóa an toàn đang bật. Tắt khóa ở cuối màn này rồi điều khiển." |
| Catalog không khai lệnh | `capability.rpc` trống | "Catalog chưa khai lệnh cho *X*, nên mục này chỉ để xem." |

Thêm chỉ báo **"Đang gửi lệnh…"** trong lúc chờ máy chủ, nên mỗi lần bấm đều có phản hồi
nhìn thấy được.

## Một lỗi kèm theo

Khóa an toàn bật thì `chan = "khoaAnToan"`, mà công tắc khóa cũng dùng chung cờ đó — bật
khóa xong là **không ai mở lại được nữa**. Nay tách hai mức: `chanNen` (ngoại tuyến / không
quyền) cho chính công tắc khóa, `chan` (gồm cả khóa) cho mọi thứ còn lại. Nút nguồn vẫn bị
khóa chặn — đó là điểm của khóa.

## Đường lệnh tới API

Không đổi, và vốn đã đủ: `onCommand` → `guiLenh` trong `LivotecApp` → cập nhật lạc quan →
`POST /v1/devices/{id}/rpc` với `{ [capability.key]: value }` → hỏng thì trả lại trạng thái
cũ và ném lỗi ra để màn hiện ngay. Vấn đề nằm ở chỗ nút không bấm được để *bắt đầu* đường đó.

Lưu ý cấu hình: không có `.env.local` thì `NEXT_PUBLIC_IOTX_MODE` mặc định là **`iotx`** —
app chạy với máy chủ thật qua `/v1` (proxy tới `IOTX_API_UPSTREAM`, mặc định
`https://api.dev.happibot.net`). Muốn xem bộ dữ liệu demo 9 thiết bị thì đặt
`NEXT_PUBLIC_IOTX_MODE=mock`.

## Kiểm tra vòng 9

`e2e4.mjs` — **16/16 đạt**, đúng những trường hợp trước đây chết lặng: máy đang tắt vẫn bấm
và đổi được chế độ; ngoại tuyến hiện băng đỏ đúng lý do và nút vô hiệu thật; chỉ-xem hiện
băng nhắc xin quyền; khóa an toàn bật thì chặn cả nút nguồn **nhưng công tắc khóa vẫn bấm
được để mở lại**; capability không có `rpc` thì ô đó vô hiệu.

`e2e3.mjs` 53/53 vẫn đạt. `a11y2.mjs`: 17 màn, 0 vùng chạm dưới 44px — kể cả khu bị làm mờ
nay đã được bộ đo tính (opacity .72 > ngưỡng .5) và vẫn đủ tương phản.

---

# Vòng 10 — chép màn chi tiết từ bản tham chiếu `web.dev.happibot.net`

Đăng nhập bản tham chiếu, mở màn chi tiết, đọc DOM + CSS + bundle để lấy đúng mô hình dựng
màn, rồi chép về app local. **Chỉ màn chi tiết thiết bị** — phần còn lại không đụng tới.

## Phát hiện then chốt: hợp đồng `ui` thật khác hẳn giả định cũ

Catalog thật (`GET /devices` → `product.ui`) gửi:

```jsonc
{ "archetype": "ac", "skin": "sunset",
  "uuTien": ["ac_temp_setting","ac_swing_mode","ac_ope_mode","ac_fan_speed","ac_power_status"],
  "slots": { "ac_temp_setting": { "nhom":"hero", "variant":"dial01", "co":3 },
             "ac_ope_mode":     { "nhom":"secondary", "variant":"chips01", "co":2 },
             "ac_power_status": { "nhom":"secondary", "variant":"power01", "co":1 } } }
```

App local trước đó đọc sai ở ba chỗ, nên gần như luôn rơi về suy đoán:

| | App local (cũ) | Hợp đồng thật |
|---|---|---|
| Thứ tự | `controls[]` + `gauges[]` | **`uuTien[]`** — `controls`/`gauges` không tồn tại |
| Tên kiểu vẽ | `dial`, `grid`, `power` | **`dial01`, `chips01`, `power01`, `slider01`, `step01`, `readout01`, `gauge01`, `state01`, `alarm01`, `filterlist01`** |
| `co` | số cột trên lưới 12 | **cỡ ô 1–3**, mỗi kiểu vẽ chỉ nhận vài cỡ |

Thêm hai thứ chưa có: **`archetype`** (khuôn: fan / light / ac / heater / purifier /
waterfilter / sensor) quyết định gán nhóm mặc định, và **`skin`** (ocean / sunset /
graphite) là bộ ba màu, không phải tên lớp CSS.

## `lib/newui/khuon.ts` — chép nguyên mô hình `phanGiai`

Năm nhóm có **sức chứa cố định**: `alarm` 2, `status` 2, `hero` **1**, `secondary` 3. Vượt
thì phần thừa rơi xuống "xem thêm" chứ không nén lại — nhờ vậy màn không bao giờ dài vô tận
dù sản phẩm khai 28 capability (điều hoà thật trên DEV đúng là 28, màn chỉ hiện 5).

Khai sai nhóm thì bị từ chối kèm lý do (băng báo động chỉ nhận số đọc, khối chính chỉ có một
chỗ…) và tụt xuống "xem thêm", thay vì vẽ sai.

Sản phẩm không có khuôn nhận ra được → không dựng màn, y như bản tham chiếu, để hai app
không lệch nhau.

## Màn

Đúng bộ lớp của bản tham chiếu: `.sheet.devpage` → `.devbar`/`.devback` → `.devbody` →
`.row` (icon, tên, chấm trạng thái) → băng báo động **đang kêu** → `.ctl-hang` số đọc →
khối chính (`.ctl-hero` + SVG vòng cung 270°, r=42, nét 7) → `.ctl-pwr` → nhóm phụ →
`⋯ Xem thêm N` → `.hg-ghim`. Báo động đang im tụt xuống "xem thêm" dạng dòng trạng thái.

Token màu (`--brand #02b6ac`, `--brand-deep #00736c`, `--card`, `--line`, `--dim`…) đặt
trong phạm vi `.devpage` nên không đụng phần còn lại của app; `skin` áp qua một lớp
`display:contents` đúng như bản gốc.

## Ba chỗ sửa so với bản gốc

1. **Nút nguồn 42×42** — dưới ngưỡng chạm 44px. Giữ nguyên hình, thêm vùng chạm trong suốt.
2. **Chữ chip đang chọn** trên `--brand-soft` chỉ đạt **3,86:1** với da *sunset* (đo thật).
   Làm đậm còn 85% màu gốc → mọi da ≥ 5:1, mắt gần như không thấy khác.
3. **Chip khi bị chặn** nuốt cú bấm không nói gì. Nay vẫn báo lý do (ngoại tuyến / không có
   quyền / catalog chưa khai lệnh).

## Kiểm tra vòng 10

`e2e5.mjs` — **28/28 đạt**, không lỗi console/HTTP: đúng bộ lớp của bản tham chiếu, vòng
SVG hai cung, − / + / chip / nút nguồn đều bấm và đổi được giá trị, "Xem thêm" mở và thu gọn,
da lấy từ `ui.skin` (đo màu viền `.ctl-pwr` ra đúng `rgb(234,118,11)` của *sunset*), bốn
khuôn khác nhau đều chỉ có **một** khối chính, và ba trạng thái chặn đều nói rõ lý do.

`a11y2.mjs`: 14 trạng thái màn, **0 vùng chạm dưới 44px**; 8 cảnh báo tương phản còn lại ở
màn đăng nhập và banner trang chủ (nền gradient), không có cái nào trên màn chi tiết.

`lint` / `tsc` / `build` sạch.

## Việc cho phía máy chủ

Mock đã chuyển sang đúng hình dạng thật (`archetype`, `skin`, `uuTien`, `slots` với
`dial01`/`chips01`/`power01`, `co` 1–3) nên bản mock và bản nối IBS đi chung một đường mã.
