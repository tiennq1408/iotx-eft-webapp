import { GOC, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';

/**
 * Chữ MÁY CHỦ là nguồn chính, như web.dev (21/10/2026): hàm `t` tra `/v1/i18n` trước (theo khoá
 * máy chủ tương ứng trong `lib/ui/khoaMayChu.ts`, rồi theo chính tên khoá), chỉ khi máy chủ không
 * có câu đó mới dùng bảng chữ trong mã.
 *
 * Bộ chữ là bản chụp `/v1/i18n?lang=vi|en` của DEV ngày 21/10/2026 (`du-lieu/i18n-dev.json`),
 * bơm vào app qua page.route — máy chủ giả chỉ có vài khoá.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const cho = ms => new Promise(r => setTimeout(r, ms));
const DEV = JSON.parse(fs.readFileSync(new URL('./du-lieu/i18n-dev.json', import.meta.url), 'utf8'));

const b = await chromium.launch({ executablePath: CHROMIUM });
const loi = [];

/** `sua(lang, strings)`: chỉnh bộ chữ trước khi app nhận — giả cảnh sửa chữ trên sadmin. */
async function phien(sua = (_l, s) => s) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => loi.push(String(e).slice(0, 160)));
  await p.route('**/v1/i18n*', r => {
    const lang = new URL(r.request().url()).searchParams.get('lang') === 'vi' ? 'vi' : 'en';
    const j = DEV[lang];
    r.fulfill({ status: 200, json: { ...j, strings: sua(lang, { ...j.strings }) } });
  });
  await p.goto(GOC, { waitUntil: 'networkidle' });
  return { ctx, p };
}
const vaoApp = async p => {
  await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('x');
  await p.locator('button.login-btn').click(); await cho(2000);
};
const nhanNav = p => p.locator('.bn-item span:not(.bn-icon-wrap)').allInnerTexts();

/* ---- Tiếng Việt: chữ máy chủ thắng, kể cả khoá local KHÁC TÊN (qua KHOA_MAY_CHU) ---- */
{
  const { ctx, p } = await phien((lang, s) => (lang === 'vi' ? { ...s, 'home.explore': 'Khám phá (sadmin sửa)', 'login.signIn': 'Vào ứng dụng' } : s));
  ok(`vi: nút đăng nhập lấy chữ máy chủ login.signIn ("${(await p.locator('button.login-btn').innerText()).trim()}")`,
    (await p.locator('button.login-btn').innerText()).trim() === 'Vào ứng dụng');
  await vaoApp(p);
  const nav = await nhanNav(p);
  ok(`vi: sửa chữ trên máy chủ là app đổi theo — nav "${nav.join(' · ')}"`, nav.includes('Khám phá (sadmin sửa)'));
  await ctx.close();
}

/* ---- Tiếng Anh: chữ máy chủ thắng chữ trong mã; máy chủ chưa có câu thì dùng bảng trong mã ---- */
{
  const { ctx, p } = await phien();
  await p.locator('.login-lang select').selectOption('en'); await cho(800);
  ok(`en: tiêu đề màn đăng nhập theo máy chủ ("${await p.locator('.dn-khung h1').innerText()}")`, (await p.locator('.dn-khung h1').innerText()) === DEV.en.strings['login.signIn']);
  await vaoApp(p);
  const nav = await nhanNav(p);
  // home.explore (máy chủ) = "Explore", bảng trong mã là "Discover" → phải ra "Explore".
  ok(`en: "Khám phá" lấy máy chủ home.explore = "${DEV.en.strings['home.explore']}" chứ không phải "Discover" (${nav.join(' · ')})`,
    nav.includes(DEV.en.strings['home.explore']) && !nav.includes('Discover'));
  // nav_devices KHÔNG trỏ sang máy chủ (common.device tiếng Anh là "device" chữ thường) → bảng trong mã.
  ok('en: khoá không có câu tương ứng trên máy chủ → dùng bảng trong mã ("Devices")', nav.includes('Devices'));
  ok('không hiện khoá kỹ thuật nào trên thanh dưới', nav.every(x => !/^[a-z]+\.[A-Za-z]/.test(x)));
  await ctx.close();
}

/* ---- Danh sách ngôn ngữ luôn có en, như web.dev ---- */
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.route('**/v1/i18n*', r => r.fulfill({ status: 200, json: { lang: 'vi', langs: ['vi', 'th'], strings: {} } }));
  await p.goto(GOC, { waitUntil: 'networkidle' });
  const ds = await p.locator('.login-lang select option').evaluateAll(os => os.map(o => o.value));
  ok(`máy chủ chỉ trả langs [vi, th] → ô chọn vẫn có en (${ds.join(',')})`, ds.includes('en') && ds.includes('vi') && ds.includes('th'));
  await ctx.close();
}

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
