/** A8 — Giao diện chung (5 ca). */
import { boGhi, moTrinhDuyet, moTrang, vaoTrang, vaoApp, doi, cho, moChiTiet, dongChiTiet, sangTab, GOC } from './chung.mjs';

const { ghi, ca, thu, xong } = boGhi('a8');
const b = await moTrinhDuyet();

/** Trang có cuộn ngang không, và vùng cuộn đang thấy có tràn ngang không. */
const tranNgang = p => p.evaluate(() => {
  const ra = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) ra.push(`trang ${document.documentElement.scrollWidth}>${innerWidth}`);
  for (const n of document.querySelectorAll('.phone, .app-scroll, .devbody, .drawer, .tk-popup, .modal-sheet, .panel-body, .login-content')) {
    const r = n.getBoundingClientRect();
    if (r.width > 0 && n.scrollWidth > n.clientWidth + 1) ra.push(`${n.className.split(' ')[0]} ${n.scrollWidth}>${n.clientWidth}`);
  }
  return ra;
});

await thu('A8-01', async () => {
  const loi = [];
  for (const rong of [360, 375, 430]) {
    const { ctx, p } = await moTrang(b, { rong, cao: 800 });
    await vaoTrang(p);
    const ghiMan = async ten => { for (const x of await tranNgang(p)) loi.push(`${rong}px ${ten}: ${x}`); };
    await ghiMan('đăng nhập');
    await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('MatKhauThu-123');
    await p.locator('button.login-btn').click(); await p.locator('.device-card').first().waitFor({ timeout: 10000 });
    await ghiMan('trang chủ');
    for (const tab of ['Thiết bị', 'Tự động', 'Dịch vụ', 'Khám phá']) { await sangTab(p, tab); await ghiMan(tab); }
    await sangTab(p, 'Nhà');
    await p.locator('.top-actions .icon-btn').last().click(); await cho(300); await ghiMan('menu phải');
    await p.locator('.drawer .nut-dong-goc').click(); await cho(300);
    await p.locator('.top-bar .profile-chip').click(); await cho(300); await ghiMan('popup tài khoản');
    await p.locator('.tk-popup .nut-dong-goc').click(); await cho(300);
    for (const ten of ['fan63903', '03092026A1', 'Quạt mới', '22022026A1']) { await moChiTiet(p, ten); await ghiMan(`chi tiết ${ten}`); await dongChiTiet(p); }
    await ctx.close();
  }
  ca('A8-01', [[`không tràn ngang ở 360 / 375 / 430 px trên 13 màn${loi.length ? ': ' + loi.slice(0, 5).join('; ') : ''}`, loi.length === 0]],
    'chữ đè nhau phải soát bằng mắt');
});

ghi('A8-02', 'KHAC', 'tests/a11y.mjs, tests/a11y-toi.mjs (16 trạng thái màn, đo cả ::before) và tests/menu.mjs — vùng chạm ≥ 44×44');

await thu('A8-03', async () => {
  const { ctx, p } = await moTrang(b);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  // Gần với "Slow 4G" của DevTools: trễ ~560 ms, ~180 KB/s.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 562, downloadThroughput: 180 * 1024, uploadThroughput: 84 * 1024 });
  await p.goto(GOC, { waitUntil: 'commit' });
  const mau = [];
  for (let i = 0; i < 40; i++) {
    await cho(250);
    mau.push(await p.evaluate(() => {
      const coChu = (document.body?.innerText || '').trim().length > 0;
      const coHinh = [...document.querySelectorAll('body *')].some(n => { const r = n.getBoundingClientRect(); return r.width > 40 && r.height > 40; });
      return coChu || coHinh;
    }).catch(() => false));
    if (await p.locator('#dn-id').count()) break;
  }
  const dauTien = mau.indexOf(true);
  const trangSau = mau.slice(Math.max(dauTien, 0)).filter(x => !x).length;
  await p.locator('#dn-id').waitFor({ timeout: 30000 });
  await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('MatKhauThu-123');
  await p.locator('button.login-btn').click();
  const dangTai = await doi(async () => /Đang|…/.test(await p.locator('button.login-btn').innerText()) || await p.locator('.splash').count() > 0, 3000);
  await p.locator('.top-bar').waitFor({ timeout: 30000 });
  ca('A8-03', [[`không màn trắng trong lúc tải (${trangSau} mẫu trắng sau khi có nội dung)`, dauTien >= 0 && trangSau === 0], ['bấm Đăng nhập trên mạng chậm có trạng thái đang tải', dangTai]]);
  await ctx.close();
});

await thu('A8-04', async () => {
  const { ctx, p } = await vaoApp(b);
  await p.route('**/v1/**', route => /\/v1\/(auth|i18n|tenant)\b/.test(route.request().url()) ? route.fallback()
    : route.fulfill({ status: 503, json: { message: 'upstream_unavailable' } }));
  await p.reload({ waitUntil: 'domcontentloaded' });
  const coBao = await doi(async () => await p.locator('.toast-loi').count() > 0, 10000);
  const chu = coBao ? (await p.locator('.toast-loi').innerText()).trim() : '';
  const nutThuLai = await p.locator('.toast-loi button').evaluateAll(ns => ns.some(n => /thử lại|retry/i.test((n.getAttribute('aria-label') || '') + n.textContent)));
  ca('A8-04', [[`có thông báo lỗi ("${chu.split('\n')[0].slice(0, 60)}")`, coBao], ['thông báo thân thiện, không lộ mã thô', coBao && !/upstream|503|5\d\d|error/i.test(chu)],
    ['có nút thử lại', nutThuLai]], 'hiện chỉ có nút × đóng; app tự thử lại theo nhịp hỏi vòng và khi quay lại tab');
  await ctx.close();
});

ghi('A8-05', 'KHAC', 'tests/a11y-toi.mjs — 16 màn ở giao diện tối, 0 chỗ thiếu tương phản. Màn đăng nhập cố ý giữ bảng màu riêng trên ảnh nền (đo bởi tests/a11y.mjs)');

xong();
await b.close();
