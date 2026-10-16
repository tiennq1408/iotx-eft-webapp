# Việc: Đừng nuốt cảnh báo lỗi khi catalog chưa khai mã đó

- Trạng thái: **chưa làm**
- Phạm vi: `IOT App - New UI`
- Làm ở đâu: **tab Code**
- Viết: 16/10/2026 — đo trực tiếp trên DEV, có số liệu thật

## Triệu chứng

Trên `web.dev` thiết bị **Điều hòa** nổi dải cảnh báo đỏ *"Danh sách lỗi · 1"*.
Trên webapp local, cùng thiết bị đó, **không có gì cả**.

## Nguyên nhân: một dòng lọc trong mã local

Giá trị thật đang báo về từ DEV:

```
Điều hòa          ac_error_catalog = "1"      ← đang lỗi
Điều hòa L1 - 2   ac_error_catalog = ""       ← không lỗi (đúng, không nên hiện)
```

Catalog `ac_1` khai `values` gồm **26 mã** của máy lạnh Gree:

```
C2 C3 C5 · E0 E1 E2 E3 E4 E5 E6 E7 · L0 L1 L2 L4 L5 L6 L8 L9 · U0 U2 U3 U7 U8 U9 · 512
```

**`"1"` không nằm trong danh sách này.** Và `lib/ui/boCuc.ts:202` lọc theo đúng danh sách đó:

```ts
return maLoi(giaTri)
  .filter(ma => !choPhep.length || choPhep.includes(ma))   // ← "1" bị loại ở đây
  .map(ma => ({ ma, chu: ten[ma] || ma }));
```

Mảng về rỗng → `BoCucGrid.tsx:264` có điều kiện `loi.length > 0` → **không vẽ dải cảnh báo**.

web.dev không lọc gì, nên in thẳng mã ra. Chữ **"1"** trong ảnh chụp chính là cái mã trần
trụi đó — không phải tên lỗi, vì nó cũng chẳng tra được tên.

| | web.dev | local hiện tại |
|---|---|---|
| Nhận `"1"` | in nguyên mã `1` | lọc bỏ, **giấu luôn cảnh báo** |
| Người dùng thấy | một con số vô nghĩa | **không biết máy đang lỗi** |

## Chọn hướng nào

Cả hai đều chưa ổn, nhưng **cách của local nguy hiểm hơn**: một chiếc điều hòa đang báo lỗi mà
màn hình im lặng hoàn toàn — người dùng không gọi bảo hành, bộ phận hỗ trợ không biết có
chuyện gì. Hiện một mã khó hiểu vẫn còn hơn không hiện gì.

Bộ lọc ấy sinh ra có lý do chính đáng: `maLoi()` tách chuỗi thô theo dấu phẩy/khoảng trắng,
không chặn thì một giá trị rác đẻ ra mấy dòng lỗi vô nghĩa. Nhưng phần bảo vệ thật sự nằm ở
chỗ khác — `maLoi()` đã tự loại `""`, `"0"`, `"false"` rồi. Phần `values` chỉ đang chặn nhầm
**mã lỗi thật mà catalog chưa khai**.

Hướng sửa: **giữ phần bảo vệ, bỏ phần chặn nhầm.** Mã không tra được tên thì vẫn hiện, dưới
dạng `Mã lỗi 1` — không giấu, cũng không giả vờ hiểu.

---

## Việc 1 — `lib/ui/boCuc.ts`: viết lại `danhSachLoi`

Thay cả hàm (dòng 198–204) bằng:

```ts
export type MucLoi = { ma: string; chu: string; biet: boolean };

/** Chuỗi lỗi hỏng có thể tách ra rất nhiều mảnh; đừng để nó đẻ ra một danh sách dài vô tận. */
const TOI_DA_LOI = 20;

/**
 * Mã lỗi ghép với tên lỗi nếu catalog có bảng `labels`.
 *
 * KHÔNG lọc theo `cap.values`. Trước đây có lọc, và đó là lý do máy lạnh trên DEV báo
 * `ac_error_catalog = "1"` mà local im re: `"1"` không nằm trong 26 mã catalog khai
 * (C2, C3, E0…), nên nó bị loại, danh sách về rỗng, dải cảnh báo không vẽ. Thiết bị đang
 * lỗi mà người dùng không biết là hỏng nặng hơn nhiều so với hiện một mã khó hiểu.
 *
 * Phần bảo vệ thật nằm ở `maLoi()`: nó đã loại `""`, `"0"`, `"false"` và mã trùng.
 *
 * `biet` = có tra được tên hay không. Nơi gọi dựa vào đó để chọn chữ hiện ra; chính hàm này
 * không dịch được vì `t` nằm trong React.
 */
export function danhSachLoi(cap: IotxCapability, giaTri: unknown): MucLoi[] {
  const khai = new Set((cap.values ?? []).map(v => String(v ?? "").trim()).filter(Boolean));
  const ten = cap.labels ?? {};
  return maLoi(giaTri).slice(0, TOI_DA_LOI).map(ma => {
    const chu = ten[ma] ?? "";
    if (!chu) canhBaoMaLoiLa(cap.key, ma, khai.has(ma));
    return { ma, chu, biet: chu !== "" };
  });
}
```

và thêm hàm cảnh báo, đặt ngay trên nó. Cùng tinh thần với `soatKhoaLa`: **không bao giờ ném
lỗi, chỉ ở bản phát triển, mỗi mã kêu đúng một lần.**

```ts
/** Nhịp đồng bộ vẽ lại mỗi 2,5 giây; kêu mỗi lần vẽ là ngập console. Mỗi mã kêu MỘT lần. */
const daKeuMaLoi = new Set<string>();

function canhBaoMaLoiLa(khoaCap: string, ma: string, coTrongValues: boolean): void {
  if (process.env.NODE_ENV === "production") return;
  const dau = `${khoaCap}:${ma}`;
  if (daKeuMaLoi.has(dau)) return;
  daKeuMaLoi.add(dau);
  console.warn(
    `[loi] ${khoaCap} báo mã "${ma}" mà catalog không có tên` +
    (coTrongValues ? " (có trong values nhưng thiếu labels)" : " (KHÔNG có trong values)") +
    ` — màn vẫn hiện mã trần. Xem docs/viec-hien-ma-loi-la.md`,
  );
}
```

## Việc 2 — `components/ui/device/BoCucGrid.tsx`: chữ cho mã không tra được

Dòng 267, thay:

```tsx
<ul>{loi.map(x => <li key={x.ma}>{x.chu}</li>)}</ul>
```

bằng:

```tsx
{/* Mã không tra được tên vẫn PHẢI hiện — giấu đi là người dùng không biết máy đang lỗi. */}
<ul>{loi.map(x => <li key={x.ma}>{x.biet ? x.chu : `${t("dev_loi_ma")} ${x.ma}`}</li>)}</ul>
```

## Việc 3 — `lib/ui/strings.ts`: thêm một khoá, ba ngôn ngữ

Đặt cạnh các khoá `dev_*` đã có (khối `vi` quanh dòng 166, `en` quanh 337, và khối `fil`):

```ts
  dev_loi_ma: "Mã lỗi",          // vi
  dev_loi_ma: "Error code",      // en
  dev_loi_ma: "Code ng error",   // fil
```

Phải có đủ **cả ba**. Thiếu một ngôn ngữ thì màn rơi về tiếng Việt mà không ai hay — chính
`strings.ts` dòng 1228 đã ghi cái bẫy này.

## Việc 4 — Bài kiểm `tests/loi-la.mjs`

Máy chủ giả đã có sẵn mọi thứ cần: `ac_1` trong `tests/du-lieu/products.json` có đủ 26 `values`
và 26 `labels`, thiết bị `Điều hòa L1 - 2` id `10c81a40-b71d-11f1-b79e-ad8fe8623469`, và cửa
`/v1/__doi?id=…&key=…&value=…` để đặt giá trị (`may-chu-gia.mjs:268`).

Dựng theo khuôn `tests/bo-cuc.mjs` (đăng nhập → tab Thiết bị → mở thiết bị), rồi chạy đủ **năm
ca**. Sau mỗi lần `__doi` nhớ chờ qua một nhịp đồng bộ (~2,5s) rồi mới đọc DOM:

| Đặt `ac_error_catalog` | Dải `.bc-alarmstrip` | Nội dung `li` |
|---|---|---|
| `E5` | **có** | `Bảo vệ do nhiệt độ đầu đẩy máy nén quá cao` |
| `1` | **có** | `Mã lỗi 1` ← ca chính, đúng con bọ này |
| `E5,U2` | **có** | **hai** dòng, dòng hai là `Bảo vệ do điện áp AC cấp vào dàn nóng bất thường` |
| `0` | **không** | — |
| `` (rỗng) | **không** | — |

Hai ca cuối chốt rằng bỏ bộ lọc **không** làm lọt "không lỗi" thành "có lỗi" — đó là phần
`maLoi()` vẫn phải giữ nguyên.

Đăng ký bài vào nhóm `api` trong `tests/chay.mjs` (dòng 72), cạnh `bo-cuc.mjs`.

---

## Kiểm sau khi làm

```bash
cd "/Users/tienquang/Documents/Homichi/IOT/IOT App - New UI"
npm run lint
npm run build
npm test
```

Bằng mắt, với webapp local nối API DEV thật: mở thiết bị **Điều hòa** (không phải
`Điều hòa L1 - 2`) — phải thấy dải đỏ *"Danh sách lỗi"* với một dòng **`Mã lỗi 1`**.
Mở `Điều hòa L1 - 2` — **không** có dải nào.

Chạy `npm run dev` và mở thiết bị **Điều hòa**, console phải có đúng một dòng:

```
[loi] ac_error_catalog báo mã "1" mà catalog không có tên (KHÔNG có trong values) — …
```

Để màn đó mở một phút: vẫn **đúng một dòng**, không lặp.

---

## Phần KHÔNG sửa được bằng mã — việc phải hỏi bên thiết bị

Gốc rễ nằm ở tầng dữ liệu, và **đúng là lỗi đã báo hôm 15/10**, chỉ khác chỗ xuất hiện:
firmware gửi **chỉ số**, catalog khai **tên**.

| capability | sadmin khai `values` | thiết bị báo về |
|---|---|---|
| `ac_error_catalog` | `["C3","C5","E3",…,"512"]` (26 mã) | `"1"` |
| `ac_ope_mode` | `["Heat","Cool","Dry","Fan","Auto"]` | `"1"` |
| `ac_fan_speed` | `["Low","Mid","High","Turbo","Auto"]` | `"3"` |
| `ac_swing_mode` | `["r20","r35","r55","r70","r80"]` | `"0"` |

Phải hỏi bên firmware: **`"1"` là lỗi gì?**

**Đừng đoán.** `values` của sadmin xếp lộn xộn (`C3, C5, E3, E2, E4, U0…`), không theo thứ tự
có nghĩa nào, nên "mã thứ hai trong danh sách" không nói lên điều gì. Cần bảng ánh xạ chính
thức chỉ số → mã lỗi từ bên firmware; có bảng đó thì sửa ở **sadmin** (khai `values` đúng dạng
firmware gửi, kèm `labels`), không phải sửa ở webapp.

Một chi tiết phụ: sản phẩm `aiotec41` cũng có dải cảnh báo (`alarm.key = "errors"`) nhưng
capability đó **không khai `values`** — nhánh `!choPhep.length` cũ đã cho qua hết, nên sản
phẩm này xưa nay vẫn hiện đúng. Lỗi chỉ cắn khi catalog **có** khai `values`.

## Nhắc

Việc này thực thi ở **tab Code**, không làm ở đây.
