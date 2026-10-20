import { GOC, GOC_GIA, anh, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Đăng ký và quên mật khẩu bằng mã email (docs/viec-noi-otp-webapp.md).
 *
 * Máy chủ giả có ba cửa `/auth/otp/gui`, `/auth/otp/xac-nhan`, `/auth/dat-lai-mat-khau` với mã
 * cố định 123456, câu `message` chép đúng chữ IBS DEV. Các ca cần số lạ (hết hạn sau vài giây,
 * 429) chặn riêng `/auth/otp/gui` bằng `page.route` thay vì làm máy chủ giả phức tạp thêm.
 *
 * Hai điều tuyệt đối: câu máy chủ hiện NGUYÊN VĂN; đặt lại mật khẩu xong VỀ MÀN ĐĂNG NHẬP, không
 * tự đăng nhập (cửa đó chỉ trả {ok:true}, không có vé).
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const cho = ms => new Promise(r => setTimeout(r, ms));
const MA_SAI = 'Mã không đúng hoặc đã hết hạn — gửi lại mã mới.';
const CAU_429 = 'Bạn gửi mã quá nhanh — thử lại sau 60 giây.';

const b = await chromium.launch({ executablePath: CHROMIUM });
const loi = [];

/** Một phiên trình duyệt mới ở màn đăng nhập. `chan`: thay trả lời của `/auth/otp/gui`. */
async function phien(chan) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => loi.push(String(e).slice(0, 160)));
  if (chan) await p.route('**/v1/auth/otp/gui', r => r.fulfill(chan));
  const guiDi = [];
  p.on('request', r => { if (/\/v1\/auth\/(otp|dat-lai|register)/.test(r.url())) guiDi.push({ duong: new URL(r.url()).pathname, than: r.postDataJSON?.() ?? null }); });
  await p.goto(GOC, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  return { ctx, p, guiDi };
}
const sangQuenMatKhau = async (p, email = 'ai@do.vn') => {
  await p.locator('.dn-row .dn-link').click(); await cho(300);
  await p.locator('#qm-id').fill(email);
  await p.locator('.dn-khung .login-btn').click(); await cho(700);
};
const canhBao = p => p.locator('.dn-alert').innerText().catch(() => '');
/** Nút Xác nhận của màn nhập mã — cả đăng ký lẫn quên mật khẩu (không tự gửi khi đủ 6 số). */
const nutXacNhan = p => p.locator('.dn-khung button[type=submit].login-btn');
const nhapMa = async (p, ma) => { await p.locator('#otp-ma').fill(ma); await nutXacNhan(p).click(); await cho(900); };

/* ---- 1. Quên mật khẩu đủ ba bước → về màn đăng nhập, KHÔNG tự đăng nhập ---- */
{
  const { ctx, p, guiDi } = await phien();
  await sangQuenMatKhau(p);
  ok('quên mật khẩu: gửi mã → sang bước nhập mã', await p.locator('#otp-ma').count() === 1);
  ok('lời dẫn đọc hạn từ máy chủ (300 s → 5 phút), không cắm cứng 10 phút',
    /5 phút/.test(await p.locator('.dn-lead').innerText()) && !/10 phút/.test(await p.locator('.dn-khung').innerText()));
  ok('quên mật khẩu: có nút "Xác nhận", khoá khi chưa đủ 6 số',
    (await nutXacNhan(p).innerText()).trim() === 'Xác nhận' && await nutXacNhan(p).isDisabled());
  await nhapMa(p, '123456');
  ok('mã đúng + bấm Xác nhận → sang bước đặt mật khẩu mới', await p.locator('#qm-pw').count() === 1);
  await p.locator('#qm-pw').fill('matkhaumoi1'); await p.locator('#qm-pw2').fill('matkhaumoi1');
  await p.locator('.dn-khung .login-btn').click(); await cho(900);
  const dat = guiDi.find(x => x.duong.endsWith('/dat-lai-mat-khau'));
  ok('gửi /dat-lai-mat-khau với veTam của bước 2 và mật khẩu mới',
    Boolean(dat?.than?.veTam?.startsWith('ve-')) && dat?.than?.matKhauMoi === 'matkhaumoi1');
  ok('[1] xong → VỀ màn đăng nhập', await p.locator('#dn-title').count() === 1);
  ok('[1] …và KHÔNG tự đăng nhập (không có thanh trên của app)', await p.locator('.top-bar').count() === 0);
  ok('[1] …hiện dòng báo đã đổi mật khẩu, ô tài khoản điền sẵn',
    /Đã đổi mật khẩu/.test(await p.locator('.dn-ok').innerText().catch(() => '')) && await p.locator('#dn-id').inputValue() === 'ai@do.vn');
  await p.screenshot({ path: anh('otp-xong') });
  await ctx.close();
}

/* ---- 2. Mã sai → ở nguyên bước 2, câu máy chủ NGUYÊN VĂN ---- */
{
  const { ctx, p } = await phien();
  await sangQuenMatKhau(p);
  await nhapMa(p, '000000');
  ok('[2] mã sai → ở nguyên bước nhập mã', await p.locator('#otp-ma').count() === 1 && await p.locator('#qm-pw').count() === 0);
  ok(`[2] …hiện NGUYÊN VĂN câu máy chủ ("${await canhBao(p)}")`, (await canhBao(p)) === MA_SAI);
  await p.screenshot({ path: anh('otp-ma-sai') });
  await ctx.close();
}

/* ---- 3, 4. Dán mã kèm khoảng trắng → lọc còn 6 số. Đủ 6 số KHÔNG tự gửi, chỉ gửi khi bấm
   Xác nhận (yêu cầu 19/10/2026; đăng ký kiểm ở ca 8). ---- */
{
  const { ctx, p, guiDi } = await phien();
  await sangQuenMatKhau(p);
  // Chặn xác nhận để đọc được ô trước khi màn sang bước 3.
  let thanXacNhan = null;
  await p.route('**/v1/auth/otp/xac-nhan', async r => { thanXacNhan = r.request().postDataJSON(); await cho(1500); await r.continue(); });
  await p.locator('#otp-ma').evaluate(n => {
    const dt = new DataTransfer(); dt.setData('text/plain', ' 1 2 3 4 5 6 ');
    n.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await cho(300);
  ok(`[3] dán " 1 2 3 4 5 6 " → ô nhận "${await p.locator('#otp-ma').inputValue()}"`, await p.locator('#otp-ma').inputValue() === '123456');
  await cho(1500);
  ok('[4] quên mật khẩu: đủ 6 số mà chưa bấm → KHÔNG gửi', thanXacNhan === null && !guiDi.some(x => x.duong.endsWith('/otp/xac-nhan')));
  ok('[4] …nút Xác nhận mở khi đủ 6 số', !(await nutXacNhan(p).isDisabled()));
  await nutXacNhan(p).click(); await cho(2000);
  ok('[4] bấm Xác nhận → gửi /otp/xac-nhan đúng mã', thanXacNhan?.ma === '123456');
  await ctx.close();
}

/* ---- 5, 6. Gửi lại khoá theo guiLaiSau; hết hetHanSau thì khoá ô nhập ---- */
{
  const { ctx, p } = await phien({ status: 200, json: { ok: true, hetHanSau: 5, guiLaiSau: 2 } });
  await sangQuenMatKhau(p);
  const nut = p.locator('.dn-khung button.login-btn.secondary');
  ok(`[5] nút Gửi lại khoá lúc đầu ("${(await nut.innerText()).trim()}")`, await nut.isDisabled() && /sau \ds/.test(await nut.innerText()));
  ok(`[6] đếm ngược hết hạn dạng m:ss ("${await p.locator('#otp-han').innerText()}")`, /0:0[3-5]/.test(await p.locator('#otp-han').innerText()));
  await cho(2600);
  ok(`[5] sau guiLaiSau = 2 s → mở ("${(await nut.innerText()).trim()}")`, !(await nut.isDisabled()) && (await nut.innerText()).trim() === 'Gửi lại');
  await cho(3000);
  ok(`[6] hết hetHanSau = 5 s → ô nhập khoá ("${await p.locator('#otp-han').innerText()}")`,
    await p.locator('#otp-ma').isDisabled() && /đã hết hạn/.test(await p.locator('#otp-han').innerText()) && !(await nut.isDisabled()));
  await p.screenshot({ path: anh('otp-het-han') });
  // Vùng chạm và cỡ chữ ô mã
  const kt = await p.evaluate(() => {
    const o = document.querySelector('#otp-ma'), n = document.querySelector('.dn-khung button.login-btn.secondary');
    return { co: parseFloat(getComputedStyle(o).fontSize), oCao: o.getBoundingClientRect().height, nutCao: n.getBoundingClientRect().height };
  });
  ok(`ô mã chữ ≥16px (${kt.co}), ô và nút cao ≥44px (${Math.round(kt.oCao)}/${Math.round(kt.nutCao)})`, kt.co >= 16 && kt.oCao >= 44 && kt.nutCao >= 44);
  await ctx.close();
}

/* ---- 7. Máy chủ trả 429 → câu NGUYÊN VĂN, không nhảy bước ---- */
{
  const { ctx, p } = await phien({ status: 429, json: { message: CAU_429 } });
  await sangQuenMatKhau(p);
  ok(`[7] 429 → hiện nguyên văn ("${await canhBao(p)}")`, (await canhBao(p)) === CAU_429);
  ok('[7] …và KHÔNG nhảy sang bước nhập mã', await p.locator('#qm-id').count() === 1 && await p.locator('#otp-ma').count() === 0);
  await ctx.close();
}

/* ---- 8. Đăng ký: form → mã → vào thẳng app, không gõ lại mật khẩu ---- */
const dangKy = async (p, email) => {
  await p.locator('.dn-foot .dn-link').click(); await cho(300);
  await p.locator('#dk-ten').fill('Người Thử'); await p.locator('#dk-id').fill(email);
  await p.locator('#dk-pw').fill('matkhau123'); await p.locator('#dk-pw2').fill('matkhau123');
  await p.locator('.dn-khung .login-btn').click(); await cho(700);
};
{
  const { ctx, p, guiDi } = await phien();
  await dangKy(p, 'moi@test.vn');
  ok('[8] đăng ký: form hợp lệ → gửi mã TRƯỚC, chưa tạo tài khoản',
    await p.locator('#otp-ma').count() === 1 && !guiDi.some(x => x.duong.endsWith('/register'))
    && guiDi.find(x => x.duong.endsWith('/otp/gui'))?.than?.viec === 'dangKy');
  ok('[8] đăng ký: màn mã có nút Xác nhận, khoá khi chưa đủ 6 số',
    (await nutXacNhan(p).innerText()).trim() === 'Xác nhận' && await nutXacNhan(p).isDisabled());
  await p.locator('#otp-ma').fill('123456'); await cho(1500);
  ok('[8] …đủ 6 số mà chưa bấm → KHÔNG gửi, chưa tạo tài khoản',
    !guiDi.some(x => x.duong.endsWith('/otp/xac-nhan') || x.duong.endsWith('/register')) && await p.locator('#otp-ma').count() === 1);
  await nutXacNhan(p).click(); await cho(1500);
  const dk = await (await fetch(`${GOC_GIA}/v1/__dang_ky_cuoi`)).json();
  ok('[8] mã đúng → register mang veTam và đúng mật khẩu đã gõ ở bước 1 (không gõ lại)',
    String(dk.veTam || '').startsWith('ve-') && dk.password === 'matkhau123' && dk.email === 'moi@test.vn' && dk.fullName === 'Người Thử');
  ok('[8] …và vào thẳng app', await p.locator('.top-bar').count() === 1);
  await ctx.close();
}

/* ---- 9. Đăng ký: mã đúng nhưng register lỗi → QUAY VỀ bước 1 kèm câu máy chủ ---- */
{
  const { ctx, p, guiDi } = await phien();
  await dangKy(p, 'x-da-dang-ky@test.vn');
  await nhapMa(p, '123456'); await cho(600);
  ok('[9] register 409 → quay về bước 1 (form đăng ký), không kẹt ở màn mã',
    await p.locator('#dk-ten').count() === 1 && await p.locator('#otp-ma').count() === 0);
  ok(`[9] …kèm câu máy chủ nguyên văn ("${await canhBao(p)}")`, (await canhBao(p)) === 'email đã đăng ký');
  ok('[9] …form vẫn giữ những gì đã gõ', await p.locator('#dk-id').inputValue() === 'x-da-dang-ky@test.vn');
  ok('[9] …không vào app', await p.locator('.top-bar').count() === 0);

  // 409 → nút "Đặt lại mật khẩu": sang quên mật khẩu, email điền sẵn, mã đặt lại gửi luôn.
  const nutDatLai = p.locator('.dn-khung button.login-btn.secondary', { hasText: 'Đặt lại mật khẩu' });
  ok('[10] email đã có tài khoản → có nút "Đặt lại mật khẩu cho email này"', await nutDatLai.count() === 1);
  await nutDatLai.click(); await cho(900);
  const guiDatLai = guiDi.filter(x => x.duong.endsWith('/otp/gui')).at(-1)?.than;
  ok(`[10] bấm → gửi mã quên mật khẩu cho đúng email (${guiDatLai?.viec} · ${guiDatLai?.dinhDanh})`,
    guiDatLai?.viec === 'quenMatKhau' && guiDatLai?.dinhDanh === 'x-da-dang-ky@test.vn');
  ok('[10] …và vào thẳng bước nhập mã của quên mật khẩu, lời dẫn nhắc đúng email',
    await p.locator('#qm-title').count() === 1 && await p.locator('#otp-ma').count() === 1
    && /x-da-dang-ky@test\.vn/.test(await p.locator('.dn-lead').innerText()));
  await nhapMa(p, '123456');
  ok('[10] …mã đúng → sang đặt mật khẩu mới như luồng quên mật khẩu thường', await p.locator('#qm-pw').count() === 1);
  await ctx.close();
}

/* ---- Lỗi register KHÁC 409 (vd. 500) → vẫn quay về bước 1 nhưng KHÔNG mời đặt lại mật khẩu ---- */
{
  const { ctx, p } = await phien();
  await p.route('**/v1/auth/register', r => r.fulfill({ status: 500, json: { message: 'Lỗi máy chủ' } }));
  await dangKy(p, 'loi-khac@test.vn');
  await nhapMa(p, '123456'); await cho(600);
  ok('[10] register lỗi khác 409 → về bước 1, KHÔNG có nút đặt lại mật khẩu',
    await p.locator('#dk-ten').count() === 1 && await p.locator('.dn-khung button', { hasText: 'Đặt lại mật khẩu' }).count() === 0);
  await ctx.close();
}

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
