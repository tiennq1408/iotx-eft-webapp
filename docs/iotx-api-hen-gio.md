# IoTX — API hẹn giờ theo thiết bị (`/devices/{id}/hen-gio`)

- Nguồn: Mydocu `/n/367` — API · Đặc tả OpenAPI (repo `docs/api/openapi.yaml`, khớp `main` @ 83c6735)
- Đọc: 07/10/2026. Trang `/n/366` (Ví dụ thiết bị) **không** có ví dụ hẹn giờ — spec là nguồn duy nhất.
- **Đã đối chiếu với IBS thật trên DEV ngày 07/10/2026** — xem mục cuối.
- Nhóm D4. Base `https://api.dev.happibot.net/v1`.

## Luật chung

- **Chỉ CHỦ thiết bị.** Người được chia sẻ → `404 {"message":"not_found"}` đồng nhất, không phân biệt.
- Sản phẩm tắt hẹn giờ (`henGio.bat=false`, hoặc không còn capability nào điều khiển được)
  → cửa **GHI** trả `403`; cửa **XOÁ** vẫn mở để dọn dữ liệu cũ.
- App đọc `batDuoc` của `GET …/hen-gio` để **giấu hẳn** màn hẹn giờ, đừng đợi 403.
- Hẹn và chương trình chạy **song song**; trùng phút thì **lệnh hẹn giờ thắng**.
- POST trả `201`, còn lại `200`.

## Bảy cửa

| Method | Đường | operationId | Ghi chú |
|---|---|---|---|
| GET | `/devices/{id}/hen-gio` | `xemHenGio` | Toàn cảnh: hẹn, chương trình, cái đang dùng |
| PUT | `…/hen-gio/hen` | `datHenGio` | **Thay** hẹn cũ — mỗi thiết bị chỉ một hẹn |
| DELETE | `…/hen-gio/hen` | `huyHenGio` | Huỷ hẹn đang chờ |
| POST | `…/hen-gio/chuong-trinh` | `taoChuongTrinhHenGio` | → `{ok, id}` |
| PUT | `…/hen-gio/chuong-trinh/{ctId}` | `suaChuongTrinhHenGio` | `motlan` đang chạy giữa chừng → **409** |
| DELETE | `…/hen-gio/chuong-trinh/{ctId}` | `xoaChuongTrinhHenGio` | Đang dùng thì đồng thời thôi dùng |
| POST | `…/hen-gio/chuong-trinh/{ctId}/dung` | `dungChuongTrinhHenGio` | Kích hoạt, thay cái đang dùng trong MỘT giao dịch |
| DELETE | `…/hen-gio/dang-dung` | `thoiDungChuongTrinhHenGio` | Thôi dùng / dừng, **không** xoá chương trình |

## `GET /hen-gio` → `HenGioTongQuan`

```
batDuoc      boolean   false = sản phẩm tắt hẹn giờ → giấu màn
capChoPhep   string[]  key capability được phép nằm trong bước
hen          {luc:int64 epoch ms, bat:boolean} | null
dangDung     int | null      id chương trình đang dùng
dangChay     {buocXong:int, tuLuc:int64} | null   ≠null khi `motlan` đang chạy giữa chừng
chuongTrinh  ChuongTrinhHenGio[]  tối đa 10
```

`capChoPhep` = capability điều khiển được **và** không bị sản phẩm loại qua `henGio.tatCap`.

## `PUT /hen-gio/hen`

Thân: `bat` (bắt buộc) + **đúng MỘT** trong:

- `phut` — integer 1..720
- `luc` — `"HH:MM"`; giờ đã qua trong ngày (múi giờ hệ) hiểu là **NGÀY MAI**

→ `200 {ok:true, hen:{luc, bat}}`, `hen.luc` là **epoch ms** lúc sẽ bắn.
`400` khi: thiếu `bat` · chọn cả hai hoặc không cách nào · `phut` ngoài 1..720 · `luc` sai `HH:MM`.

## Chương trình — `ThanChuongTrinhHenGio`

```
ten     string ≤40
kieu    'gio' | 'khoang'
buoc    BuocHenGio[]  1..8
chay    'motlan' | 'lap'
ngay    int[] 0=CN … 6=T7   — bắt buộc ≥1 khi chay='lap'
batDau  "HH:MM" | null      — bắt buộc khi kieu='khoang' VÀ chay='lap'
```

`BuocHenGio`:

```
moc  kieu='gio'    → "HH:MM", không trùng mốc
     kieu='khoang' → int 1..1440, TĂNG DẦN
hd   [{cap, val}]  1..5   cap phải nằm trong capChoPhep LÚC GHI
```

`ChuongTrinhHenGio` = thân trên + `id:int` + `capThuHoi:string[]` — cap từng lưu trong bước
nhưng **đã bị thu hồi sau khi lưu**; app đeo cảnh báo, lúc chạy hệ tự bỏ qua hành động đó.

### Giới hạn cứng

10 chương trình/thiết bị · 8 bước/chương trình · 5 hành động/bước · tên ≤40 ký tự.
Sai → `400` với `message` tiếng Việt **chỉ đúng bước sai** — hiện thẳng lên màn.

### Ngữ nghĩa kích hoạt

- `motlan`: tính giờ từ **BÂY GIỜ**, chạy xong **tự rời** (thôi đang-dùng).
- `lap`: tính mốc từ **phút kích hoạt**; `dangChay` luôn null.
- Mỗi thiết bị chỉ **một** chương trình đang dùng; kích hoạt cái mới sẽ bỏ cái cũ
  (và dừng `motlan` đang chạy giữa chừng) trong cùng một giao dịch.

## Mã lỗi

| Mã | Khi nào |
|---|---|
| 400 | Thân sai (xem từng cửa) — `message` tiếng Việt |
| 401 | Thiếu/sai/hết hạn token |
| 403 | `HenGioTat` — sản phẩm tắt hẹn giờ. Chỉ ở cửa GHI |
| 404 | `not_found` đồng nhất — không tồn tại, không phải của mình, hoặc là thiết bị được chia sẻ |
| 409 | Sửa chương trình `motlan` đang chạy giữa chừng — dừng rồi hãy sửa |

## Đã kiểm trên IBS thật (DEV, 07/10/2026)

Thiết bị `03092026A1` (`fan_sbi314`), tài khoản CHỦ sở hữu, qua webapp "IOT App - New UI".

Khớp spec, không lệch chỗ nào:

- `GET` trả đủ 6 trường bắt buộc; `capChoPhep` = `["buzzer","light","mode","oscillate","power","speed","timerOff"]`
  — đúng bằng tập "có `rpc` và `kind` ≠ sensor", tức công thức suy ra `capChoPhep` là đoán được từ catalog.
- Mỗi chương trình trả kèm `capThuHoi` (rỗng khi không có cap nào bị thu hồi).
- `POST /chuong-trinh` → `201 {ok:true, id}`; ba chương trình tạo lại ra id 52/53/54.
- `PUT /hen` với `{bat:false, phut:720}` → `200 {ok:true, hen:{luc:<epoch ms>, bat:false}}`;
  `luc` đúng bằng giờ hiện tại + 720 phút.
- `DELETE /hen` → `200 {ok:true}`, `hen` về null.
- Một `PUT /hen` dính `401` rồi client tự `/auth/refresh` và thử lại ra `200` — đường làm mới
  token một lần chạy đúng trên cửa GHI, không phải chỉ trên GET.

### Bốn cửa còn lại — kiểm ngày 07/10/2026, 22:5x

Thiết bị `SBI314` (`fan_sbi314`, id `31e9d160-…`), tài khoản CHỦ, qua webapp local cổng 3001.
Chương trình thử: `kieu=khoang`, `chay=motlan`, một bước `moc=1440`, hành động `buzzer=false`.

| Gọi | Kết quả |
|---|---|
| `POST …/chuong-trinh` | `201 {ok:true, id:56}` |
| `POST …/chuong-trinh/56/dung` | **`201`** (không phải 200) — `dangDung=56`, `dangChay={buocXong:0}` |
| `PUT …/chuong-trinh/56` lúc đang chạy | **`409`** |
| `DELETE …/dang-dung` | `200` — `dangDung`/`dangChay` về null, **chương trình vẫn còn** |
| `PUT …/chuong-trinh/56` sau khi dừng | `200` — tên đổi thành công |
| `PUT …/hen {bat:false, phut:720}` | `200` — `luc` = bây giờ + 720 phút |
| `DELETE …/hen` | `200` |
| `DELETE …/chuong-trinh/56` | `200` — về 0/10, trả đúng nguyên trạng |

Nguyên văn `message` của nhánh 409:

> Chương trình đang chạy giữa chừng — dừng rồi hãy sửa

Một điểm lệch nhỏ so với tóm tắt cũ: **`/dung` trả `201 Created`**, dù nó không tạo tài
nguyên nào mà chỉ đổi cái đang dùng. Client hiện chỉ đọc `ok` nên không ảnh hưởng, nhưng
nếu openapi khai `200` cho `dungChuongTrinhHenGio` thì spec và máy chủ đang lệch nhau.

## Đối chiếu với webapp "IOT App - New UI"

Đủ cả 8 lời gọi trong `lib/iotx/client.ts`, kiểu trong `lib/iotx/contracts.ts` khớp spec,
`components/newui/device/HenGioPanel.tsx` dùng hết.

Ba lỗi tìm được ngày 07/10 khi dựng bộ kiểm `tests/hen-gio.mjs` (đã sửa):

1. Thanh ghim ở màn chi tiết in cứng "chưa đặt gì" kể cả khi đã có hẹn, và vẫn hiện trên máy
   được chia sẻ — bấm vào chỉ gặp màn báo lỗi. Giờ đọc `/hen-gio` và tự ẩn khi `batDuoc=false` hoặc `404`.
2. Đóng màn hẹn giờ văng thẳng ra danh sách thiết bị thay vì về màn chi tiết.
3. Ô "Giờ bắt đầu chu kỳ" lấy `soan.batDau ?? "06:00"` làm giá trị hiển thị trong khi state vẫn
   null → người dùng thấy giờ nằm đó mà màn vẫn báo thiếu, gõ lại đúng 06:00 thì trình duyệt
   không bắn `onChange` nên kẹt luôn.

Còn một điểm chưa khớp, thuộc phía tài liệu: **spec không tả `henGio` trong schema sản phẩm**.
Catalog thật có trả `henGio: {bat, tatCap}` trong `/v1/products`, nhưng `openapi.yaml` không khai
— client sinh tự động sẽ không thấy. Đáng báo cho nhóm IBS.
