# Việc: Bỏ khung điện thoại, dựng khung + nền giống `devktv.happinno.com`

- Trạng thái: **chưa làm**
- Phạm vi: `IOT App - New UI`
- Làm ở đâu: **tab Code**
- Viết: 15/10/2026 — đo trực tiếp trên `https://devktv.happinno.com/`, khung nhìn 604×787

## Mục tiêu

Bỏ cái khung máy giả (viền đen 12px, bo 44px, cao tối đa 800px nổi giữa nền tối). Thay bằng
**một cột cao hết màn hình, rộng 448px, không bo góc**, chỉ có hai nét viền mảnh hai bên và
quầng sáng nhẹ xung quanh, đặt giữa một sân nền xám — đúng như `devktv.happinno.com`.

**Chỉ lấy khung và nền.** Màu thương hiệu, bảng màu, phông chữ, nội dung bên trong giữ nguyên
của local. Bên devktv dùng xanh `#00aeef`; local giữ teal của mình.

## Số đo lấy từ bản tham chiếu

Đo bằng `getComputedStyle` trên `devktv.happinno.com`, không phải nhìn ảnh:

```
html, body            nền #f7fbfc  (+ một vệt radial mờ góc trên trái)
  main.stage          nền #e6ecef · display:flex · justify-content:center · min-height:100dvh
    section.app-shell rộng 448px · max-width:100% · margin:0 auto
                      border-width: 0 1px · border-color:#d5dfe4   ← CHỈ hai bên
                      border-radius: 0                             ← KHÔNG bo góc
                      box-shadow: rgba(10,35,45,.08) 0 0 48px      ← quầng đều bốn phía
                      overflow: clip · position: relative · min-height: 100dvh
```

Quy tắc theo bề ngang, nguyên văn của họ:

```css
@media (min-width: 560px) {
  .stage { display:flex; justify-content:center; padding:0; background:#e6ecef; }
  .app-shell { width:448px; max-width:100%; min-height:100dvh; margin:0 auto;
               border-width:0 1px; border-style:none solid; border-color:#d5dfe4;
               border-radius:0; box-shadow: rgba(10,35,45,.08) 0 0 48px; }
}
```

Dưới **560px** cột trải hết bề ngang, không viền, không quầng, không sân — y như local đang
làm ở mốc 460px, chỉ khác con số.

## Một chỗ cố ý làm KHÁC bản tham chiếu — đọc kỹ

devktv để `min-height:100dvh` và cho **cả trang** cuộn. Local **không được** làm vậy.

Kiến trúc local treo gần như mọi thứ vào chiều cao có thật của khung:

| Phần tử | Luật hiện tại | Hỏng ra sao nếu khung chỉ có `min-height` |
|---|---|---|
| `.app-scroll` | `flex:1; overflow-y:auto` | hết vùng cuộn riêng, trang tự dài ra |
| `.bottom-nav` | `position:absolute; bottom:0` | trôi xuống đáy nội dung, không còn dính đáy màn |
| `.sheet.devpage` | `position:absolute; inset:0` | cao bằng nội dung trang, không phủ đúng một màn |
| `.full-panel` (hẹn giờ) | `position:absolute; inset:0` | như trên |
| `.tk-overlay`, `.drawer-overlay` | `position:absolute; inset:0` | nền mờ không phủ hết |
| `.toast-loi` | `position:absolute; bottom:84px` | neo sai chỗ |
| `.login-screen` | `position:absolute; inset:0` | ảnh nền không phủ hết màn |

Vì vậy cột của local dùng **`height:100dvh`** (cố định) thay cho `min-height:100dvh`. Nhìn ra
ngoài **không khác gì** bản tham chiếu — vẫn là một cột chạm mép trên và mép dưới — nhưng mọi
tấm phủ, thanh dưới và vùng cuộn bên trong giữ nguyên cách làm, không phải viết lại.

Phần tử bọc phải giữ **`position:relative`** và **`overflow:hidden`**. Đây là điểm neo của
toàn bộ các tấm `absolute` ở trên. Bỏ nó đi là màn chi tiết lại bung ra khỏi khung — đúng con
bọ đã sửa một lần rồi, có ghi lại trong chính file `app/globals.css` dòng 585 và trong
`tests/khung.mjs`.

## Đổi tên lớp

Lấy đúng tên của bản tham chiếu để sau này so sánh cho dễ:

| Cũ | Mới | Vai trò |
|---|---|---|
| `.app-shell` (vòng ngoài) | `.stage` | sân nền xám, căn giữa |
| `.phone` (vòng trong) | `.app-shell` | cột 448px, điểm neo `relative` |

**Cẩn thận:** tên `.app-shell` bị dùng lại cho phần tử khác. Làm theo đúng thứ tự dưới đây,
đừng tìm-thay thế hàng loạt, không thì hai luật chồng nhau.

## Việc 1 — `app/globals.css`, khối khung máy (dòng 52–81)

Thay **cả khối** hiện tại:

```css
body{
  ...
  background:#0c1a17;     /* nền tối, bỏ */
  ...
}
.app-shell{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:26px 12px;}
.phone{
  position:relative;width:100%;max-width:400px;
  height:min(800px,calc(100dvh - 52px));min-height:600px;
  background:var(--bg);border:12px solid #111;border-radius:44px;
  overflow:hidden;box-shadow:var(--shadow);
  display:flex;flex-direction:column;
}
.splash{min-height:100dvh;...;color:#B7CAC6;}
@media (max-width:460px){
  .app-shell{padding:0;}
  .phone{max-width:none;height:100dvh;min-height:100dvh;border:0;border-radius:0;box-shadow:none;}}
```

bằng:

```css
body{
  font-family:Calibri,'Segoe UI',Carlito,Arial,sans-serif;
  background:var(--nen-san);
  color:var(--text);
  min-height:100dvh;
  -webkit-tap-highlight-color:transparent;
}

/* ---------- khung ứng dụng ----------
   Dựng theo devktv.happinno.com: một CỘT cao hết màn hình, không bo góc, hai nét viền mảnh
   hai bên, quầng sáng đều bốn phía, đặt giữa sân xám. Dưới 560px cột trải hết bề ngang.
   `height:100dvh` (không phải min-height như bản gốc) vì `.bottom-nav`, `.sheet.devpage`,
   `.full-panel`, `.tk-overlay`, `.toast-loi`, `.login-screen` đều `position:absolute` neo vào
   đây — bỏ chiều cao cố định là cả loạt tấm phủ đó neo sai. Nhìn ra ngoài không khác. */
.stage{min-height:100dvh;display:flex;justify-content:center;}
.app-shell{
  position:relative;width:100%;height:100dvh;
  background:var(--bg);
  overflow:hidden;
  display:flex;flex-direction:column;
}
.splash{min-height:100dvh;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;background:var(--nen-san);color:var(--muted);}
.splash .brand-mark{width:64px;height:64px;display:grid;place-items:center;border-radius:20px;background:linear-gradient(145deg,#12b7a7,var(--teal-dark));color:#fff;}
.splash .brand-mark svg{width:32px;height:32px;}

@media (min-width:560px){
  .stage{background:var(--nen-san);}
  .app-shell{
    width:448px;max-width:100%;margin:0 auto;
    border-width:0 1px;border-style:none solid;border-color:var(--vien-san);
    border-radius:0;
    box-shadow:0 0 48px rgba(10,35,45,.08);
  }
}
```

Hai biến mới, thêm vào khối `:root` cạnh `--shadow` (dòng ~31):

```css
  --nen-san:#E6ECEF;   /* sân xám quanh cột — đo từ devktv */
  --vien-san:#D5DFE4;  /* nét viền hai bên cột */
```

và bản tối, thêm vào khối `html[data-giao-dien="toi"] body` (dòng ~860):

```css
  --nen-san:#080F0E;
  --vien-san:#2B3A36;
```

> Vệt radial mờ ở góc trên trái của devktv **bỏ qua**. Ở ≥560px sân xám che mất nó, ở <560px
> cột trải hết bề ngang cũng che mất — vẽ vào không ai thấy.

## Việc 2 — `app/globals.css`, luật cỡ chữ (dòng 844–854)

`zoom` phóng cả cột nên chiều cao phải chia lại cho vừa màn. Chiều cao giờ chỉ còn một công
thức duy nhất nên **cả khối `@media (max-width:460px)` ở dưới bỏ luôn**, không cần nữa.

Thay:

```css
html[data-co-chu="lon"] .phone{zoom:1.1;height:calc(min(800px, 100dvh - 52px) / 1.1);min-height:calc(600px / 1.1);}
html[data-co-chu="ratLon"] .phone{zoom:1.2;height:calc(min(800px, 100dvh - 52px) / 1.2);min-height:calc(600px / 1.2);}
...
@media (max-width:460px){
  html[data-co-chu="lon"] .phone{height:calc(100dvh / 1.1);min-height:calc(100dvh / 1.1);}
  html[data-co-chu="ratLon"] .phone{height:calc(100dvh / 1.2);min-height:calc(100dvh / 1.2);}
}
```

bằng:

```css
html[data-co-chu="lon"] .app-shell{zoom:1.1;height:calc(100dvh / 1.1);}
html[data-co-chu="ratLon"] .app-shell{zoom:1.2;height:calc(100dvh / 1.2);}
```

(hai dòng `.dev-ico` / `.dev-ten` nằm giữa hai khối đó giữ nguyên, không đụng tới)

## Việc 3 — `components/LivotecApp.tsx` (dòng 411 và 421)

Hai chỗ, sửa y hệt nhau:

```tsx
<div className="app-shell"><div className="phone">
```
→
```tsx
<div className="stage"><div className="app-shell">
```

Thẻ đóng `</div></div>` giữ nguyên.

## Việc 4 — viết lại `tests/khung.mjs`

Bài này **không được xoá**. Nó tồn tại để bắt đúng con bọ "tấm phủ bung ra khỏi khung" và sau
khi bỏ khung điện thoại thì nguy cơ đó còn cao hơn, không thấp đi. Chỉ chỉnh cho khớp khung mới:

1. `p.locator('.phone')` → `p.locator('.app-shell')` (dòng 24).
2. `ok('khung máy đúng 400px...', khung.w === 400)` → **`khung.w === 448`**, đổi chữ cho đúng
   ("cột ứng dụng đúng 448px").
3. Dung sai của màn chi tiết: `dev.w >= khung.w - 26` → **`dev.w >= khung.w - 2`**.
   Con số 26 cũ là vì viền đen 12px mỗi bên (400 − 24 = 376 lòng khung). Viền mới chỉ 1px mỗi
   bên nên lòng khung là 446; để nguyên 26 là bài test mất hẳn khả năng bắt lỗi.
4. Sửa phần chú thích đầu file: nói đúng khung mới thay vì khung điện thoại.

Thêm bốn khẳng định mới vào cuối, trước `console.log`:

```js
// Hình dáng khung: đo lại đúng những gì bản tham chiếu có.
const kh = await p.locator('.app-shell').evaluate(e => {
  const s = getComputedStyle(e), r = e.getBoundingClientRect();
  return { bo: s.borderRadius, tren: s.borderTopWidth, trai: s.borderLeftWidth,
           cao: Math.round(r.height), giua: Math.round(r.left + r.width / 2), pos: s.position };
});
ok(`khung không bo góc (${kh.bo})`, parseFloat(kh.bo) === 0);
ok(`viền chỉ hai bên (trên ${kh.tren}, trái ${kh.trai})`, parseFloat(kh.tren) === 0 && parseFloat(kh.trai) > 0);
ok(`khung cao hết màn hình (${kh.cao}/900)`, Math.abs(kh.cao - 900) <= 1);
ok('khung nằm giữa cửa sổ', Math.abs(kh.giua - 640) <= 1);
ok('khung vẫn là điểm neo position:relative', kh.pos === 'relative');

// Dưới 560px: cột trải hết bề ngang, không viền, không quầng.
await p.setViewportSize({ width: 430, height: 900 }); await p.waitForTimeout(300);
const hep = await p.locator('.app-shell').evaluate(e => {
  const s = getComputedStyle(e), r = e.getBoundingClientRect();
  return { w: Math.round(r.width), l: Math.round(r.left), vien: s.borderLeftWidth, bong: s.boxShadow };
});
ok(`màn hẹp: cột trải hết bề ngang (${hep.w}, trái ${hep.l})`, hep.w === 430 && hep.l === 0);
ok(`màn hẹp: không viền, không quầng`, parseFloat(hep.vien) === 0 && hep.bong === 'none');
```

## Việc 5 — hai bài test khác còn nhắc `.phone`

- `tests/menu.mjs` dòng 127: `document.querySelector('.phone')` → `'.app-shell'`.
  Khẳng định `r.bottom <= innerHeight + 1` vẫn đúng với `height:100dvh` + `zoom`.
- `tests/kich-ban/a8-giao-dien.mjs` dòng 11: trong danh sách selector, `.phone` → `.app-shell`.

## Kiểm sau khi làm

```bash
cd "/Users/tienquang/Documents/Homichi/IOT/IOT App - New UI"
npm run lint
npm run build
node tests/khung.mjs
node tests/menu.mjs
node tests/kich-ban/a8-giao-dien.mjs
```

Mắt thường, ở khổ 1280×900:

- Một cột 448px chính giữa, chạm mép trên và mép dưới cửa sổ, **không bo góc**, hai nét xám
  mảnh hai bên, quầng mờ đều quanh, sân xám `#E6ECEF` hai bên.
- Bấm vào một thiết bị: màn chi tiết phủ đúng trong cột, không tràn ra sân xám.
- Mở hẹn giờ, mở popup tài khoản, mở menu phải: nền mờ dừng đúng ở mép cột.
- Thanh điều hướng dưới dính đáy cửa sổ.
- Kéo cửa sổ hẹp xuống dưới 560px: cột trải hết bề ngang, viền và quầng biến mất.
- Đổi cỡ chữ sang **Rất lớn**: cột vẫn vừa màn hình, không có thanh cuộn ngang.
- Đổi sang giao diện **tối**: sân nền tối theo, không còn mảng xám sáng.

## Nhắc

Việc này thực thi ở **tab Code**, không làm ở đây. Lệnh để ra:

> Đọc `docs/viec-bo-khung-dien-thoai.md` và làm đúng theo đó. Làm đủ cả 5 việc, chạy `npm run lint`,
> `npm run build` và ba bài test ở mục "Kiểm sau khi làm" rồi báo kết quả.
