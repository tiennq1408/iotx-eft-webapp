import { GOC, anh, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Mọi tấm phủ toàn màn phải nằm TRONG khung máy, không đè lên cả cửa sổ.
 *
 * Bẫy thật đã dính: `.sheet.devpage` dùng `position:fixed; inset:0; max-width:480px` nên
 * neo theo khung nhìn chứ không theo `.phone`. Ở màn rộng, màn chủ là 400px bo 44px còn
 * màn chi tiết nhảy ra 480px vuông góc, lệch sang trái — người dùng thấy như sang một app
 * khác. Ở màn hẹp ≤460px khung máy trải hết nên bọ VÔ HÌNH; vì vậy bài này cố ý chạy ở
 * khổ rộng, nơi duy nhất nhìn ra được.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 140)));

await p.goto(GOC, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await p.getByPlaceholder(/Email hoặc/).fill('p@p');
await p.getByPlaceholder(/Mật khẩu/).fill('x');
await p.locator('button.login-btn').click(); await p.waitForTimeout(2200);

const khung = await p.locator('.phone').evaluate(e => {
  const r = e.getBoundingClientRect();
  return { t: r.top, l: r.left, r: r.right, b: r.bottom, w: Math.round(r.width) };
});
ok(`khung máy đúng 400px như thiết kế (${khung.w})`, khung.w === 400);

/** Tấm có lọt ra ngoài khung máy không — sai số 1px cho làm tròn. */
async function trongKhung(ten, chon) {
  const o = await p.locator(chon).first().evaluate(e => {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    return { t: r.top, l: r.left, r: r.right, b: r.bottom, w: Math.round(r.width), pos: s.position };
  });
  const lot = o.l < khung.l - 1 || o.r > khung.r + 1 || o.t < khung.t - 1 || o.b > khung.b + 1;
  ok(`${ten} nằm trong khung máy (rộng ${o.w}, ${o.pos})`, !lot);
  ok(`${ten} không dùng position:fixed`, o.pos !== 'fixed');
  return o;
}

// Hộp thoại: nền mờ phải phủ đúng khung máy, không phủ cả cửa sổ
await p.locator('.profile-chip').click(); await p.waitForTimeout(700);
if (await p.locator('.modal-overlay').count()) await trongKhung('hộp thoại tài khoản', '.modal-overlay');
await p.locator('.modal-close').first().click().catch(() => p.keyboard.press('Escape'));
await p.waitForTimeout(500);

await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await p.waitForTimeout(800);
await p.locator('.device-card').first().locator('.card-hit').click(); await p.waitForTimeout(1100);
const dev = await trongKhung('màn chi tiết thiết bị', '.sheet.devpage');
ok(`màn chi tiết rộng bằng lòng khung, không tự nới (${dev.w}px)`, dev.w <= khung.w && dev.w >= khung.w - 26);
ok('cuộn tới được tận cuối màn chi tiết', await p.locator('.devbody').evaluate(e => {
  e.scrollTo(0, e.scrollHeight);
  return e.scrollTop + e.clientHeight >= e.scrollHeight - 2;
}));
await p.screenshot({ path: anh('khung-chitiet') });

// Tấm hẹn giờ cũng phủ toàn màn — cùng luật
const hg = p.locator('.devbody button').filter({ hasText: /Hẹn giờ/ }).first();
if (await hg.count()) {
  await hg.click(); await p.waitForTimeout(900);
  if (await p.locator('.full-panel').count()) await trongKhung('tấm hẹn giờ', '.full-panel');
}

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
