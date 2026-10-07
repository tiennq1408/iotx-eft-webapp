import { GOC, NHAT_KY, anh, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';

/**
 * Lưới `ui.boCuc`: catalog khai ô nào ở cột/hàng nào, rộng mấy ô, vẽ bằng control gì.
 * Bài này kiểm rằng app đặt ĐÚNG chỗ catalog nói, chứ không phải "có vẽ ra cái gì đó".
 *
 * Hai sản phẩm thật từ DEV:
 *   ac_1        — dial01 3×3 ở góc trái, power01 dọc cột 4, ba hàng chip có `gtIco`, skin sunset
 *   fan_sbi314  — readout01 trên cùng, dial01, power01 ngang, chip 2/hàng, hai công tắc
 *                 nửa–nửa ở hàng 8, step01 dưới cùng
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
try { fs.unlinkSync(NHAT_KY); } catch { /* chưa có */ }

const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 160)));

await p.goto(GOC, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await p.getByPlaceholder(/Tên đăng nhập/).fill('p@p');
await p.getByPlaceholder(/Mật khẩu/).fill('x');
await p.locator('button.login-btn').click(); await p.waitForTimeout(2200);
await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await p.waitForTimeout(900);

async function mo(ten) {
  await p.locator('.device-card').filter({ hasText: ten }).first().locator('.card-hit').click();
  await p.waitForTimeout(1000);
}
const dong = async () => { await p.locator('.devback').click(); await p.waitForTimeout(600); };

/** Vị trí thật trên lưới, đọc từ CSS đã tính — không tin thuộc tính mình tự đặt. */
const oCua = key => p.locator(`.bc-tile[data-k="${key}"]`).evaluate(n => {
  const s = getComputedStyle(n), r = n.getBoundingClientRect();
  return { cot: s.gridColumnStart + '/' + s.gridColumnEnd, hang: s.gridRowStart + '/' + s.gridRowEnd, w: Math.round(r.width), h: Math.round(r.height) };
});

/* ---------------- ac_1: Quạt mới ---------------- */
await mo('Quạt mới');
ok('ac_1 dựng lưới (không rơi về khuôn mặc định)', await p.locator('.bc-grid').count() === 1);
ok('ac_1 vẽ đủ 5 ô catalog khai', await p.locator('.bc-tile').count() === 5);

const kieu = await p.locator('.bc-grid').evaluate(n => getComputedStyle(n).gridTemplateColumns.split(' ').length);
ok(`ac_1 chia đúng 4 cột (${kieu})`, kieu === 4);

const dial = await oCua('ac_temp_setting');
ok(`ac_temp_setting ở cột 1 rộng 3 (${dial.cot})`, dial.cot === '1/4');
ok(`ac_temp_setting cao 3 hàng kể cả khe (${dial.h}px ≈ 3×64+2×8=208)`, Math.abs(dial.h - 208) <= 4);
ok('ac_temp_setting vẽ bằng dial01', await p.locator('.bc-tile[data-k="ac_temp_setting"] svg').count() === 1);
ok('dial hiện đúng giá trị 24', /\b24\b/.test(await p.locator('.bc-tile[data-k="ac_temp_setting"]').innerText() + await p.locator('.bc-tile[data-k="ac_temp_setting"] svg').innerHTML()));

const pwr = await oCua('ac_power_status');
ok(`ac_power_status ở cột 4 rộng 1 (${pwr.cot})`, pwr.cot === '4/5');
ok('ac_power_status vẽ bằng power01', await p.locator('.bc-tile[data-k="ac_power_status"] .bc-pwr').count() === 1);
ok('power01 tự mang nhãn (không có nhãn trên)', await p.locator('.bc-tile[data-k="ac_power_status"] .bc-pl').count() === 0);

// moiHang: catalog nói chế độ 4 chip/hàng, tốc độ 3 chip/hàng → phải khác nhau thật
const hangCua = async key => p.locator(`.bc-tile[data-k="${key}"] .bc-chip`).evaluateAll(
  ns => new Set(ns.map(n => Math.round(n.getBoundingClientRect().top))).size);
const hMode = await hangCua('ac_ope_mode'), hSpeed = await hangCua('ac_fan_speed');
ok(`ac_ope_mode (moiHang 4, 5 giá trị) xuống 2 hàng — thấy ${hMode}`, hMode === 2);
ok(`ac_fan_speed (moiHang 3, 5 giá trị) xuống 2 hàng — thấy ${hSpeed}`, hSpeed === 2);
const dauMode = await p.locator('.bc-tile[data-k="ac_ope_mode"] .bc-chip').evaluateAll(
  ns => ns.filter(n => Math.round(n.getBoundingClientRect().top) === Math.round(ns[0].getBoundingClientRect().top)).length);
ok(`ac_ope_mode hàng đầu đủ 4 chip — thấy ${dauMode}`, dauMode === 4);

ok('gtIco hiện emoji theo từng giá trị',
  (await p.locator('.bc-tile[data-k="ac_ope_mode"] .bc-chip i').allInnerTexts()).filter(x => x.trim()).length === 5);
// Chip KHÔNG có icon thì không được dựng thẻ bọc rỗng: `.bc-chip i` có min-height 18px nên
// một thẻ rỗng vẫn chiếm chỗ và đẩy nhãn tụt xuống, nhìn như chữ không căn giữa. Bản tham
// chiếu (đọc 07/10/2026) bỏ hẳn thẻ này. Đo bằng độ lệch tâm chứ không tin mắt.
ok('chip không có icon thì không có thẻ bọc rỗng',
  await p.locator('.bc-tile[data-k="ac_swing_mode"] .bc-chip i').count() === 0);
const lech = await p.locator('.bc-tile[data-k="ac_swing_mode"] .bc-chip').first().evaluate(n => {
  const c = n.getBoundingClientRect(), s = n.querySelector('span').getBoundingClientRect();
  return Math.abs((s.top + s.bottom) / 2 - (c.top + c.bottom) / 2);
});
ok(`nhãn chip căn giữa theo chiều dọc (lệch ${Math.round(lech * 10) / 10}px)`, lech <= 1);

// ac_1 mang CẢ `ui.slots`/`ui.skin` cũ lẫn `ui.boCuc` mới — lưới phải thắng, cả bố cục
// lẫn da. Catalog thật để cả hai, nên đây là chỗ dễ hồi quy nhất.
ok('boCuc thắng ui.slots (không còn khối khuôn cũ)',
  await p.locator('.ctl-hero, .ctl-hang, .ctl-more').count() === 0);
const nhan = await p.locator('.bc-chip.on').first().evaluate(n => getComputedStyle(n).backgroundColor);
ok(`boCuc.skin "sunset" thắng ui.skin "ocean" — ${nhan}`, /^rgba?\(2[0-4]\d,\s*1[0-2]\d,\s*1?\d/.test(nhan));

// chạm được và gửi đúng lệnh
const truoc = fs.existsSync(NHAT_KY) ? fs.readFileSync(NHAT_KY, 'utf8').split('\n').length : 0;
await p.locator('.bc-tile[data-k="ac_ope_mode"] .bc-chip', { hasText: 'Sưởi ấm' }).click();
await p.waitForTimeout(700);
await p.locator('.bc-tile[data-k="ac_power_status"] .bc-pwr').click();
await p.waitForTimeout(700);
await p.locator('.bc-tile[data-k="ac_temp_setting"] .bc-dialbtn').last().click();
await p.waitForTimeout(700);
const dong1 = fs.readFileSync(NHAT_KY, 'utf8').trim().split('\n').slice(truoc ? truoc - 1 : 0).map(JSON.parse);
const than = dong1.map(d => d.than).join(' ');
ok(`3 lần chạm → 3 lệnh lên máy chủ (${dong1.length})`, dong1.length === 3);
ok('chip gửi setMode với giá trị catalog', /setMode/.test(than) && /Sưởi ấm/.test(than));
ok('power01 gửi setPower', /setPower/.test(than));
ok('dial + gửi setTempTarget 25', /setTempTarget/.test(than) && /\b25\b/.test(than));
ok('mỗi lệnh một Idempotency-Key riêng', new Set(dong1.map(d => d.idem)).size === 3 && dong1.every(d => d.idem));

// 44px: mọi thứ chạm được trong lưới
const nho = await p.locator('.bc-grid button, .bc-grid .bc-chip, .bc-grid [role="button"]').evaluateAll(
  ns => ns.map(n => { const r = n.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), c: n.className }; })
         .filter(x => x.h < 44 || x.w < 44));
ok(`mọi vùng chạm ≥44px — ${nho.length ? JSON.stringify(nho.slice(0, 3)) : 'đạt'}`, nho.length === 0);

await p.screenshot({ path: anh('bocuc-ac1'), fullPage: true });
await dong();

/* ---------------- fan_sbi314: 03092026A1 ---------------- */
await mo('03092026A1');
ok('fan_sbi314 dựng lưới', await p.locator('.bc-grid').count() === 1);
ok('fan_sbi314 vẽ đủ 8 ô', await p.locator('.bc-tile').count() === 8);

const ro = await oCua('curSpeed');
ok(`curSpeed trải hết 4 cột ở trên cùng (${ro.cot}, ${ro.hang})`, ro.cot === '1/5' && ro.hang.startsWith('1/'));
ok('curSpeed null hiện "—" chứ không phải 0', (await p.locator('.bc-tile[data-k="curSpeed"]').innerText()).includes('—'));

const den = await oCua('light'), bz = await oCua('buzzer');
ok(`light ở nửa trái (${den.cot})`, den.cot === '1/3');
ok(`buzzer ở nửa phải (${bz.cot})`, bz.cot === '3/5');
ok('light và buzzer cùng một hàng', den.hang === bz.hang);
ok('cả hai là công tắc gạt', await p.locator('.bc-tile[data-k="light"] .switch, .bc-tile[data-k="buzzer"] .switch').count() === 2);
// Cùng một linh kiện với màn chủ, không phải bản dựng riêng — đây là chỗ hay trượt lại nhất.
ok('công tắc trong lưới dùng CHUNG linh kiện với màn chủ', await p.locator('.bc-tile .switch-hit > .switch').count() > 0);
ok('không còn bản công tắc riêng của lưới', await p.locator('.bc-tgl').count() === 0);
ok('công tắc trong lưới trông y hệt màn chủ', await p.evaluate(() => {
  const a = document.querySelector('.bc-tile .switch');
  const s = getComputedStyle(a), k = getComputedStyle(a, '::after');
  return [s.width, s.height, k.width, k.height].join(',') === '38px,23px,18px,18px' && k.boxShadow !== 'none';
}));
ok('công tắc phản ánh đúng trạng thái API (light bật, oscillate tắt)',
  await p.locator('.bc-tile[data-k="light"] .switch-hit[aria-checked="true"]').count() === 1 &&
  await p.locator('.bc-tile[data-k="oscillate"] .switch-hit[aria-checked="false"]').count() === 1);

ok('timerOff vẽ bằng step01 (hai nút −/+)', await p.locator('.bc-tile[data-k="timerOff"] .bc-stp button').count() === 2);
ok('fan_sbi314 không khai skin → giữ màu thương hiệu',
  !/^rgba?\(2[0-4]\d,\s*1[0-2]\d/.test(await p.locator('.bc-tile[data-k="light"] .switch').evaluate(n => getComputedStyle(n).backgroundColor)));

const truoc2 = fs.readFileSync(NHAT_KY, 'utf8').trim().split('\n').length;
await p.locator('.bc-tile[data-k="light"] .switch-hit').click(); await p.waitForTimeout(700);
await p.locator('.bc-tile[data-k="mode"] .bc-chip', { hasText: 'Ngủ' }).click(); await p.waitForTimeout(700);
const dong2 = fs.readFileSync(NHAT_KY, 'utf8').trim().split('\n').slice(truoc2).map(JSON.parse);
ok(`2 lần chạm → 2 lệnh (${dong2.length})`, dong2.length === 2);
ok('công tắc gạt gửi setLight false', /setLight/.test(dong2[0]?.than || '') && /false/.test(dong2[0]?.than || ''));
ok('chip gửi setMode sleep', /setMode/.test(dong2[1]?.than || '') && /sleep/.test(dong2[1]?.than || ''));

const nho2 = await p.locator('.bc-grid button, .bc-grid .bc-chip, .bc-grid [role="button"]').evaluateAll(
  ns => ns.map(n => n.getBoundingClientRect()).filter(r => r.height < 44 || r.width < 44).length);
ok(`mọi vùng chạm ≥44px (${nho2} nhỏ)`, nho2 === 0);
ok('không ô nào tràn ngang khỏi màn',
  await p.locator('.bc-tile').evaluateAll(ns => ns.filter(n => n.getBoundingClientRect().right > 391).length) === 0);

await p.screenshot({ path: anh('bocuc-fan'), fullPage: true });
await dong();

/* ---------------- dựng giống bản tham chiếu web.dev ----------------
   Những con số dưới đây chép thẳng từ DOM thật của https://web.dev.happibot.net (đọc
   07/10/2026, hai sản phẩm ac_1 và fan_sbi314). Nếu ai đó vẽ lại vòng xoay theo cách khác
   — dasharray, xoay cả thẻ svg, đổi bán kính — chuỗi `d` sẽ lệch và bài này bắt được. */
await mo('03092026A1');

const svg = p.locator('.bc-tile[data-v="dial01"] svg');
ok('vòng xoay dùng viewBox 120 như bản tham chiếu', await svg.getAttribute('viewBox') === '0 0 120 120');
ok('vòng xoay KHÔNG xoay cả thẻ svg (bản cũ xoay 135°)',
  await svg.evaluate(n => getComputedStyle(n).transform) === 'none');
ok('vòng xoay vẽ bằng hai cung <path>, không phải <circle> + dasharray',
  await svg.locator('path').count() === 2 && await svg.locator('circle').count() === 0);

const nen = await svg.locator('path').first().getAttribute('d');
ok(`cung nền khớp từng ký tự với web.dev (${nen})`, nen === 'M27.47 92.53A46 46 0 1 1 92.53 92.53');
ok('cung nền dày 10 như bản tham chiếu', await svg.locator('path').first().getAttribute('stroke-width') === '10');

// speed = 12 trên thang 0–12 → chạy hết vòng; cùng chuỗi với cung nền
const chay = await svg.locator('path').nth(1).getAttribute('d');
ok(`cung chạy đúng tỉ lệ 12/12 (${chay})`, chay === 'M27.47 92.53A46 46 0 1 1 92.53 92.53');

ok('số và đơn vị nằm CHUNG một dòng, không tách <small>',
  await svg.locator('text').count() === 1);
ok('ô chỉ số cũng ghép đơn vị vào cùng dòng',
  await p.locator('.bc-tile .bc-big small').count() === 0);

/* --- gtIco kiểu "@ten": tham chiếu kho icon của sadmin --- */
// Catalog DEV đã bỏ emoji, chuyển sang `@wind`, `@leaf`… App từng bỏ qua thẳng mọi giá trị
// bắt đầu bằng `@`, nên mọi nút chọn mất sạch biểu tượng trong khi web.dev vẫn có.
const anhChip = p.locator('.bc-tile[data-k="mode"] .bc-chip i img');
ok(`"@ten" đổi thành ảnh từ kho icon (${await anhChip.count()} nút)`, await anhChip.count() === 4);
ok('địa chỉ trỏ đúng /v1/icons/<ten>',
  (await anhChip.first().getAttribute('src')) === '/v1/icons/wind');
ok('mọi icon tải được thật', await anhChip.evaluateAll(
  ns => ns.every(n => n.complete && n.naturalWidth > 0)));
ok('dùng loading="lazy" như bản tham chiếu',
  (await anhChip.first().getAttribute('loading')) === 'lazy');

const sr = p.locator('.bc-tile[data-v="power01"] .bc-srow');
ok('nút nguồn nằm trong .bc-srow như bản tham chiếu', await sr.count() === 1);
ok('hàng nút nguồn căn giữa, cách nhãn 10px', await sr.evaluate(n => {
  const s = getComputedStyle(n); return s.justifyContent === 'center' && s.gap === '10px';
}));
ok('nút nguồn báo trạng thái bằng aria-pressed',
  await p.locator('.bc-tile[data-v="power01"] .bc-pwr[aria-pressed]').count() === 1);
await dong();

// Thang thấp phải ra cung ngắn — chính chuỗi web.dev in ra cho SBI314 lúc speed = 1
await mo('SBI314');
const chay2 = await p.locator('.bc-tile[data-v="dial01"] svg path').nth(1).getAttribute('d');
ok(`speed 4/12 → cung ngắn, cờ cung-lớn tắt (${chay2})`, /A46 46 0 0 1 /.test(chay2) && chay2 !== nen);
await dong();

/* ---------------- sản phẩm không khai boCuc vẫn đi đường cũ ---------------- */
await mo('fan63903');
ok('sản phẩm không có boCuc KHÔNG dựng lưới', await p.locator('.bc-grid').count() === 0);
ok('…và vẫn có control để bấm', await p.locator('.devpage button').count() > 2);

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
