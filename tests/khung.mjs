import { GOC, anh, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Mọi tấm phủ toàn màn phải nằm TRONG cột ứng dụng, không đè lên cả cửa sổ.
 *
 * Khung (dựng theo devktv.happinno.com, docs/viec-bo-khung-dien-thoai.md): `.stage` là sân
 * xám căn giữa, `.app-shell` là CỘT 448px cao hết màn hình, không bo góc, viền 1px chỉ hai
 * bên. `.app-shell` là điểm neo `position:relative; overflow:hidden` của mọi tấm `absolute`.
 *
 * Bẫy thật đã dính: `.sheet.devpage` dùng `position:fixed; inset:0; max-width:480px` nên
 * neo theo khung nhìn chứ không theo khung app — ở màn rộng màn chi tiết bung ra ngoài, lệch
 * sang trái, người dùng thấy như sang một app khác. Dưới 560px cột trải hết bề ngang nên bọ
 * VÔ HÌNH; vì vậy bài này cố ý chạy ở khổ rộng, nơi duy nhất nhìn ra được.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 140)));

await p.goto(GOC, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await p.locator('#dn-id').fill('p@p.vn');
await p.locator('#dn-pw').fill('x');
await p.locator('button.login-btn').click(); await p.waitForTimeout(2200);

const khung = await p.locator('.app-shell').evaluate(e => {
  const r = e.getBoundingClientRect();
  return { t: r.top, l: r.left, r: r.right, b: r.bottom, w: Math.round(r.width) };
});
ok(`cột ứng dụng đúng 448px (${khung.w})`, khung.w === 448);

/** Tấm có lọt ra ngoài cột ứng dụng không — sai số 1px cho làm tròn. */
async function trongKhung(ten, chon) {
  const o = await p.locator(chon).first().evaluate(e => {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    return { t: r.top, l: r.left, r: r.right, b: r.bottom, w: Math.round(r.width), pos: s.position };
  });
  const lot = o.l < khung.l - 1 || o.r > khung.r + 1 || o.t < khung.t - 1 || o.b > khung.b + 1;
  ok(`${ten} nằm trong cột ứng dụng (rộng ${o.w}, ${o.pos})`, !lot);
  ok(`${ten} không dùng position:fixed`, o.pos !== 'fixed');
  return o;
}

// Hộp thoại: nền mờ phải phủ đúng cột ứng dụng, không phủ cả cửa sổ
await p.locator('.profile-chip').click(); await p.waitForTimeout(700);
// Popup tài khoản thả xuống dưới avatar: nền mờ của nó cũng phải nằm gọn trong cột.
if (await p.locator('.tk-overlay').count()) await trongKhung('popup tài khoản', '.tk-overlay');
else R.push('FAIL  bấm avatar không mở popup tài khoản');
await p.locator('.tk-overlay .modal-scrim').click({ position: { x: 10, y: 500 } });
await p.waitForTimeout(500);

await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await p.waitForTimeout(800);
await p.locator('.device-card').first().locator('.card-hit').click(); await p.waitForTimeout(1100);
const dev = await trongKhung('màn chi tiết thiết bị', '.sheet.devpage');
ok(`màn chi tiết rộng bằng lòng khung, không tự nới (${dev.w}px)`, dev.w <= khung.w && dev.w >= khung.w - 2);
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

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
