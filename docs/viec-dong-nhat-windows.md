# Việc: Giao diện giống nhau trên Windows và macOS

- Trạng thái: **đã làm** (15/10/2026). Hai chỗ lệch khỏi doc, có lý do:
  - Thanh cuộn: `scrollbar-width`/`scrollbar-color` bọc trong `@supports not selector(::-webkit-scrollbar)`
    — từ Chrome 121, có hai thuộc tính chuẩn là Chrome bỏ qua hết `::-webkit-scrollbar`, không ra được 10px.
  - Preload phông dùng `preload()` của `react-dom` thay cho `<link>` viết tay (viết tay thì bị khai hai lần).
  - Dòng ✏️ 🔑 🔔 của popup tài khoản và năm mục menu góc phải cũng đổi sang icon một nét.
- Phạm vi: `IOT App - New UI`
- Làm ở đâu: **tab Code**
- Viết: 15/10/2026 — đo trên mã nguồn thật, phông Carlito kiểm bằng gói npm thật

## Vấn đề

Cùng một mã, mở trên Windows thì cỡ chữ khác và một số biểu tượng hỏng. Nguyên nhân là
**bốn thứ độc lập**, không phải một. Doc này sửa cả bốn.

| # | Nguyên nhân | Gây ra |
|---|---|---|
| 1 | Không đóng gói phông nào — phó mặc phông cài sẵn trong máy | cỡ chữ, độ rộng chữ khác hẳn |
| 2 | Không khai thanh cuộn — macOS 0px, Windows ~16px | lề và chỗ xuống dòng khác |
| 3 | Cờ ngôn ngữ dựng bằng emoji regional indicator | Windows hiện **hai chữ cái**, không có cờ |
| 4 | Biểu tượng thiết bị và menu dùng emoji | hai bộ tranh khác nhau, vài cái thành đen trắng |

---

## Việc 1 — Đóng gói phông Carlito

### Vì sao hiện giờ lệch

`app/globals.css:57`

```css
font-family:Calibri,'Segoe UI',Carlito,Arial,sans-serif;
```

Không có `next/font`, không có `@font-face`, không có Google Fonts ở bất kỳ đâu trong dự án.
Phông thật sự được dùng:

| Máy | Phông |
|---|---|
| Windows | **Calibri** |
| macOS có MS Office | Calibri |
| macOS **không** có MS Office | **Arial** |
| Linux | Carlito |

Calibri hẹp hơn và x-height thấp hơn Arial, nên cùng `font-size:14px` mà Windows nhìn nhỏ
hơn. CSS có **118 chỗ khai `font-size` bằng px** — mỗi chỗ đều thừa hưởng chênh lệch này.
Hai máy Mac cũng có thể khác nhau tuỳ có cài Office hay không.

### Chọn Carlito, không chọn phông khác

Carlito **tương thích số đo (metric-compatible) với Calibri** — cùng bề rộng từng chữ, cùng
chiều cao dòng. Nghĩa là đóng gói Carlito thì **Windows gần như không đổi gì**, chỉ máy Mac
đổi để khớp theo. Chọn phông khác (Inter, Be Vietnam Pro) thì **cả hai bên cùng đổi** và phải
rà lại toàn bộ 118 chỗ khai cỡ chữ.

Đã kiểm trên gói thật `@fontsource/carlito@5.3.0`:

- Giấy phép **SIL OFL 1.1** — đóng gói vào sản phẩm thương mại được.
- Có **bộ con `vietnamese`**, dải gồm `U+1EA0-1EF9` — tức đủ `ạ ả ấ ầ ậ ế ề ệ ị ọ ộ ớ ợ ụ ử ự ỳ ỹ`.
- Nặng 400 + 700, cả `latin` lẫn `vietnamese`: **≈86 KB** tổng. Không cần `latin-ext`
  (chỉ chứa dấu của tiếng châu Âu); vi · en · fil đều nằm trong `latin` + `vietnamese`.

### Làm

**Bước 1.** Lấy 4 tệp woff2 về `public/fonts/`:

```bash
cd "/Users/tienquang/Documents/Homichi/IOT/IOT App - New UI"
mkdir -p public/fonts && cd /tmp && rm -rf carlito && mkdir carlito && cd carlito
npm pack @fontsource/carlito@5 && tar xzf *.tgz
cp package/files/carlito-{latin,vietnamese}-{400,700}-normal.woff2 \
   "/Users/tienquang/Documents/Homichi/IOT/IOT App - New UI/public/fonts/"
cp package/LICENSE "/Users/tienquang/Documents/Homichi/IOT/IOT App - New UI/public/fonts/CARLITO-LICENSE.txt"
```

Kiểm: `ls public/fonts/` phải ra đúng 4 tệp `.woff2` và 1 tệp giấy phép.

> **Không** thêm `@fontsource/carlito` vào `dependencies`. Chỉ cần 4 tệp tĩnh; thêm gói vào
> là kéo theo 50+ tệp của các bộ chữ Cyrillic/Hy Lạp không bao giờ dùng tới.

**Bước 2.** Thêm vào đầu `app/globals.css`, **trên** khối `:root`:

```css
/* ====================================================================
   Phông: Carlito, tự đóng gói.

   Trước đây dãy phông là `Calibri, 'Segoe UI', Carlito, Arial` — không đóng gói gì, nên
   Windows dùng Calibri còn macOS không cài Office thì rơi xuống Arial. Hai phông này rộng
   hẹp khác nhau, làm 118 chỗ khai font-size trong file này hiện ra hai cỡ khác nhau.

   Carlito tương thích số đo với Calibri, nên bản Windows giữ nguyên còn các máy khác khớp
   theo. Giấy phép SIL OFL 1.1 (public/fonts/CARLITO-LICENSE.txt).

   Hai dải `unicode-range` chép đúng từ gói @fontsource/carlito@5.3.0 — trình duyệt chỉ tải
   tệp `vietnamese` khi trên màn có chữ thuộc dải đó.
   ==================================================================== */
@font-face{
  font-family:'Carlito';font-style:normal;font-weight:400;font-display:swap;
  src:url('/fonts/carlito-latin-400-normal.woff2') format('woff2');
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face{
  font-family:'Carlito';font-style:normal;font-weight:400;font-display:swap;
  src:url('/fonts/carlito-vietnamese-400-normal.woff2') format('woff2');
  unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB;
}
@font-face{
  font-family:'Carlito';font-style:normal;font-weight:700;font-display:swap;
  src:url('/fonts/carlito-latin-700-normal.woff2') format('woff2');
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face{
  font-family:'Carlito';font-style:normal;font-weight:700;font-display:swap;
  src:url('/fonts/carlito-vietnamese-700-normal.woff2') format('woff2');
  unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB;
}
```

**Bước 3.** Đổi dãy phông ở `app/globals.css:57`:

```css
font-family:'Carlito',Calibri,'Segoe UI',Arial,sans-serif;
```

(giữ phần đuôi làm đường lui cho lúc tệp phông chưa tải xong hoặc tải hỏng)

**Bước 4.** Nạp sớm hai tệp hay dùng nhất, trong `app/layout.tsx`:

```tsx
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        {/* Không có @font-face nào nằm trong HTML, nên trình duyệt chỉ biết cần phông sau khi
            tải và đọc xong CSS. Hai dòng này cho tải song song, bớt một nhịp chữ nhảy cỡ. */}
        <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/fonts/carlito-latin-400-normal.woff2" />
        <link rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href="/fonts/carlito-vietnamese-400-normal.woff2" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### Hai điều phải biết, không phải lỗi

- **Chữ nghiêng:** cả dự án chỉ có **1 chỗ** dùng `font-style:italic`. Không đóng gói tệp
  nghiêng; trình duyệt sẽ tự nghiêng chữ thẳng. Nếu thấy xấu thì chép thêm
  `carlito-{latin,vietnamese}-400-italic.woff2` (+42 KB) và khai hai `@font-face` nữa.
- **Độ đậm:** CSS đang dùng 5 mức `400 · 500 · 600 · 700 · 800`, nhưng Carlito (và cả Calibri,
  cả Arial) chỉ có **2** mức thật là 400 và 700. Trình duyệt gộp `500→400` và `600, 700, 800→700`.
  Nghĩa là **thứ bậc 600 / 700 / 800 hiện đang là giả, ba mức hiện ra y hệt nhau** — và đã
  như vậy từ trước, trên mọi máy. Doc này không sửa; chỉ ghi lại để sau khỏi tưởng là lỗi mới.

---

## Việc 2 — Thanh cuộn chiếm cùng một bề rộng ở mọi máy

### Vì sao lệch

Không có một dòng `scrollbar-width`, `scrollbar-color` hay `::-webkit-scrollbar` nào trong
`globals.css`. Mà bốn vùng đều `overflow-y:auto`: `.app-scroll`, `.devbody`, `.panel-body`,
`.login-content`.

- macOS: thanh cuộn **nổi đè lên**, chiếm **0px** bề rộng bố cục.
- Windows: thanh cuộn **cổ điển**, ăn **~16px** bề rộng thật.

Vùng nội dung trên Windows hẹp hơn Mac 16px → chữ xuống dòng ở chỗ khác, thẻ co khác. Với cột
448px sắp dựng (`docs/viec-bo-khung-dien-thoai.md`) thì Windows chỉ còn 432px nội dung.

Khai kiểu dáng cho thanh cuộn khiến Chrome/Edge **trên cả hai hệ** chuyển sang thanh cuộn
chiếm chỗ với đúng bề rộng mình đặt — đó chính là cách làm cho hai bên bằng nhau.

### Làm

Thêm vào `app/globals.css`, ngay sau khối khung ứng dụng:

```css
/* ----------  thanh cuộn ----------
   macOS để thanh cuộn nổi đè (chiếm 0px bố cục), Windows để thanh cuộn cổ điển (chiếm ~16px).
   Không khai gì thì vùng nội dung trên Windows hẹp hơn Mac 16px, chữ xuống dòng khác chỗ.
   Khai kiểu dáng ở đây buộc cả hai hệ dùng cùng một bề rộng 10px. */
.app-scroll, .devbody, .panel-body, .login-content, .drawer, .tk-popup, .modal-sheet{
  scrollbar-width:thin;                              /* Firefox */
  scrollbar-color:var(--ray) transparent;
}
.app-scroll::-webkit-scrollbar,
.devbody::-webkit-scrollbar,
.panel-body::-webkit-scrollbar,
.login-content::-webkit-scrollbar,
.drawer::-webkit-scrollbar,
.tk-popup::-webkit-scrollbar,
.modal-sheet::-webkit-scrollbar{width:10px;height:10px;}
.app-scroll::-webkit-scrollbar-track,
.devbody::-webkit-scrollbar-track,
.panel-body::-webkit-scrollbar-track,
.login-content::-webkit-scrollbar-track,
.drawer::-webkit-scrollbar-track,
.tk-popup::-webkit-scrollbar-track,
.modal-sheet::-webkit-scrollbar-track{background:transparent;}
.app-scroll::-webkit-scrollbar-thumb,
.devbody::-webkit-scrollbar-thumb,
.panel-body::-webkit-scrollbar-thumb,
.login-content::-webkit-scrollbar-thumb,
.drawer::-webkit-scrollbar-thumb,
.tk-popup::-webkit-scrollbar-thumb,
.modal-sheet::-webkit-scrollbar-thumb{
  background:var(--ray);border-radius:999px;
  border:3px solid transparent;background-clip:content-box;   /* nhìn mảnh 4px, vẫn dễ bấm */
}
```

`--ray` đã có sẵn ở cả bản sáng (`#DCEAE8`) và bản tối (`#2F403B`) nên giao diện tối tự đúng.

---

## Việc 3 — Bỏ emoji cờ, dùng ảnh cờ có sẵn trong repo

### Vì sao hỏng

`lib/newui/ngonNgu.ts:23` dựng cờ bằng cặp ký tự regional indicator:

```ts
return [...vung].map(c => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("");
```

**Windows cố ý không có glyph cờ quốc gia nào.** Segoe UI Emoji bỏ hẳn bộ cờ — quyết định của
Microsoft, không sửa được từ phía web, không phải lỗi cài đặt máy. Windows hiện ra **hai chữ
cái** `VN` `US` `PH`.

Ảnh cờ thật **đã nằm sẵn trong repo mà không dùng**:
`public/images/livotec/flag-vn.png`, `flag-uk.png`, `flag-ph.png` (khai ở `assets.ts:18-20`).

Ba chỗ gọi `coNgonNgu`, chỉ **một** chỗ là `<select>` thật:

| Chỗ | Kiểu | Chèn `<img>` được không |
|---|---|---|
| `components/newui/LoginScreen.tsx:235` | `<select><option>` thật | **Không** — HTML không cho |
| `components/LivotecApp.tsx:383` | `ChonModal`, danh sách tự dựng | Được |
| `components/newui/modals.tsx:78` | dòng menu tự dựng | Được |

### Làm

**Bước 1.** Trong `lib/newui/ngonNgu.ts`, **giữ nguyên** `coNgonNgu` (vẫn dùng làm đường lui)
và thêm hàm trả địa chỉ ảnh:

```ts
import { IMG } from "@/lib/newui/assets";

/**
 * Ảnh cờ cho một mã ngôn ngữ.
 *
 * Không dùng emoji cờ: Windows cố ý không có glyph cờ quốc gia nào (Segoe UI Emoji bỏ hẳn bộ
 * này), nên emoji cờ hiện ra thành hai chữ cái "VN", "US". Ảnh PNG thì máy nào cũng như nhau.
 *
 * Chỉ có ba lá cờ trong repo. Máy chủ thêm ngôn ngữ mới mà chưa có ảnh thì trả null, nơi gọi
 * vẽ icon quả cầu thay thế — KHÔNG rơi về emoji.
 */
const CO_ANH: Record<string, string> = { vi: IMG.flagVi, en: IMG.flagEn, fil: IMG.flagFil };

export function anhCoNgonNgu(ma: string): string | null {
  return CO_ANH[ma] ?? CO_ANH[ma.split("-")[0]] ?? null;
}
```

**Bước 2.** Thêm một nét icon quả cầu vào bảng `D` trong `components/newui/Icon.tsx` (bảng
chưa có `globe`; đặt cạnh `compass`):

```ts
  globe: ["M12 3a9 9 0 100 18 9 9 0 000-18z", "M3 12h18", "M12 3c2.5 2.4 2.5 15.6 0 18", "M12 3c-2.5 2.4-2.5 15.6 0 18"],
```

**Bước 3.** `components/LivotecApp.tsx:383` và `components/newui/modals.tsx:78` — thay chuỗi
`${coNgonNgu(ma)} ${tenNgonNgu(ma)}` bằng `<img>` + tên.

`ChonModal` hiện chỉ nhận chuỗi (`components/newui/modals.tsx:148`):

```ts
luaChon: Array<{ giaTri: string; khoa?: string; nhan?: string }>;
```

Thêm một trường không bắt buộc, **không đổi các chỗ gọi khác**:

```ts
  /** Ảnh nhỏ đứng trước nhãn (cờ ngôn ngữ). Không có thì không vẽ gì. */
  luaChon: Array<{ giaTri: string; khoa?: string; nhan?: string; anh?: string | null }>;
```

Trong thân `ChonModal`, trước nhãn, vẽ:

```tsx
{muc.anh
  ? <Image unoptimized className="co-ngon-ngu" src={muc.anh} alt="" width={20} height={14} />
  : <span className="co-ngon-ngu-tron" aria-hidden="true"><Icon name="globe" /></span>}
```

CSS đi kèm:

```css
.co-ngon-ngu{width:20px;height:14px;object-fit:cover;border-radius:2px;flex-shrink:0;}
.co-ngon-ngu-tron{width:20px;height:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.co-ngon-ngu-tron svg{width:14px;height:14px;}
```

Chỗ gọi ở `LivotecApp.tsx:383` đổi thành:

```tsx
luaChon={dsNgonNgu(lang, boChu.langs).map(ma => ({
  giaTri: ma, nhan: tenNgonNgu(ma), anh: anhCoNgonNgu(ma),
}))}
```

Ở `modals.tsx:78`, dòng menu đổi `giaTri` thành chỉ tên ngôn ngữ và vẽ cờ riêng cạnh nó —
không nối emoji vào chuỗi nữa.

**Bước 4.** `LoginScreen.tsx:235` — `<option>` không chứa được ảnh, nên **bỏ cờ khỏi
`<option>`** và đặt một lá cờ cạnh ô chọn, hiện ngôn ngữ đang chọn:

```tsx
{coChonLang && (
  <label className="login-lang">
    <span className="dn-sr">{t("login_lang")}</span>
    {/* <option> không chứa được <img>, mà emoji cờ thì Windows không vẽ được. Nên cờ đứng
        ngoài ô chọn, hiện ngôn ngữ đang dùng; trong danh sách chỉ còn tên. */}
    {anhCoNgonNgu(lang)
      ? <Image unoptimized className="co-ngon-ngu" src={anhCoNgonNgu(lang)!} alt="" width={20} height={14} />
      : <span className="co-ngon-ngu-tron" aria-hidden="true"><Icon name="globe" /></span>}
    <select value={lang} onChange={event => onLang?.(event.target.value)}>
      {dsLang.map(ma => <option key={ma} value={ma}>{tenNgonNgu(ma)}</option>)}
    </select>
  </label>
)}
```

và `.login-lang` thêm `display:flex;align-items:center;gap:8px;`.

> Không dựng dropdown tự chế để nhét ảnh vào danh sách. `<select>` thật cho sẵn bàn phím,
> trình đọc màn hình và bộ chọn của hệ điều hành trên điện thoại — dựng tay là mất cả ba, đổi
> một lá cờ lấy một đống lỗi trợ năng.

---

## Việc 4 — Bỏ emoji ở biểu tượng thiết bị và dòng menu

### Vì sao hỏng

Hai nguồn:

**a) Dòng menu tài khoản** — `components/newui/modals.tsx:77-81` cắm cứng emoji:

```ts
{ muc: "ngonNgu", emo: "🌐", ... },
{ muc: "coChu",   emo: "🔤", ... },
{ muc: "giaoDien", emo: "🌓", ... },
```

**b) Biểu tượng thiết bị** — `product.icon` do sadmin trả, có thể là emoji
(`❄️ 💧 🍳 🌬️ 🍚 ♨️ 🚿 🌀 🍃`, xem `lib/newui/mockCatalog.ts` và `assets.ts:61`), vẽ thẳng ra
chữ ở `home.tsx:199` và `DeviceDetail.tsx:210`.

Apple Color Emoji và Segoe UI Emoji là **hai bộ tranh khác hẳn nhau**. Nặng hơn: `♨️` và `🌬️`
là codepoint mặc định kiểu **chữ**, phải có variation selector mới thành emoji màu — Windows
vẽ một số trong đó ra **ký hiệu đen trắng**, nhìn đúng như icon hỏng.

Dự án đã có sẵn bộ icon một nét trong `components/newui/Icon.tsx` với đủ tên cần dùng:
`snow · wind · drop · flame · heat · pot · leaf · box · fanIcn · moon · grid`.

### Làm

**Bước a.** `modals.tsx` — bỏ trường `emo`, dùng `Icon`:

```ts
const dongChon: Array<{ muc: MucChon; ico: TenIcon; nhan: string; giaTri: string }> = [
  { muc: "ngonNgu",  ico: "globe", nhan: "menu_ngon_ngu", giaTri: tenNgonNgu(lang) },
  { muc: "coChu",    ico: "grid",  nhan: "chu_co",        giaTri: t(NHAN_CO_CHU[caiDat.coChu]) },
  { muc: "giaoDien", ico: "moon",  nhan: "menu_giao_dien", giaTri: t(NHAN_GIAO_DIEN[caiDat.giaoDien]) },
];
```

và chỗ vẽ `<span className="emo">{d.emo}</span>` đổi thành `<span className="emo"><Icon name={d.ico} /></span>`.
CSS `.drawer-item .emo` (dòng 238) đổi `font-size:18px` thành `display:flex;align-items:center;justify-content:center;`
và thêm `.drawer-item .emo svg{width:18px;height:18px;}`.

Rà cả file: mọi trường `emo` khác trong `modals.tsx` và `shell.tsx` làm y hệt.

**Bước b.** Thêm bảng đổi emoji → icon vào `lib/newui/assets.ts`, ngay dưới `anhDaiDienSanPham`:

```ts
/**
 * Emoji của catalog → tên icon trong bộ một nét.
 *
 * Vì sao cần: `product.icon` của sadmin hay là emoji, mà Apple Color Emoji và Segoe UI Emoji
 * là hai bộ tranh khác hẳn nhau — `♨️` và `🌬️` còn ra đen trắng trên Windows vì là codepoint
 * mặc định kiểu chữ. Vẽ bằng icon của mình thì máy nào cũng như nhau.
 *
 * Emoji lạ không có trong bảng thì vẫn vẽ nguyên emoji — thà hơi khác còn hơn mất biểu tượng.
 */
export const EMOJI_SANG_ICON: Record<string, string> = {
  "❄️": "snow", "❄": "snow",
  "💧": "drop", "🚿": "drop",
  "🍳": "pot",  "🍚": "pot",
  "🌬️": "wind", "🌬": "wind", "🌀": "fanIcn",
  "♨️": "heat", "♨": "heat",
  "🍃": "leaf",
  "📦": "box",
};
```

Ở `home.tsx:199` và `DeviceDetail.tsx:210`, trước khi vẽ `anh.chu`, tra bảng: có trong bảng
thì vẽ `<Icon name={...} />`, không có thì vẽ chữ như cũ.

**Bước c.** Việc cho sadmin, **không phải việc của mã**: đường đúng về lâu dài là sadmin đặt
`product.icon` theo dạng `@ten` (ví dụ `@wind`) để webapp lấy từ kho icon qua `/v1/icons/{ten}`.
Nhánh này **đã có sẵn** trong `diaChiIcon` (`assets.ts`) và chạy được. Bảng ở bước b chỉ là lưới
an toàn cho những sản phẩm còn đang để emoji.

---

## Ghi nhận, KHÔNG sửa trong đợt này

Ba thứ cũng khác giữa Windows và macOS nhưng không đáng sửa — ghi lại để sau khỏi mất công
điều tra lại:

- **Dấu `✓` trong chuỗi `share.shared`** (`strings.ts:695, 905, 1110`) là `U+2713`, nằm ngoài
  cả hai dải `latin` và `vietnamese` của Carlito, nên vẫn rơi về phông hệ thống. Muốn dứt điểm
  thì thay bằng `<Icon name="check" />`.
- **Windows mặc định chia tỉ lệ màn hình 125%** trên nhiều máy, làm `devicePixelRatio` thành
  số lẻ. Nét viền `1px` hai bên cột mới sẽ dày mỏng không đều giữa hai cạnh. Thuần thẩm mỹ.
- **`zoom` cho tính năng cỡ chữ** (`globals.css:844`) chỉ được Firefox hỗ trợ từ bản 126.
  Firefox cũ trên Windows thì chọn "Lớn"/"Rất lớn" **không có tác dụng gì, không báo gì**.
  Chrome, Edge, Safari đều bình thường.

---

## Kiểm sau khi làm

```bash
cd "/Users/tienquang/Documents/Homichi/IOT/IOT App - New UI"
ls public/fonts/                 # phải có đúng 4 .woff2 + 1 giấy phép
npm run lint
npm run build
npm test
```

Kiểm phông đã ăn — mở app rồi dán vào console:

```js
document.fonts.check('14px Carlito')                       // true
getComputedStyle(document.body).fontFamily                 // bắt đầu bằng "Carlito"
// Chữ có dấu phải dùng đúng tệp vietnamese, không rơi về phông hệ thống:
document.fonts.check('14px Carlito', 'Điều hoà đã bật')    // true
```

Bằng mắt, **trên cả máy Mac và máy Windows**, so hai bên cạnh nhau:

1. Cùng một màn, chữ phải **cùng cỡ, cùng độ rộng, xuống dòng cùng chỗ**.
2. Ô chọn ngôn ngữ: thấy **lá cờ thật**, không phải chữ `VN` / `US`.
3. Popup chọn ngôn ngữ và dòng menu "Ngôn ngữ": cũng là cờ thật.
4. Ba dòng menu tài khoản (Ngôn ngữ · Cỡ chữ · Giao diện): icon một nét, không còn emoji.
5. Danh sách thiết bị và màn chi tiết: biểu tượng là icon một nét, **không có cái nào đen trắng**.
6. Thanh cuộn: cùng bề rộng hai bên; vùng nội dung rộng bằng nhau.
7. Ngắt mạng rồi tải lại: chữ vẫn đọc được (rơi về Calibri/Arial), không phải ô trống.
8. Đổi sang giao diện tối: thanh cuộn đổi màu theo, không còn vệt sáng.

## Nhắc

Việc này thực thi ở **tab Code**, không làm ở đây.

Nếu `docs/viec-bo-khung-dien-thoai.md` chưa chạy thì **làm doc đó trước** — cả hai cùng sửa
`globals.css` ở vùng đầu file, làm ngược thứ tự dễ giẫm chân nhau.
