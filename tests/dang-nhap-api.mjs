import { GOC, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Mục 5 của docs/viec-man-dang-nhap.md: lỗi MÁY CHỦ khi đăng nhập luôn vào `.alert` chung,
 * không bao giờ gắn vào ô mật khẩu — 401 (sai mật khẩu) và 404 (sai tenant) phải nói cùng
 * một câu để không lộ email nào tồn tại.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const b = await chromium.launch({ executablePath: CHROMIUM });
const cho = ms => new Promise(r => setTimeout(r, ms));

try {
  const cau = {};
  for (const ma of [401, 404]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route('**/v1/auth/login', route => route.fulfill({ status: ma, json: { message: ma === 401 ? 'unauthorized' : 'not_found' } }));
    const p = await ctx.newPage();
    await p.goto(GOC, { waitUntil: 'networkidle' });
    await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await p.locator('#dn-id').fill('ai@do.vn'); await p.locator('#dn-pw').fill('sai-mat-khau');
    await p.locator('.dn-khung .login-btn').click(); await cho(900);
    cau[ma] = await p.locator('.dn-alert').innerText().catch(() => '');
    ok(`máy chủ ${ma} → câu lỗi vào .alert chung`, cau[ma].length > 0);
    ok(`máy chủ ${ma} → KHÔNG có .err dưới ô mật khẩu, ô không bị đánh dấu sai`,
      await p.locator('#dn-pw-err').count() === 0 && (await p.locator('#dn-pw').getAttribute('aria-invalid')) !== 'true');
    ok(`máy chủ ${ma} → không có chữ "lần thử"`, !/lần thử/i.test(await p.locator('.login-screen').innerText()));
    await ctx.close();
  }
  ok(`401 và 404 nói CÙNG một câu ("${cau[401]}")`, cau[401] === cau[404]);
} catch (e) {
  R.push(`FAIL  dừng giữa chừng: ${String(e).split('\n')[0].slice(0, 160)}`);
} finally {
  console.log(R.join('\n'));
  console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
  await b.close();
}
