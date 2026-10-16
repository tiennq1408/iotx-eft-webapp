# Việc: Chiều cao hàng theo từng ô (`o[].caoHang`)

- Trạng thái: **chưa làm**
- Phạm vi: `IOT App - New UI`
- Làm ở đâu: **tab Code**
- Viết: 16/10/2026 — đo trực tiếp trên `web.dev.happibot.net`, 3 sản phẩm, có đối chiếu JSON thô

## Tóm tắt

Sadmin khai `caoHang` ở **hai cấp**: cấp lưới và **cấp từng ô**. Local chỉ đọc cấp lưới, nên
mọi hàng cao bằng nhau. Đây là lý do màn chi tiết của local không khớp web.dev.

Thêm nữa, local chặn `caoHang` qua một bảng ba giá trị `[56, 64, 72]`, trong khi sadmin đang
gửi **48** — local từ chối rồi rơi về 64.

Rà hết toàn bộ trường của `ui.boCuc` trên cả ba sản phẩm, **`o[].caoHang` là trường DUY NHẤT
local còn thiếu**. Mọi trường khác đều đã có. Phần cuối doc liệt kê để khỏi sửa nhầm.

## Bằng chứng

JSON thô của `ui.boCuc`, sản phẩm **Smart Fan 314** (thiết bị `SBI314 R`), rút gọn:

```json
{
  "cot": 4, "skin": "#b7554b", "caoHang": 72,
  "o": [
    { "key": "speed",  "row": 1, "h": 3, "variant": "dial01",  "caoHang": 48, … },
    { "key": "mode",   "row": 4, "h": 2, "moiHang": 2,         "caoHang": 64, … },
    { "key": "oscillate", "row": 6, "h": 1, … },
    { "key": "light",  "row": 7, "w": 2, "h": 1, … },
    { "key": "buzzer", "row": 7, "w": 2, "h": 1, … },
    { "key": "power",  "row": 8, "h": 1, "variant": "power01", … }
  ]
}
```

`grid-template-rows` web.dev ghi ra, đọc bằng `getComputedStyle`:

```
48px 48px 48px   64px 64px   72px 72px 72px
```

Khớp từng hàng một:

| Hàng | Ô phủ lên | `o.caoHang` | Chiều cao thật |
|---|---|---|---|
| 1–3 | `speed` (h=3) | **48** | 48 · 48 · 48 |
| 4–5 | `mode` (h=2) | **64** | 64 · 64 |
| 6 | `oscillate` | — | 72 ← `caoHang` của lưới |
| 7 | `light` + `buzzer` | — | 72 |
| 8 | `power` | — | 72 |

Kiểm chéo trên **Air Conditioner (L1)** — sản phẩm này **không khai `caoHang` cấp lưới**
(mặc định 64), nhưng hai ô `ac_ope_mode` và `ac_fan_speed` khai `caoHang: 72`:

```
64 64 64   72 72   64   72 72   64 64   64 64 64 64
└ dial01 ─┘ └ope─┘ pwr  └fan─┘ └swing┘ └── switch/readout ──┘
            =72          =72    (không khai → 64)
```

Đúng từng hàng. Không có công thức nào ở đây cả — **chỉ là một con số sadmin gửi sang**.

**Hai giả thuyết đã bị loại bỏ bằng phép đo, đừng đi lại đường đó:**

- *Không phải* co lưới cho vừa màn hình. Ép khung nhìn 900×700 rồi 900×1400, tải lại trang:
  vector vẫn y nguyên `48 48 48 64 64 72 72 72`, tổng vẫn 544px.
- *Không phải* vừa khít nội dung. Đo `scrollHeight` của `.bc-body`: ô `speed` cần 170px mà chỉ
  được cấp 160px; hai ô `chips01` của máy lạnh có nội dung 78px và 62px nhưng được cấp **cùng**
  152px, còn ô thứ ba nội dung 54px chỉ được 136px.

## Sai lệch hiện tại, tính bằng pixel

Với `SBI314 R`:

| | tổng chiều cao lưới |
|---|---|
| web.dev | 488px nội dung + 7×8px khe = **544px** |
| local hiện tại | 8 hàng × 72px + 56px khe = **632px** |

Lệch **88px**, và vòng xoay tốc độ bị phóng to quá cỡ vì ba hàng của nó được 72px thay vì 48px.

---

## Việc 1 — Thêm `caoHang` vào kiểu `OBoCuc`

**File:** `lib/ui/boCuc.ts`, trong `export type OBoCuc`

```ts
  /**
   * Chiều cao MỖI HÀNG mà ô này phủ lên (px), đè `caoHang` của lưới.
   * Ô `h: 3` khai `caoHang: 48` thì ba hàng đều 48px, tổng 3×48 + 2×8 = 160px.
   * Không khai thì hàng lấy `caoHang` của lưới.
   */
  caoHang?: number;
```

## Việc 2 — Bỏ bảng trắng ba giá trị

**File:** `lib/ui/boCuc.ts` dòng 20–21 và 139

Hiện tại:

```ts
const CAO_HANG = [56, 64, 72];
const CAO_HANG_MAC = 64;
…
const caoHang = CAO_HANG.includes(Number(bc.caoHang)) ? Number(bc.caoHang) : CAO_HANG_MAC;
```

Bảng này **sai cả hai đầu**: sadmin đang gửi **48** (local từ chối, rơi về 64), còn **56** thì
đo trên cả ba sản phẩm không thấy lần nào. Thay bằng kiểm tra khoảng:

```ts
const CAO_HANG_MAC = 64;
/** Khoảng chiều cao hàng chấp nhận được. KHÔNG chốt vào vài giá trị cố định: sadmin đang
 *  gửi 48 cho ô vòng xoay của Smart Fan 314, và sẽ còn gửi số khác. Chỉ chặn số rác. */
const CAO_HANG_MIN = 24, CAO_HANG_MAX = 240;
const soCaoHang = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= CAO_HANG_MIN && n <= CAO_HANG_MAX ? Math.round(n) : null;
};
```

và ở dòng 139: `const caoHang = soCaoHang(bc.caoHang) ?? CAO_HANG_MAC;`

## Việc 3 — Tính vector chiều cao từng hàng

**File:** `lib/ui/boCuc.ts`, trong `phanGiaiBoCuc`, ngay sau `const { map, soHang } = hangHienThi(...)`

```ts
/**
 * Chiều cao của TỪNG hàng, không phải một số dùng chung.
 *
 * Luật đo được trên web.dev: hàng nào bị một ô có `o.caoHang` phủ lên thì lấy số của ô đó;
 * hàng không có ô nào khai thì lấy `caoHang` của lưới. Số của ô ĐÈ số của lưới, kể cả khi
 * nhỏ hơn — ô vòng xoay của Smart Fan 314 khai 48 trong khi lưới khai 72, và web.dev vẽ 48.
 *
 * Hai ô cùng phủ một hàng mà khai khác nhau thì lấy số LỚN hơn, để không ô nào bị cắt.
 * Trường hợp này chưa gặp trên DEV; đặt luật trước cho khỏi vỡ.
 */
const caoMoiHang: number[] = Array(soHang).fill(caoHang);
const daKhai: boolean[] = Array(soHang).fill(false);
for (const muc of o) {
  const cao = soCaoHang(muc.caoHang);
  if (cao === null) continue;
  for (let h = muc.row; h < muc.row + muc.h; h++) {
    const r = map[h];                       // số hàng thật sau khi dồn hàng trống
    if (r === undefined) continue;
    const i = r - 1;
    caoMoiHang[i] = daKhai[i] ? Math.max(caoMoiHang[i], cao) : cao;
    daKhai[i] = true;
  }
}
```

rồi trả thêm ra ngoài (dòng 142):

```ts
return { o, map, soHang, caoHang, caoMoiHang, soCot: Number(bc.cot) || SO_COT, capBao };
```

## Việc 4 — Dùng vector đó khi vẽ

**File:** `components/ui/device/BoCucGrid.tsx` dòng 272

Thay:

```ts
gridTemplateRows: `repeat(${Math.max(kq.soHang, 1)}, ${kq.caoHang}px)`,
```

bằng:

```ts
// Mỗi hàng một chiều cao riêng (xem `caoMoiHang`), không phải `repeat()` một số dùng chung:
// sadmin khai `caoHang` cho từng ô, ô vòng xoay thấp hơn ô công tắc.
gridTemplateRows: (kq.caoMoiHang.length ? kq.caoMoiHang : [kq.caoHang]).map(n => `${n}px`).join(" "),
```

---

## Kiểm sau khi làm

```bash
cd "/Users/tienquang/Documents/Homichi/IOT/IOT App - New UI"
npm run lint
npm run build
npm test
```

Rồi mở `SBI314 R` trên webapp local, dán vào console:

```js
getComputedStyle(document.querySelector('.bc-grid')).gridTemplateRows
// PHẢI ra: "48px 48px 48px 64px 64px 72px 72px 72px"
Math.round(document.querySelector('.bc-grid').getBoundingClientRect().height)
// PHẢI ra: 544   (đang là 632)
```

Mở máy lạnh `Điều hòa L1 - 2`:

```js
getComputedStyle(document.querySelector('.bc-grid')).gridTemplateRows
// PHẢI ra: "64px 64px 64px 72px 72px 64px 72px 72px 64px 64px 64px 64px 64px 64px"
```

Mở `fan63903` (không ô nào khai `caoHang`): phải ra 5 hàng **64px** đều nhau — tức là đường
cũ không bị hỏng.

Thêm một bài vào `tests/` chốt đúng ba vector trên, để lần sau sadmin đổi số thì biết ngay.

---

## ĐÃ KIỂM, KHÔNG PHẢI LỖI — đừng sửa

Rà toàn bộ khoá xuất hiện trong `ui.boCuc` của cả ba sản phẩm rồi đối chiếu với mã local:

| Khoá | Local |
|---|---|
| `bc.cot` | có — `Number(bc.cot) \|\| SO_COT` (`boCuc.ts:142`) |
| `bc.skin` | có |
| `bc.alarm.key` | có — `capBao` → `.bc-alarmstrip` (`BoCucGrid.tsx:264`) |
| `o.canN` `o.canD` | có |
| `o.moiHang` | có |
| `o.ico` · `o.gtIco` · `o.vtIco` · `o.gtVt` | có |
| `o.mauCtl` · `o.vien` · `o.hlChon` | có |
| `o.nenAnh` | có |
| `o.nhan.{can,co,dam,mau}` | có |
| **`o.caoHang`** | **THIẾU** ← việc của doc này |

Local còn có `coNut`, `rongNut`, `bc.donHang`, `bc.nenAnh`, `nhan.nghieng` mà sadmin hiện chưa
gửi. Để nguyên, không dọn — gửi tới lúc nào là dùng được lúc đó.

### Một chỗ local đang LÀM TỐT HƠN web.dev — giữ nguyên

`BoCucGrid.tsx:211` sáng nút đang chọn từ giá trị máy chủ:

```ts
const chon = String(gt) === String(v);
… className={["bc-chip", chon ? "on" : "", …]}  aria-pressed={chon}
```

web.dev **không làm việc này**: đo trên `fan63903` (có `mode = "normal"` khớp chính xác danh
sách `values`), sau 6 giây không nút nào mang class `.on`; nút chỉ sáng tạm 2 giây sau cú bấm
rồi tắt. Local so bằng `String()` nên còn chịu được cả trường hợp máy chủ trả số mà catalog
khai chữ. **Đừng chép cách của web.dev ở chỗ này.**

## Nhắc

Việc này thực thi ở **tab Code**, không làm ở đây.
