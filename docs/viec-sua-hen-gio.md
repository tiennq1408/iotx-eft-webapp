# Việc: Ba điểm cần sửa ở khối hẹn giờ

- Trạng thái: **đã làm 07/10/2026**
- Phạm vi: `IOT App - New UI`
- Làm ở đâu: **tab Code**
- Viết: 07/10/2026, sau khi chạy hết luồng hẹn giờ trên API thật

## Bối cảnh

Luồng hẹn giờ đã được chạy đầu-cuối trên IBS thật ngày 07/10 (thiết bị `SBI314`,
tài khoản chủ, webapp local cổng 3001). **Chín lời gọi API đều đúng** — kết quả
chi tiết trong `docs/iotx-api-hen-gio.md`. Ba điểm dưới đây là chuyện giao diện
và xử lý lỗi, không phải lỗi hợp đồng.

## Mục tiêu

1. Xoá chương trình phải hỏi lại — hiện một chạm là mất vĩnh viễn.
2. Không mời người dùng làm một việc chắc chắn bị từ chối (`409`).
3. Lỗi tạm thời không được làm biến mất nút hẹn giờ như thể thiết bị không có.

---

## 1. Xoá chương trình không hỏi lại

**Hiện trạng** — `components/newui/device/HenGioPanel.tsx:204`:

```tsx
<button aria-label={t("auto_delete")} disabled={dangLam}
  onClick={() => { void lam(() => iotxClient.xoaChuongTrinh(deviceId, ct.id)); }}>
  <Icon name="trash" />
</button>
```

Một chạm là gọi `DELETE` ngay. Không hoàn tác được, máy chủ không giữ bản sao.
Đây đúng là tình huống đã xảy ra ngày 07/10 khi ba chương trình biến mất và mất
khá lâu mới truy ra nguyên nhân.

**Cách sửa — xác nhận tại chỗ, hai nhịp.** App **chưa có** component hỏi-lại nào
(đã tìm: không có `ConfirmModal`, không có `window.confirm`), nên cách rẻ nhất là
đổi chính nút thùng rác thành hai nút trong 4 giây:

```tsx
const [choXoa, setChoXoa] = useState<number | null>(null);

// trong hàng chương trình, thay nút thùng rác:
{choXoa === ct.id ? (
  <>
    <button className="nut-bam canh-bao" disabled={dangLam}
      onClick={() => { setChoXoa(null); void lam(() => iotxClient.xoaChuongTrinh(deviceId, ct.id)); }}>
      {t("hg_xoa_that")}
    </button>
    <button className="secondary nut-bam" onClick={() => setChoXoa(null)}>{t("cancel")}</button>
  </>
) : (
  <button aria-label={t("auto_delete")} disabled={dangLam}
    onClick={() => setChoXoa(ct.id)}><Icon name="trash" /></button>
)}
```

Thêm một `useEffect` tự huỷ sau 4 giây, và đặt `setChoXoa(null)` khi `tongQuan`
nạp lại, để trạng thái chờ không treo lơ lửng.

Chuỗi mới (ba ngôn ngữ): `hg_xoa_that` — "Xoá thật?" / "Delete?" / "Burahin?".
Dùng lại `cancel` đã có.

Giữ vùng chạm ≥44px cho cả hai nút, và hàng không được tràn ngang ở bề rộng 390px
— chương trình có tên dài 40 ký tự là trường hợp cần thử.

**Lựa chọn lớn hơn, nếu muốn làm một lần cho cả app:** dựng `XacNhanModal` trong
`components/newui/modals.tsx` rồi dùng chung. Đáng cân nhắc vì còn hai chỗ xoá
khác cũng không hỏi lại: "Xoá tất cả thông báo" và xoá bước trong trình soạn. Nhưng
nếu chỉ muốn vá đúng chỗ nguy hiểm nhất thì cách hai nhịp ở trên là đủ.

---

## 2. Nút "Sửa chương trình" mời gọi một cú `409`

**Hiện trạng** — `HenGioPanel.tsx:200`: nút sửa luôn bật. Đã đo: với chương trình
`motlan` đang chạy giữa chừng, `PUT …/chuong-trinh/{id}` **luôn** trả `409`
"Chương trình đang chạy giữa chừng — dừng rồi hãy sửa". Người dùng mở trình soạn,
gõ xong, bấm Lưu, rồi mới bị từ chối.

**Cách sửa** — vô hiệu hoá đúng trường hợp đó, kèm lý do:

```tsx
// `dangChay` chỉ khác null khi chương trình ĐANG DÙNG thuộc kiểu `motlan` và đang chạy dở.
const khoaSua = tongQuan.dangChay !== null && tongQuan.dangDung === ct.id;
...
<button aria-label={t("hg_edit_program")} disabled={dangLam || khoaSua}
  title={khoaSua ? t("hg_khoa_sua") : undefined}
  onClick={() => onSoan({ id: ct.id, than: { … } })}>
  <Icon name="settings" />
</button>
```

Chuỗi mới `hg_khoa_sua` — "Đang chạy giữa chừng — thôi dùng rồi hãy sửa."

**Cẩn thận, đây là chỗ dễ làm sai:** điều kiện phải đúng cả hai vế.
Chương trình `lap` **không bao giờ** có `dangChay` (hợp đồng nói rõ `dangChay`
luôn null với `lap`), và sửa một chương trình `lap` đang dùng là **hợp lệ**, trả
`200`. Nếu khoá theo mỗi `dangDung === ct.id` thì sẽ chặn nhầm.

Giữ nguyên việc hiện câu lỗi `409` của máy chủ trong trình soạn — nó vẫn là lưới
an toàn cho trường hợp chương trình bắt đầu chạy ngay sau khi màn được nạp.

---

## 3. `useHenGio` gộp mọi lỗi thành một

**Hiện trạng** — `hooks/useHenGio.ts`:

```ts
try {
  setTongQuan(await iotxClient.xemHenGio(deviceId));
  setLoi("");
} catch (error) { setLoi(moTaLoi(error)); }
```

và `components/newui/device/DeviceDetail.tsx:73`:

```ts
const hienGhim = !isIotxMode || (hg?.batDuoc === true && !loiHenGio);
```

Nghĩa là **bất kỳ** lỗi nào cũng giấu hẳn nút hẹn giờ: `404` (đúng), nhưng cũng cả
mất mạng, `502` từ proxy `/v1`, `401` sau khi làm mới token hỏng. Người dùng thấy
nút biến mất và không có cách nào biết vì sao — y hệt như thiết bị không hỗ trợ
hẹn giờ.

Chỉ hai tình huống là **vĩnh viễn** và đáng giấu hẳn:

| Tình huống | Nghĩa | Xử lý |
|---|---|---|
| `404 not_found` | máy được chia sẻ, hoặc không phải của mình | giấu hẳn |
| `batDuoc: false` | sản phẩm tắt hẹn giờ | giấu hẳn |
| `403 HenGioTat` | sản phẩm tắt hẹn giờ (chỉ ở cửa GHI, nhưng phòng xa) | giấu hẳn |
| mọi lỗi khác | tạm thời | **giữ nút**, bấm vào thì báo lỗi |

**Cách sửa** — `IotxApiError` đã mang sẵn `.status` (xem `lib/iotx/errors.ts`),
nên phân loại được ngay:

```ts
import { IotxApiError } from "@/lib/iotx/errors";
...
const [anGian, setAnGian] = useState(false);   // 404 / 403: giấu hẳn, không phải lỗi tạm
...
catch (error) {
  const ma = error instanceof IotxApiError ? error.status : 0;
  setAnGian(ma === 404 || ma === 403);
  setLoi(moTaLoi(error));
}
```

rồi ở `DeviceDetail.tsx`:

```ts
const { tongQuan: hg, loi: loiHenGio, anGian } = useHenGio(device.id);
const hienGhim = !isIotxMode || (!anGian && (hg?.batDuoc !== false));
```

Khi `loiHenGio` có chữ mà `anGian` false: vẫn hiện thanh ghim, nhưng dòng tóm tắt
nói lỗi thay vì "chưa đặt gì", và bấm vào thì vào màn hẹn giờ — ở đó `HenGioPanel`
vốn đã biết hiện lỗi và cho thử lại.

Nhớ kiểm cả lúc **đang tải lần đầu**: `hg` còn null thì đừng nháy nút rồi lại giấu.

---

## Cách kiểm chứng

```bash
npx tsc --noEmit
npm run lint
npm run build
node tests/chay.mjs api      # hen-gio.mjs phải vẫn đạt 27
```

Thêm vào `tests/hen-gio.mjs` (máy chủ giả đã có đủ cửa, chỉ cần dựng tình huống):

1. Bấm thùng rác một lần → **không** có `DELETE` nào trong nhật ký; hiện nút xác nhận.
2. Bấm xác nhận → mới có `DELETE`.
3. Bấm thùng rác rồi bấm "Huỷ" → không có `DELETE`.
4. Chương trình `motlan` đang chạy → nút sửa `disabled`.
5. Chương trình `lap` đang dùng → nút sửa **vẫn bấm được** (đây là bài dễ quên nhất).
6. Máy chủ giả trả `503` cho `GET /hen-gio` → thanh ghim **vẫn hiện**.
7. Máy chủ giả trả `404` → thanh ghim **biến mất**.

Soi mắt: ở bề rộng 390px, một chương trình tên 40 ký tự ở trạng thái chờ xác nhận
vẫn không tràn ngang, và cả hai nút vẫn ≥44px.

## Ràng buộc (AGENTS.md)

- Vùng chạm ≥44px, không tràn ngang, tương phản đạt WCAG.
- `404 {"message":"not_found"}` cố tình nhập nhằng — hiện câu chung, đừng đoán nguyên nhân.
- Hiện nguyên văn `message` tiếng Việt của máy chủ cho mọi mã khác.
- Chạy `npm run lint` và `npm run build` trước khi bàn giao.

## Không làm

- ❌ Đổi thiết kế màn hẹn giờ ngoài ba điểm trên.
- ❌ Thêm `window.confirm` — nó chặn luồng và không theo được giao diện app.
- ❌ Khoá nút sửa chỉ dựa trên `dangDung` (sẽ chặn nhầm chương trình `lap`).
- ❌ Bỏ việc hiện câu lỗi `409` của máy chủ — vẫn cần làm lưới an toàn.

## Ghi chú gửi nhóm IBS (không phải việc của app)

`POST /devices/{id}/hen-gio/chuong-trinh/{ctId}/dung` trả **`201 Created`**, dù nó
không tạo tài nguyên nào mà chỉ đổi chương trình đang dùng. Client hiện chỉ đọc
`ok` nên không hỏng. Cần đối chiếu `openapi.yaml` xem spec khai `200` hay `201`;
nếu khai `200` thì spec và máy chủ đang lệch nhau.
