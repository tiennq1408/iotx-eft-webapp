# Việc: Bắt kịp bản `ui.boCuc` mới của sadmin

- Trạng thái: **chưa làm**
- Phạm vi: `IOT App - New UI`
- Làm ở đâu: **tab Code**
- Viết: 15/10/2026 — đo trực tiếp trên `web.dev.happibot.net`, sản phẩm `ac_1` (Điều hòa L1 - 2)

## Mục tiêu

Màn chi tiết của local vẽ đúng như web.dev cho sản phẩm có `ui.boCuc` bản mới. Sadmin đã
thêm tám thứ; local hiện **bỏ qua lặng lẽ** cả tám nên màn vẽ thiếu màu, thiếu icon, thiếu viền.

## Lỗi gốc, sửa trước tiên: `boCuc.skin` giờ là MÃ MÀU

```json
"skin": "#2ea5fc"
```

Trước đây `skin` là **tên** (`ocean` / `sunset` / `graphite`) và `lib/newui/khuon.ts` ánh xạ
tên → màu. Giờ sadmin gửi thẳng **mã hex**, không khớp tên nào, nên local rơi về mặc định —
toàn bộ màu nhấn của màn sai.

**Sửa:** hàm đọc skin nhận **cả hai** dạng. Khớp `/^#[0-9a-f]{3,8}$/i` thì dùng thẳng làm màu;
không thì tra bảng tên như cũ.

---

## Tám thứ mới — số đo thật

Toàn bộ số dưới đây đọc từ DOM và CSS của web.dev ngày 15/10/2026, không phải ước lượng.

### 1. `o.mauCtl` — đổi màu nhấn của RIÊNG một ô

Ô nhận class `mauo` **và** ba biến CSS nội tuyến đè lên biến gốc:

```html
<div class="bc-tile mauo" style="grid-area:6/1/7/5; --brand:#fb6559; --brand-deep:#c44f45; --brand-soft:#fee9e8">
```

| `mauCtl` | `--brand` | `--brand-deep` | `--brand-soft` |
|---|---|---|---|
| `#fb6559` | `#fb6559` | `#c44f45` | `#fee9e8` |
| `#ffffff` | `#ffffff` | `#c7c7c7` | `#ffffff` |

Công thức suy ra từ hai mẫu: **deep ≈ brand × 0,78** (khớp cả hai mẫu, sai số ≤1), **soft ≈
trộn brand với trắng khoảng 85%**. ⚠️ Chỉ có hai mẫu nên hãy dùng chính hai dòng trên làm
**bài kiểm nghiệm thu** cho hàm tính màu.

CSS kèm theo:

```css
.bc-tile.mauo .bc-body            { color: var(--brand); }
.bc-tile.mauo .bc-chip:not(.on)   { color: var(--brand); }
.bc-tile.mauo .bc-pwr             { color: #fff; }
.bc-tile.mauo .bc-big small       { color: inherit; opacity: .75; }
```

Hiệu quả thấy được: ô Power có `mauCtl:#fb6559` → chữ "Power" đỏ `rgb(251,101,89)`, cỡ 20px/600.

### 2. `o.vien: "skin"` — viền đậm theo màu nhấn

Ô nhận class `vien`:

```css
.bc-tile.vien, .bc-khung.vien { border: 2px solid var(--brand); }
```

Đo thật: ô bình thường viền `1px solid rgba(#dfeae8, .7)`; ô có `vien` viền **`2px solid #2ea5fc`**
(chính là màu skin). Sáu ô dùng: Eco, I-feel, Iclean, Sleep, Anti-Mildew, Mute.

### 3. `o.hlChon: "vien"` — mục đang chọn tô viền thay vì nền đặc

Khối chip nhận class `hl-vien`:

```css
.bc-chip.on                     { background: var(--brand); border-color: var(--brand); color: #fff; }
.bc-chips.hl-vien .bc-chip.on   { background: var(--bg,#f6f8f8); border-color: var(--brand);
                                  box-shadow: inset 0 0 0 1px var(--brand); color: var(--brand); }
```

⚠️ **Chưa quan sát được trực tiếp** — lúc đo, máy điều hòa đang tắt nên không chip nào ở trạng
thái `on`. Hai luật CSS trên lấy từ bảng kiểu của web.dev, nên đúng về khai báo; **phải kiểm
lại bằng mắt** sau khi làm xong, bằng cách chọn một chế độ.

### 4. `o.vtIco` — vị trí icon trong chip, áp cho CẢ khối

Khối chip nhận class `vt-trai` / `vt-duoi` (bản tham chiếu còn có `vt-tren`, `vt-phai`):

```css
.bc-chips.vt-duoi .bc-chip { flex-direction: column-reverse; }
.bc-chips.vt-trai .bc-chip { flex-direction: row; gap: 6px; }
.bc-chips.vt-phai .bc-chip { flex-direction: row-reverse; gap: 6px; }
```

Đo thật trong ô cao 2 hàng (tile 136px, `.bc-body` 96px): chip `vt-duoi` cao **52,9px**,
chip `vt-trai` cao **45px**.

### 5. `o.gtVt` — vị trí icon riêng cho MỘT giá trị

`{"Auto":"trai"}` → **riêng chip "Auto"** nhận thêm class `vt-trai`, đè lên vị trí của cả khối:

```css
.bc-chips .bc-chip.vt-tren { flex-direction: column;         gap: 2px; }
.bc-chips .bc-chip.vt-duoi { flex-direction: column-reverse; gap: 2px; }
.bc-chips .bc-chip.vt-trai { flex-direction: row;            gap: 6px; }
.bc-chips .bc-chip.vt-phai { flex-direction: row-reverse;    gap: 6px; }
```

Dùng ở `ac_ope_mode` và `ac_fan_speed`: cả khối `vt-duoi`, riêng "Auto" `vt-trai` — vì "Auto"
nằm một mình ở hàng thứ hai nên để icon bên trái cho cân.

### 6. `o.ico` — icon CỐ ĐỊNH của ô (khác `gtIco` theo từng giá trị)

Giá trị `@eco`, `@ifeel`, `@iclean`, `@sleep`, `@mildew`, `@mute` — vẫn là tham chiếu kho icon,
giải ra `/v1/icons/<ten>` bằng `diaChiIcon` đã có.

Cấu trúc đo được ở ô Eco Mode:

```html
<div class="bc-body">
  <div class="bc-srow">                       <!-- gap 8px -->
    <span class="bc-lb vt-trai">              <!-- gap 6px -->
      <i class="bc-lico"><img class="bc-icoimg" src=".../icons/eco"></i>
      <span class="nh-nho">Eco Mode</span>
    </span>
    <button class="bc-tgl">…</button>
  </div>
</div>
```

```css
.bc-lb            { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.bc-lb > span     { overflow-wrap: anywhere; white-space: normal; min-width: 0; overflow: hidden; }
.bc-lb.vt-tren    { flex-direction: column;         gap: 2px; }
.bc-lb.vt-duoi    { flex-direction: column-reverse; gap: 2px; }
.bc-lb.vt-phai    { flex-direction: row-reverse; }
```

Số đo: `<i class="bc-lico">` 18×18, `font-size:18px`; `.bc-icoimg` `object-fit:contain; width:1em; height:1em`.

### 7. `o.nhan.mau` — màu của nhãn

Nhận `"skin"` hoặc mã hex. Ví dụ thật:

| Ô | `nhan` | Kết quả đo |
|---|---|---|
| `ac_ope_mode` | `{can:"giua", dam:true, mau:"skin"}` | tiêu đề `#2ea5fc`, 12px/**700**, căn giữa |
| `ac_temp_setting` | `{can:"giua", dam:true, mau:"#ffffff"}` | tiêu đề trắng trên nền ảnh |
| `ac_power_status` | `{co:"lon"}` | chữ "Power" 20px/600 |
| `ac_eco_mode` | `{co:"nho"}` | nhãn 13,6px |

Lớp cỡ chữ đã có trong bản tham chiếu:

```css
.bc-tile .nh-lon         { font-size: 1.25em; }
.bc-tile .bc-pl.nh-lon   { font-size: 15px; line-height: 1.15; }
.bc-tile .nh-dam         { font-weight: 700; }
```

### 8. `.bc-body` — lớp bọc MỚI giữa tiêu đề và nội dung

```css
.bc-tile .bc-body { flex: 1 1 0; min-width: 0; min-height: 0; display: flex; }
```

Đây là chỗ `mauo` đổ màu vào (mục 1). Local hiện không có lớp này — **phải thêm**, nếu không
quy tắc màu ở mục 1 không có chỗ bám.

---

## Kèm theo: số đo nền của chip và ô (để đối chiếu)

```css
.bc-chips      { display:flex; flex-wrap:wrap; align-content:stretch; gap:6px;
                 width:100%; height:100%; overflow:hidden; }
.bc-chips .bc-chip { align-self:stretch; min-width:0; height:auto; }
.bc-chip       { border:1px solid var(--line); background:var(--bg,#f6f8f8); color:var(--ink);
                 border-radius:12px; white-space:nowrap; cursor:pointer; min-width:0; }
.bc-chip i     { flex:0 0 auto; min-height:18px; font-size:18px; font-style:normal; line-height:1; }
.bc-chip span  { text-align:center; white-space:normal; overflow-wrap:anywhere; line-height:1.15; }

/* ba cỡ chip — mặc định là co-vua */
.bc-chips.co-nho .bc-chip   { gap:1px; padding:2px 4px; font-size:10.5px; }
.bc-chips.co-nho .bc-chip i { min-height:14px; font-size:14px; }
.bc-chips.co-lon .bc-chip   { gap:3px; padding:6px 8px; font-size:14px; }
.bc-chips.co-lon .bc-chip i { min-height:24px; font-size:24px; }
/* co-vua: padding 4px 6px, font-size 12px, i 18px */

.bc-tile       { background:#fff; border:1px solid rgba(223,234,232,.7); border-radius:14px;
                 padding:8px 10px; display:flex; flex-direction:column; }
.bc-tile.nen   { background-position:50% center; background-repeat:no-repeat; background-size:cover; }
```

Hai lớp nữa có trong bản tham chiếu nhưng `ac_1` **chưa dùng** — làm luôn cho khỏi phải quay lại:

```css
.bc-chips.gond       { align-content: flex-start; }
.bc-chips.gond-duoi  { align-content: flex-end; }
.bc-chips.gond .bc-chip { height: 52px; }
```

---

## Tệp phải sửa

| Tệp | Sửa gì |
|---|---|
| `lib/newui/boCuc.ts` | thêm 6 trường vào `OBoCuc`: `ico`, `vtIco`, `gtVt`, `mauCtl`, `vien`, `hlChon`; thêm `nhan.mau` |
| `lib/newui/khuon.ts` | `mauSkin` nhận **cả mã hex** lẫn tên cũ |
| `components/newui/device/BoCucGrid.tsx` | thêm `.bc-body`; gắn class `mauo`/`vien`/`hl-vien`/`vt-*`/`co-*`; dựng `.bc-lb` cho `ico`; tính ba biến màu từ `mauCtl` |
| `app/globals.css` | toàn bộ luật CSS trong tài liệu này |
| `tests/bo-cuc.mjs` | thêm phép cho 8 thứ mới |
| `tests/du-lieu/products.json` | cập nhật `ac_1` theo catalog thật mới |

## Cách kiểm chứng

```bash
npx tsc --noEmit && npm run lint && npm run build
node tests/chay.mjs api
```

Phép kiểm mới cho `tests/bo-cuc.mjs`:

1. `skin: "#2ea5fc"` → màu nhấn của màn **đúng mã đó**, không rơi về mặc định.
2. Ô `mauCtl:"#fb6559"` → có class `mauo`, và `--brand` nội tuyến bằng `#fb6559`,
   `--brand-deep` `#c44f45`, `--brand-soft` `#fee9e8`.
3. Ô `mauCtl:"#ffffff"` → `--brand-deep` `#c7c7c7`, `--brand-soft` `#ffffff`.
4. Ô `vien:"skin"` → class `vien`, viền tính ra **2px** và màu bằng skin.
5. Khối chip `vtIco:"duoi"` → class `vt-duoi`, chip `flex-direction: column-reverse`.
6. `gtVt:{"Auto":"trai"}` → **riêng** chip "Auto" có class `vt-trai`, các chip khác thì không.
7. `ico:"@eco"` → có `.bc-lb > i.bc-lico > img.bc-icoimg`, `src` kết thúc `/v1/icons/eco`.
8. `nhan.mau:"skin"` → màu tiêu đề bằng skin; `nhan.mau:"#ffffff"` → trắng.
9. `nhan.dam:true` → `font-weight: 700`.
10. Mọi ô đều có `.bc-body` bọc phần nội dung.
11. `hlChon:"vien"` → khối có class `hl-vien`; **chọn một giá trị** rồi kiểm chip đó có
    `background` bằng `--bg` (không phải `--brand`) và `box-shadow` viền trong.

Soi mắt sau khi xong: mở `ac_1` ở local đặt cạnh web.dev ở 390px — ô Temp Target phải có ảnh
nền, vòng xoay trắng, chữ trắng; ô Power chữ đỏ; sáu ô chế độ viền xanh 2px.

## Ràng buộc (AGENTS.md)

- Vẽ control từ capability của sản phẩm, có đường lui chung khi catalog khai thiếu.
- Vùng chạm ≥44px, không tràn ngang, tương phản đạt WCAG — ⚠️ chữ trắng trên ảnh nền ở ô
  Temp Target là chỗ dễ trượt, đo lại bằng `a11y.mjs`.
- Chỉ gọi IBS qua `/v1`; icon lấy qua `/v1/icons/<ten>` như hiện tại.

## Không làm

- ❌ Cắm cứng `#2ea5fc` hay bất kỳ màu nào — tất cả đến từ catalog.
- ❌ Bỏ bảng tên skin cũ (`ocean`/`sunset`/`graphite`) — sản phẩm khác có thể còn dùng.
- ❌ Đoán công thức màu mà không chạy hai bài kiểm số 2 và 3.
- ❌ Vẽ `ico` bằng `gtIco` — hai trường khác nhau: `ico` cố định, `gtIco` theo giá trị.
