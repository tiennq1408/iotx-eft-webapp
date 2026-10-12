/** A10 — Popup tài khoản (7 ca). */
import { boGhi, moTrinhDuyet, vaoApp, doi, cho } from './chung.mjs';

const { ca, thu, xong } = boGhi('a10');
const b = await moTrinhDuyet();
const moPopup = async p => { await p.locator('.top-bar .profile-chip').click(); await cho(350); };
const popup = p => p.locator('.tk-popup');
const chon = async (p, dong, muc) => {
  await popup(p).locator('.menu-dong-chon', { hasText: dong }).click(); await cho(300);
  // Khớp TRỌN nhãn ở cuối dòng: "Lớn" không được bắt nhầm "Rất lớn"; ngôn ngữ có cờ đứng trước.
  await p.locator('.chon-ds .radio-list-row', { hasText: new RegExp(`(^|\\s)${muc}\\s*$`) }).click(); await cho(400);
};
const chuaBat = p => p.locator('.modal-sheet [role="alert"]').innerText().catch(() => '');

await thu('A10-01', async () => {
  const { ctx, p } = await vaoApp(b);
  await moPopup(p);
  const ten = (await popup(p).locator('.menu-ho-so-chu strong').innerText()).trim();
  const email = (await popup(p).locator('.menu-ho-so-chu span').innerText().catch(() => '')).trim();
  // /me của máy giả: email "p@p" → tên hiển thị suy từ phần trước @.
  ca('A10-01', [['bấm avatar → popup mở', await popup(p).count() === 1], [`tên + email đúng tài khoản đang đăng nhập ("${ten}", "${email}")`, ten === 'p' && email === 'p@p']]);
  await ctx.close();
});

await thu('A10-02', async () => {
  const { ctx, p } = await vaoApp(b);
  await moPopup(p);
  await popup(p).locator('.drawer-item', { hasText: 'Đổi tên' }).click(); await cho(300);
  await p.locator('#dt-ten').fill('Tên mới'); await p.locator('.modal-sheet .btn-full').click(); await cho(500);
  ca('A10-02', [['Đổi tên → báo "tính năng đang chờ bật"', /chờ bật/.test(await chuaBat(p))]]);
  await ctx.close();
});

await thu('A10-03', async () => {
  const { ctx, p } = await vaoApp(b);
  await moPopup(p);
  await popup(p).locator('button.tk-anh').click(); await cho(300);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await p.locator('.modal-sheet input[type="file"]').setInputFiles({ name: 'anh.png', mimeType: 'image/png', buffer: png }); await cho(300);
  await p.locator('.modal-sheet button.btn-full').last().click(); await cho(500);
  ca('A10-03', [['Đổi ảnh đại diện → báo "tính năng đang chờ bật"', /chờ bật/.test(await chuaBat(p))]]);
  await ctx.close();
});

await thu('A10-04', async () => {
  const { ctx, p } = await vaoApp(b);
  await moPopup(p);
  await popup(p).locator('.drawer-item', { hasText: 'Đổi mật khẩu' }).click(); await cho(300);
  await p.locator('#dmk-cu').fill('MatKhauCu-1'); await p.locator('#dmk-moi').fill('MatKhauMoi-1'); await p.locator('#dmk-nhapLai').fill('MatKhauMoi-1');
  await p.locator('.modal-sheet .btn-full').click(); await cho(500);
  ca('A10-04', [['Đổi mật khẩu → báo "tính năng đang chờ bật"', /chờ bật/.test(await chuaBat(p))]]);
  await ctx.close();
});

await thu('A10-05', async () => {
  const { ctx, p } = await vaoApp(b);
  await moPopup(p);
  await chon(p, 'Cỡ chữ', 'Lớn');
  await chon(p, 'Giao diện', 'Tối');
  await chon(p, 'Ngôn ngữ', 'English');
  const ngay = await p.evaluate(() => ({ ...document.documentElement.dataset }));
  const tieuDeEn = await popup(p).locator('.menu-cum h3').innerText();
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.locator('.device-card').first().waitFor();
  const sau = await p.evaluate(() => ({ ...document.documentElement.dataset }));
  await moPopup(p);
  const vanEn = /account/i.test(await popup(p).locator('.menu-cum h3').innerText());
  ca('A10-05', [[`áp ngay: cỡ ${ngay.coChu}, giao diện ${ngay.giaoDien}, chữ "${tieuDeEn}"`, ngay.coChu === 'lon' && ngay.giaoDien === 'toi' && /account/i.test(tieuDeEn)],
    [`giữ sau khi tải lại: cỡ ${sau.coChu}, giao diện ${sau.giaoDien}, tiếng Anh ${vanEn}`, sau.coChu === 'lon' && sau.giaoDien === 'toi' && vanEn]]);
  // Trả về mặc định cho các ca sau.
  await chon(p, 'Language', 'Tiếng Việt'); await chon(p, 'Giao diện', 'Sáng'); await chon(p, 'Cỡ chữ', 'Vừa');
  await ctx.close();
});

await thu('A10-06', async () => {
  const { ctx, p } = await vaoApp(b);
  await moPopup(p);
  const cong = () => popup(p).locator('.drawer-item[role="switch"]');
  const truoc = await cong().getAttribute('aria-checked');
  await cong().click(); await cho(300);
  const sau = await cong().getAttribute('aria-checked');
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.locator('.device-card').first().waitFor();
  await moPopup(p);
  const giu = await cong().getAttribute('aria-checked');
  await cong().click(); await cho(300);   // trả lại
  ca('A10-06', [[`bật/tắt được (${truoc} → ${sau})`, truoc !== sau], [`giữ trạng thái sau khi tải lại (${giu})`, giu === sau]]);
  await ctx.close();
});

await thu('A10-07', async () => {
  const { ctx, p } = await vaoApp(b);
  // Đặt vài cài đặt của máy để xem chúng còn sau đăng xuất.
  await moPopup(p); await chon(p, 'Giao diện', 'Tối'); await chon(p, 'Ngôn ngữ', 'English');
  const kho = () => p.evaluate(() => {
    const lay = s => Object.fromEntries(Object.keys(s).map(k => [k, s.getItem(k)]));
    return { local: lay(localStorage), session: lay(sessionStorage) };
  });
  const truoc = await kho();
  await popup(p).locator('.menu-dang-xuat').click();   // chữ đã sang tiếng Anh, chọn theo lớp
  await doi(async () => await p.locator('button.login-btn').count() > 0);
  await cho(500);
  const sau = await kho();
  const tatCa = { ...sau.local, ...sau.session };
  const chuoi = JSON.stringify(tatCa);
  const conVe = Object.keys(tatCa).filter(k => /session|token|ve\b/i.test(k));
  const conAnhChup = Object.keys(tatCa).filter(k => /anh-chup|bootstrap/i.test(k));
  const conEtagBootstrap = /"bootstrap:/.test(chuoi);
  const conHoSo = /p@p\b/.test(chuoi);
  const giuCaiDat = 'livotec-cai-dat' in sau.local && /toi/.test(sau.local['livotec-cai-dat'] || '');
  const giuNgonNgu = sau.local['livotec-lang'] === 'en' && truoc.local['livotec-lang'] === 'en';
  ca('A10-07', [[`xoá vé / phiên${conVe.length ? ' — còn: ' + conVe.join(', ') : ''}`, conVe.length === 0],
    [`xoá ảnh chụp danh sách thiết bị${conAnhChup.length ? ' — còn: ' + conAnhChup.join(', ') : ''}`, conAnhChup.length === 0],
    ['xoá cache /bootstrap (nhãn ETag bootstrap:*)', !conEtagBootstrap], ['không còn hồ sơ (email) trong bộ nhớ', !conHoSo],
    ['giữ cài đặt của máy: giao diện / cỡ chữ', giuCaiDat], [`giữ ngôn ngữ (${sau.local['livotec-lang']})`, giuNgonNgu]],
    `khoá còn lại sau đăng xuất: ${Object.keys(tatCa).join(', ') || '(trống)'}`);
  await p.evaluate(() => { localStorage.removeItem('livotec-cai-dat'); localStorage.setItem('livotec-lang', 'vi'); });
  await ctx.close();
});

xong();
await b.close();
