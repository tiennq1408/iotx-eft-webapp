import { GOC, anh, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';

/**
 * Chiều cao hàng theo từng ô (`ui.boCuc.o[].caoHang`, docs/viec-caohang-o.md).
 *
 * Sadmin khai `caoHang` ở hai cấp: lưới và từng ô. Hàng nào bị một ô có `caoHang` phủ lên thì
 * lấy số của ô đó (đè số của lưới, kể cả khi nhỏ hơn); hàng còn lại lấy số của lưới (mặc định 64).
 *
 * Ba vector dưới đây đọc bằng `getComputedStyle` trên web.dev ngày 16/10/2026. Catalog của ba
 * sản phẩm chép nguyên từ DEV cùng ngày vào `du-lieu/cao-hang-dev.json` và bơm vào app qua
 * `/v1/products` — không sửa `products.json` dùng chung, để các bài khác giữ catalog của chúng.
 * Lần sau sadmin đổi số: lấy lại catalog DEV, chạy bài này, thấy ngay vector nào lệch.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const DEV = JSON.parse(fs.readFileSync(new URL('./du-lieu/cao-hang-dev.json', import.meta.url), 'utf8'));

const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 160)));

// Catalog máy chủ giả + ba sản phẩm DEV đè lên cùng khoá.
await p.route('**/v1/products*', async route => {
  const goc = await route.fetch();
  const ds = await goc.json();
  await route.fulfill({ status: 200, json: { ...ds, ...DEV } });
});

await p.goto(GOC, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await p.locator('#dn-id').fill('p@p.vn');
await p.locator('#dn-pw').fill('x');
await p.locator('button.login-btn').click(); await p.waitForTimeout(2200);
await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await p.waitForTimeout(900);

const mo = async ten => {
  await p.locator('.device-card').filter({ hasText: ten }).first().locator('.card-hit').click();
  await p.waitForTimeout(1000);
};
const dong = async () => { await p.locator('.devback').click(); await p.waitForTimeout(600); };
const doLuoi = () => p.locator('.bc-grid').evaluate(n => ({
  hang: getComputedStyle(n).gridTemplateRows,
  cao: Math.round(n.getBoundingClientRect().height),
}));

// 1. Smart Fan 314: lưới 72, ô vòng xoay `speed` (h=3) khai 48, ô `mode` (h=2) khai 64.
await mo('SBI314');
const quat = await doLuoi();
ok(`SBI314: "${quat.hang}"`, quat.hang === '48px 48px 48px 64px 64px 72px 72px 72px');
ok(`SBI314: lưới cao ${quat.cao}px = 3×48 + 2×64 + 3×72 + 7×8 = 544`, quat.cao === 544);
ok('SBI314: số của ô (48) ĐÈ số của lưới (72) dù nhỏ hơn',
  await p.locator('.bc-tile[data-k="speed"]').evaluate(n => Math.round(n.getBoundingClientRect().height)) === 3 * 48 + 2 * 8);
await p.screenshot({ path: anh('cao-hang-sbi314'), fullPage: true });
await dong();

// 2. Air Conditioner (L1): lưới không khai (64), `ac_ope_mode` và `ac_fan_speed` khai 72.
await mo('Điều hòa L1 - 2');
const ac = await doLuoi();
ok(`Điều hòa L1 - 2: "${ac.hang}"`,
  ac.hang === '64px 64px 64px 72px 72px 64px 72px 72px 64px 64px 64px 64px 64px 64px');
await dong();

// 3. fan63903 (fan_smart): không ô nào khai `caoHang` → đường cũ, mọi hàng 64px.
await mo('fan63903');
const thuong = await doLuoi();
ok(`fan63903: "${thuong.hang}" — 5 hàng 64px đều nhau`, thuong.hang === '64px 64px 64px 64px 64px');
await dong();

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
