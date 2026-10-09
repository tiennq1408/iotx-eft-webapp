import { GOC, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Hai chỗ mở ra từ thanh trên:
 * - Menu góc phải: đúng như bản gốc — năm mục quản lý + dòng phiên bản, KHÔNG có chọn ngôn ngữ.
 * - Popup tài khoản (bấm avatar + tên góc trái trên): hồ sơ · cụm Tài khoản (đổi mật khẩu,
 *   ngôn ngữ, cỡ chữ, giao diện, thông báo) · Đăng xuất. Avatar có nút máy ảnh để đổi ảnh,
 *   dòng Đổi tên nằm trên Đổi mật khẩu — hai cửa sửa hồ sơ chưa có trong `/v1` nên báo chờ bật. Ngôn ngữ / cỡ chữ / giao diện là ba
 *   dòng cùng kiểu, bấm vào mở popup chọn; chọn xong quay về popup tài khoản.
 *
 * Giao diện / cỡ chữ / chấm báo là tuỳ chọn của máy (localStorage), gắn lên <html> CHỈ khi đã
 * đăng nhập. Đổi mật khẩu chưa có cửa `/v1` nên phải báo "đang chờ bật".
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const cho = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: CHROMIUM });

const dangNhap = async p => {
  await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('x');
  await p.locator('button.login-btn').click(); await cho(2000);
};
const moMenu = async p => { await p.locator('.top-actions .icon-btn').last().click(); await cho(350); };
const moTaiKhoan = async p => { await p.locator('.top-bar .profile-chip').click(); await cho(350); };
const html = p => p.evaluate(() => ({ ...document.documentElement.dataset }));
const nhoHon44 = loc => loc.evaluateAll(ns => ns.map(n => ({ k: n.className, r: n.getBoundingClientRect() }))
  .filter(x => x.r.width > 0 && (x.r.width < 44 || x.r.height < 44)).map(x => `${x.k} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`));

try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 140)));
  await p.goto(GOC, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });

  /* ---------- màn đăng nhập không theo tuỳ chọn hiển thị ---------- */
  await p.evaluate(() => localStorage.setItem('livotec-cai-dat', JSON.stringify({ giaoDien: 'toi', coChu: 'lon' })));
  await p.reload({ waitUntil: 'networkidle' }); await cho(300);
  ok('màn đăng nhập: chưa gắn giao diện tối hay cỡ chữ lên <html>', !('giaoDien' in await html(p)) && !('coChu' in await html(p)));
  await p.evaluate(() => localStorage.removeItem('livotec-cai-dat'));
  await p.reload({ waitUntil: 'networkidle' }); await cho(300);
  await dangNhap(p);
  ok('đăng nhập xong: mặc định giao diện sáng, cỡ vừa', (await html(p)).giaoDien === 'sang' && (await html(p)).coChu === 'vua');

  /* ---------- 1. menu góc phải: như bản gốc, chỉ năm mục ---------- */
  await moMenu(p);
  ok('menu phải có tiêu đề "Menu"', /Menu/.test(await p.locator('.drawer h3').first().innerText()));
  const muc = await p.locator('.drawer .drawer-item').allInnerTexts();
  ok(`menu phải có đúng 5 mục (${muc.length})`, muc.length === 5 && /Nhà/.test(muc[0]) && /Thiết bị ảo/.test(muc[4]));
  ok('menu phải KHÔNG còn chọn ngôn ngữ', await p.locator('.drawer select, .drawer .lang-flag, .drawer .lang-row').count() === 0 && !/Ngôn ngữ/.test(await p.locator('.drawer').innerText()));
  ok('menu phải không còn cụm Tài khoản / Đăng xuất', !/Tài khoản|Đăng xuất|Đổi mật khẩu/.test(await p.locator('.drawer').innerText()));
  ok('menu phải còn dòng phiên bản', /v1\.0/.test(await p.locator('.drawer-foot').innerText()));
  {
    const nut = await p.locator('.drawer .nut-dong-goc').boundingBox(); const khung = await p.locator('.drawer').boundingBox();
    ok('menu phải có nút đóng ở góc phải trên', nut && nut.x + nut.width > khung.x + khung.width - 20 && nut.y < khung.y + 30);
  }
  const nhoMenu = await nhoHon44(p.locator('.drawer button'));
  ok(`menu phải: mọi mục ≥44px (${nhoMenu.join(', ') || 'không có cái nào nhỏ'})`, nhoMenu.length === 0);
  await p.locator('.drawer .nut-dong-goc').click(); await cho(300);
  ok('bấm nút đóng → menu phải đóng', await p.locator('.drawer').count() === 0);

  /* ---------- 2. popup tài khoản ở góc trái trên ---------- */
  await moTaiKhoan(p);
  const popup = p.locator('.tk-popup');
  ok('bấm avatar + tên góc trái trên → mở popup tài khoản', await popup.count() === 1);
  const hopChip = await p.locator('.top-bar .profile-chip').boundingBox(); const hopPopup = await popup.boundingBox();
  ok('popup thả xuống ngay dưới avatar, bám mép trái', hopPopup.y >= hopChip.y + hopChip.height - 4 && hopPopup.y < hopChip.y + hopChip.height + 30 && hopPopup.x < 30);
  ok('có avatar và tên tài khoản', await popup.locator('.menu-ho-so .avatar-circle img').count() === 1 && (await popup.locator('.menu-ho-so-chu strong').innerText()).trim().length > 0);
  const taiKhoan = (await popup.innerText()).replace(/\s+/g, ' ');
  ok('cụm Tài khoản: Đổi tên · Đổi mật khẩu · Ngôn ngữ · Cỡ chữ · Giao diện · Thông báo',
    ['Tài khoản', 'Đổi tên', 'Đổi mật khẩu', 'Ngôn ngữ', 'Cỡ chữ', 'Giao diện', 'Thông báo'].every(x => new RegExp(x, 'i').test(taiKhoan)));
  const thuTu = (await popup.locator('.menu-cum .drawer-item .menu-nhan').allInnerTexts()).map(x => x.trim().split('\n')[0]);
  ok(`Đổi tên nằm ngay trên Đổi mật khẩu (${thuTu.slice(0, 2).join(' → ')})`, thuTu[0] === 'Đổi tên' && thuTu[1] === 'Đổi mật khẩu');
  ok('avatar có nút đổi ảnh kèm biểu tượng máy ảnh', await popup.locator('.menu-ho-so button.tk-anh[aria-label="Đổi ảnh đại diện"] .tk-anh-icon svg').count() === 1);
  const dong = popup.locator('.menu-dong-chon');
  ok('Ngôn ngữ · Cỡ chữ · Giao diện là ba dòng CÙNG kiểu (nhãn + giá trị + mũi tên, mở popup)',
    await dong.count() === 3 && await dong.locator('.menu-gia-tri').count() === 3 && await dong.locator('.menu-mui').count() === 3
    && (await dong.evaluateAll(ns => ns.every(n => n.getAttribute('aria-haspopup') === 'dialog'))));
  const cuoi = await popup.locator(':scope > *').last().evaluate(n => n.innerText.trim());
  ok(`nút Đăng xuất nằm cuối popup ("${cuoi}")`, cuoi === 'Đăng xuất');
  const nhoPopup = await nhoHon44(popup.locator('button'));
  ok(`popup: mọi phần tử bấm được ≥44px (${nhoPopup.join(', ') || 'không có cái nào nhỏ'})`, nhoPopup.length === 0);
  {
    const nut = await popup.locator('.nut-dong-goc').boundingBox();
    ok('popup có nút đóng ở góc phải trên', nut && nut.x + nut.width > hopPopup.x + hopPopup.width - 20 && nut.y < hopPopup.y + 30);
    await popup.locator('.nut-dong-goc').click(); await cho(300);
    ok('bấm nút đóng → popup tài khoản đóng', await popup.count() === 0);
    await moTaiKhoan(p);
  }
  ok('popup không tràn ngang', await popup.evaluate(n => n.scrollWidth <= n.clientWidth) && await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  const moDong = async ten => { await p.locator('.tk-popup .menu-dong-chon', { hasText: ten }).click(); await cho(300); };
  const chon = async ten => { await p.locator('.chon-ds .radio-list-row', { hasText: ten }).click(); await cho(400); };

  /* ---------- ngôn ngữ ---------- */
  await moDong('Ngôn ngữ');
  const dsLang = await p.locator('.chon-ds .radio-list-row').allInnerTexts();
  ok(`popup Ngôn ngữ có ${dsLang.length} mục, mỗi mục có cờ, đánh dấu mục đang chọn`, dsLang.length >= 2 && dsLang.every(x => /^\S+ \S/.test(x.trim()))
    && /Tiếng Việt/.test(await p.locator('.chon-ds .radio-list-row[aria-pressed="true"]').innerText()));
  await chon('English');
  ok('chọn English → popup chọn đóng, về popup tài khoản, chữ đổi ngay', await p.locator('.chon-ds').count() === 0 && await popup.count() === 1 && /account/i.test(await popup.locator('.menu-cum h3').innerText()));
  await p.locator('.tk-popup .menu-dong-chon').first().click(); await cho(300); await chon('Tiếng Việt');

  /* ---------- giao diện ---------- */
  await moDong('Giao diện');
  ok('popup Giao diện: Sáng · Tối · Theo hệ thống', (await p.locator('.chon-ds .radio-list-row').allInnerTexts()).map(x => x.trim()).join('|') === 'Sáng|Tối|Theo hệ thống');
  await chon('Tối');
  const nenToi = await popup.evaluate(n => getComputedStyle(n).backgroundColor);
  ok(`chọn Tối → <html data-giao-dien="toi">, popup nền tối (${nenToi})`, (await html(p)).giaoDien === 'toi' && nenToi !== 'rgb(255, 255, 255)');
  ok('dòng Giao diện hiện giá trị "Tối"', /Tối/.test(await popup.locator('.menu-dong-chon', { hasText: 'Giao diện' }).locator('.menu-gia-tri').innerText()));
  await p.reload({ waitUntil: 'networkidle' }); await cho(1500);
  ok('tải lại trang → vẫn giữ giao diện tối', (await html(p)).giaoDien === 'toi');
  await moTaiKhoan(p);
  await moDong('Giao diện'); await chon('Theo hệ thống');
  await p.emulateMedia({ colorScheme: 'dark' }); await cho(200);
  const theoToi = (await html(p)).giaoDien;
  await p.emulateMedia({ colorScheme: 'light' }); await cho(200);
  ok(`Theo hệ thống: máy tối → tối (${theoToi}), máy sáng → sáng (${(await html(p)).giaoDien})`, theoToi === 'toi' && (await html(p)).giaoDien === 'sang');
  await moDong('Giao diện'); await chon('Sáng');

  /* ---------- cỡ chữ ---------- */
  await moDong('Cỡ chữ');
  ok('popup Cỡ chữ: Vừa · Lớn · Rất lớn, có dòng xem trước',
    (await p.locator('.chon-ds .radio-list-row').allInnerTexts()).map(x => x.trim()).join('|') === 'Vừa|Lớn|Rất lớn' && await p.locator('.chu-xem-truoc').count() === 1);
  await chon('Rất lớn');
  ok('chọn Rất lớn → gắn lên <html>, về popup tài khoản', (await html(p)).coChu === 'ratLon' && await popup.count() === 1);
  const vua = await p.evaluate(() => { const r = document.querySelector('.phone').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth; });
  ok('chữ Rất lớn: khung máy vẫn vừa màn hình, không tràn ngang', vua);
  ok('dòng Cỡ chữ hiện giá trị "Rất lớn"', /Rất lớn/.test(await popup.locator('.menu-dong-chon', { hasText: 'Cỡ chữ' }).locator('.menu-gia-tri').innerText()));
  await moDong('Cỡ chữ'); await chon('Vừa');

  /* ---------- thông báo: tắt thì bỏ chấm đỏ trên chuông ---------- */
  const nutTB = popup.locator('.drawer-item[role="switch"]');
  ok('công tắc thông báo mặc định BẬT', await nutTB.getAttribute('aria-checked') === 'true');
  await p.locator('.modal-scrim').first().click({ position: { x: 10, y: 600 } }); await cho(300);
  const coChamTruoc = await p.locator('.top-actions .dot').count();
  await moTaiKhoan(p);
  await nutTB.click(); await cho(200);
  ok('bấm → TẮT', await nutTB.getAttribute('aria-checked') === 'false');
  await p.locator('.modal-scrim').first().click({ position: { x: 10, y: 600 } }); await cho(300);
  ok(`tắt thông báo → chuông không còn chấm đỏ (trước: ${coChamTruoc})`, coChamTruoc === 1 && await p.locator('.top-actions .dot').count() === 0);

  /* ---------- đổi mật khẩu: chặn tại chỗ, rồi báo chờ bật ---------- */
  await moTaiKhoan(p);
  await popup.locator('.drawer-item', { hasText: 'Đổi mật khẩu' }).click(); await cho(300);
  ok('mở hộp Đổi mật khẩu: ba ô có nhãn', await p.locator('.modal-sheet label[for^="dmk-"]').count() === 3);
  await p.locator('.modal-sheet .btn-full').click(); await cho(200);
  ok('bỏ trống → báo lỗi tại ô, không gửi', await p.locator('#dmk-cu-err').count() === 1 && await p.locator('#dmk-moi-err').count() === 1);
  await p.locator('#dmk-cu').fill('matkhaucu1'); await p.locator('#dmk-moi').fill('abc1234'); await p.locator('#dmk-nhapLai').fill('abc1234');
  await p.locator('.modal-sheet .btn-full').click(); await cho(200);
  ok('mật khẩu mới 7 ký tự → chặn', /tối thiểu 8/i.test(await p.locator('#dmk-moi-err').innerText()));
  await p.locator('#dmk-moi').fill('matkhaumoi1'); await p.locator('#dmk-nhapLai').fill('matkhaumoi2');
  await p.locator('.modal-sheet .btn-full').click(); await cho(200);
  ok('nhập lại không khớp → chặn', await p.locator('#dmk-nhapLai-err').count() === 1);
  await p.locator('#dmk-nhapLai').fill('matkhaumoi1');
  await p.locator('.modal-sheet .btn-full').click(); await cho(400);
  ok('hợp lệ nhưng chưa có cửa /v1 → báo "đang chờ bật", không báo thành công',
    /chờ bật/.test(await p.locator('.modal-sheet [role="alert"]').innerText()) && await p.locator('.dmk-xong').count() === 0);
  await p.locator('.modal-close').click(); await cho(300);
  ok('đóng hộp Đổi mật khẩu → quay lại popup tài khoản', await popup.count() === 1);

  /* ---------- đổi tên: chặn tại chỗ, rồi báo chờ bật ---------- */
  await popup.locator('.drawer-item', { hasText: 'Đổi tên' }).click(); await cho(300);
  ok('mở hộp Đổi tên: ô có nhãn, điền sẵn tên hiện tại', await p.locator('label[for="dt-ten"]').count() === 1 && (await p.locator('#dt-ten').inputValue()).length > 0);
  await p.locator('#dt-ten').fill('   '); await p.locator('.modal-sheet .btn-full').click(); await cho(200);
  ok('bỏ trống → báo lỗi tại ô, không gửi', await p.locator('#dt-ten-err').count() === 1);
  await p.locator('#dt-ten').fill('Ngọc Thủy Mới'); await p.locator('.modal-sheet .btn-full').click(); await cho(400);
  ok('tên hợp lệ nhưng chưa có cửa /v1 → báo "đang chờ bật"', /chờ bật/.test(await p.locator('.modal-sheet [role="alert"]').innerText()));
  await p.locator('.modal-close').click(); await cho(300);
  ok('đóng hộp Đổi tên → quay lại popup tài khoản', await popup.count() === 1);

  /* ---------- đổi ảnh đại diện: chọn ảnh, xem trước, lưu → chờ bật ---------- */
  await popup.locator('button.tk-anh').click(); await cho(300);
  ok('bấm biểu tượng máy ảnh → mở hộp Đổi ảnh đại diện, nút Lưu khoá khi chưa chọn ảnh',
    /Đổi ảnh đại diện/.test(await p.locator('.modal-sheet .modal-title').innerText()) && await p.locator('.modal-sheet button.btn-full').last().isDisabled());
  const tepAnh = p.locator('.modal-sheet input[type="file"]');
  await tepAnh.setInputFiles({ name: 'ghi-chu.txt', mimeType: 'text/plain', buffer: Buffer.from('khong phai anh') }); await cho(200);
  ok('chọn tệp không phải ảnh → báo lỗi, không xem trước', /tệp ảnh/.test(await p.locator('.modal-sheet .dmk-err').innerText()) && await p.locator('.anh-xem-truoc img[src^="blob:"]').count() === 0);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await tepAnh.setInputFiles({ name: 'anh.png', mimeType: 'image/png', buffer: png }); await cho(300);
  ok('chọn ảnh → hiện xem trước, mở nút Lưu', await p.locator('.anh-xem-truoc img[src^="blob:"]').count() === 1 && await p.locator('.modal-sheet button.btn-full').last().isEnabled());
  await p.locator('.modal-sheet button.btn-full').last().click(); await cho(400);
  ok('lưu khi chưa có cửa /v1 → báo "đang chờ bật"', /chờ bật/.test(await p.locator('.modal-sheet [role="alert"]').innerText()));
  const nhoAnh = await nhoHon44(p.locator('.modal-sheet button, .modal-sheet label.anh-chon'));
  ok(`hộp đổi ảnh: mọi phần tử bấm được ≥44px (${nhoAnh.join(', ') || 'không có cái nào nhỏ'})`, nhoAnh.length === 0);
  await p.locator('.modal-close').click(); await cho(300);
  ok('đóng hộp đổi ảnh → quay lại popup tài khoản', await popup.count() === 1);

  /* ---------- đăng xuất ---------- */
  await popup.locator('.menu-dang-xuat').click(); await cho(800);
  ok('bấm Đăng xuất → về màn đăng nhập, gỡ tuỳ chọn hiển thị khỏi <html>', await p.locator('#dn-id').count() === 1 && !('giaoDien' in await html(p)) && !('coChu' in await html(p)));

  ok(`không lỗi JS (${loi.length})`, loi.length === 0);
  await ctx.close();
} catch (e) {
  R.push(`FAIL  dừng giữa chừng: ${String(e).split('\n')[0].slice(0, 160)}`);
} finally {
  console.log(R.join('\n'));
  console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
  await b.close();
}
