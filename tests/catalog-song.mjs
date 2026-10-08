import { GOC, GOC_GIA, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Catalog đổi lúc app đang chạy — sửa lưới `ui.boCuc` trên sadmin rồi lưu.
 *
 * Bệnh: nhịp đồng bộ trước đây chỉ hỏi `/devices`, mà sửa lưới thì DỮ LIỆU THIẾT BỊ không
 * đổi một chữ nào — thứ đổi là catalog, và phiên bản của nó chỉ nằm trong `/bootstrap`
 * (`phienBan.products`). Nên app giữ bố cục cũ cho tới khi tải lại trang, trong khi
 * web.dev — vốn hỏi `/bootstrap` mỗi 2,5 giây — đổi ngay trước mắt.
 *
 * Bài này đổi lưới NGAY LÚC màn chi tiết đang mở và đo xem nó có tự vẽ lại không.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 140)));

await p.goto(GOC, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await p.locator('#dn-id').fill('p@p.vn');
await p.locator('#dn-pw').fill('x');
await p.locator('button.login-btn').click(); await p.waitForTimeout(2200);
await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await p.waitForTimeout(900);

const doiCatalog = (sp, luoi) => p.evaluate(async u => { await fetch(u); },
  `${GOC_GIA}/v1/__doi_catalog?sp=${sp}&boCuc=${encodeURIComponent(JSON.stringify(luoi))}`);

/** Chờ tới khi điều kiện đúng, trả về số giây đã chờ (null nếu quá hạn). */
async function doiToi(ham, han = 12000) {
  const dau = Date.now();
  while (Date.now() - dau < han) {
    if (await ham()) return Math.round((Date.now() - dau) / 100) / 10;
    await p.waitForTimeout(400);
  }
  return null;
}

// Máy chủ giả giữ catalog trong bộ nhớ, nên lần chạy trước còn để lại lưới cũ của nó.
// Đặt lại mốc trước đã, không thì bài này lúc xanh lúc đỏ mà chẳng liên quan gì tới app.
const LUOI_GOC = { cot: 4, o: [
  { key: 'buzzer', col: 3, row: 8, w: 2, h: 1 },
  { key: 'curSpeed', col: 1, row: 1, w: 4, h: 1, variant: 'readout01' },
  { key: 'light', col: 1, row: 8, w: 2, h: 1 },
  { key: 'mode', col: 1, row: 5, w: 4, h: 2, moiHang: 2, coNut: 'nho' },
  { key: 'oscillate', col: 1, row: 7, w: 4, h: 1 },
  { key: 'power', col: 1, row: 4, w: 4, h: 1, variant: 'power01' },
  { key: 'speed', col: 1, row: 2, w: 4, h: 2, variant: 'dial01' },
  { key: 'timerOff', col: 1, row: 9, w: 4, h: 1, variant: 'step01' },
] };
await doiCatalog('fan_sbi314', LUOI_GOC);

await p.locator('.device-card').filter({ hasText: '03092026A1' }).first().locator('.card-hit').click();
await p.waitForTimeout(1500);

const soO = () => p.locator('.bc-tile').count();
const viTri = key => p.locator(`.bc-tile[data-k="${key}"]`).evaluate(n => getComputedStyle(n).gridArea).catch(() => '(khong co)');

const veMoc = await doiToi(async () => (await soO()) === 8);
ok(`về đúng mốc 8 ô sau ${veMoc}s`, veMoc !== null);
const speedDau = await viTri('speed');
ok(`speed đang ở ${speedDau}`, speedDau.startsWith('2 /'));

/* --- sadmin lưu lưới mới: speed xuống cuối, bỏ bớt ô, đổi skin --- */
await doiCatalog('fan_sbi314', { cot: 4, skin: 'graphite', o: [
  { key: 'power', col: 1, row: 1, w: 4, h: 1, variant: 'power01' },
  { key: 'light', col: 1, row: 2, w: 2, h: 1 },
  { key: 'buzzer', col: 3, row: 2, w: 2, h: 1 },
  { key: 'speed', col: 1, row: 3, w: 4, h: 2, variant: 'dial01' },
] });

const t = await doiToi(async () => (await soO()) === 4);
ok(`lưới mới về trong ${t}s mà KHÔNG phải tải lại trang`, t !== null && t <= 8);
ok(`chỉ còn 4 ô như catalog mới khai (${await soO()})`, await soO() === 4);
const speedSau = await viTri('speed');
ok(`speed đã dời xuống hàng 3 (${speedSau})`, speedSau.startsWith('3 /'));
ok('ô bị bỏ khỏi lưới thì biến mất', await p.locator('.bc-tile[data-k="timerOff"]').count() === 0);

// Skin cũng phải theo catalog mới: graphite #475569, không còn teal #02b6ac.
// Phải so ĐÚNG màu — chấp nhận "khác rỗng" thì teal cũ cũng lọt.
const mauNut = await p.locator('.bc-pwr').first()
  .evaluate(n => getComputedStyle(n).backgroundColor).catch(() => '');
ok(`skin graphite có tác dụng (${mauNut})`, mauNut === 'rgb(71, 85, 105)');

await doiCatalog('fan_sbi314', LUOI_GOC);   // trả lại mốc cho lần chạy sau

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
