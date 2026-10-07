import { GOC, NHAT_KY, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';

/**
 * Đầu màn chi tiết thiết bị — dựng theo bản tham chiếu web.dev (đọc 07/10/2026), cộng nút
 * trở lại bên trái vốn là của app này.
 *
 * Một hàng: ‹ · ảnh · tên + bút sửa · dòng trạng thái · sao ghim.
 * Hàng dưới: ba ô gán Nhà / Phòng / Nhóm.
 *
 * Cả bốn thao tác đi chung một cửa `PATCH /devices/{id}`, nên bài này soi nhật ký máy chủ
 * để chắc mỗi nút gửi đúng trường chứ không chỉ đổi màu trên màn.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
try { fs.unlinkSync(NHAT_KY); } catch { /* chưa có */ }
const ghi = () => (fs.existsSync(NHAT_KY) ? fs.readFileSync(NHAT_KY, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [])
  .filter(x => x.cua === 'PATCH /devices');

const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 140)));

await p.goto(GOC, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await p.getByPlaceholder(/Tên đăng nhập/).fill('p@p');
await p.getByPlaceholder(/Mật khẩu/).fill('x');
await p.locator('button.login-btn').click(); await p.waitForTimeout(2200);
await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await p.waitForTimeout(1000);
await p.locator('.device-card').filter({ hasText: 'SBI314' }).first().locator('.card-hit').click();
await p.waitForTimeout(1500);

try {
  /* ---------- 1. Có đủ các phần ---------- */
  ok('nút trở lại vẫn ở bên trái', await p.locator('.devdau .devback').count() === 1);
  ok('có ảnh đại diện', await p.locator('.devdau .dev-ico').count() === 1);
  ok('tên thiết bị đúng', (await p.locator('.dev-ten').innerText()).trim() === 'SBI314');
  ok('có nút bút để đổi tên', await p.locator('.devdau .dev-but').count() === 1);
  ok('có sao ghim', await p.locator('.devdau .fav-lon').count() === 1);
  ok('máy được chia sẻ thì dòng trạng thái nói rõ',
    /được chia sẻ/.test(await p.locator('.dev-st').innerText()));
  ok('ba ô gán Nhà / Phòng / Nhóm', await p.locator('.dev-gan .fsel').count() === 3);
  ok('chưa gán thì cả ba hiện "chưa gán"',
    (await p.locator('.dev-gan .fsel').evaluateAll(ns => ns.map(n => n.options[n.selectedIndex]?.text)))
      .every(x => /chưa gán/.test(x)));

  /* ---------- 2. Không tràn ngang, vùng chạm đủ 44px ---------- */
  ok('hàng gán không tràn khỏi màn', await p.locator('.devbody').evaluate(n => n.scrollWidth <= n.clientWidth));
  ok('cả ba ô đọc trọn chữ, không bị cắt', await p.locator('.dev-gan .fsel').evaluateAll(
    ns => ns.every(n => n.scrollWidth <= n.clientWidth + 1)));
  const nho = await p.locator('.devdau button, .dev-gan .fsel').evaluateAll(
    ns => ns.map(n => n.getBoundingClientRect()).filter(r => r.height < 44 || r.width < 44).length);
  ok(`mọi nút ở đầu màn ≥44px (${nho} nhỏ)`, nho === 0);

  /* ---------- 3. Sao ghim gửi đúng lệnh ---------- */
  const saoTruoc = await p.locator('.fav-lon').getAttribute('aria-pressed');
  await p.locator('.fav-lon').click(); await p.waitForTimeout(900);
  ok(`bấm sao thì đổi ngay trên màn (${saoTruoc} → ${await p.locator('.fav-lon').getAttribute('aria-pressed')})`,
    await p.locator('.fav-lon').getAttribute('aria-pressed') !== saoTruoc);
  ok('và gửi PATCH { fav }', ghi().some(x => 'fav' in x.patch));

  /* ---------- 4. Gán phòng ---------- */
  const oPhong = p.locator('.dev-gan .fsel').nth(1);
  const coSan = await oPhong.evaluate(n => [...n.options].map(o => o.value).filter(v => v && v !== '__moi'));
  if (coSan.length) {
    await oPhong.selectOption(coSan[0]); await p.waitForTimeout(900);
    ok(`chọn phòng có sẵn → PATCH { room: "${coSan[0]}" }`, ghi().some(x => x.patch.room === coSan[0]));
  } else ok('chọn phòng có sẵn (bỏ qua: danh sách rỗng)', true);

  /* ---------- 5. "Thêm mới…" biến ô chọn thành ô nhập ---------- */
  const oNha = p.locator('.dev-gan .fsel').first();
  await oNha.selectOption('__moi'); await p.waitForTimeout(600);
  const oNhap = p.locator('.dev-gan input.fsel');
  ok('chọn "Thêm mới…" thì hiện ô nhập', await oNhap.count() === 1);
  await oNhap.fill('Nhà Thử'); await oNhap.press('Enter'); await p.waitForTimeout(1000);
  ok('gõ tên mới → PATCH { house }', ghi().some(x => x.patch.house === 'Nhà Thử'));
  ok('tên vừa tạo thành lựa chọn trong ô', await p.locator('.dev-gan .fsel').first()
    .evaluate(n => [...n.options].some(o => o.value === 'Nhà Thử')));

  /* ---------- 6. Đổi tên bằng nút bút ---------- */
  await p.locator('.dev-but').click(); await p.waitForTimeout(500);
  const oTen = p.locator('.dev-teno');
  ok('bấm bút thì tên thành ô nhập', await oTen.count() === 1);
  await oTen.fill('SBI314 đổi'); await oTen.press('Enter'); await p.waitForTimeout(1000);
  ok('gửi PATCH { label }', ghi().some(x => x.patch.label === 'SBI314 đổi'));
  ok('tên trên màn đổi theo', (await p.locator('.dev-ten').innerText()).trim() === 'SBI314 đổi');
  // trả lại tên cũ cho lần chạy sau
  await p.locator('.dev-but').click(); await p.waitForTimeout(400);
  await p.locator('.dev-teno').fill('SBI314'); await p.locator('.dev-teno').press('Enter'); await p.waitForTimeout(900);

  /* ---------- 7. Bấm Esc thì bỏ dở, không gửi gì ---------- */
  const truocEsc = ghi().length;
  await p.locator('.dev-but').click(); await p.waitForTimeout(400);
  await p.locator('.dev-teno').fill('đừng lưu cái này');
  await p.locator('.dev-teno').press('Escape'); await p.waitForTimeout(700);
  ok('Esc bỏ dở đổi tên, không gửi lệnh nào', ghi().length === truocEsc);
  ok('tên giữ nguyên sau khi Esc', (await p.locator('.dev-ten').innerText()).trim() === 'SBI314');
} catch (e) {
  R.push(`FAIL  dừng giữa chừng: ${String(e).split('\n')[0].slice(0, 160)}`);
} finally {
  console.log(R.join('\n'));
  console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
  console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
  await b.close();
}
