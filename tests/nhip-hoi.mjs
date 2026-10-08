import { GOC, GOC_GIA, NHAT_KY, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';

/**
 * Nhịp hỏi lại trạng thái.
 *
 * Bệnh thật: app chỉ dựa vào SSE. Luồng đó không phát lại sự kiện đã lỡ, và nếu mạch
 * không nhả telemetry thì chẳng có sự kiện nào cả — màn chi tiết đang mở đứng ở ảnh cũ
 * cho tới khi người dùng đổi tab. Bản tham chiếu web.dev không dùng SSE lần nào, nó hỏi
 * lại `/bootstrap` mỗi 2,5 giây, nên luôn trông đúng.
 *
 * `/__doi` của máy chủ giả đổi dữ liệu mà KHÔNG phát SSE — đúng cảnh đó. Bài này đo cả
 * chiều ngược lại: nhịp hỏi lại không được phép đè lên nút người dùng vừa bấm, nếu không
 * nút sẽ tự bật rồi tắt và thành lỗi tệ hơn bệnh.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
try { fs.unlinkSync(NHAT_KY); } catch { /* chưa có */ }

const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 140)));

await p.goto(GOC, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await p.getByPlaceholder(/Email hoặc/).fill('p@p');
await p.getByPlaceholder(/Mật khẩu/).fill('x');
await p.locator('button.login-btn').click(); await p.waitForTimeout(2200);
await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await p.waitForTimeout(900);

const FAN = '29ff86a0-a76a-11f1-b79e-ad8fe8623469';   // 03092026A1, fan_sbi314 (đi đường lưới)
const doi = (key, value) => p.evaluate(async u => { await fetch(u); },
  `${GOC_GIA}/v1/__doi?id=${FAN}&key=${key}&value=${encodeURIComponent(value)}`);
const vong = () => p.locator('.bc-tile[data-k="speed"] svg text').textContent({ timeout: 1500 }).catch(() => '?');
const den = () => p.locator('.bc-tile[data-k="light"] .switch-hit').getAttribute('aria-checked', { timeout: 1500 }).catch(() => '?');
/** Chờ tới khi điều kiện đúng, trả về số giây đã chờ (hoặc null nếu quá hạn). */
async function doiToi(ham, han = 12000) {
  const dau = Date.now();
  while (Date.now() - dau < han) {
    if (await ham()) return Math.round((Date.now() - dau) / 100) / 10;
    await p.waitForTimeout(400);
  }
  return null;
}

// Đặt mốc trước đã. Máy chủ giả giữ dữ liệu trong bộ nhớ nên lần chạy trước còn để lại
// giá trị cũ; không đặt lại thì bài này đo nhầm và lúc xanh lúc đỏ.
for (const [k, v] of [['speed', '12'], ['light', 'true'], ['buzzer', 'true']]) await doi(k, v);

await p.locator('.device-card').filter({ hasText: '03092026A1' }).first().locator('.card-hit').click();
await p.waitForTimeout(1200);
const sanSang = await doiToi(async () => (await vong()) === '12' && (await den()) === 'true');
ok(`mở màn chi tiết và về đúng mốc sau ${sanSang}s`, sanSang !== null);
if (sanSang === null) {
  // Không về được mốc thì mọi phép sau đo trên nền sai và kết quả vô nghĩa — dừng ở đây,
  // in ra đúng một lý do thay vì một màn hình đỏ khó đọc.
  console.log(R.join('\n'));
  console.log('Không đặt được mốc ban đầu — nhịp hỏi lại nhiều khả năng đã chết.');
  console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
  await b.close(); process.exit(1);
}

/* --- 1. Dữ liệu đổi trên máy chủ, KHÔNG có SSE --- */
await doi('speed', '7');
const t1 = await doiToi(async () => (await vong()) === '7');
ok(`đổi ở nơi khác (không SSE) → màn chi tiết tự cập nhật sau ${t1}s`, t1 !== null && t1 <= 8);

await doi('light', 'false');
const t2 = await doiToi(async () => (await den()) === 'false');
ok(`công tắc cũng theo kịp sau ${t2}s`, t2 !== null && t2 <= 8);

/* --- 2. Nhịp hỏi lại KHÔNG được đè lên nút vừa bấm --- */
// Bật chế độ mạch "câm": nhận lệnh nhưng không bao giờ báo lại. Đây là cảnh xấu nhất —
// nhịp hỏi lại cứ trả về giá trị CŨ trong khi người dùng vừa bấm sang giá trị mới.
await p.evaluate(async u => { await fetch(u); }, `${GOC_GIA}/v1/__lam_ngo?bat=1`);
await p.locator('.bc-tile[data-k="buzzer"] .switch-hit').click();
const dau = await p.locator('.bc-tile[data-k="buzzer"] .switch-hit').getAttribute('aria-checked');
ok(`bấm công tắc → đổi ngay trên màn (${dau})`, dau === 'false');
let giuDuoc = true;
for (let i = 0; i < 5; i++) {
  await p.waitForTimeout(1000);
  if (await p.locator('.bc-tile[data-k="buzzer"] .switch-hit').getAttribute('aria-checked') !== dau) { giuDuoc = false; break; }
}
ok('qua 5 giây và vài nhịp hỏi lại, nút KHÔNG tự lật về', giuDuoc);

// Quá cửa sổ giữ thì máy chủ phải thắng lại — lệnh có thể đã trượt, đừng dối người dùng.
const t3 = await doiToi(async () => (await p.locator('.bc-tile[data-k="buzzer"] .switch-hit').getAttribute('aria-checked')) === 'true', 14000);
ok(`quá hạn giữ, máy chủ nói lại lời cuối sau ${t3}s`, t3 !== null);

await p.evaluate(async u => { await fetch(u); }, `${GOC_GIA}/v1/__lam_ngo?bat=0`);

/* --- 3. Lệnh vẫn phải lên tới máy chủ --- */
const ghi = fs.existsSync(NHAT_KY) ? fs.readFileSync(NHAT_KY, 'utf8').trim().split('\n').filter(Boolean) : [];
ok(`lệnh vẫn gửi lên máy chủ (${ghi.length})`, ghi.length >= 1 && /setBuzzer/.test(ghi.join(' ')));

/* --- 4. Tab chạy nền thì ngưng hỏi, đừng đốt pin --- */
await p.evaluate(() => Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }));
await p.evaluate(() => { window.__dem = 0; const F = fetch; window.fetch = function (u) { if (/\/v1\/devices/.test(String(u))) window.__dem++; return F.apply(this, arguments); }; });
await p.waitForTimeout(6000);
const demNen = await p.evaluate(() => window.__dem);
ok(`tab chạy nền: không hỏi lại lần nào trong 6 giây (${demNen})`, demNen === 0);

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
