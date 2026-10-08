import { GOC, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Menu góc phải, bốn cụm: hồ sơ · Cài đặt (5 mục) · Tài khoản (đổi mật khẩu, ngôn ngữ, cỡ
 * chữ, giao diện, thông báo) · tên app + phiên bản; nút thu gọn góc phải trên, Đăng xuất ở cuối.
 * Ngôn ngữ / cỡ chữ / giao diện là ba dòng cùng kiểu, bấm vào mở popup chọn.
 *
 * Giao diện / chữ / chấm báo là tuỳ chọn của máy (localStorage), gắn lên <html> CHỈ khi đã
 * đăng nhập. Đổi mật khẩu chưa có cửa `/v1` nên phải báo "đang chờ bật".
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const cho = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: CHROMIUM });

async function vao(ctx) {
  const p = await ctx.newPage();
  const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 140)));
  await p.goto(GOC, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  return { p, loi };
}
const dangNhap = async p => {
  await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('x');
  await p.locator('button.login-btn').click(); await cho(2000);
};
const moMenu = async p => { await p.locator('.top-actions .icon-btn').last().click(); await cho(350); };
const html = p => p.evaluate(() => ({ ...document.documentElement.dataset }));

try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const { p, loi } = await vao(ctx);

  /* ---------- màn đăng nhập không theo tuỳ chọn hiển thị ---------- */
  await p.evaluate(() => localStorage.setItem('livotec-cai-dat', JSON.stringify({ giaoDien: 'toi', coChu: 'lon' })));
  await p.reload({ waitUntil: 'networkidle' }); await cho(300);
  ok('màn đăng nhập: chưa gắn giao diện tối hay cỡ chữ lên <html>', !('giaoDien' in await html(p)) && !('coChu' in await html(p)));
  await p.evaluate(() => localStorage.removeItem('livotec-cai-dat'));
  await p.reload({ waitUntil: 'networkidle' }); await cho(300);
  await dangNhap(p);
  ok('đăng nhập xong: mặc định giao diện sáng, cỡ vừa', (await html(p)).giaoDien === 'sang' && (await html(p)).coChu === 'vua');

  /* ---------- 1. bố cục bốn cụm ---------- */
  await moMenu(p);
  ok('cụm 1: avatar và tên tài khoản', await p.locator('.drawer .menu-ho-so .avatar-circle img').count() === 1 && (await p.locator('.menu-ho-so-chu strong').innerText()).trim().length > 0);
  const tieuDe = await p.locator('.drawer .menu-cum h3').allInnerTexts();
  ok(`hai cụm có tiêu đề Cài đặt và Tài khoản (${tieuDe.join(' / ')})`, tieuDe.length === 2 && /cài đặt/i.test(tieuDe[0]) && /tài khoản/i.test(tieuDe[1]));
  const caiDat = await p.locator('.drawer .menu-cum').nth(0).locator('.drawer-item').allInnerTexts();
  ok(`cụm Cài đặt có đúng 5 mục hiện tại (${caiDat.length})`, caiDat.length === 5 && /Nhà/.test(caiDat[0]) && /Thiết bị ảo/.test(caiDat[4]));
  const taiKhoan = (await p.locator('.drawer .menu-cum').nth(1).innerText()).replace(/\s+/g, ' ');
  ok('cụm Tài khoản: Đổi mật khẩu · Ngôn ngữ · Cỡ chữ · Giao diện · Thông báo',
    ['Đổi mật khẩu', 'Ngôn ngữ', 'Cỡ chữ', 'Giao diện', 'Thông báo'].every(x => taiKhoan.includes(x)));
  ok('không còn mục Kiểu chữ', !/Kiểu chữ|Kiểu và kích thước/.test(taiKhoan));
  const dong = p.locator('.drawer .menu-dong-chon');
  ok('Ngôn ngữ · Cỡ chữ · Giao diện là ba dòng CÙNG kiểu (nhãn + giá trị + mũi tên, mở popup)',
    await dong.count() === 3 && await dong.locator('.menu-gia-tri').count() === 3 && await dong.locator('.menu-mui').count() === 3
    && (await dong.evaluateAll(ns => ns.every(n => n.getAttribute('aria-haspopup') === 'dialog'))));
  ok('cụm 4: tên app và phiên bản', /Livotec Home · Phiên bản \d/.test(await p.locator('.drawer-foot').innerText()));
  const cuoi = await p.locator('.drawer > *').last().evaluate(n => n.innerText.trim());
  ok(`nút Đăng xuất nằm cuối cùng ("${cuoi}")`, cuoi === 'Đăng xuất');
  const thuGon = p.locator('.drawer .menu-thu-gon');
  const hop = await thuGon.boundingBox(); const khung = await p.locator('.drawer').boundingBox();
  ok('nút thu gọn ở góc phải trên của menu', hop && hop.x + hop.width > khung.x + khung.width - 20 && hop.y < khung.y + 40);

  /* ---------- vùng chạm ---------- */
  const nho = await p.locator('.drawer button, .drawer select').evaluateAll(ns => ns.map(n => ({ k: n.className, r: n.getBoundingClientRect() }))
    .filter(x => x.r.width > 0 && (x.r.width < 44 || x.r.height < 44)).map(x => `${x.k} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`));
  ok(`mọi phần tử bấm được trong menu ≥44px (${nho.join(', ') || 'không có cái nào nhỏ'})`, nho.length === 0);
  ok('menu không tràn ngang', await p.locator('.drawer').evaluate(n => n.scrollWidth <= n.clientWidth));

  /* ---------- ngôn ngữ: popup dựng từ langs, đổi là chữ đổi ngay ---------- */
  const moDong = async ten => { await p.locator('.drawer .menu-dong-chon', { hasText: ten }).click(); await cho(300); };
  const chon = async ten => { await p.locator('.chon-ds .radio-list-row', { hasText: ten }).click(); await cho(400); };
  await moDong('Ngôn ngữ');
  const dsLang = await p.locator('.chon-ds .radio-list-row').allInnerTexts();
  ok(`popup Ngôn ngữ có ${dsLang.length} mục, mỗi mục có cờ, đánh dấu mục đang chọn`, dsLang.length >= 2 && dsLang.every(x => /^\S+ \S/.test(x.trim()))
    && /Tiếng Việt/.test(await p.locator('.chon-ds .radio-list-row[aria-pressed="true"]').innerText()));
  await chon('English');
  ok('chọn English → popup đóng, về menu, chữ đổi ngay', await p.locator('.chon-ds').count() === 0 && /settings/i.test(await p.locator('.drawer .menu-cum h3').first().innerText()));
  await p.locator('.drawer .menu-dong-chon').first().click(); await cho(300); await chon('Tiếng Việt');

  /* ---------- giao diện ---------- */
  await moDong('Giao diện');
  ok('popup Giao diện: Sáng · Tối · Theo hệ thống', (await p.locator('.chon-ds .radio-list-row').allInnerTexts()).map(x => x.trim()).join('|') === 'Sáng|Tối|Theo hệ thống');
  await chon('Tối');
  const nenToi = await p.locator('.drawer').evaluate(n => getComputedStyle(n).backgroundColor);
  ok(`chọn Tối → <html data-giao-dien="toi">, menu nền tối (${nenToi})`, (await html(p)).giaoDien === 'toi' && nenToi !== 'rgb(255, 255, 255)');
  ok('dòng Giao diện hiện giá trị "Tối"', /Tối/.test(await p.locator('.drawer .menu-dong-chon', { hasText: 'Giao diện' }).locator('.menu-gia-tri').innerText()));
  await p.reload({ waitUntil: 'networkidle' }); await cho(1500);
  ok('tải lại trang → vẫn giữ giao diện tối', (await html(p)).giaoDien === 'toi');
  await moMenu(p);
  await moDong('Giao diện'); await chon('Theo hệ thống');
  await p.emulateMedia({ colorScheme: 'dark' }); await cho(200);
  const theoToi = (await html(p)).giaoDien;
  await p.emulateMedia({ colorScheme: 'light' }); await cho(200);
  ok(`Theo hệ thống: máy tối → tối (${theoToi}), máy sáng → sáng (${(await html(p)).giaoDien})`, theoToi === 'toi' && (await html(p)).giaoDien === 'sang');
  await moDong('Giao diện'); await chon('Sáng');

  /* ---------- cỡ chữ ---------- */
  await moDong('Cỡ chữ');
  ok('popup Cỡ chữ: Vừa · Lớn · Rất lớn, có dòng xem trước, không có kiểu chữ',
    (await p.locator('.chon-ds .radio-list-row').allInnerTexts()).map(x => x.trim()).join('|') === 'Vừa|Lớn|Rất lớn'
    && await p.locator('.chu-xem-truoc').count() === 1 && !/Kiểu chữ/.test(await p.locator('.modal-sheet').innerText()));
  await chon('Rất lớn');
  ok('chọn Rất lớn → gắn lên <html>, về menu', (await html(p)).coChu === 'ratLon' && !('kieuChu' in await html(p)) && await p.locator('.drawer').count() === 1);
  const vua = await p.evaluate(() => { const r = document.querySelector('.phone').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth; });
  ok('chữ Rất lớn: khung máy vẫn vừa màn hình, không tràn ngang', vua);
  ok('dòng Cỡ chữ hiện giá trị "Rất lớn"', /Rất lớn/.test(await p.locator('.drawer .menu-dong-chon', { hasText: 'Cỡ chữ' }).locator('.menu-gia-tri').innerText()));

  /* ---------- thông báo: tắt thì bỏ chấm đỏ trên chuông ---------- */
  const nutTB = p.locator('.drawer-item[role="switch"]');
  ok('công tắc thông báo mặc định BẬT', await nutTB.getAttribute('aria-checked') === 'true');
  await p.locator('.modal-scrim').first().click({ position: { x: 10, y: 10 } }); await cho(300);
  const coChamTruoc = await p.locator('.top-actions .dot').count();
  await moMenu(p);
  await nutTB.click(); await cho(200);
  ok('bấm → TẮT', await nutTB.getAttribute('aria-checked') === 'false');
  await p.locator('.modal-scrim').first().click({ position: { x: 10, y: 10 } }); await cho(300);
  ok(`tắt thông báo → chuông không còn chấm đỏ (trước: ${coChamTruoc})`, coChamTruoc === 1 && await p.locator('.top-actions .dot').count() === 0);

  /* ---------- đổi mật khẩu: chặn tại chỗ, rồi báo chờ bật ---------- */
  await moMenu(p);
  await p.locator('.drawer-item', { hasText: 'Đổi mật khẩu' }).click(); await cho(300);
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

  /* ---------- nút thu gọn, đăng xuất ---------- */
  await p.locator('.modal-close').click(); await cho(300);
  await p.locator('.drawer .menu-thu-gon').click(); await cho(300);
  ok('bấm nút thu gọn → menu đóng', await p.locator('.drawer').count() === 0);
  await moMenu(p);
  await p.locator('.drawer .menu-dang-xuat').click(); await cho(800);
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
