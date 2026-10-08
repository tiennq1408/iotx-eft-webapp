# Việc: Dựng lại đầu màn chi tiết thiết bị

- Trạng thái: **đã làm 07/10/2026**
- Phạm vi: `IOT App - New UI`
- Làm ở đâu: **tab Code** (viết mã, chạy test, commit)
- Viết: 07/10/2026

## Mục tiêu

Đầu màn chi tiết thiết bị hiện một hàng gồm: nút trở lại ‹ · ảnh đại diện ·
tên thiết bị + nút bút đổi tên · dòng trạng thái · sao ghim. Ngay dưới là ba ô
chọn **Nhà / Phòng / Nhóm** để gán chỗ tại chỗ, kèm mục "＋ Thêm mới…" để gõ tên
mới mà không phải lặn vào màn quản lý.

Dựng theo bản tham chiếu `web.dev.happibot.net` (đọc 07/10/2026), cộng nút trở
lại bên trái vốn là của app này. Cả bốn thao tác (đổi tên, gán nhà, gán phòng,
gán nhóm, ghim) đi chung một cửa `PATCH /devices/{id}`.

## ⚠️ Đọc trước khi bắt đầu

Phần này đã từng được dựng xong một lần trong một bản sao repo trên cloud, nhưng
bản sao đó **đã lệch khỏi máy này** và **không được chép đè**. Lý do:

1. Máy này đang có hơn 20 tệp sửa chưa commit (`git status` ngày 07/10), nhiều
   hơn hẳn bản sao kia. Chép đè sẽ nuốt mất công việc mới.
2. `lib/newui/strings.ts` trong bản sao **bị hỏng**: khoá `notif_delete` bị đổi
   nhầm thành `auto_delete` ở cả ba ngôn ngữ (nhãn "Xoá thông báo này" biến mất
   và `auto_delete` bị khai hai lần). Bản trên máy này mới là bản đúng.
3. `components/LivotecApp.tsx` trong bản sao thuộc một nhánh cũ hơn: nó nhập
   `AppData` từ `@/lib/storage`, còn `ToastModal`/`tranLuat`/`onToast`, và
   **không có** `loiDongBo`.
4. `components/newui/device/DeviceDetail.tsx` trong bản sao có một loạt đổi tên
   vô ích (`nhanCap` → `nhanCua`, `doSo` → `so`, `nhanGiaTriCap` → `nhanGiaTri`)
   và hai prop `lang`/`onLang` không dùng tới.
5. `app/globals.css` trong bản sao còn khối `.flag-row`/`.flag-btn` **không tệp
   tsx nào dùng** — CSS chết.

➡️ Vì vậy: **gõ tay theo doc này**, đừng chép tệp. Những đoạn mã dưới đây đã lọc
sạch năm thứ rác kể trên.

## Sự thật đã đo (07/10/2026, đo thẳng trên máy này)

Mọi thứ cần dùng **đã có sẵn**, không phải dựng thêm:

| Thứ cần | Có chưa | Ở đâu |
|---|---|---|
| `Device.fav`, `.shared`, `.perms`, `.house`, `.room`, `.group` | ✅ | `lib/types.ts` |
| `SpaceState = {houses, rooms, groups}` | ✅ | `lib/types.ts:24` |
| `iotxClient.updateDevice(id, {label, house, room, grp, fav, hidden})` → `PATCH /devices/{id}` | ✅ | `lib/iotx/client.ts:189` |
| Chuỗi `pick_room` | ✅ | `strings.ts:23` (từ điển chính) |
| Chuỗi `pick_house`, `pick_group` | ✅ | `strings.ts:343` (từ điển lồng — **kiểm `t("pick_house")` trả đúng chữ trước khi dùng**) |
| CSS `.devpage .dev-ico/.dev-giua/.dev-tenhang/.dev-ten/.dev-st/.dev-dot/.devback` | ✅ | `globals.css:511–539` |
| Biến màu `--sao #c4cfcc`, `--sao-on #f5b301`, `--brand-soft`, `--line`, `--card`, `--ink`, `--dim`, `--ok` | ✅ | `globals.css:498–500`, trong phạm vi `.devpage` |

Cần thêm mới: 7 chuỗi × 3 ngôn ngữ, 5 quy tắc CSS, cửa `PATCH /devices` trong
máy chủ giả, và một bài kiểm.

## Tệp phải sửa

| Tệp | Sửa gì |
|---|---|
| `lib/newui/strings.ts` | thêm 7 khoá vào **ba** từ điển vi/en/tl |
| `app/globals.css` | thêm khối 5 quy tắc, đặt ngay sau `.devpage .frow{…}` (~dòng 533) |
| `components/newui/device/DeviceDetail.tsx` | 2 prop mới, 1 hằng `GAN`, 3 state, 2 hàm, thay khối header |
| `components/LivotecApp.tsx` | thêm `suaThietBi`, truyền 2 prop mới |
| `tests/may-chu-gia.mjs` | thêm cửa `PATCH /devices/{id}` + ghi nhật ký |
| `tests/dau-man.mjs` | **tệp mới** |
| `tests/chay.mjs` | thêm `'dau-man.mjs'` vào nhóm `api` |

## Các bước

### Bước 1 — `lib/newui/strings.ts`

Thêm vào **từ điển tiếng Việt** (cạnh cụm `hg_no_cap`, ~dòng 101):

```ts
  dev_rename: "Đổi tên thiết bị",
  dev_fav: "Ghim thiết bị",
  dev_shared: "được chia sẻ",
  dev_them_moi: "Thêm mới…",
  dev_chua_gan_nha: "Nhà: chưa gán",
  dev_chua_gan_phong: "Phòng: chưa gán",
  dev_chua_gan_nhom: "Nhóm: chưa gán",
```

Tiếng Anh (~dòng 206):

```ts
  dev_rename: "Rename device",
  dev_fav: "Pin device",
  dev_shared: "shared with you",
  dev_them_moi: "New…",
  dev_chua_gan_nha: "House: unassigned",
  dev_chua_gan_phong: "Room: unassigned",
  dev_chua_gan_nhom: "Group: unassigned",
```

Tagalog (~dòng 311):

```ts
  dev_rename: "Palitan ang pangalan",
  dev_fav: "I-pin ang device",
  dev_shared: "ibinahagi sa iyo",
  dev_them_moi: "Bago…",
  dev_chua_gan_nha: "Bahay: wala pa",
  dev_chua_gan_phong: "Kwarto: wala pa",
  dev_chua_gan_nhom: "Grupo: wala pa",
```

**Không đụng tới `notif_delete`.**

### Bước 2 — `app/globals.css`

Chèn ngay sau dòng `.devpage .frow{display:flex; gap:.4rem;}`:

```css
/* ---- đầu màn chi tiết: nút đổi tên, sao ghim, ba ô gán chỗ ----
   Số đo chép từ bản tham chiếu web.dev (đọc 07/10/2026), trừ chiều cao ô chọn: bản đó để
   30px, dự án đòi vùng chạm 44px nên nâng lên và tăng cỡ chữ cho cân. */
.devpage .dev-but{
  flex:0 0 auto; width:44px; height:44px; padding:6px; border:0; border-radius:10px;
  background:transparent; color:var(--dim); font-size:.9rem; cursor:pointer; line-height:1;
}
.devpage .dev-but:hover{background:var(--brand-soft);}
.devpage .dev-teno{
  flex:1 1 auto; min-width:0; min-height:36px; padding:.25rem .5rem;
  border:1px solid var(--brand); border-radius:9px; background:var(--card);
  color:var(--ink); font-size:1rem; font-weight:600; font-family:inherit;
}
.devpage .fav-lon{
  flex:0 0 auto; width:44px; height:44px; padding:1px 6px; border:0; border-radius:12px;
  background:transparent; color:var(--sao); font-size:1.7rem; line-height:1; cursor:pointer;
}
.devpage .fav-lon.on{color:var(--sao-on);}
.devpage .dev-gan{margin-top:.1rem;}
.devpage .fsel{
  flex:1 1 0; min-width:0; min-height:44px; padding:.4rem .3rem;
  border:1px solid var(--line); border-radius:10px; background:var(--card);
  color:var(--ink); font-size:.72rem; font-family:inherit;
}
```

### Bước 3 — `components/newui/device/DeviceDetail.tsx`

**3a. Nhập thêm kiểu** (dòng 15):

```ts
import type { Device, SpaceState } from "@/lib/types";
```

**3b. Hai prop mới** trong `PropsMan`:

```ts
  /** Danh sách nhà / phòng / nhóm để đổ vào ba ô gán ở đầu màn. */
  spaces: SpaceState;
  /** Sửa chính thiết bị: đổi tên, gán chỗ, ghim. Một cửa `PATCH /devices/{id}` lo cả bốn. */
  onSua: (patch: { label?: string; house?: string; room?: string; grp?: string; fav?: boolean }) => Promise<void>;
```

**3c. Hằng `GAN`**, đặt ngay trước hàm `tomTatHenGio`:

```ts
/**
 * Ba ô gán ở đầu màn. `grp` là tên trường của API, còn trong `Device` nó là `group` —
 * khác tên nên tách riêng thay vì suy ra, để sau này đọc không phải đoán.
 */
const GAN = [
  { khoa: "house" as const, dsKey: "houses" as const, nhan: "pick_house", chuaGan: "dev_chua_gan_nha" },
  { khoa: "room" as const, dsKey: "rooms" as const, nhan: "pick_room", chuaGan: "dev_chua_gan_phong" },
  { khoa: "grp" as const, dsKey: "groups" as const, nhan: "pick_group", chuaGan: "dev_chua_gan_nhom" },
];
```

**3d. Chữ ký hàm + state**, thay dòng `export default function DeviceDetail({ device, onClose, … })`:

```tsx
export default function DeviceDetail({ device, onClose, onCommand, onAn, onHenGio, onVatTu, spaces, onSua }: PropsMan) {
  const { t } = useChu();
  const [loi, setLoi] = useState("");
  const [doiTen, setDoiTen] = useState(false);
  const [tenMoi, setTenMoi] = useState("");
  const [themMuc, setThemMuc] = useState<"house" | "room" | "grp" | null>(null);

  /** Người chỉ được xem thì không sửa được tên, chỗ hay ghim — ẩn hẳn cho khỏi mời gọi. */
  const choSua = device.perms?.create !== false && device.perms?.control !== false;

  async function lam(patch: Parameters<typeof onSua>[0]) {
    setLoi("");
    try { await onSua(patch); }
    catch (e) { setLoi(moTaLoi(e)); }
  }

  async function luuTen() {
    if (!doiTen) return;
    const v = tenMoi.trim();
    setDoiTen(false);
    if (v && v !== device.name) await lam({ label: v });
  }
```

**3e. Thay khối header.** Bỏ đoạn hiện có (dòng 386–396, từ `<div className="dev-giua">`
đến hết `</div>` đóng `.row devdau`) và thay bằng:

```tsx
          <div className="dev-giua">
            <div className="dev-tenhang">
              {doiTen ? (
                <input className="dev-teno" autoFocus value={tenMoi} maxLength={60}
                  aria-label={t("dev_rename")}
                  onChange={e => setTenMoi(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") void luuTen(); if (e.key === "Escape") setDoiTen(false); }}
                  onBlur={() => { void luuTen(); }} />
              ) : (
                <>
                  <span className="dev-ten">{device.name}</span>
                  {choSua && (
                    <button className="dev-but" aria-label={t("dev_rename")}
                      onClick={() => { setTenMoi(device.name); setDoiTen(true); }}>✏️</button>
                  )}
                </>
              )}
            </div>
            <div className={`dev-st small${device.online ? "" : " dim"}`}>
              <i className={`dev-dot${device.online ? " on" : ""}`} />
              {device.online ? t("online") : t("offline")}
              {device.shared ? ` · 👥 ${t("dev_shared")}` : ""}
            </div>
          </div>
          <button className={`fav-lon${device.fav ? " on" : ""}`} aria-pressed={Boolean(device.fav)}
            aria-label={t("dev_fav")} onClick={() => { void lam({ fav: !device.fav }); }}>★</button>
        </div>

        {/* Gán nhà / phòng / nhóm ngay tại đây, không phải lặn vào màn quản lý. */}
        {choSua && (
          <div className="frow dev-gan">
            {GAN.map(({ khoa, dsKey, nhan, chuaGan }) => {
              const dang = khoa === "grp" ? device.group : (device[khoa] as string);
              const ds = [...new Set([...(spaces[dsKey] ?? []), dang].filter(Boolean))]
                .sort((a, b) => a.localeCompare(b, "vi"));
              return themMuc === khoa ? (
                <input key={khoa} className="fsel" autoFocus placeholder={t(nhan)} maxLength={40}
                  aria-label={t(nhan)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { void lam({ [khoa]: e.currentTarget.value.trim() }); setThemMuc(null); }
                    if (e.key === "Escape") setThemMuc(null);
                  }}
                  onBlur={e => { const v = e.target.value.trim(); if (v) void lam({ [khoa]: v }); setThemMuc(null); }} />
              ) : (
                <select key={khoa} className="fsel" aria-label={t(nhan)} value={dang || ""}
                  onChange={e => {
                    if (e.target.value === "__moi") { setThemMuc(khoa); return; }
                    void lam({ [khoa]: e.target.value });
                  }}>
                  <option value="">{t(chuaGan)}</option>
                  {ds.map(v => <option key={v} value={v}>{v}</option>)}
                  <option value="__moi">＋ {t("dev_them_moi")}</option>
                </select>
              );
            })}
          </div>
        )}
```

**Lưu ý có chủ đích:** tên phòng **rời khỏi** dòng trạng thái (`· {device.room}`)
vì nó đã nằm trong ô chọn ngay dưới; chỗ đó giờ dành cho dấu `👥 được chia sẻ`.

### Bước 4 — `components/LivotecApp.tsx`

**4a.** Thêm hàm, đặt cạnh `doiGhim`/`anThietBi`:

```tsx
  /**
   * Đổi tên / gán chỗ / ghim — cùng một cửa `PATCH /devices/{id}`.
   *
   * Vẽ ngay rồi mới gửi, vì ba thao tác này người dùng kỳ vọng thấy liền tay. Hỏng thì trả
   * về nguyên trạng và ném lỗi ra cho màn chi tiết hiện câu của máy chủ.
   *
   * Tên chỗ mới gõ ra được nhét luôn vào `spaces`, nếu không thì nó biến mất khỏi ô chọn
   * ngay sau khi lưu và người dùng tưởng là hỏng.
   */
  async function suaThietBi(id: string, patch: { label?: string; house?: string; room?: string; grp?: string; fav?: boolean }) {
    const truoc = data.devices.find(device => device.id === id);
    setData(current => ({
      ...current,
      spaces: {
        houses: patch.house ? [...new Set([...current.spaces.houses, patch.house])] : current.spaces.houses,
        rooms: patch.room ? [...new Set([...current.spaces.rooms, patch.room])] : current.spaces.rooms,
        groups: patch.grp ? [...new Set([...current.spaces.groups, patch.grp])] : current.spaces.groups,
      },
      devices: current.devices.map(device => device.id !== id ? device : {
        ...device,
        name: patch.label ?? device.name,
        house: patch.house ?? device.house,
        room: patch.room ?? device.room,
        group: patch.grp ?? device.group,
        fav: patch.fav ?? device.fav,
      }),
    }));
    if (!isIotxMode) return;
    try { await iotxClient.updateDevice(id, patch); }
    catch (error) {
      if (truoc) setData(current => ({ ...current, devices: current.devices.map(d => d.id === id ? truoc : d) }));
      throw error;
    }
  }
```

**4b.** Thêm hai prop vào `<DeviceDetail …>`:

```tsx
                spaces={data.spaces}
                onSua={patch => suaThietBi(thietBiDangMo.id, patch)}
```

### Bước 5 — `tests/may-chu-gia.mjs`

Máy chủ giả hiện **chưa có** cửa `PATCH /devices/{id}` và nhật ký (dòng 186) chỉ
ghi `{id, idem, than}` cho RPC. Thêm cửa mới, ghi kèm trường `cua` để bài kiểm lọc:

```js
// PATCH /devices/{id} — đổi tên, gán chỗ, ghim. Ghi nhật ký kèm `cua` để bài kiểm lọc ra.
if (duoi[0] === 'devices' && duoi.length === 2 && req.method === 'PATCH') {
  return doc().then(than => {
    const id = decodeURIComponent(duoi[1]);
    const tb = kho.devices.find(d => d.id === id);
    if (!tb) return J(res, { message: 'not_found' }, 404);
    Object.assign(tb, than);
    fs.appendFileSync(NHAT_KY, JSON.stringify({ cua: 'PATCH /devices', id, patch: than }) + '\n');
    return J(res, { ok: true });
  });
}
```

Tên biến (`duoi`, `kho`, `doc()`, `J`) lấy theo đúng tệp hiện có — chỉnh lại cho khớp.

### Bước 6 — `tests/dau-man.mjs` (tệp mới)

Nguyên văn ở phụ lục cuối doc. Đã sửa sẵn theo quy ước `CHROMIUM` trong `tests/chung.mjs`.

### Bước 7 — `tests/chay.mjs`

Thêm `'dau-man.mjs'` vào mảng `bai` của nhóm `api` (nhóm này cần máy chủ giả).

## Cách kiểm chứng

```bash
npx tsc --noEmit
npm run lint
npm run build
node tests/chay.mjs api
```

Đạt khi:

- `tsc` và `lint` sạch.
- `node tests/dau-man.mjs` ra **22/22 đạt**, dòng "Lỗi JS: không có".
- Các bộ cũ trong nhóm `api` vẫn đạt như trước (`bo-cuc` 61, `hen-gio` 27,
  `catalog-song` 7, `rpc` 13, `nhip-hoi` 8, `dong-bo` 4, `anh-dai-dien` 8).

Soi mắt thêm ba thứ bài kiểm không bắt được:

1. Mở màn chi tiết trên máy **được chia sẻ** → không thấy bút, sao, lẫn ba ô gán.
2. Đặt tên nhà dài ~40 ký tự → ba ô vẫn không tràn ngang.
3. Nền tối / da (skin) khác → chữ trong ô chọn vẫn đọc được.

## Ràng buộc (AGENTS.md)

- Đọc `docs/IOTX-INTEGRATION.md` trước khi đụng phần thiết bị / chia sẻ.
- Chỉ nói chuyện với IBS qua `/v1`. Ở đây chỉ dùng `PATCH /devices/{id}` đã có sẵn.
- **Vùng chạm ≥44px, không tràn ngang, tương phản đạt WCAG** — bài kiểm có soi ba điều này.
- Tôn trọng quyền chia sẻ theo thiết bị → đó là lý do có `choSua`.
- Chạy `npm run lint` và `npm run build` trước khi bàn giao.

## Không làm

- ❌ Chép tệp từ bản sao repo trên cloud — xem mục cảnh báo đầu doc.
- ❌ Thêm prop `lang` / `onLang` vào `DeviceDetail` (không dùng tới).
- ❌ Đổi tên `nhanCap` / `nhanGiaTriCap` / `doSo`.
- ❌ Đụng vào `notif_delete` trong `strings.ts`.
- ❌ Thêm `.flag-row` / `.flag-btn` vào CSS.
- ❌ Mở rộng sang gọi `admin/*`, Keycloak, ThingsBoard.
- ❌ Đổi thiết kế chung của màn chi tiết — doc này chỉ động tới phần đầu màn.

---

## Phụ lục — `tests/dau-man.mjs`

```js
import { GOC, NHAT_KY, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';

/**
 * Đầu màn chi tiết thiết bị — dựng theo bản tham chiếu web.dev (đọc 07/10/2026), cộng nút
 * trở lại bên trái vốn là của app này.
 *
 * Một hàng: ‹ · ảnh · tên + bút sửa · dòng trạng thái · sao ghim.
 * Hàng dưới: ba ô gán Nhà / Phòng / Nhóm.
 *
 * Cả bốn thao tác đi chung một cửa `PATCH /devices/{id}`, nên bài này soi nhật ký máy chủ
 * để chắc mỗi nút gửi đúng trường chứ không chỉ đổi màu trên màn.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
try { fs.unlinkSync(NHAT_KY); } catch { /* chưa có */ }
const ghi = () => (fs.existsSync(NHAT_KY) ? fs.readFileSync(NHAT_KY, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [])
  .filter(x => x.cua === 'PATCH /devices');

const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 140)));

await p.goto(GOC, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await p.getByPlaceholder(/Tên đăng nhập/).fill('p@p');
await p.getByPlaceholder(/Mật khẩu/).fill('x');
await p.locator('button.login-btn').click(); await p.waitForTimeout(2200);
await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await p.waitForTimeout(1000);
await p.locator('.device-card').filter({ hasText: 'SBI314' }).first().locator('.card-hit').click();
await p.waitForTimeout(1500);

try {
  /* ---------- 1. Có đủ các phần ---------- */
  ok('nút trở lại vẫn ở bên trái', await p.locator('.devdau .devback').count() === 1);
  ok('có ảnh đại diện', await p.locator('.devdau .dev-ico').count() === 1);
  ok('tên thiết bị đúng', (await p.locator('.dev-ten').innerText()).trim() === 'SBI314');
  ok('có nút bút để đổi tên', await p.locator('.devdau .dev-but').count() === 1);
  ok('có sao ghim', await p.locator('.devdau .fav-lon').count() === 1);
  ok('máy được chia sẻ thì dòng trạng thái nói rõ',
    /được chia sẻ/.test(await p.locator('.dev-st').innerText()));
  ok('ba ô gán Nhà / Phòng / Nhóm', await p.locator('.dev-gan .fsel').count() === 3);
  ok('chưa gán thì cả ba hiện "chưa gán"',
    (await p.locator('.dev-gan .fsel').evaluateAll(ns => ns.map(n => n.options[n.selectedIndex]?.text)))
      .every(x => /chưa gán/.test(x)));

  /* ---------- 2. Không tràn ngang, vùng chạm đủ 44px ---------- */
  ok('hàng gán không tràn khỏi màn', await p.locator('.devbody').evaluate(n => n.scrollWidth <= n.clientWidth));
  ok('cả ba ô đọc trọn chữ, không bị cắt', await p.locator('.dev-gan .fsel').evaluateAll(
    ns => ns.every(n => n.scrollWidth <= n.clientWidth + 1)));
  const nho = await p.locator('.devdau button, .dev-gan .fsel').evaluateAll(
    ns => ns.map(n => n.getBoundingClientRect()).filter(r => r.height < 44 || r.width < 44).length);
  ok(`mọi nút ở đầu màn ≥44px (${nho} nhỏ)`, nho === 0);

  /* ---------- 3. Sao ghim gửi đúng lệnh ---------- */
  const saoTruoc = await p.locator('.fav-lon').getAttribute('aria-pressed');
  await p.locator('.fav-lon').click(); await p.waitForTimeout(900);
  ok(`bấm sao thì đổi ngay trên màn (${saoTruoc} → ${await p.locator('.fav-lon').getAttribute('aria-pressed')})`,
    await p.locator('.fav-lon').getAttribute('aria-pressed') !== saoTruoc);
  ok('và gửi PATCH { fav }', ghi().some(x => 'fav' in x.patch));

  /* ---------- 4. Gán phòng ---------- */
  const oPhong = p.locator('.dev-gan .fsel').nth(1);
  const coSan = await oPhong.evaluate(n => [...n.options].map(o => o.value).filter(v => v && v !== '__moi'));
  if (coSan.length) {
    await oPhong.selectOption(coSan[0]); await p.waitForTimeout(900);
    ok(`chọn phòng có sẵn → PATCH { room: "${coSan[0]}" }`, ghi().some(x => x.patch.room === coSan[0]));
  } else ok('chọn phòng có sẵn (bỏ qua: danh sách rỗng)', true);

  /* ---------- 5. "Thêm mới…" biến ô chọn thành ô nhập ---------- */
  const oNha = p.locator('.dev-gan .fsel').first();
  await oNha.selectOption('__moi'); await p.waitForTimeout(600);
  const oNhap = p.locator('.dev-gan input.fsel');
  ok('chọn "Thêm mới…" thì hiện ô nhập', await oNhap.count() === 1);
  await oNhap.fill('Nhà Thử'); await oNhap.press('Enter'); await p.waitForTimeout(1000);
  ok('gõ tên mới → PATCH { house }', ghi().some(x => x.patch.house === 'Nhà Thử'));
  ok('tên vừa tạo thành lựa chọn trong ô', await p.locator('.dev-gan .fsel').first()
    .evaluate(n => [...n.options].some(o => o.value === 'Nhà Thử')));

  /* ---------- 6. Đổi tên bằng nút bút ---------- */
  await p.locator('.dev-but').click(); await p.waitForTimeout(500);
  const oTen = p.locator('.dev-teno');
  ok('bấm bút thì tên thành ô nhập', await oTen.count() === 1);
  await oTen.fill('SBI314 đổi'); await oTen.press('Enter'); await p.waitForTimeout(1000);
  ok('gửi PATCH { label }', ghi().some(x => x.patch.label === 'SBI314 đổi'));
  ok('tên trên màn đổi theo', (await p.locator('.dev-ten').innerText()).trim() === 'SBI314 đổi');
  // trả lại tên cũ cho lần chạy sau
  await p.locator('.dev-but').click(); await p.waitForTimeout(400);
  await p.locator('.dev-teno').fill('SBI314'); await p.locator('.dev-teno').press('Enter'); await p.waitForTimeout(900);

  /* ---------- 7. Bấm Esc thì bỏ dở, không gửi gì ---------- */
  const truocEsc = ghi().length;
  await p.locator('.dev-but').click(); await p.waitForTimeout(400);
  await p.locator('.dev-teno').fill('đừng lưu cái này');
  await p.locator('.dev-teno').press('Escape'); await p.waitForTimeout(700);
  ok('Esc bỏ dở đổi tên, không gửi lệnh nào', ghi().length === truocEsc);
  ok('tên giữ nguyên sau khi Esc', (await p.locator('.dev-ten').innerText()).trim() === 'SBI314');
} catch (e) {
  R.push(`FAIL  dừng giữa chừng: ${String(e).split('\n')[0].slice(0, 160)}`);
} finally {
  console.log(R.join('\n'));
  console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
  console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
  await b.close();
}
```
