/** A1 — Đăng nhập và phiên (14 ca). */
import { boGhi, moTrinhDuyet, moTrang, vaoTrang, vaoApp, doi, cho, giaVeHetHan, quayLaiTab, demYeuCau } from './chung.mjs';

const { ghi, ca, thu, xong } = boGhi('a1');
const b = await moTrinhDuyet();
const CAU_CHUNG = 'Tài khoản hoặc mật khẩu không đúng.';

await thu('A1-01', async () => {
  const { ctx, p } = await moTrang(b);
  await vaoTrang(p);
  await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('MatKhauThu-123');
  const t0 = Date.now();
  await p.locator('button.login-btn').click();
  await p.locator('.device-card').first().waitFor({ timeout: 10000 });
  const ms = Date.now() - t0;
  ca('A1-01', [[`danh sách thiết bị hiện sau ${ms} ms (≤ 2000)`, ms <= 2000], ['vào màn chính', await p.locator('.top-bar').count() === 1]],
    `đo trên máy chủ giả — số trên DEV phải đo tay`);
  await ctx.close();
});

await thu('A1-02', async () => {
  const { ctx, p } = await moTrang(b);
  await vaoTrang(p);
  const thuMa = async (ma, message) => {
    await p.route('**/v1/auth/login', r => r.fulfill({ status: ma, json: { message } }));
    await p.locator('#dn-id').fill('ai@do.vn'); await p.locator('#dn-pw').fill('saimatkhau1');
    await p.locator('button.login-btn').click(); await cho(700);
    const cau = (await p.locator('.dn-alert').innerText().catch(() => '')).trim();
    const loiO = await p.locator('#dn-pw-err').count();
    const danhDau = await p.locator('#dn-pw').getAttribute('aria-invalid');
    await p.unroute('**/v1/auth/login');
    return { cau, loiO, danhDau };
  };
  const a = await thuMa(401, 'invalid_grant');
  const c = await thuMa(404, 'not_found');
  ca('A1-02', [
    ['401 → câu chung ở cảnh báo đầu form', a.cau.includes(CAU_CHUNG)],
    ['404 → CÙNG câu đó (không lộ tài khoản có tồn tại)', c.cau === a.cau],
    ['không gắn lỗi vào riêng ô mật khẩu', a.loiO === 0 && c.loiO === 0 && a.danhDau !== 'true' && c.danhDau !== 'true'],
  ]);
  await ctx.close();
});

await thu('A1-03', async () => {
  const { ctx, p } = await vaoApp(b);
  const soLamMoi = await giaVeHetHan(p);
  await p.locator('.device-card .card-hit').first().click(); await cho(4000);
  ca('A1-03', [
    ['vẫn trong app, không bị đá ra', await p.locator('button.login-btn').count() === 0],
    ['mở được thiết bị', await p.locator('.devpage').count() === 1],
    [`đúng 1 lượt /auth/refresh (đếm được ${soLamMoi()})`, soLamMoi() === 1],
  ], 'vé hết hạn dựng bằng 401 thay cho chờ 6 phút; bản chờ thật 6 phút làm tay');
  await ctx.close();
});

await thu('A1-04', async () => {
  const { ctx, p } = await vaoApp(b);
  const soLamMoi = await giaVeHetHan(p);
  await p.reload({ waitUntil: 'domcontentloaded' });
  const vao = await doi(async () => await p.locator('.device-card').count() > 0, 8000);
  await cho(2500);
  ca('A1-04', [['mở lại app khi vé hết hạn → vào được', vao], [`đúng 1 lượt /auth/refresh, không phải 2 (đếm được ${soLamMoi()})`, soLamMoi() === 1]]);
  await ctx.close();
});

await thu('A1-05', async () => {
  const { ctx, p, mang } = await vaoApp(b);
  await p.evaluate(() => {
    const k = 'livotec-iotx-session';
    const s = JSON.parse(localStorage.getItem(k) || '{}'); delete s.refreshToken; localStorage.setItem(k, JSON.stringify(s));
  });
  await giaVeHetHan(p, { refreshHong: true });
  await quayLaiTab(p);
  const ve = await doi(async () => await p.locator('button.login-btn').count() > 0, 8000);
  const tu = Date.now(); await cho(5000);
  const sau = mang.filter(r => r.luc >= tu && /\/v1\//.test(r.url)).length;
  ca('A1-05', [['về màn đăng nhập', ve], [`không lặp vô hạn (${sau} request /v1 trong 5 s sau đó)`, sau <= 3]]);
  await ctx.close();
});

await thu('A1-06', async () => {
  const { ctx, p } = await vaoApp(b);
  await p.locator('.top-bar .profile-chip').click(); await cho(300);
  await p.locator('.tk-popup .menu-dang-xuat').click();
  const ve = await doi(async () => await p.locator('button.login-btn').count() > 0);
  await p.goBack().catch(() => undefined); await cho(1200);
  const lot = await p.locator('.top-bar').count();
  ca('A1-06', [['đăng xuất → về màn đăng nhập', ve], ['bấm Back không vào lại được app', lot === 0]]);
  await ctx.close();
});

await thu('A1-07', async () => {
  const { ctx, p } = await moTrang(b);
  await vaoTrang(p);
  const so = await p.locator('.login-lang select option').count();
  await p.locator('.login-lang select').selectOption('en'); await cho(500);
  const en = await p.locator('.dn-khung h1').innerText();
  await p.locator('.login-lang select').selectOption('th'); await cho(500);
  const th = await p.locator('.login-lang select').inputValue();
  await p.locator('.login-lang select').selectOption('vi'); await cho(400);
  ca('A1-07', [[`số mục bằng langs máy chủ (${so}/3: en, th, vi)`, so === 3], ['vi → en: chữ đổi ngay ("Sign in")', en === 'Sign in'], ['chọn được th', th === 'th'],
    ['chưa cần đăng nhập', await p.locator('.top-bar').count() === 0]],
    'chữ tiếng Thái lấy từ /i18n máy chủ — máy giả không có bản Thái, xem tay trên DEV');
  await ctx.close();
});

await thu('A1-08', async () => {
  const { ctx, p } = await moTrang(b);
  await vaoTrang(p);
  const o = p.locator('#dn-pw'), mat = p.locator('.dn-eye').first();
  const truoc = [await o.getAttribute('type'), await mat.getAttribute('aria-label')];
  await mat.click();
  const sau = [await o.getAttribute('type'), await mat.getAttribute('aria-label')];
  ca('A1-08', [['password → text', truoc[0] === 'password' && sau[0] === 'text'], [`aria-label đổi theo (${truoc[1]} → ${sau[1]})`, truoc[1] !== sau[1]]]);
  await ctx.close();
});

await thu('A1-09', async () => {
  const { ctx, p } = await moTrang(b);
  await vaoTrang(p);
  await p.locator('button.login-btn').click(); await cho(300);
  const haiLoi = await p.locator('#dn-id-err').count() === 1 && await p.locator('#dn-pw-err').count() === 1;
  await p.locator('#dn-id').fill('a');
  const motMat = await p.locator('#dn-id-err').count() === 0 && await p.locator('#dn-pw-err').count() === 1;
  ca('A1-09', [['bỏ trống → lỗi dưới đúng từng ô', haiLoi], ['gõ lại thì lỗi của chính ô đó biến mất', motMat]]);
  await ctx.close();
});

await thu('A1-10', async () => {
  const { ctx, p } = await moTrang(b);
  await vaoTrang(p);
  await p.locator('.dn-row .dn-link').click(); await cho(300);
  await p.locator('#qm-id').fill('ai@do.vn');
  await p.locator('.dn-khung .login-btn').click(); await cho(500);
  ca('A1-10', [['báo "tính năng đang chờ bật"', /chờ bật/.test(await p.locator('.dn-alert').innerText().catch(() => ''))],
    ['không nhảy sang màn "Đã gửi mã"', await p.locator('#qm-id').count() === 1]]);
  await ctx.close();
});

await thu('A1-11', async () => {
  const { ctx, p } = await moTrang(b);
  await vaoTrang(p);
  const url = p.url();
  await p.locator('.dn-google').click(); await cho(600);
  ca('A1-11', [['báo "tính năng đang chờ bật"', /chờ bật/.test(await p.locator('.dn-alert').innerText().catch(() => ''))],
    ['không điều hướng, không treo', p.url() === url && await p.locator('.dn-google').isEnabled()]]);
  await ctx.close();
});

await thu('A1-12', async () => {
  const { ctx, p, mang } = await moTrang(b);
  await vaoTrang(p);
  await p.route('**/v1/auth/login', r => r.fulfill({ status: 401, json: { message: 'invalid_grant' } }));
  await p.locator('#dn-id').fill('0912345678'); await p.locator('#dn-pw').fill('MatKhauThu-123');
  await p.locator('button.login-btn').click(); await cho(700);
  const gui = mang.find(r => r.url.includes('/v1/auth/login'));
  const coGui = Boolean(gui && (gui.body || '').includes('0912345678'));
  ghi('A1-12', 'BIET', `app gửi thẳng SĐT lên /auth/login (${coGui ? 'đã quan sát thấy' : 'KHÔNG thấy request — xem lại'}) trong khi sadmin đang tắt đăng nhập bằng SĐT; máy chủ trả câu chung. Xem docs/bao-cao/2026-10-09.md mục 3`);
  await ctx.close();
});

await thu('A1-13', async () => {
  const { ctx, p, mang } = await moTrang(b);
  await vaoTrang(p);
  await p.locator('.dn-foot .dn-link').click(); await cho(300);
  await p.locator('#dk-ten').fill('Người Thử'); await p.locator('#dk-id').fill('thu@test.vn');
  await p.locator('#dk-pw').fill('abc1234'); await p.locator('#dk-pw2').fill('abc1234');
  const tu = Date.now();
  await p.locator('.dn-khung .login-btn').click(); await cho(500);
  ca('A1-13', [['mật khẩu 7 ký tự → chặn tại chỗ', await p.locator('#dk-pw-err').count() === 1],
    ['không gửi request', demYeuCau(mang, /\/v1\/auth\/register/, tu) === 0]]);
  await ctx.close();
});

await thu('A1-14', async () => {
  const { ctx, p } = await moTrang(b);
  await vaoTrang(p);
  await p.locator('.dn-foot .dn-link').click(); await cho(300);
  await p.locator('#dk-ten').fill('Người Thử'); await p.locator('#dk-id').fill('thu@test.vn');
  await p.locator('#dk-pw').fill('matkhau01'); await p.locator('#dk-pw2').fill('matkhau02');
  await p.locator('.dn-khung .login-btn').click(); await cho(400);
  ca('A1-14', [['hai ô mật khẩu khác nhau → báo lỗi tại chỗ', await p.locator('#dk-pw2-err').count() === 1]]);
  await ctx.close();
});

xong();
await b.close();
