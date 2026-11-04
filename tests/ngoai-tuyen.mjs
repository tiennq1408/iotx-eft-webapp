import { GOC, CHROMIUM, anh } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * PWA phần B — chạy được khi mất mạng (docs/viec-pwa.md mục 3, nghiệm thu bước 9 và 10).
 *
 * Cần bản PRODUCTION: service worker chỉ đăng ký khi NODE_ENV === "production" (DangKySW).
 *
 *   9.  Mở app một lần (có mạng) → tắt mạng → mở lại: app lên, thấy thiết bị ở trạng thái cuối,
 *       có dải "Mất kết nối máy chủ". Không mở lại lần nào trước khi tắt mạng — đúng cảnh
 *       người dùng cài xong rồi mất mạng ngay.
 *   10. Đang mất mạng: KHÔNG có luồng request /v1 lặp mỗi 2,5 giây; SSE dừng.
 *   +   Có mạng lại → tự nối lại, dải biến mất, SSE chạy lại.
 *   +   3.4: nối được mạng (onLine = true) mà không tới được máy chủ (Wi-Fi của thiết bị) →
 *       câu "Không kết nối được máy chủ", không phải câu khuyên đổi sang https.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const cho = ms => new Promise(r => setTimeout(r, ms));
const CAU_MANG = 'Không kết nối được máy chủ';
const CAU_TRINH_DUYET = 'Trình duyệt không gửi được yêu cầu';

const b = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
// Máy không có Web Bluetooth (như iPhone): có thì lệnh quạt mất mạng tự chuyển sang Bluetooth
// (`guiQuaKenh`) thay vì báo lỗi, và ca "lệnh hỏng khi không tới máy chủ" không còn gì để đo.
await ctx.addInitScript(() => { delete Navigator.prototype.bluetooth; });
const p = await ctx.newPage();
const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 160)));
const v1 = []; p.on('request', q => { const u = new URL(q.url()); if (u.pathname.startsWith('/v1/')) v1.push({ t: Date.now(), path: u.pathname }); });

/* ---- Lần mở đầu tiên, có mạng ---- */
await p.goto(GOC, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('x');
await p.locator('button.login-btn').click(); await cho(2000);
await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await cho(800);
const tenThietBi = (await p.locator('.device-card').allInnerTexts()).map(x => x.split('\n')[0].trim()).filter(Boolean);
await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 });
await cho(2500);   // ảnh chụp thiết bị ghi sau 1,5 giây dữ liệu yên

const cache = await p.evaluate(async () => {
  const ten = await caches.keys();
  const muc = ten.includes('livotec-v2') ? (await (await caches.open('livotec-v2')).keys()).map(r => new URL(r.url).pathname) : [];
  return { ten, boMa: muc.filter(x => x.startsWith('/_next/static/')).length, v1: muc.filter(x => x.startsWith('/v1')).length };
});
ok(`service worker livotec-v2 đang điều khiển trang, cache: ${cache.ten.join(', ')}`, cache.ten.includes('livotec-v2') && !cache.ten.includes('livotec-v1'));
ok(`bó mã của lần mở đầu tiên đã vào cache (${cache.boMa} tệp) — không thì mở offline kẹt ở màn chờ`, cache.boMa >= 3);
ok('không có mục /v1 nào trong cache', cache.v1 === 0);

/* ---- Bước 9: tắt mạng, mở lại ---- */
await ctx.setOffline(true);
await p.reload({ waitUntil: 'load' }).catch(() => undefined);
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => undefined);
await cho(3000);
ok('mất mạng: app lên, không kẹt ở màn chờ', await p.locator('.splash').count() === 0 && await p.locator('.top-bar').count() === 1);
await p.locator('.bn-item', { hasText: 'Thiết bị' }).click().catch(() => undefined); await cho(600);
const offTen = (await p.locator('.device-card').allInnerTexts()).map(x => x.split('\n')[0].trim()).filter(Boolean);
ok(`mất mạng: vẫn thấy ${offTen.length}/${tenThietBi.length} thiết bị ở trạng thái cuối`, offTen.length > 0 && offTen.length === tenThietBi.length);
const dai = p.locator('.mat-ket-noi');
ok(`dải "Mất kết nối máy chủ" hiện (${(await dai.innerText().catch(() => '')).replace(/\n/g, ' · ')})`, await dai.count() === 1 && /Mất kết nối máy chủ/.test(await dai.innerText()));
ok('nút Thử lại ≥44px', (await dai.locator('button').evaluate(n => n.getBoundingClientRect().height)) >= 44);
ok('không có toast lỗi đồng bộ chồng lên dải', await p.locator('.toast-loi').count() === 0);
await p.screenshot({ path: anh('ngoai-tuyen') });

/* ---- Bước 10: không có luồng lỗi lặp ---- */
const tu = Date.now();
await cho(25_000);
const trongLuc = v1.filter(x => x.t >= tu);
ok(`25 giây mất mạng: ${trongLuc.length} request /v1 (${trongLuc.map(x => x.path).join(', ') || 'không có'}) — không phải ~10 lần của nhịp 2,5 giây`, trongLuc.length <= 2);
ok('SSE dừng: không mở lại /v1/stream khi mất mạng', !trongLuc.some(x => x.path === '/v1/stream'));

/* ---- Có mạng lại: tự nối lại ---- */
const luc = Date.now();
await ctx.setOffline(false);
await p.waitForFunction(() => !document.querySelector('.mat-ket-noi'), null, { timeout: 8000 }).catch(() => undefined);
ok(`có mạng lại → dải biến mất sau ${((Date.now() - luc) / 1000).toFixed(1)} giây`, await dai.count() === 0);
await cho(1500);
ok('SSE nối lại', v1.some(x => x.t >= luc && x.path === '/v1/stream'));

/* ---- 3.4: có mạng (onLine true) nhưng không tới được máy chủ ---- */
await p.route('**/v1/**', r => r.abort('failed'));
const kichDongBo = () => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
// Nhịp quay-lại-tab chặn 2 giây một lần, và sự kiện `online` ở trên vừa dùng một lượt.
for (let i = 0; i < 3; i++) { await kichDongBo(); await cho(2300); }
ok(`Wi-Fi của thiết bị (onLine = ${await p.evaluate(() => navigator.onLine)}): hỏng 2 lần liền → dải mất kết nối`, await dai.count() === 1);
await p.locator('.mat-ket-noi button').click(); await cho(1200);
const chu = await p.locator('body').innerText();
ok('không hiện câu khuyên đổi sang https', !chu.includes(CAU_TRINH_DUYET));
await p.unroute('**/v1/**');
await p.locator('.mat-ket-noi button').click(); await cho(1500);
ok('bấm Thử lại khi máy chủ đã về → dải biến mất', await dai.count() === 0);

/* ---- 3.4 phần lỗi lệnh: câu báo đúng ---- */
await p.route('**/v1/**', r => r.abort('failed'));
await p.locator('.device-card').filter({ hasText: 'Quạt mới' }).first().locator('.card-hit').click(); await cho(1200);
await p.locator('.devpage .bc-tile [role=switch], .devpage .bc-tile button[aria-pressed]').first().click(); await cho(1500);
// Màn chi tiết báo lỗi lệnh ngay trong màn (DeviceDetail `loi`), không qua toast.
const cau = await p.locator('.devpage .form-message').innerText().catch(() => '');
ok(`lệnh hỏng khi không tới máy chủ → "${cau}"`, cau.includes(CAU_MANG));
await p.unroute('**/v1/**');

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
