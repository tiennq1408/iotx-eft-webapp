import { GOC, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Nút mắt cuối hàng lọc LỌC RA các thiết bị đã ẩn — không phải đổi dạng xem lưới.
 *
 * Ẩn một máy (màn chi tiết → "Ẩn thiết bị khỏi danh sách") thì nó rời mọi danh sách thường;
 * bật nút mắt thì chỉ còn các máy đã ẩn, mở một máy ra có nút "Hiện lại thiết bị".
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const cho = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: CHROMIUM });

try {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 140)));
  await p.goto(GOC, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('x');
  await p.locator('button.login-btn').click(); await cho(2000);

  const mat = p.locator('.filter-pill.eye');
  const soThe = () => p.locator('.device-grid .device-card').count();
  const tenThe = () => p.locator('.device-grid .device-card .card-hit').evaluateAll(ns => ns.map(n => n.getAttribute('aria-label')));
  const soNha = await soThe();

  ok('nút mắt mang nhãn "Thiết bị đã ẩn", đang tắt', await mat.getAttribute('aria-label') === 'Thiết bị đã ẩn' && await mat.getAttribute('aria-pressed') === 'false');
  const hop = await mat.boundingBox();
  ok(`nút mắt ≥44px (${Math.round(hop.width)}x${Math.round(hop.height)})`, hop.width >= 44 && hop.height >= 44);

  /* ---------- chưa ẩn gì: bật mắt → danh sách rỗng, có lời nhắc ---------- */
  await mat.click(); await cho(400);
  ok('bật nút mắt → sang màn Thiết bị, nút sáng lên', await p.locator('.bn-item.active', { hasText: 'Thiết bị' }).count() === 1
    && await mat.getAttribute('aria-pressed') === 'true' && /active/.test(await mat.getAttribute('class')));
  ok('chưa ẩn máy nào → báo "Không có thiết bị nào đã ẩn"', await soThe() === 0 && /Không có thiết bị nào đã ẩn/.test(await p.locator('.empty-state').innerText()));
  ok('có dòng nói rõ đang xem thiết bị đã ẩn', /đã ẩn/.test(await p.locator('.da-an-ghi-chu').innerText()));
  ok('không còn kiểu lưới "gọn" cũ', await p.locator('.device-grid.compact').count() === 0);
  await mat.click(); await cho(400);
  const soThietBi = await soThe();
  ok(`tắt nút mắt → về danh sách thường (${soThietBi} thiết bị)`, soThietBi > 1 && await p.locator('.da-an-ghi-chu').count() === 0);

  /* ---------- ẩn một máy ---------- */
  const [ten] = await tenThe();
  await p.locator('.device-grid .device-card .card-hit').first().click(); await cho(700);
  await p.locator('.devpage button', { hasText: 'Ẩn thiết bị khỏi danh sách' }).click(); await cho(500);
  ok(`ẩn "${ten}" → rời danh sách Thiết bị`, await soThe() === soThietBi - 1 && !(await tenThe()).includes(ten));
  await p.locator('.bn-item', { hasText: 'Nhà' }).click(); await cho(400);
  ok('…và rời cả trang chủ', await soThe() === soNha - 1);

  /* ---------- bật mắt → chỉ còn máy đã ẩn ---------- */
  await mat.click(); await cho(400);
  ok(`bật nút mắt → chỉ còn đúng máy đã ẩn ("${(await tenThe()).join(', ')}")`, await soThe() === 1 && (await tenThe())[0] === ten);
  await p.locator('.device-grid .device-card .card-hit').first().click(); await cho(700);
  const nutHien = p.locator('.devpage button', { hasText: 'Hiện lại thiết bị' });
  ok('mở máy đã ẩn → có nút "Hiện lại thiết bị", không còn nút "Ẩn"', await nutHien.count() === 1 && await p.locator('.devpage button', { hasText: 'Ẩn thiết bị' }).count() === 0);
  await nutHien.click(); await cho(500);
  ok('hiện lại → danh sách đã ẩn trống', await soThe() === 0);
  await mat.click(); await cho(400);
  ok(`tắt nút mắt → máy trở lại danh sách thường (${await soThe()})`, await soThe() === soThietBi && (await tenThe()).includes(ten));

  ok(`không lỗi JS (${loi.length})`, loi.length === 0);
} catch (e) {
  R.push(`FAIL  dừng giữa chừng: ${String(e).split('\n')[0].slice(0, 160)}`);
} finally {
  console.log(R.join('\n'));
  console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
  await b.close();
}
