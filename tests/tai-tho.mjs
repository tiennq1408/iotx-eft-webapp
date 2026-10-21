import { GOC, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Tai thỏ (yêu cầu 23/10/2026): nền app phải tràn lên vùng tai thỏ / thanh trạng thái.
 *
 * - Safari iPhone và Chrome Android tô vùng đó theo `<meta name="theme-color">` → màu phải ĐỔI THEO
 *   MÀN đang hiện (mép trên của màn), và nền `html` cùng màu trên điện thoại (lib/ui/mauDinh.ts).
 * - "Thêm vào Màn hình chính" trên iPhone: `apple-mobile-web-app-status-bar-style=black-translucent`
 *   + `viewport-fit=cover`, nội dung lùi bằng env(safe-area-inset-top).
 *
 * Chromium không giả lập được vùng an toàn (env(...) = 0), nên phần lùi nội dung chỉ kiểm được là
 * KHÔNG làm xê dịch bố cục; còn lại phải soi trên máy thật.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const cho = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 160)));

const theme = () => p.evaluate(() => document.querySelector('meta[name="theme-color"]')?.content);
const nenHtml = () => p.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

await p.goto(GOC, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await cho(500);

const meta = await p.evaluate(() => ({
  vp: document.querySelector('meta[name="viewport"]')?.content || '',
  apple: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content,
  capable: document.querySelector('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]')?.content,
}));
ok(`viewport có viewport-fit=cover (${meta.vp})`, /viewport-fit=cover/.test(meta.vp));
ok(`web app iPhone: thanh trạng thái trong suốt (${meta.apple}, capable ${meta.capable})`, meta.apple === 'black-translucent' && meta.capable === 'yes');

ok(`đăng nhập: theme-color = mép trên màu đào (${await theme()})`, (await theme()) === '#fadcbe');
ok(`đăng nhập: nền html cùng màu (${await nenHtml()})`, (await nenHtml()) === rgb('#fadcbe'));

const truoc = await p.locator('.login-content').evaluate(n => getComputedStyle(n).paddingTop);
ok(`không có tai thỏ → màn đăng nhập không xê dịch (đệm trên ${truoc})`, truoc === '20px');

await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('x');
await p.locator('button.login-btn').click(); await cho(2000);
ok(`trong app: theme-color = mép trên (${await theme()})`, (await theme()) === '#f2ece0');
ok('thanh trên không xê dịch (đệm trên 6px)', await p.locator('.top-bar').evaluate(n => getComputedStyle(n).paddingTop) === '6px');

await p.locator('.bn-item').nth(1).click(); await cho(600);
await p.locator('.device-card').first().locator('.card-hit').click(); await cho(1000);
ok(`chi tiết thiết bị: theme-color = nền màn chi tiết (${await theme()})`, (await theme()) === '#f4f9f8');
await p.locator('.devback').click(); await cho(600);
ok(`đóng chi tiết → về màu app (${await theme()})`, (await theme()) === '#f2ece0');

// Giao diện tối
await p.locator('.top-bar .profile-chip').click(); await cho(350);
await p.locator('.tk-popup .menu-dong-chon', { hasText: 'Giao diện' }).click(); await cho(300);
await p.locator('.chon-ds .radio-list-row', { hasText: /(^|\s)Tối\s*$/ }).click(); await cho(500);
await p.locator('.tk-overlay .modal-scrim').click({ position: { x: 10, y: 600 } }).catch(() => {}); await cho(400);
ok(`giao diện tối: theme-color tối (${await theme()})`, (await theme()) === '#1f2420');
await p.locator('.device-card').first().locator('.card-hit').click(); await cho(1000);
ok(`giao diện tối, chi tiết: theme-color (${await theme()})`, (await theme()) === '#0e1614');
await p.locator('.devback').click(); await cho(500);

// Màn rộng: cột 448px giữa sân xám — nền html KHÔNG đổi theo màn
await p.setViewportSize({ width: 1280, height: 900 }); await cho(400);
ok(`màn rộng: nền html vẫn là sân (${await nenHtml()}), không lấy màu mép trên`, (await nenHtml()) !== rgb('#1f2420'));

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
