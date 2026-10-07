/**
 * Vòng đời phiên đăng nhập — đúng luật trong AGENTS.md: 401 thì làm mới token MỘT lần;
 * làm mới cũng hỏng thì xoá phiên và về màn đăng nhập. Mọi lỗi khác (mất mạng, 5xx) không
 * phải lý do để đăng xuất.
 *
 * Máy chủ giả luôn trả token hợp lệ, nên các tình huống hỏng được dựng bằng `page.route`
 * chặn ngay trong trình duyệt.
 */
import { GOC, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const b = await chromium.launch({ executablePath: CHROMIUM });
const cho = ms => new Promise(r => setTimeout(r, ms));
const laAuth = url => /\/v1\/auth\//.test(url);

async function dangNhap() {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(GOC, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await p.getByPlaceholder(/Tên đăng nhập/).fill('p@p');
  await p.getByPlaceholder(/Mật khẩu/).fill('x');
  await p.locator('button.login-btn').click();
  await p.locator('.top-bar').waitFor({ timeout: 8000 });
  return { ctx, p };
}

/** Đợi điều kiện đúng trong `ms`, hỏi mỗi 250ms. */
async function doi(dk, ms = 6000) {
  for (let i = 0; i < ms / 250; i++) { if (await dk()) return true; await cho(250); }
  return false;
}

const quayLaiTab = p => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

/* 1. Refresh hỏng → về màn đăng nhập, không kẹt ở trạng thái "đăng nhập mà không token". */
{
  const { ctx, p } = await dangNhap();
  await p.route('**/v1/**', route => {
    const url = route.request().url();
    if (url.includes('/v1/auth/refresh')) return route.fulfill({ status: 401, json: { message: 'invalid_token' } });
    if (laAuth(url)) return route.fallback();
    return route.fulfill({ status: 401, json: { message: 'unauthorized' } });
  });
  await quayLaiTab(p);
  ok('Refresh hỏng: về màn đăng nhập', await doi(async () => await p.locator('button.login-btn').count() > 0));
  ok('Refresh hỏng: token đã bị xoá', await p.evaluate(() => localStorage.getItem('livotec-iotx-session') === null));
  // Đã về màn đăng nhập thì thôi hỏi /bootstrap.
  let sau = 0;
  p.on('request', r => { if (r.url().includes('/v1/bootstrap')) sau++; });
  await cho(3000);
  ok('Refresh hỏng: không còn hỏi /bootstrap không kèm token', sau === 0);
  await ctx.close();
}

/* 2. Mất mạng lúc mở app → giữ phiên, báo lỗi, rồi tự lành khi mạng về. */
{
  const { ctx, p } = await dangNhap();
  await p.route('**/v1/bootstrap**', route => route.fulfill({ status: 503, json: { message: 'upstream_unavailable' } }));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  ok('Mất mạng khi mở: vẫn ở trong app', await doi(async () => await p.locator('.top-bar').count() > 0));
  ok('Mất mạng khi mở: không bị đá ra màn đăng nhập', await p.locator('button.login-btn').count() === 0);
  ok('Mất mạng khi mở: token vẫn còn', await p.evaluate(() => localStorage.getItem('livotec-iotx-session') !== null));
  ok('Mất mạng khi mở: có báo lỗi', await doi(async () => await p.locator('.toast-loi').count() > 0));
  await p.unroute('**/v1/bootstrap**');
  await quayLaiTab(p);
  ok('Mạng về: đồng bộ lại đủ và tắt báo lỗi', await doi(async () => await p.locator('.toast-loi').count() === 0, 8000));
  ok('Mạng về: tải được hồ sơ', await doi(async () => (await p.locator('.profile-name').first().innerText({ timeout: 300 }).catch(() => '')).includes('p')));
  await ctx.close();
}

/* 3. Nhiều request cùng gặp 401 → chỉ MỘT lần làm mới, và phiên sống tiếp. */
{
  const { ctx, p } = await dangNhap();
  let lanLamMoi = 0;
  await p.route('**/v1/**', route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('/v1/auth/refresh')) {
      lanLamMoi++;
      return route.fulfill({ status: 200, json: { accessToken: 'b', refreshToken: 'r2', tenant: 'livotec', expiresIn: 300 } });
    }
    if (!laAuth(url) && req.headers().authorization === 'Bearer a') return route.fulfill({ status: 401, json: { message: 'unauthorized' } });
    return route.fallback();
  });
  // Mở lại app với token cũ: /bootstrap và /stream cùng lúc gặp 401.
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await cho(4000);
  ok(`401 đồng thời: làm mới đúng một lần (thấy ${lanLamMoi})`, lanLamMoi === 1);
  ok('401 đồng thời: vẫn trong app', await p.locator('.top-bar').count() > 0 && await p.locator('button.login-btn').count() === 0);
  ok('401 đồng thời: dùng token mới', await p.evaluate(() => JSON.parse(localStorage.getItem('livotec-iotx-session') || '{}').accessToken === 'b'));
  await ctx.close();
}

console.log(R.join('\n'));
console.log(`\n${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
