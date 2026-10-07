# Việc: Kiểm bốn cửa hẹn giờ còn lại trên IBS thật

- Trạng thái: **chưa làm**
- Phạm vi: `IOT App - New UI` (không sửa mã trừ khi phát hiện lệch)
- Làm ở đâu: **luồng Cowork có trình duyệt tích hợp** — chỉ ở đó mới mở được API dev
  và Mydocu sau SSO. Nếu tìm ra lệch so với spec thì phần **sửa mã** mới sang tab Code.
- Viết: 07/10/2026

## Mục tiêu

Ngày 07/10 đã đối chiếu `GET /hen-gio`, `PUT /hen`, `DELETE /hen`,
`POST /chuong-trinh` với IBS thật — khớp spec. Còn **bốn thứ chưa kiểm**, vì
chúng sẽ hẹn lệnh thật xuống mạch đang cắm điện:

| Cửa | Cần chứng minh |
|---|---|
| `POST /chuong-trinh/{id}/dung` | kích hoạt được, `dangDung` và `dangChay` đổi đúng |
| `PUT /chuong-trinh/{id}` | sửa được khi **không** đang chạy |
| — nhánh **409** | sửa `motlan` **đang chạy giữa chừng** thì bị chặn |
| `DELETE /dang-dung` | thôi dùng mà **không** xoá chương trình |

Hiện bốn cái này mới chỉ chạy qua máy chủ giả trong `tests/hen-gio.mjs`. Nếu IBS
thật cư xử khác, bộ kiểm đang nói dối.

Hợp đồng đầy đủ: `docs/iotx-api-hen-gio.md`.

## Rủi ro và cách né

Hẹn giờ là lệnh **thật** xuống thiết bị thật. Cách né:

1. Chỉ dùng một hành động vô hại: **`buzzer` → `off`** (tắt còi). Nếu sản phẩm
   không có `buzzer` thì dùng `light` → `off`.
2. Đặt mốc **1440 phút** (24 giờ). Trong suốt buổi kiểm sẽ không có gì bắn ra.
3. `chay: 'motlan'` — chạy một lần rồi tự rời, không đọng lại.
4. Xoá sạch ở bước cuối và trả nguyên trạng.

Kể cả nếu bỏ quên, thứ tệ nhất xảy ra sau 24h là **còi bị tắt**.

## Chuẩn bị

- Thiết bị: **chọn một máy mình là CHỦ sở hữu** và không ngại bị hẹn giờ.
  Lần trước dùng `03092026A1` (`fan_sbi314`); nếu vẫn dùng được thì tốt nhất,
  vì đã biết `capChoPhep` của nó:
  `["buzzer","light","mode","oscillate","power","speed","timerOff"]`.
- Tài khoản: **tài khoản chủ**. Máy được chia sẻ sẽ trả `404` đồng nhất.
- Người dùng tự đăng nhập vào webapp trên trình duyệt — Claude **không** gõ mật khẩu.
- Gọi API bằng chính phiên đã đăng nhập đó (không có token nào nằm trong mã nguồn hay doc).

## Các bước

Mỗi bước: gọi → đọc kỳ vọng → `GET /hen-gio` xác nhận.

**0. Chụp nguyên trạng.** `GET /devices/{id}/hen-gio`, lưu lại `hen`, `dangDung`,
`chuongTrinh` để khôi phục ở bước 8.

**1. Tạo chương trình thử.**

```http
POST /v1/devices/{id}/hen-gio/chuong-trinh
{
  "ten": "KIEM-TAM 07-10",
  "kieu": "khoang",
  "chay": "motlan",
  "buoc": [{ "moc": 1440, "hd": [{ "cap": "buzzer", "val": "off" }] }]
}
```

Kỳ vọng `201 {ok:true, id:<N>}`. (`khoang` + `motlan` → **không** cần `batDau`;
nếu IBS vẫn đòi `batDau` thì đó đã là một lệch so với spec — ghi lại.)

**2. Kích hoạt.** `POST …/chuong-trinh/{N}/dung` → kỳ vọng `200 {ok:true}`.

`GET /hen-gio` kỳ vọng:
- `dangDung === N`
- `dangChay !== null`, dạng `{buocXong: 0, tuLuc: <epoch ms ≈ bây giờ>}`

**3. Nhánh 409 — cái cần biết nhất.** Sửa chính chương trình đang chạy:

```http
PUT /v1/devices/{id}/hen-gio/chuong-trinh/{N}
{ "ten": "KIEM-TAM đổi", "kieu": "khoang", "chay": "motlan",
  "buoc": [{ "moc": 1440, "hd": [{ "cap": "buzzer", "val": "off" }] }] }
```

Kỳ vọng **`409`**. Ghi lại nguyên văn `message` — app sẽ hiện thẳng câu này.

**4. Thôi dùng.** `DELETE …/hen-gio/dang-dung` → kỳ vọng `200 {ok:true}`.

`GET /hen-gio` kỳ vọng:
- `dangDung === null`
- `dangChay === null`
- **chương trình `N` vẫn còn** trong `chuongTrinh` ← điểm mấu chốt: thôi dùng ≠ xoá

**5. Sửa lại sau khi đã dừng.** Lặp lại hệt bước 3 → giờ kỳ vọng **`200`**,
và `GET` thấy `ten` đã đổi.

**6. (tuỳ chọn) Một giao dịch thay cái đang dùng.** Tạo chương trình thứ hai `M`,
kích hoạt `M` khi `N` đang dùng → kỳ vọng `dangDung === M` và `N` tự rời, không
phải gọi `DELETE /dang-dung` trước.

**7. Xoá.** `DELETE …/chuong-trinh/{N}` (và `{M}` nếu có) → `200`.

**8. Khôi phục.** So `GET /hen-gio` với ảnh chụp ở bước 0. Phải trùng khít.

## Cách kiểm chứng

Đạt khi cả bốn cửa trả đúng mã kỳ vọng và `GET /hen-gio` sau mỗi bước khớp bảng
trên. Mỗi lệch so với spec phải ghi: cửa nào, gửi gì, nhận gì, spec nói gì.

Sau đó **cập nhật `docs/iotx-api-hen-gio.md`**:
- chuyển bốn cửa từ "Chưa kiểm" sang mục "Đã kiểm trên IBS thật";
- chép nguyên văn `message` của nhánh 409;
- nếu có lệch, thêm vào mục "Còn một điểm chưa khớp" và báo nhóm IBS.

Nếu phát hiện lệch khiến mã sai, **mở một doc việc mới cho tab Code** — doc này
không sửa mã.

## Ràng buộc (AGENTS.md)

- Chỉ nói chuyện với IBS qua `/v1`. Không đụng `admin/*`, `internal/*`, Keycloak, ThingsBoard.
- **Không để token, mật khẩu, khoá nào vào mã nguồn hay vào doc.**
- Token sống 300 giây; `401` thì làm mới **một lần** rồi thôi. (Đã chứng minh
  ngày 07/10 là đường làm mới chạy đúng cả trên cửa GHI.)
- `Idempotency-Key` là của RPC thiết bị, **không** áp cho cửa hẹn giờ.
- `404 {"message":"not_found"}` cố tình nhập nhằng — đừng suy ra nguyên nhân.

## Không làm

- ❌ Dùng thiết bị của người khác, hay máy được chia sẻ cho mình.
- ❌ Đặt hành động có hậu quả thật (`power`, `speed`, `oscillate`) trong bước.
- ❌ Đặt mốc gần (vài phút) "cho nhanh" — để 1440 phút.
- ❌ Bỏ qua bước 8. Lần trước đã có ba chương trình biến mất và mất khá lâu mới
  truy ra nguyên nhân; đừng để lặp lại chuyện không biết ai làm gì.
- ❌ Sửa mã trong doc này.
