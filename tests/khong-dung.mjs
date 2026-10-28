import { GOC, NHAT_KY, anh, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';

/**
 * `product.ui.khongDung` — "đang thế này thì không dùng được thế kia" (web.dev 23/10/2026).
 *
 * Catalog `ac_1` chép nguyên từ DEV ngày 23/10/2026 (`du-lieu/ac1-khongdung-dev.json`):
 *   ac_power_status off → khoá gần hết (eco, mọi tốc độ quạt, mọi chế độ…)
 *   ac_ope_mode Dry     → khoá eco, tốc độ Mid/High/Turbo/Auto, mute
 *   ac_is_sleep_mode on → khoá eco
 * Ô bị khoá: lớp `khoa`, mờ .4, thân `inert`. Chip bị khoá: lớp `khoa`, mờ .35, bấm không gửi lệnh.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const cho = ms => new Promise(r => setTimeout(r, ms));
const AC1 = JSON.parse(fs.readFileSync(new URL('./du-lieu/ac1-khongdung-dev.json', import.meta.url), 'utf8'));

const b = await chromium.launch({ executablePath: CHROMIUM });
const loi = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
p.on('pageerror', e => loi.push(String(e).slice(0, 160)));
await p.route('**/v1/products*', async r => { const g = await (await r.fetch()).json(); await r.fulfill({ json: { ...g, ac_1: AC1 } }); });
await p.goto(GOC, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('x');
await p.locator('button.login-btn').click(); await cho(2000);
await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await cho(800);
await p.locator('.device-card').filter({ hasText: 'Quạt mới' }).first().locator('.card-hit').click(); await cho(1500);

const tile = k => p.locator(`.bc-tile[data-k="${k}"]`);
const khoaO = k => tile(k).evaluate(n => ({ lop: n.classList.contains('khoa'), aria: n.getAttribute('aria-disabled'), mo: getComputedStyle(n).opacity, inert: n.querySelector('.bc-body').inert }));
const chips = k => tile(k).evaluate(n => [...n.querySelectorAll('.bc-chip')].map(c => ({ chu: c.innerText.trim(), khoa: c.classList.contains('khoa'), mo: getComputedStyle(c).opacity, on: c.classList.contains('on') })));
const nguon = tile('ac_power_status').locator('button');
async function datNguon(bat) {
  if ((await nguon.getAttribute('aria-pressed')) !== String(bat)) { await nguon.click(); await cho(900); }
}
const soLenh = () => (fs.existsSync(NHAT_KY) ? fs.readFileSync(NHAT_KY, 'utf8').trim().split('\n').filter(Boolean).length : 0);

/* ---- Máy TẮT: gần hết ô bị khoá, riêng nút nguồn thì không ---- */
await datNguon(false);
const eco = await khoaO('ac_eco_mode');
ok(`nguồn tắt → ô eco khoá (lớp ${eco.lop}, aria-disabled ${eco.aria}, mờ ${eco.mo}, inert ${eco.inert})`, eco.lop && eco.aria === 'true' && eco.mo === '0.4' && eco.inert);
const quat = await khoaO('ac_fan_speed');
ok('nguồn tắt → MỌI tốc độ quạt bị khoá nên cả ô quạt khoá', quat.lop);
ok('nút nguồn không tự khoá chính nó', !(await khoaO('ac_power_status')).lop);
ok('ô không có trong danh sách (iClean) vẫn dùng được', !(await khoaO('ac_is_iclean')).lop);
const truoc = soLenh();
await tile('ac_eco_mode').click({ force: true }); await cho(700);
ok('bấm vào ô đang khoá → không gửi lệnh', soLenh() === truoc);
await tile('ac_eco_mode').screenshot({ path: anh('khong-dung-o') });

/* ---- Máy BẬT, chế độ Dry: chỉ khoá vài giá trị ---- */
await datNguon(true);
await tile('ac_ope_mode').locator('.bc-chip', { hasText: /Dry|Hút ẩm|Khô/ }).first().click(); await cho(900);
const q = await chips('ac_fan_speed');
const khoaQ = q.filter(c => c.khoa).length;
ok(`Dry → khoá 4/5 tốc độ quạt, còn 1 dùng được (${q.map(c => `${c.chu}${c.khoa ? '✕' : ''}`).join(' ')})`, q.length === 5 && khoaQ === 4);
ok('chip khoá mờ .35, chip còn dùng được rõ', q.every(c => c.mo === (c.khoa ? '0.35' : '1')));
ok('ô quạt KHÔNG khoá cả ô (còn 1 giá trị)', !(await khoaO('ac_fan_speed')).lop);
ok('Dry → ô eco khoá', (await khoaO('ac_eco_mode')).lop);
const t2 = soLenh();
await tile('ac_fan_speed').locator('.bc-chip.khoa').first().click({ force: true }); await cho(700);
ok('bấm chip đang khoá → không gửi lệnh', soLenh() === t2);
ok('chip khoá có aria-disabled và ra khỏi thứ tự Tab', await tile('ac_fan_speed').locator('.bc-chip.khoa').first().evaluate(n => n.getAttribute('aria-disabled') === 'true' && n.tabIndex === -1));
await tile('ac_fan_speed').screenshot({ path: anh('khong-dung-chip') });

/* ---- Đổi sang Cool: không còn khoá gì ---- */
await tile('ac_ope_mode').locator('.bc-chip', { hasText: /Cool|Làm mát|Lạnh/ }).first().click(); await cho(900);
ok('Cool → tốc độ quạt mở hết', (await chips('ac_fan_speed')).every(c => !c.khoa));
ok('Cool → eco mở lại', !(await khoaO('ac_eco_mode')).lop);

/* ---- Chốt an toàn: luật lỡ khoá nút nguồn (đặc tả 5.1b) thì app vẫn không khoá ---- */
{
  const ac1 = { ...AC1, ui: { ...AC1.ui, khongDung: { ...AC1.ui.khongDung, ac_ope_mode: { Cool: ['*'] } } } };
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await c2.newPage();
  p2.on('pageerror', e => loi.push(String(e).slice(0, 160)));
  await p2.route('**/v1/products*', async r => { const g = await (await r.fetch()).json(); await r.fulfill({ json: { ...g, ac_1: ac1 } }); });
  await p2.goto(GOC, { waitUntil: 'networkidle' });
  await p2.locator('#dn-id').fill('p@p.vn'); await p2.locator('#dn-pw').fill('x');
  await p2.locator('button.login-btn').click(); await cho(2000);
  await p2.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await cho(800);
  await p2.locator('.device-card').filter({ hasText: 'Quạt mới' }).first().locator('.card-hit').click(); await cho(1500);
  const lop = k => p2.locator(`.bc-tile[data-k="${k}"]`).evaluate(n => n.classList.contains('khoa'));
  ok('Cool khoá "*" → mọi ô khác khoá (eco)…', await lop('ac_eco_mode'));
  ok('…nhưng nút nguồn vẫn bấm được', !(await lop('ac_power_status')));
  await c2.close();
}

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
