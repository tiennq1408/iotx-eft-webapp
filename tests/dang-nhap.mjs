import { GOC, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Màn đăng nhập dựng theo mẫu docs/mau/login.html — xem docs/viec-man-dang-nhap.md.
 *
 * Nhóm này chạy chế độ mock (không có máy chủ). "Câu trả lời của máy chủ" cho `/i18n` và
 * `/tenant/theme` được gieo vào cache localStorage đúng chỗ app đọc bản đã giữ. Lỗi 401 của
 * máy chủ đo ở `dang-nhap-api.mjs` (nhóm api), vì đăng nhập mock không gọi mạng.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const b = await chromium.launch({ executablePath: CHROMIUM });
const cho = ms => new Promise(r => setTimeout(r, ms));
const KHOA = 'livotec-iotx-cache-v2';

async function mo(cache) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  if (cache) await ctx.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KHOA, cache]);
  const p = await ctx.newPage();
  const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 140)));
  let goiMang = 0; p.on('request', r => { if (/\/v1\//.test(r.url())) goiMang++; });
  await p.goto(GOC, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await p.locator('button.login-btn').waitFor({ timeout: 8000 });
  return { ctx, p, loi, mang: () => goiMang };
}
const errCua = (p, id) => p.locator(`#${id}-err`);

try {
  /* ---------- 1. Đủ thành phần ---------- */
  const { ctx, p, loi, mang } = await mo({ i18n: { vi: { boChu: { lang: 'vi', langs: ['en', 'th', 'vi'], strings: {} } } } });
  ok('topbar: có logo và ô chọn ngôn ngữ', await p.locator('.dn-topbar .login-wordmark').count() === 1 && await p.locator('.dn-topbar .login-lang select').count() === 1);
  ok('có h1 và dòng dẫn', await p.locator('.dn-khung h1').count() === 1 && await p.locator('.dn-khung .dn-lead').count() === 1);
  ok('hai ô có NHÃN riêng (label for)', await p.locator('label[for="dn-id"]').count() === 1 && await p.locator('label[for="dn-pw"]').count() === 1);
  ok('có nút con mắt', await p.locator('.dn-eye').count() === 1);
  ok('hàng [ghi nhớ | quên mật khẩu]', await p.locator('.dn-row .dn-check input[type=checkbox]').count() === 1 && /Quên mật khẩu/.test(await p.locator('.dn-row .dn-link').innerText()));
  ok('nút Đăng nhập và dòng chân', await p.locator('.dn-khung .login-btn').count() === 1 && /Đăng ký ngay/.test(await p.locator('.dn-foot').innerText()));

  /* ---------- 2. Con mắt ---------- */
  const truoc = [await p.locator('#dn-pw').getAttribute('type'), await p.locator('.dn-eye').getAttribute('aria-label')];
  await p.locator('.dn-eye').click(); await cho(150);
  const sau = [await p.locator('#dn-pw').getAttribute('type'), await p.locator('.dn-eye').getAttribute('aria-label')];
  ok(`con mắt: type ${truoc[0]} → ${sau[0]}, nhãn "${truoc[1]}" → "${sau[1]}"`, truoc[0] === 'password' && sau[0] === 'text' && truoc[1] !== sau[1]);
  await p.locator('.dn-eye').click(); await cho(100);

  /* ---------- 3. Lỗi dưới đúng ô, gõ lại thì mất ---------- */
  await p.locator('.dn-khung .login-btn').click(); await cho(200);
  ok('bỏ trống → .err dưới ô định danh, ô có aria-invalid', await errCua(p, 'dn-id').count() === 1 && (await p.locator('#dn-id').getAttribute('aria-invalid')) === 'true');
  ok('…và dưới ô mật khẩu', await errCua(p, 'dn-pw').count() === 1);
  await p.locator('#dn-id').fill('a');
  ok('gõ vào ô thì lỗi của CHÍNH ô đó biến mất', await errCua(p, 'dn-id').count() === 0 && await errCua(p, 'dn-pw').count() === 1);

  /* ---------- 6. Không có "lần thử" ---------- */
  ok('không phần tử nào chứa chữ "lần thử"', !/lần thử/i.test(await p.locator('.login-screen').innerText()));

  /* ---------- 7. Ô định danh: "Email hoặc SĐT", không placeholder (yêu cầu 08/10) ---------- */
  ok('nhãn ô định danh là "Email hoặc SĐT"', (await p.locator('label[for="dn-id"]').innerText()).trim() === 'Email hoặc SĐT');
  ok('ô định danh không có placeholder', !(await p.locator('#dn-id').getAttribute('placeholder')));
  ok('nhãn mật khẩu là "Mật khẩu (≥ 8 ký tự)"', (await p.locator('label[for="dn-pw"]').innerText()).trim() === 'Mật khẩu (≥ 8 ký tự)');
  await p.locator('#dn-id').fill('khong-phai-email'); await p.locator('#dn-pw').fill('matkhau1');
  const mangTruoc = mang();
  await p.locator('.dn-khung .login-btn').click(); await cho(300);
  ok('không phải email cũng không phải SĐT → chặn tại chỗ, không gửi', await errCua(p, 'dn-id').count() === 1 && mang() === mangTruoc && await p.locator('.top-bar').count() === 0);
  await p.locator('#dn-id').fill('0912345678');
  ok('gõ số điện thoại → hết lỗi định dạng', await errCua(p, 'dn-id').count() === 0);

  /* ---------- 8. Quên mật khẩu chưa có cửa ---------- */
  await p.locator('.dn-row .dn-link').click(); await cho(300);
  ok('sang màn Quên mật khẩu (state, không đổi hash)', await p.locator('#qm-title').count() === 1 && !new URL(p.url()).hash);
  await p.locator('#qm-id').fill('ai@do.vn');
  await p.locator('.dn-khung .login-btn').click(); await cho(400);
  ok('Gửi mã khi chưa có cửa → .alert báo đang chờ bật', /chờ bật/.test(await p.locator('.dn-alert').innerText()));
  ok('…và KHÔNG sang bước "Đã gửi mã"', await p.locator('#qm-id').count() === 1 && !/Đã gửi mã/.test(await p.locator('.dn-khung').innerText()));
  await p.locator('.dn-back').click(); await cho(300);

  /* ---------- 9, 10, 4. Đăng ký ---------- */
  await p.locator('.dn-foot .dn-link').click(); await cho(300);
  await p.locator('#dk-ten').fill('Người Thử');
  await p.locator('#dk-id').fill('thu@test.vn');
  await p.locator('#dk-pw').fill('matkhau1');
  await p.locator('#dk-pw2').fill('matkhau2');
  await p.locator('.dn-check.top input').check();
  await p.locator('.dn-khung .login-btn').click(); await cho(300);
  ok('hai mật khẩu khác nhau → báo tại chỗ', await errCua(p, 'dk-pw2').count() === 1 && await p.locator('.top-bar').count() === 0);
  await p.locator('#dk-pw2').fill('matkhau1');
  await p.locator('.dn-check.top input').uncheck();
  await p.locator('.dn-khung .login-btn').click(); await cho(300);
  ok('chưa tích điều khoản → không gửi', await errCua(p, 'dk-dong-y').count() === 1 && await p.locator('.top-bar').count() === 0);
  await p.locator('.dn-check.top input').check();
  await p.locator('#dk-pw').fill('abc1234'); await p.locator('#dk-pw2').fill('abc1234');
  const mangDk = mang();
  await p.locator('.dn-khung .login-btn').click(); await cho(300);
  ok('mật khẩu 7 ký tự → chặn tại chỗ, không gửi request', await errCua(p, 'dk-pw').count() === 1 && mang() === mangDk && await p.locator('.top-bar').count() === 0);
  ok('gợi ý mật khẩu đúng chính sách thật ("Tối thiểu 8 ký tự.")', (await p.locator('.dn-hint').innerText()).trim() === 'Tối thiểu 8 ký tự.');
  ok('Điều khoản / Chính sách không phải liên kết chết', await p.locator('.dn-check.top a').count() === 0);

  /* ---------- 12. Vùng chạm ---------- */
  const nho = await p.locator('.login-screen button, .login-screen input:not([type=checkbox]), .login-screen select, .login-screen .dn-check').evaluateAll(
    ns => ns.map(n => ({ k: n.className || n.id || n.tagName, r: n.getBoundingClientRect() })).filter(x => x.r.height < 44 || x.r.width < 44).map(x => `${x.k} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`));
  ok(`mọi phần tử bấm được ≥44px (${nho.join(', ') || 'không có cái nào nhỏ'})`, nho.length === 0);
  const cao = await p.evaluate(() => ['.dn-input', '.dn-input-wrap', '.dn-khung .login-btn'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().height)));
  ok(`ô nhập và nút cao 52px (${cao.join('/')})`, cao.every(h => h === 52));
  ok('không tràn ngang ở 390px', await p.locator('.login-content').evaluate(n => n.scrollWidth <= n.clientWidth));

  /* ---------- 11. Ngôn ngữ ---------- */
  await p.locator('.dn-back').click(); await cho(300);
  const muc = await p.locator('.login-lang select option').evaluateAll(os => os.map(o => o.value));
  ok(`số mục ngôn ngữ bằng langs máy chủ trả (${muc.join(',')})`, muc.join(',') === 'en,th,vi');
  await p.locator('.login-lang select').selectOption('en'); await cho(400);
  ok('đổi sang en → chữ đổi ngay, chưa cần đăng nhập', (await p.locator('.dn-khung h1').innerText()) === 'Sign in' && await p.locator('.top-bar').count() === 0);
  await p.locator('.login-lang select').selectOption('vi'); await cho(300);

  /* ---------- vào được bằng email hợp lệ ---------- */
  await p.locator('#dn-id').fill('demo@demo.vn'); await p.locator('#dn-pw').fill('demo');
  await p.locator('.dn-khung .login-btn').click(); await cho(900);
  ok('email hợp lệ + mật khẩu → vào app', await p.locator('.top-bar').count() === 1);
  ok(`không lỗi JS (${loi.length})`, loi.length === 0);
  await ctx.close();
} catch (e) {
  R.push(`FAIL  dừng giữa chừng: ${String(e).split('\n')[0].slice(0, 160)}`);
} finally {
  console.log(R.join('\n'));
  console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
  await b.close();
}
