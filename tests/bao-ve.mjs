/**
 * Những lớp bảo vệ quanh dữ liệu người dùng và quyền:
 * - proxy `/v1` chặn các nhánh app không được gọi (admin/internal/health…);
 * - đăng xuất xoá dữ liệu của tài khoản khỏi trình duyệt;
 * - chế độ IoTX không bao giờ hiện thiết bị mock;
 * - bật/tắt trên thẻ không bị nhịp hỏi lại lật ngược khi mạch chưa kịp báo;
 * - người được chia sẻ chỉ-xem thấy điều khiển trên lưới bị khóa.
 */
import { GOC, GOC_GIA, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const b = await chromium.launch({ executablePath: CHROMIUM });
const cho = ms => new Promise(r => setTimeout(r, ms));
async function doi(dk, ms = 6000) {
  for (let i = 0; i < ms / 250; i++) { if (await dk()) return true; await cho(250); }
  return false;
}
const AN = 'nextjs-portal{display:none!important}';

async function dangNhap() {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(GOC, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: AN });
  await p.getByPlaceholder(/Tên đăng nhập/).fill('p@p');
  await p.getByPlaceholder(/Mật khẩu/).fill('x');
  await p.locator('button.login-btn').click();
  await p.locator('.top-bar').waitFor({ timeout: 8000 });
  return { ctx, p };
}

/* A9. Proxy chặn nhánh cấm, vẫn cho nhánh người dùng đi qua. */
for (const duong of ['admin/tenants', 'internal/telemetry', 'danh-muc/x', 'vat-tu/x', 'health', 'live', 'ready']) {
  const r = await fetch(`${GOC}/v1/${duong}`);
  const than = await r.json().catch(() => null);
  ok(`proxy chặn /v1/${duong} (${r.status})`, r.status === 404 && than?.message === 'not_found');
}
ok('proxy vẫn cho /v1/products đi qua', (await fetch(`${GOC}/v1/products`)).status === 200);

/* A6. Đăng xuất xoá ảnh chụp thiết bị và ETag của /bootstrap. */
{
  const { ctx, p } = await dangNhap();
  const kho = () => p.evaluate(() => ({
    token: localStorage.getItem('livotec-iotx-session') !== null,
    anhChup: localStorage.getItem('livotec-iotx-anh-chup') !== null,
    etagBootstrap: Object.keys(JSON.parse(localStorage.getItem('livotec-iotx-cache') || '{}').etag || {}).some(k => k.startsWith('bootstrap:')),
    etagProducts: Object.keys(JSON.parse(localStorage.getItem('livotec-iotx-cache') || '{}').etag || {}).some(k => k.startsWith('products:')),
    mockV5: localStorage.getItem('livotec-home-v5') !== null,
  }));
  // Máy chủ giả không gửi ETag, nên gieo sẵn hai mục như máy chủ thật để lại: một của cửa
  // cần đăng nhập, một của catalog công khai.
  await p.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem('livotec-iotx-cache') || '{}');
    cache.etag = { ...cache.etag, 'bootstrap:vi': { etag: 'W/"1"', data: { me: { email: 'p@p' } } }, 'products:livotec:vi': { etag: 'W/"2"', data: {} } };
    localStorage.setItem('livotec-iotx-cache', JSON.stringify(cache));
  });
  const truoc = await kho();
  ok('Đang đăng nhập: có ảnh chụp thiết bị', truoc.anhChup);
  ok('Chế độ IoTX: không ghi vào kho mock', !truoc.mockV5);
  await p.locator('.profile-chip').click();
  await p.locator('.btn-full.danger').click();
  await p.locator('button.login-btn').waitFor({ timeout: 5000 });
  await cho(500);
  const sau = await kho();
  ok('Đăng xuất: xoá token', !sau.token);
  ok('Đăng xuất: xoá ảnh chụp thiết bị', !sau.anhChup);
  ok('Đăng xuất: xoá ETag /bootstrap (mang email, thiết bị)', !sau.etagBootstrap);
  ok('Đăng xuất: giữ catalog công khai', sau.etagProducts);
  await ctx.close();
}

/* A7. Mở app khi /bootstrap hỏng: không bao giờ hiện thiết bị mock. */
{
  const { ctx, p } = await dangNhap();
  await p.locator('.device-card').first().waitFor({ timeout: 5000 });
  const soThat = await p.locator('.device-card').count();
  await p.route('**/v1/bootstrap**', route => route.fulfill({ status: 503, json: { message: 'upstream_unavailable' } }));

  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.addStyleTag({ content: AN });
  await p.locator('.top-bar').waitFor({ timeout: 5000 }).catch(() => undefined);
  await cho(800);
  ok(`Mất mạng, có ảnh chụp: thấy đúng ${soThat} thiết bị của tài khoản`, await p.locator('.device-card').count() === soThat);

  await p.evaluate(() => localStorage.removeItem('livotec-iotx-anh-chup'));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.addStyleTag({ content: AN });
  await p.locator('.top-bar').waitFor({ timeout: 5000 }).catch(() => undefined);
  await cho(800);
  ok('Mất mạng, chưa có ảnh chụp: danh sách trống, không có thiết bị mock', await p.locator('.device-card').count() === 0);
  await ctx.close();
}

/* A8. Bật trên thẻ rồi nhịp hỏi lại về trước phản hồi của mạch: công tắc không lật về. */
{
  const AC = '10c81a40-b71d-11f1-b79e-ad8fe8623469';
  await fetch(`${GOC_GIA}/v1/__doi?id=${AC}&key=ac_power_status&value=false`);
  const { ctx, p } = await dangNhap();
  await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await cho(600);
  const the = () => p.locator('.device-card').filter({ has: p.locator('.dname', { hasText: 'Điều hòa L1 - 2' }) }).first();
  const bat = async () => (await the().locator('.switch').getAttribute('class')).includes('on');
  ok('Trước: đang TẮT', !await bat());
  // Mạch chậm: lệnh treo 4 giây, trong lúc đó máy chủ vẫn báo giá trị cũ.
  await p.route('**/rpc', async route => { await cho(4000); await route.fallback(); });
  await the().locator('.switch-hit').click();
  await cho(300);
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await cho(1500);
  ok('Nhịp hỏi lại về trước phản hồi: công tắc vẫn BẬT', await bat());
  ok('Lệnh tới nơi: vẫn BẬT', await doi(bat, 6000) && await bat());
  await ctx.close();
}

/* A10. Chia sẻ chỉ-xem trên sản phẩm đi đường lưới: điều khiển bị khóa. */
{
  const FAN = '29ff86a0-a76a-11f1-b79e-ad8fe8623469';
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/v1/bootstrap**', async route => {
    const headers = { ...route.request().headers() };
    delete headers['if-none-match'];
    const r = await route.fetch({ headers });
    const than = await r.json();
    for (const d of than.devices) if (d.id === FAN) d.perms = { control: false, create: false, delete: false };
    await route.fulfill({ response: r, json: than });
  });
  const p = await ctx.newPage();
  await p.goto(GOC, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: AN });
  await p.getByPlaceholder(/Tên đăng nhập/).fill('p@p');
  await p.getByPlaceholder(/Mật khẩu/).fill('x');
  await p.locator('button.login-btn').click();
  await p.locator('.top-bar').waitFor({ timeout: 8000 });
  await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await cho(600);
  await p.locator('.device-card').filter({ hasText: '03092026A1' }).first().locator('.card-hit').click();
  await p.locator('.bc-grid').waitFor({ timeout: 5000 }).catch(() => undefined);
  const nutMo = await p.locator('.bc-grid button:not([disabled]), .bc-grid input:not([disabled])').count();
  const chipMo = await p.locator('.bc-grid .bc-chip:not([aria-disabled="true"])').count();
  ok(`Chỉ-xem: mọi nút/thanh trên lưới bị khóa (còn mở ${nutMo})`, nutMo === 0);
  ok(`Chỉ-xem: mọi chip trên lưới bị khóa (còn mở ${chipMo})`, chipMo === 0);
  ok('Chỉ-xem: có câu giải thích', await p.locator('.devbody .small.dim', { hasText: /quyền/i }).count() > 0);
  await ctx.close();
}

console.log(R.join('\n'));
console.log(`\n${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
