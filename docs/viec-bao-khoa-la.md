# Việc: Báo động khi sadmin thêm trường mới vào catalog

- Trạng thái: **chưa làm**
- Phạm vi: `IOT App - New UI`
- Làm ở đâu: **tab Code**
- Viết: 16/10/2026 — có quét thật toàn bộ catalog DEV
- Liên quan: làm **sau** `docs/viec-caohang-o.md` (doc này cần `o.caoHang` đã nằm trong kiểu)

## Vấn đề

Local đọc `ui.boCuc` bằng cách **nhặt đúng những trường nó biết tên**. Trường nào chưa biết thì
**bỏ qua không một tiếng động** — không lỗi, không cảnh báo, màn vẫn vẽ ra, chỉ là vẽ sai.

Chuyện này đã xảy ra **ba lần**, lần nào cũng phát hiện bằng mắt sau khi đã sai một thời gian:

| Lần | Sadmin đổi gì | Hậu quả | Phát hiện ra sao |
|---|---|---|---|
| 1 | `boCuc.skin` từ tên (`ocean`) thành mã màu (`#2ea5fc`) | sai toàn bộ màu nhấn màn chi tiết | nhìn thấy |
| 2 | thêm `ico`, `vtIco`, `gtVt`, `mauCtl`, `vien`, `hlChon`, `nhan.mau` | mất icon, mất viền, sai màu nhãn | nhìn thấy |
| 3 | thêm `o[].caoHang` | lưới lệch 88px, vòng xoay phóng to | nhìn thấy |

Lần thứ tư sẽ y hệt. Sửa `caoHang` không ngăn được — nó chỉ vá một trường.

Doc này không thêm tính năng nào cho người dùng. Nó làm một việc: **biến "sai âm thầm hàng
tuần" thành "biết ngay trong ngày"**.

## Mốc hiện tại — quét thật, 16/10/2026

Gọi `GET /v1/products?lang=vi&tenant=livotec` trên DEV rồi đối chiếu từng khoá với mã local:

```
12 sản phẩm   ·   6 sản phẩm có ui.boCuc
ac · ac_1 · ac_2026001 · aiotec41 · b65thu · fan · fan_basic
fan_sbi314 · fan_smart · light · sensor_temp · ui_hopdong_ghep

Khoá lạ ở ui         : không có
Khoá lạ ở boCuc      : không có
Khoá lạ ở boCuc.o    : không có
Khoá lạ ở o.nhan     : không có
Khoá lạ ở capability : không có
```

Nghĩa là **sau khi `o.caoHang` vào, local biết hết mọi trường sadmin đang gửi.** Bài kiểm dưới
đây hôm nay sẽ xanh — nó là cái bẫy đặt sẵn cho lần sau, không phải để vá lỗi đang có.

> Lưu ý đáng giá: `/v1/products` **không cần đăng nhập** (đã thử bỏ hẳn header `Authorization`,
> vẫn trả 200). Và nó trả **12** sản phẩm trong khi `/bootstrap` chỉ trả 3 sản phẩm của thiết
> bị người dùng đang sở hữu. Nên bài kiểm quét `/products`: **không cần mật khẩu**, mà phủ
> rộng gấp đôi.

---

## Việc 1 — Kêu ngay lúc chạy, chỉ ở bản phát triển

**File:** `lib/ui/boCuc.ts`

Thêm vào gần đầu file, sau các hằng:

```ts
/* ====================================================================
   Bắt trường lạ của catalog.

   `phanGiaiBoCuc` nhặt đúng các trường nó biết tên, nên sadmin thêm trường mới là local bỏ
   qua LẶNG LẼ — màn vẫn vẽ, chỉ là vẽ sai, và chỉ phát hiện được bằng mắt. Đã dính ba lần:
   `skin` đổi sang mã màu, tám trường icon/viền/màu, rồi `o.caoHang`.

   Chỉ CẢNH BÁO, không bao giờ ném lỗi: trường lạ nghĩa là catalog mới hơn app, màn vẫn phải
   vẽ được bằng những gì app hiểu. Chặn ở đây là người dùng mất luôn màn chi tiết.
   ==================================================================== */
const KHOA_BIET = {
  boCuc: new Set(["cot", "caoHang", "donHang", "skin", "nenAnh", "alarm", "o"]),
  o: new Set(["key", "col", "row", "w", "h", "variant", "canN", "canD", "caoHang", "moiHang",
              "coNut", "rongNut", "nhan", "gtIco", "ico", "vtIco", "gtVt", "mauCtl",
              "vien", "hlChon", "nenAnh"]),
  nhan: new Set(["can", "co", "dam", "nghieng", "mau"]),
} as const;

/** Nhịp đồng bộ vẽ lại mỗi 2,5 giây; kêu mỗi lần vẽ là ngập console. Mỗi khoá kêu MỘT lần. */
const daKeu = new Set<string>();

function soatKhoaLa(bc: BoCuc): void {
  if (process.env.NODE_ENV === "production") return;
  const keu = (noi: keyof typeof KHOA_BIET, obj: object | undefined) => {
    if (!obj) return;
    for (const k of Object.keys(obj)) {
      if (KHOA_BIET[noi].has(k)) continue;
      const dau = `${noi}.${k}`;
      if (daKeu.has(dau)) continue;
      daKeu.add(dau);
      console.warn(`[boCuc] sadmin gửi trường local CHƯA BIẾT: ${dau} — màn chi tiết đang bỏ qua nó. Xem docs/viec-bao-khoa-la.md`);
    }
  };
  keu("boCuc", bc);
  for (const o of bc.o ?? []) { keu("o", o); keu("nhan", o.nhan); }
}
```

rồi gọi **một dòng** ở đầu `phanGiaiBoCuc`:

```ts
export function phanGiaiBoCuc(bc: BoCuc, caps: IotxCapability[], khoaNguon = capNguonTrong(caps)?.key) {
  soatKhoaLa(bc);
  …
```

Ba điều **phải** giữ đúng, đừng tối ưu đi:

1. **Chỉ cảnh báo.** Không ném lỗi, không bỏ vẽ ô. Catalog mới hơn app là chuyện bình thường.
2. **Chỉ ở bản phát triển.** `process.env.NODE_ENV === "production"` thoát sớm — Next thay
   hằng này lúc dựng nên cả khối bị loại khỏi bundle, người dùng không tốn một byte nào.
3. **Mỗi khoá một lần.** `useDongBoNen` vẽ lại mỗi 2,5 giây; thiếu `daKeu` thì mở màn chi tiết
   một phút là 24 dòng giống hệt nhau, đọc không nổi và người ta sẽ tắt đi.

## Việc 2 — Bài kiểm quét catalog thật

**File mới:** `tests/khoa-la.mjs`

```js
/**
 * Sadmin có thêm trường nào local chưa biết không?
 *
 * Khác mọi bài khác trong tests/: bài này gọi API DEV THẬT, không gọi máy chủ giả. Vì câu hỏi
 * nó trả lời là "ngoài kia vừa đổi gì", mà máy chủ giả thì chỉ biết những gì mình tự nhét vào.
 *
 * Không cần đăng nhập: `/v1/products` mở, và nó trả CẢ catalog (12 sản phẩm hôm 16/10/2026)
 * chứ không chỉ sản phẩm của thiết bị mình có như `/bootstrap` (3).
 */
const GOC = process.env.IOTX_API_UPSTREAM || 'https://api.dev.happibot.net';
const TENANT = process.env.IOTX_TENANT || 'livotec';

// Giữ ĐỒNG BỘ với KHOA_BIET trong lib/ui/boCuc.ts. Lệch là bài này nói dối.
const BIET = {
  'ui':         ['renderer','archetype','skin','controls','gauges','image','uuTien','slots','boCuc'],
  'boCuc':      ['cot','caoHang','donHang','skin','nenAnh','alarm','o'],
  'boCuc.o':    ['key','col','row','w','h','variant','canN','canD','caoHang','moiHang','coNut',
                 'rongNut','nhan','gtIco','ico','vtIco','gtVt','mauCtl','vien','hlChon','nenAnh'],
  'o.nhan':     ['can','co','dam','nghieng','mau'],
  'capability': ['key','kind','label','rpc','min','max','step','unit','unitSpace','values','labels'],
};
for (const k of Object.keys(BIET)) BIET[k] = new Set(BIET[k]);

const url = `${GOC}/v1/products?lang=vi&tenant=${encodeURIComponent(TENANT)}`;
let sp;
try {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  sp = await r.json();
} catch (e) {
  // Không với tới DEV thì KHÔNG báo đỏ: đỏ vì mất mạng rồi ai cũng quen, hết tác dụng báo động.
  console.log(`BỎ QUA  không gọi được ${url}: ${e.message}`);
  process.exit(0);
}

const la = new Map();                       // "noi.khoa" -> Set(mã sản phẩm)
const soat = (noi, obj, ma) => {
  for (const k of Object.keys(obj || {})) {
    if (BIET[noi].has(k)) continue;
    const d = `${noi}.${k}`;
    if (!la.has(d)) la.set(d, new Set());
    la.get(d).add(ma);
  }
};

let coBoCuc = 0;
for (const [ma, p] of Object.entries(sp)) {
  soat('ui', p.ui, ma);
  for (const c of p.capabilities || []) soat('capability', c, ma);
  const bc = p.ui?.boCuc;
  if (!bc) continue;
  coBoCuc++;
  soat('boCuc', bc, ma);
  for (const o of bc.o || []) { soat('boCuc.o', o, ma); soat('o.nhan', o.nhan, ma); }
}

console.log(`Quét ${Object.keys(sp).length} sản phẩm, ${coBoCuc} sản phẩm có ui.boCuc`);
if (la.size === 0) { console.log('PASS  không có trường lạ'); process.exit(0); }
for (const [d, ds] of la) console.log(`FAIL  trường LẠ ${d} — ở: ${[...ds].join(', ')}`);
console.log('\nSadmin vừa thêm trường mới. Đọc giá trị thật rồi bổ sung vào lib/ui/boCuc.ts,');
console.log('và cập nhật cả BIET trong chính file này. Xem docs/viec-bao-khoa-la.md');
process.exit(1);
```

## Việc 3 — Đăng ký thành nhóm RIÊNG, không vào lần chạy mặc định

**File:** `tests/chay.mjs`, bảng `NHOM` (dòng 66)

```js
  // Gọi API DEV thật nên KHÔNG để chung nhóm nào: `npm test` phải chạy được lúc không mạng,
  // và kết quả của nó phụ thuộc sadmin chứ không phụ thuộc mã trong repo.
  'that':      { moiTruong: {}, canMayGia: false, rieng: true, bai: ['khoa-la.mjs'] },
```

Cờ `rieng: true` đã có sẵn cơ chế ở dòng 75 (`filter(k => !NHOM[k].rieng)`), nên nhóm này chỉ
chạy khi gọi tên:

```bash
node tests/chay.mjs that
```

Thêm vào `package.json`:

```json
"test:that": "node tests/chay.mjs that"
```

**Chạy nó trước mỗi lần bàn giao**, và sau mỗi lần nghe tin sadmin cập nhật.

---

## Kiểm sau khi làm

```bash
cd "/Users/tienquang/Documents/Homichi/IOT/IOT App - New UI"
npm run lint
npm run build
npm test            # nhóm mặc định KHÔNG được đụng tới mạng — vẫn xanh như trước
npm run test:that   # phải in "Quét 12 sản phẩm, 6 sản phẩm có ui.boCuc" rồi PASS
```

Thử cho nó bắt được thật — tạm bỏ `caoHang` khỏi danh sách `BIET['boCuc.o']` trong
`tests/khoa-la.mjs` rồi chạy lại:

```
FAIL  trường LẠ boCuc.o.caoHang — ở: fan_sbi314, ac_1
```

Phải ra đúng như vậy. Trả lại rồi chạy lần nữa cho xanh.

Thử phần cảnh báo lúc chạy: `npm run dev`, mở màn chi tiết một thiết bị, console **không** có
dòng `[boCuc]` nào (hôm nay không có trường lạ). Tạm bỏ `"vien"` khỏi `KHOA_BIET.o` trong
`lib/ui/boCuc.ts` rồi tải lại — phải thấy **đúng một** dòng cảnh báo, và để màn đó mở một phút
vẫn chỉ một dòng, không lặp.

## Nhắc

Việc này thực thi ở **tab Code**, không làm ở đây. Làm **sau** `docs/viec-caohang-o.md` —
`caoHang` phải có trong `KHOA_BIET.o` và trong `BIET['boCuc.o']`, không thì chính nó bị báo lạ.

Và nhớ: **hai danh sách khoá ở hai file phải luôn khớp nhau.** Thêm trường mới vào
`lib/ui/boCuc.ts` thì thêm vào `tests/khoa-la.mjs` cùng lúc.
