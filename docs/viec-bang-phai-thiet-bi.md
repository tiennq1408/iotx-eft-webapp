# Việc: Nút thông tin + bảng phải (thông tin thiết bị & bảo hành)

- Trạng thái: **chưa làm**
- Phạm vi: `IOT App - New UI`
- Làm ở đâu: **tab Code**
- Viết: 20/10/2026 — đã gọi thử `/v1/serials/lookup` 8 lần trên DEV, chạy đúng tài liệu

> **Doc này THAY THẾ `docs/viec-thong-tin-thiet-bi.md`.** Doc kia định làm một popup giữa màn
> hiện Tên/Loại/Serial/Mã/Ngày thêm; doc này gộp luôn nội dung đó thành **mục 1** của bảng phải,
> cộng thêm **mục 2** là dữ liệu bảo hành từ S-Factory. Một nút, một bảng, hai mục — thay vì hai
> nút cùng nói về "thông tin thiết bị". Doc kia chưa làm dòng nào nên bỏ đi không mất gì.

## Mục tiêu

Thêm một nút cạnh nút **Ghim thiết bị** ở đầu màn chi tiết. Bấm vào mở **bảng trượt từ phải**
gồm hai mục:

1. **Thông tin thiết bị** — dữ liệu local, hiện ngay lập tức
2. **Bảo hành** — gọi `/v1/serials/lookup`, hiện sau

---

## Đã đo trên DEV ngày 20/10 — cửa chạy đúng tài liệu

| Gửi | Kết quả |
|---|---|
| `SNB6DRE9USGD` | 200 `found:true`, thân khớp tài liệu từng chữ · **203ms** |
| `snb6dre9usgd` chữ thường | 200, trả `serial:"SNB6DRE9USGD"` **in hoa sẵn** |
| `"  snb6dre9usgd  "` | 200, chuẩn hoá đúng |
| serial lạ | 200 `found:false`, **đủ khoá, toàn null** |
| `a!` | 400 `invalid_serial` + câu tiếng Việt |
| `ab` / `abc` | 400 / 200 — biên 3 ký tự đúng |

**Không gặp 503 `not_configured`** → Super Admin đã khai URL S-Factory trên DEV. Trả lời
86–203ms, đủ nhanh để gọi ngay khi mở bảng, không cần nút "Kiểm tra" riêng.

---

## Việc 1 — `lib/types.ts` + `lib/iotx/mappers.ts`

Thêm `createdTime` vào `Device` (mục 1 của bảng cần nó):

```ts
  /** Mốc thêm thiết bị (epoch ms). */
  createdTime?: number;
```

và trong `mapIotxDevice`: `createdTime: device.createdTime,`

Bốn trường kia đã có sẵn — **đặc biệt `code: device.name` chính là SERIAL**, mapper đã ánh xạ
sẵn kèm chú thích *"Mã in trên thân máy"*. Không phải sửa gì thêm.

## Việc 2 — `lib/iotx/client.ts`: cửa tra serial

```ts
export type BaoHanhSerial = {
  found: boolean;
  serial: string;
  product: { name: string; code: string } | null;
  manufactureDate: string | null;   // "2025-07-11" — ĐÃ theo giờ Việt Nam
  purchaseDate: string | null;
  warranty: {
    months: number | null; activatedAt: string | null; expiredAt: string | null;
    status: string | null; code: string | null; exportedAt: string | null;
  } | null;
  source: string;
};

/**
 * Tra serial trong S-Factory.
 *
 * Serial lạ KHÔNG phải lỗi: máy chủ trả 200 kèm `found:false` và mọi khoá là null. Chỉ các mã
 * 4xx/5xx mới là lỗi thật — xem bảng ở mục 4.
 *
 * IBS tự chuẩn hoá chữ thường và khoảng trắng, trả bản in hoa trong `serial`.
 */
traSerial(serial: string) {
  return this.request<BaoHanhSerial>(`/serials/lookup?serial=${encodeURIComponent(serial.trim().toUpperCase())}`);
}
```

Dùng `this.request` để ăn sẵn Bearer và luật làm mới vé sau 401 — **đừng tự gọi `fetch`**.

## Việc 3 — Nút mở, cạnh nút Ghim

**`components/ui/device/DeviceDetail.tsx`**, trong khối `.devdau` (dòng ~239), đặt **ngay sau**
`<button className="fav-lon">`:

```tsx
{device.code && (
  <button className="tt-lon" aria-label={t("tt_mo")} onClick={() => setMoBang(true)}>
    <Icon name="info" />
  </button>
)}
```

- **Không có `device.code` thì không vẽ nút** — không có serial thì chẳng có gì để tra.
- Thêm nét `info` vào bảng `D` của `components/ui/Icon.tsx`:
  `info: ["M12 3a9 9 0 100 18 9 9 0 000-18z", "M12 11v5", "M12 7.6v.9"],`
- CSS đi theo `.fav-lon` cho cân: **44×44**, nền trong suốt, màu `var(--dim)`.
- **Đừng dùng emoji ℹ️** — local vừa dọn sạch emoji ở đợt `viec-dong-nhat-windows.md`;
  Windows vẽ một số emoji ra ký hiệu đen trắng.

## Việc 4 — Bảng phải

**File mới:** `components/ui/device/BangThietBi.tsx`

**Dùng lại `.drawer-overlay` + `.drawer` sẵn có** (`app/globals.css:308-309`), đúng như
`MenuDrawer` trong `components/ui/modals.tsx:51`. Hai lớp đó:

- đã `justify-content:flex-end` → **trượt từ phải**, không phải viết mới
- `position:absolute` neo vào khung ứng dụng → **nằm gọn trong khung**. `tests/khung.mjs` kiểm
  đúng chuyện này; bảng tự chế bằng `position:fixed` sẽ trượt ra ngoài khung ở màn rộng.

Thêm một biến thể bề rộng, vì 80% quá rộng cho bảng thông tin:

```css
.drawer.tt{width:min(88%, 360px);}
```

### Mục 1 — Thông tin thiết bị (hiện ngay)

| Dòng | Nguồn | Ví dụ |
|---|---|---|
| Tên | `device.name` *(đã là label)* | `SBI314 R` |
| Loại | ảnh sản phẩm + `device.model` | `fan_sbi314` |
| **Serial** | **`device.code`** | `05092026A3` |
| Mã thiết bị | `device.id` | `31e9d160-a8da-11f1-…` |
| Ngày thêm | `device.createdTime` | `5/9/2026` |

### Mục 2 — Bảo hành (gọi API)

Gọi `traSerial(device.code)` **khi bảng mở**, không chờ bấm nút. Ba trạng thái:

**Đang tải** — chừa sẵn chiều cao, đừng để bảng nhảy giật khi dữ liệu về.

**`found: true`** — hiện:

| Dòng | Nguồn |
|---|---|
| Sản phẩm | `product.name` |
| Mã sản phẩm | `product.code` *(mã SAP)* |
| Ngày sản xuất | `manufactureDate` |
| Ngày mua | `purchaseDate` |
| Bảo hành | `warranty.status` |
| Thời hạn | `warranty.months` tháng |
| Kích hoạt | `warranty.activatedAt` |
| Hết hạn | `warranty.expiredAt` |
| Mã bảo hành | `warranty.code` |
| Ngày xuất kho | `warranty.exportedAt` |

`warranty` có thể là **`null` nguyên khối** — khi đó hiện một dòng *"Chưa có thông tin bảo hành"*,
đừng vẽ sáu dòng rỗng.

**`found: false`** — *"Chưa có dữ liệu cho serial này"*. **Đây KHÔNG phải lỗi**, đừng tô đỏ.

### Ngày tháng — một cái bẫy

`manufactureDate` trả về dạng `"2025-07-11"` và tài liệu ghi rõ **đã theo giờ Việt Nam**.

**Đừng đưa qua `new Date()` rồi định dạng theo locale.** Chuỗi `"2025-07-11"` được JS hiểu là
nửa đêm **UTC**; máy ở múi giờ âm sẽ hiện thành `10/7/2025` — lệch một ngày. Tách chuỗi mà dùng:

```ts
/** "2025-07-11" → "11/7/2025". KHÔNG qua Date: chuỗi đã theo giờ VN, parse là lệch múi giờ. */
const ngayISO = (s?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : "—";
};
```

`createdTime` ở mục 1 thì khác — nó là epoch ms, dùng `Intl` bình thường:

```ts
const DINH_DANG_NGAY = new Intl.DateTimeFormat("vi-VN", { day:"numeric", month:"numeric", year:"numeric" });
export function dinhDangNgay(luc?: number | string | Date | null): string {
  if (luc === null || luc === undefined) return "—";
  const d = luc instanceof Date ? luc : new Date(luc);
  return Number.isNaN(d.getTime()) ? "—" : DINH_DANG_NGAY.format(d);
}
```

(thêm vào `lib/ui/thoiGian.ts`; `dinhDangLuc` sẵn có ra `"22:00 07/10"` — có giờ, thiếu năm,
**không dùng được ở đây**)

---

## Việc 5 — Lỗi: ĐỪNG dùng `moTaLoi()` cho mục bảo hành

**Đây là chỗ dễ sai nhất của cả doc.**

`moTaLoi()` ánh xạ **502 → *"Không kết nối được máy chủ IoTX"***. Nhưng ở cửa này 502 nghĩa là
**IBS không gọi được S-Factory** — IoTX vẫn khoẻ. Dùng `moTaLoi` ở đây là nói sai hẳn bản chất
và người dùng sẽ đi kiểm tra mạng của chính họ.

Mục 2 phải có bảng ánh xạ riêng, đọc `error.status` và `error.payload.error`:

| Mã | `error` | Màn hiện | Có nút Thử lại |
|---|---|---|---|
| 200 `found:false` | — | "Chưa có dữ liệu cho serial này" | không |
| 400 | `invalid_serial` | hiện nguyên văn `message` máy chủ | không |
| 401 | — | client tự làm mới vé; vẫn hỏng thì để lỗi thoát ra như mọi cửa | không |
| 502 | `timeout` · `unreachable` · `http_403` · `bad_response` · `graphql` | "Không gọi được S-Factory, thử lại sau" | **có** |
| 503 | `not_configured` | "Chưa khai S-Factory" + **nhớ lại, ẩn nút cho tới khi tải lại trang** | không |

**Về 503:** tài liệu IBS nói *"ẩn nút Kiểm tra"*, nhưng chỉ sau khi gọi mới biết. Nên: gặp 503
thì ghi một cờ ở cấp mô-đun (`let chuaKhaiSFactory = false`) và từ đó **không vẽ nút** nữa trong
phiên này. Tải lại trang thì thử lại từ đầu.

**400 `invalid_serial` về lý thuyết không xảy ra** — serial lấy từ chính máy chủ. Nếu nó xảy ra
thì dữ liệu thiết bị có vấn đề; vẫn phải hiện lỗi, đừng nuốt.

---

## Việc 6 — Chữ, đủ ba ngôn ngữ vi / en / fil

```
tt_mo          "Thông tin thiết bị"
tt_tieu_de     "Thông tin thiết bị"
tt_ten · tt_loai · tt_serial · tt_ma · tt_ngay
bh_tieu_de     "Bảo hành"
bh_sp · bh_ma_sp · bh_ngay_sx · bh_ngay_mua · bh_trang_thai
bh_thang · bh_kich_hoat · bh_het_han · bh_ma_bh · bh_xuat_kho
bh_dang_tai    "Đang tra cứu…"
bh_khong_co    "Chưa có dữ liệu cho serial này"
bh_khong_bh    "Chưa có thông tin bảo hành"
bh_loi_goi     "Không gọi được S-Factory, thử lại sau"
bh_chua_khai   "Chưa khai S-Factory"
bh_thu_lai     "Thử lại"
```

Thiếu một ngôn ngữ thì màn rơi về tiếng Việt mà không ai hay.

---

## Việc 7 — Bài kiểm

**File mới:** `tests/bang-thiet-bi.mjs`, đăng ký vào nhóm `api`. Thêm cửa
`/v1/serials/lookup` vào `tests/may-chu-gia.mjs` để giả được đủ năm nhánh.

| Ca | Mong đợi |
|---|---|
| Thiết bị có `code` | **có** nút cạnh nút Ghim |
| Thiết bị **không** có `code` | **không** vẽ nút |
| Bấm nút | bảng trượt từ phải, mục 1 hiện **ngay** |
| Serial hiện ở mục 1 | đúng `device.name` của API, **không phải** `label` |
| Thiết bị đã đổi tên | Tên ≠ Serial — hai giá trị khác nhau |
| `found:true` | đủ dòng bảo hành, ngày đúng `d/M/yyyy` |
| `warranty: null` | **một** dòng "Chưa có thông tin bảo hành", không phải sáu dòng rỗng |
| `found:false` | câu "chưa có dữ liệu", **không tô đỏ** |
| 502 | câu S-Factory + **nút Thử lại**, KHÔNG phải câu "Không kết nối được máy chủ" |
| 503 | báo chưa khai, và **lần sau không vẽ nút** |
| Khổ 360px | bảng không gây cuộn ngang (UUID xuống dòng) |
| Màn rộng 1280px | bảng **nằm trong khung**, không tràn ra nền xám |
| `manufactureDate: "2025-07-11"` | hiện `11/7/2025` ở **mọi múi giờ** |

Dữ liệu giả `tests/du-lieu/bootstrap.json` đã có hai thiết bị `name` khác `label` — dùng luôn.

---

## Kiểm sau khi làm

```bash
cd "/Users/tienquang/Documents/Homichi/IOT/IOT App - New UI"
npm run lint
npm run build
npm test
```

Nối API DEV thật, mở **SBI314 R**:

- [ ] Có nút tròn cạnh nút Ghim
- [ ] Bấm → bảng trượt từ phải, mục 1 hiện ngay
- [ ] **Tên `SBI314 R`**, **Serial `05092026A3`** — khác nhau
- [ ] Mục Bảo hành: hiện "Đang tra cứu…" rồi ra kết quả (serial này nhiều khả năng `found:false`)
- [ ] Thu còn 360px: không cuộn ngang
- [ ] Kéo rộng 1280px: bảng không tràn ra ngoài khung
- [ ] Giao diện tối: đọc được

Muốn thấy `found:true` thì tra tay bằng serial Karofi `SNB6DRE9USGD` — serial đó có dữ liệu thật.

---

## Hai câu nên hỏi IBS, không chặn việc này

**1. Mã SAP khớp vào đâu?** Tài liệu ghi `product.code` là *"mã SAP để khớp sản phẩm trong danh
mục"*. Tôi kiểm `/v1/products` (12 sản phẩm): **không sản phẩm nào mang mã `1001040629`**, cũng
không có trường nào tên kiểu `code`/`sap`/`sku`. Nên hiện tại chỉ hiện được **chữ cho người
đọc**, không suy ra được `type` của IoTX. Việc này không chặn bảng thông tin, nhưng chặn ý tưởng
"tự điền loại máy" trong luồng thêm thiết bị.

**2. `warranty.status` có những giá trị nào?** Đo được một giá trị: `"Inactive"` — tiếng Anh.
Cần danh sách đầy đủ để dịch. Chưa có thì **hiện nguyên văn**, đừng đoán.

## Nhắc

Việc này thực thi ở **tab Code**, không làm ở đây.
Doc này thay `docs/viec-thong-tin-thiet-bi.md` — xoá doc kia khi làm xong.
