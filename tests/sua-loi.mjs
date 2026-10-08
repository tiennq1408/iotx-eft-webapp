/**
 * Những lỗi tìm ra ở lượt rà soát thứ hai, mỗi lỗi một phép đo:
 * - trình soạn Nếu–Thì lưu ĐÚNG giá trị/toán tử đang hiện, và chặn dòng trống ở nhóm phụ;
 * - proxy không bị lách bằng `..`;
 * - token mới làm mới mà vẫn bị 401 thì kết thúc phiên, không gọi refresh mãi;
 * - một thông báo có ngày hỏng không làm hỏng cả lần đồng bộ;
 * - màn hẹn giờ mở từ bộ chọn thiết bị thì đóng là đóng hẳn.
 */
import http from 'node:http';
import { GOC, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const b = await chromium.launch({ executablePath: CHROMIUM });
const cho = ms => new Promise(r => setTimeout(r, ms));
async function doi(dk, ms = 6000) {
  for (let i = 0; i < ms / 250; i++) { if (await dk()) return true; await cho(250); }
  return false;
}
const AN = 'nextjs-portal{display:none!important}';
const AC = '10c81a40-b71d-11f1-b79e-ad8fe8623469';

async function dangNhap(truocKhiVao) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  if (truocKhiVao) await truocKhiVao(ctx);
  const p = await ctx.newPage();
  const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 160)));
  await p.goto(GOC, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: AN });
  await p.locator('#dn-id').fill('p@p.vn');
  await p.locator('#dn-pw').fill('x');
  await p.locator('button.login-btn').click();
  await p.locator('.top-bar').waitFor({ timeout: 8000 }).catch(() => undefined);
  return { ctx, p, loi };
}

/** Gửi đường dẫn THÔ, không qua chuẩn hoá URL của fetch — đúng như kẻ dò sẽ làm. */
function goiTho(duong) {
  const u = new URL(GOC);
  return new Promise(xong => {
    http.get({ host: u.hostname, port: u.port, path: duong }, r => { r.resume(); xong(r.statusCode); })
      .on('error', () => xong(0));
  });
}

/* Proxy: dot-segment không lách được danh sách chặn. */
for (const duong of ['/v1/x/../admin/tenants', '/v1/x/%2e%2e/admin/tenants', '/v1/devices/%2E%2E/%2E%2E/internal/x']) {
  const ma = await goiTho(duong);
  ok(`proxy chặn ${duong} (${ma})`, ma === 404);
}

/* Nếu–Thì: chọn công tắc thì lưu `true` và `eq`, đúng như màn đang hiện. */
{
  const { ctx, p } = await dangNhap();
  let than = null;
  await p.route('**/v1/rules', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    than = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, id: 99, shadow: true } });
  });
  await p.locator('.bn-item', { hasText: 'Tự động' }).click(); await cho(400);
  await p.locator('.auto-btn.primary').click(); await cho(400);
  await p.getByPlaceholder(/Nóng thì bật quạt/).fill('Thử');
  const dieuKien = p.locator('.rule-section').first().locator('.rule-row').first();
  await dieuKien.getByLabel('Chọn thiết bị').selectOption(AC);
  await dieuKien.getByLabel('Chọn chỉ số').selectOption('ac_power_status');
  const giaTriHien = await dieuKien.locator('select').nth(3).inputValue();
  const toanTuHien = await dieuKien.locator('select').nth(2).inputValue();

  const hanhDong = p.locator('.rule-section').nth(3).locator('.rule-row').first();
  await hanhDong.getByLabel('Chọn thiết bị').selectOption(AC);
  await hanhDong.getByLabel('Chọn chỉ số').selectOption('setPower');

  const luu = p.locator('.editor-panel button.primary.full');
  ok('Đủ điều kiện: nút lưu bật', await luu.isEnabled());

  // Thêm một dòng trống ở "CHỈ KHI": phải chặn, máy chủ sẽ từ chối cả luật.
  await p.locator('.rule-section.optional').first().locator('.rule-add button').first().click();
  ok('Dòng trống ở nhóm "chỉ khi": chặn lưu', !(await luu.isEnabled()));
  await p.locator('.rule-section.optional').first().locator('.rule-row-head button').last().click();

  await luu.click();
  await doi(async () => than !== null, 4000);
  const dk = than?.conds?.[0];
  ok(`Lưu đúng giá trị đang hiện (hiện "${giaTriHien}", gửi ${JSON.stringify(dk?.value)})`, giaTriHien === 'true' && dk?.value === true);
  ok(`Lưu đúng toán tử đang hiện (hiện "${toanTuHien}", gửi "${dk?.op}")`, dk?.op === toanTuHien && dk?.op === 'eq');
  ok('Luật mới ở chế độ chạy thử', than?.shadow === true);
  await ctx.close();
}

/* 401 sau khi refresh thành công: kết thúc phiên, không gọi refresh mãi. */
{
  let lanLamMoi = 0;
  const { ctx, p } = await dangNhap();
  await p.route('**/v1/**', route => {
    const url = route.request().url();
    if (url.includes('/v1/auth/refresh')) { lanLamMoi++; return route.fulfill({ json: { accessToken: `b${lanLamMoi}`, refreshToken: 'r', tenant: 'livotec', expiresIn: 300 } }); }
    if (/\/v1\/auth\//.test(url)) return route.fallback();
    return route.fulfill({ status: 401, json: { message: 'unauthorized' } });
  });
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  ok('Token mới vẫn bị từ chối: về màn đăng nhập', await doi(async () => await p.locator('button.login-btn').count() > 0, 8000));
  const sau = lanLamMoi;
  await cho(3000);
  ok(`Không gọi /auth/refresh mãi (${sau} lần, sau đó thêm ${lanLamMoi - sau})`, sau <= 3 && lanLamMoi === sau);
  await ctx.close();
}

/* Thông báo có ngày hỏng không làm hỏng lần đồng bộ. */
{
  const { ctx, p, loi } = await dangNhap(async c => {
    await c.route('**/v1/notifications', route => route.fulfill({ json: { unread: 1, items: [{ id: 1, type: 'info', title: 'Ngày hỏng', body: '', created_at: 'khong-phai-ngay', read: false }] } }));
  });
  ok('Ngày hỏng: vẫn vào được app', await p.locator('.top-bar').count() > 0);
  await p.locator('.top-actions .icon-btn').first().click({ timeout: 3000 }).catch(() => undefined); await cho(400);
  ok('Ngày hỏng: thông báo vẫn hiện', await p.locator('.notif-row', { hasText: 'Ngày hỏng' }).count() === 1);
  ok(`Ngày hỏng: không lỗi trang (${loi.length})`, loi.length === 0);
  await ctx.close();
}

/* Màn hẹn giờ mở từ "Theo thời gian": đóng là đóng hẳn, không rơi vào màn chi tiết. */
{
  const { ctx, p } = await dangNhap();
  await p.locator('.bn-item', { hasText: 'Tự động' }).click(); await cho(400);
  await p.locator('.auto-btn.secondary').click(); await cho(400);
  await p.locator('.radio-list-row', { hasText: 'Điều hòa L1 - 2' }).click(); await cho(800);
  ok('Mở được màn hẹn giờ từ bộ chọn', await p.locator('.full-panel .panel-head').count() > 0);
  await p.locator('.full-panel .panel-head .icon-button').first().click(); await cho(500);
  ok('Đóng: không rơi vào màn chi tiết chưa từng mở', await p.locator('.devpage').count() === 0);
  ok('Đóng: về lại màn tự động', await p.locator('.auto-btn-row').count() === 1);
  await ctx.close();
}

console.log(R.join('\n'));
console.log(`\n${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
