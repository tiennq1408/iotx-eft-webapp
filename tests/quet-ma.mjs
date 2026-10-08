import { GOC, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Quét mã bằng camera và ghép nối Bluetooth ở luồng thêm thiết bị.
 *
 * Camera: Chromium chạy với camera GIẢ (`--use-fake-device-for-media-stream`) nên mở được
 * stream thật mà không cần phần cứng; đo được khung <video> bật/tắt theo nút. Giải mã QR
 * không đo ở đây (cần ảnh QR làm nguồn video giả), đã kiểm riêng bộ đọc `docTem`.
 * Bluetooth: Chromium có `navigator.bluetooth` nhưng hộp chọn thiết bị không tự động được,
 * nên đo hai nhánh giao diện: có API → nút "Tìm thiết bị"; không có (iPhone) → nói rõ mô phỏng.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const b = await chromium.launch({ executablePath: CHROMIUM, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const cho = ms => new Promise(r => setTimeout(r, ms));

async function vaoThem(ctx) {
  const p = await ctx.newPage();
  const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 140)));
  await p.goto(GOC, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await p.getByPlaceholder(/Email hoặc/).fill('p@p');
  await p.getByPlaceholder(/Mật khẩu/).fill('x');
  await p.locator('button.login-btn').click(); await cho(2200);
  await p.locator('.top-actions .icon-btn').last().click(); await cho(300);
  await p.locator('.drawer-item').filter({ has: p.locator('.emo:text("📶")') }).click(); await cho(500);
  return { p, loi };
}

try {
  /* ---------- 1. Camera: hai nhánh đều có nút mở camera, bật/tắt được ---------- */
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
  const { p, loi } = await vaoThem(ctx);
  await p.locator('.method-card').first().click(); await cho(300);
  const nutCam = p.locator('.add-flow button.secondary.full');
  ok('nhánh QR: có nút "Mở camera để quét"', /camera/i.test(await nutCam.innerText()));
  ok('trước khi bấm: chưa có khung hình', await p.locator('.scanner video:not([hidden])').count() === 0);
  await nutCam.click(); await cho(1500);
  ok('bấm → camera bật, khung hình hiện trong ô quét', await p.locator('.scanner video:not([hidden])').count() === 1
    && await p.locator('.scanner video').evaluate(v => v.srcObject !== null && v.videoWidth > 0));
  ok('nút đổi thành "Dừng quét"', /dừng/i.test(await nutCam.innerText()));
  ok('không hiện lỗi camera', await p.locator('.add-flow .form-message').count() === 0);
  await nutCam.click(); await cho(400);
  ok('bấm dừng → tắt camera, trả lại ô quét', await p.locator('.scanner video:not([hidden])').count() === 0
    && await p.locator('.scanner video').evaluate(v => v.srcObject === null));
  ok('ô nhập tay vẫn còn để gõ khi không quét được', await p.getByPlaceholder(/fan81029/).count() === 1);

  // nhánh serial cũng quét được
  await p.locator('.add-flow .panel-head .icon-button').click(); await cho(300);
  await p.locator('.top-actions .icon-btn').last().click(); await cho(300);
  await p.locator('.drawer-item').filter({ has: p.locator('.emo:text("📶")') }).click(); await cho(500);
  await p.locator('.method-card').nth(1).click(); await cho(300);
  ok('nhánh serial: cũng có nút mở camera', /camera/i.test(await p.locator('.add-flow button.secondary.full').innerText()));
  ok(`không lỗi JS (${loi.length})`, loi.length === 0);
  await ctx.close();

  /* ---------- 2. Bluetooth: có Web Bluetooth → nút tìm theo tên; không có → nói rõ mô phỏng ---------- */
  const ctxBle = await b.newContext({ viewport: { width: 390, height: 844 } });
  const { p: p2 } = await vaoThem(ctxBle);
  await p2.locator('.method-card').first().click(); await cho(300);
  await p2.getByPlaceholder(/fan81029/).fill('fan81029');
  await p2.getByPlaceholder(/5 số/).fill('12345');
  await p2.locator('.add-flow button.primary.full').click(); await cho(300);
  const coBle = await p2.evaluate(() => 'bluetooth' in navigator);
  const chuBuoc2 = await p2.locator('.add-flow .pairing').innerText();
  if (coBle) {
    ok('trình duyệt có Web Bluetooth → nút "Tìm thiết bị qua Bluetooth"', /Bluetooth/.test(await p2.locator('.add-flow button.primary.full').innerText()));
    ok('…và nói rõ chọn thiết bị theo TÊN trên tem', /fan81029/.test(chuBuoc2));
    ok('vẫn có đường "Bỏ qua (mô phỏng)"', await p2.locator('.add-flow button.secondary.full', { hasText: /Bỏ qua/ }).count() === 1);
  } else ok('trình duyệt không có Web Bluetooth (bỏ qua nhánh có API)', true);
  await ctxBle.close();

  const ctxKhong = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctxKhong.addInitScript(() => { Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true }); });
  const { p: p3 } = await vaoThem(ctxKhong);
  await p3.locator('.method-card').first().click(); await cho(300);
  await p3.getByPlaceholder(/fan81029/).fill('fan81029');
  await p3.getByPlaceholder(/5 số/).fill('12345');
  await p3.locator('.add-flow button.primary.full').click(); await cho(300);
  ok('không có Web Bluetooth (iPhone) → nói rõ bước này mô phỏng', /mô phỏng/i.test(await p3.locator('.add-flow .pairing').innerText()));
  ok('…và chỉ còn nút mô phỏng để đi tiếp', /Mô phỏng/.test(await p3.locator('.add-flow button.primary.full').innerText()));
  await ctxKhong.close();
} catch (e) {
  R.push(`FAIL  dừng giữa chừng: ${String(e).split('\n')[0].slice(0, 160)}`);
} finally {
  console.log(R.join('\n'));
  console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
  await b.close();
}
