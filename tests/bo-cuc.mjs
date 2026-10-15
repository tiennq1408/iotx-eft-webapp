import { GOC, NHAT_KY, anh, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';

/**
 * Lưới `ui.boCuc`: catalog khai ô nào ở cột/hàng nào, rộng mấy ô, vẽ bằng control gì.
 * Bài này kiểm rằng app đặt ĐÚNG chỗ catalog nói, chứ không phải "có vẽ ra cái gì đó".
 *
 * Hai sản phẩm thật từ DEV:
 *   ac_1        — catalog 15/10/2026: dial01 4×3 có ảnh nền, power01 ngang, ba khối chip, sáu
 *                 công tắc có icon cố định; skin là mã hex, kèm tám trường mới của sadmin
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
await p.locator('#dn-id').fill('p@p.vn');
await p.locator('#dn-pw').fill('x');
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
// Catalog ac_1 lấy từ DEV ngày 15/10/2026 (version 159): 12 ô, skin là MÃ MÀU `#2ea5fc`,
// giá trị enum bằng tiếng Anh (`Heat`, `Auto`…) kèm `labels` tiếng Việt.
await mo('Quạt mới');
ok('ac_1 dựng lưới (không rơi về khuôn mặc định)', await p.locator('.bc-grid').count() === 1);
ok('ac_1 vẽ đủ 12 ô catalog khai', await p.locator('.bc-tile').count() === 12);

const kieu = await p.locator('.bc-grid').evaluate(n => getComputedStyle(n).gridTemplateColumns.split(' ').length);
ok(`ac_1 chia đúng 4 cột (${kieu})`, kieu === 4);

const dial = await oCua('ac_temp_setting');
ok(`ac_temp_setting trải hết 4 cột (${dial.cot})`, dial.cot === '1/5');
ok(`ac_temp_setting cao 3 hàng kể cả khe (${dial.h}px ≈ 3×64+2×8=208)`, Math.abs(dial.h - 208) <= 4);
ok('ac_temp_setting vẽ bằng dial01', await p.locator('.bc-tile[data-k="ac_temp_setting"] svg').count() === 1);
ok('dial hiện đúng giá trị 24', /\b24\b/.test(await p.locator('.bc-tile[data-k="ac_temp_setting"]').innerText() + await p.locator('.bc-tile[data-k="ac_temp_setting"] svg').innerHTML()));

const pwr = await oCua('ac_power_status');
ok(`ac_power_status trải hết 4 cột (${pwr.cot})`, pwr.cot === '1/5');
ok('ac_power_status vẽ bằng power01', await p.locator('.bc-tile[data-k="ac_power_status"] .bc-pwr').count() === 1);
ok('power01 tự mang nhãn (không có nhãn trên)', await p.locator('.bc-tile[data-k="ac_power_status"] .bc-pl').count() === 0);

// moiHang 4 với 5 giá trị → 2 hàng, hàng đầu đủ 4
const hangCua = async key => p.locator(`.bc-tile[data-k="${key}"] .bc-chip`).evaluateAll(
  ns => new Set(ns.map(n => Math.round(n.getBoundingClientRect().top))).size);
const hMode = await hangCua('ac_ope_mode'), hSpeed = await hangCua('ac_fan_speed');
ok(`ac_ope_mode (moiHang 4, 5 giá trị) xuống 2 hàng — thấy ${hMode}`, hMode === 2);
ok(`ac_fan_speed (moiHang 4, 5 giá trị) xuống 2 hàng — thấy ${hSpeed}`, hSpeed === 2);
const dauMode = await p.locator('.bc-tile[data-k="ac_ope_mode"] .bc-chip').evaluateAll(
  ns => ns.filter(n => Math.round(n.getBoundingClientRect().top) === Math.round(ns[0].getBoundingClientRect().top)).length);
ok(`ac_ope_mode hàng đầu đủ 4 chip — thấy ${dauMode}`, dauMode === 4);

ok('gtIco "@ten" thành ảnh kho icon cho cả 5 chế độ',
  await p.locator('.bc-tile[data-k="ac_ope_mode"] .bc-chip i img').count() === 5);
// Chip KHÔNG có icon thì không được dựng thẻ bọc rỗng: `.bc-chip i` có min-height 18px nên
// một thẻ rỗng vẫn chiếm chỗ và đẩy nhãn tụt xuống. Đo bằng độ lệch tâm chứ không tin mắt.
ok('chip không có icon thì không có thẻ bọc rỗng',
  await p.locator('.bc-tile[data-k="ac_swing_mode"] .bc-chip i').count() === 0);
const lech = await p.locator('.bc-tile[data-k="ac_swing_mode"] .bc-chip').first().evaluate(n => {
  const c = n.getBoundingClientRect(), s = n.querySelector('span').getBoundingClientRect();
  return Math.abs((s.top + s.bottom) / 2 - (c.top + c.bottom) / 2);
});
ok(`nhãn chip căn giữa theo chiều dọc (lệch ${Math.round(lech * 10) / 10}px)`, lech <= 1);
ok('boCuc dựng cả màn (không còn khối khuôn cũ)',
  await p.locator('.ctl-hero, .ctl-hang, .ctl-more').count() === 0);

// chạm được và gửi đúng lệnh — giá trị gửi lên là giá trị catalog (`Heat`), không phải nhãn
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
ok('chip gửi setMode với giá trị catalog Heat', /setMode/.test(than) && /"Heat"/.test(than));
ok('power01 gửi setPower', /setPower/.test(than));
ok('dial + gửi setTempTarget 25', /setTempTarget/.test(than) && /\b25\b/.test(than));
ok('mỗi lệnh một Idempotency-Key riêng', new Set(dong1.map(d => d.idem)).size === 3 && dong1.every(d => d.idem));

// 44px: mọi thứ chạm được trong lưới
const nho = await p.locator('.bc-grid button, .bc-grid .bc-chip, .bc-grid [role="button"]').evaluateAll(
  ns => ns.map(n => { const r = n.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), c: n.className }; })
         .filter(x => x.h < 44 || x.w < 44));
ok(`mọi vùng chạm ≥44px — ${nho.length ? JSON.stringify(nho.slice(0, 3)) : 'đạt'}`, nho.length === 0);
ok('không ô nào tràn ngang khỏi màn',
  await p.locator('.bc-tile').evaluateAll(ns => ns.filter(n => n.getBoundingClientRect().right > 391).length) === 0);

await p.screenshot({ path: anh('bocuc-ac1'), fullPage: true });
await dong();

/* ---------------- ac_1: tám thứ mới của sadmin (docs/viec-bocuc-v2.md) ----------------
   Số mong đợi chép từ DOM/CSS của web.dev ngày 15/10/2026 — không tự đặt. */
await mo('Quạt mới');
const tile = k => p.locator(`.bc-tile[data-k="${k}"]`);
const bien = (k, ten) => tile(k).evaluate((n, t) => n.style.getPropertyValue(t).trim(), ten);
const RGB_SKIN = 'rgb(46, 165, 252)';   // #2ea5fc

// 1. skin là mã hex → màu nhấn của màn đúng mã đó, không rơi về mặc định
const brandMan = await tile('ac_eco_mode').evaluate(n => getComputedStyle(n).getPropertyValue('--brand').trim());
ok(`[1] skin "#2ea5fc" → --brand của màn = ${brandMan}`, brandMan === '#2ea5fc');

// 2, 3. mauCtl → class mauo + ba biến nội tuyến; hai mẫu thật là bài nghiệm thu công thức màu
const pw = { lop: await tile('ac_power_status').getAttribute('class'), b: await bien('ac_power_status', '--brand'),
  d: await bien('ac_power_status', '--brand-deep'), s: await bien('ac_power_status', '--brand-soft') };
ok(`[2] mauCtl #fb6559 → mauo, --brand ${pw.b}, --brand-deep ${pw.d}, --brand-soft ${pw.s}`,
  /\bmauo\b/.test(pw.lop) && pw.b === '#fb6559' && pw.d === '#c44f45' && pw.s === '#fee9e8');
// web.dev đo lại 15/10/2026: trong ô `mauo` chữ nhãn (`.bc-lb-chu`) màu mực, chỉ nút ⏻ đỏ.
const chuPw = await tile('ac_power_status').locator('.bc-srow .bc-lb-chu').evaluate(n => {
  const s = getComputedStyle(n); return `${s.color} ${s.fontSize}/${s.fontWeight}`; });
ok(`[2] chữ nút nguồn màu mực 20px/600 (${chuPw})`, chuPw === 'rgb(14, 43, 39) 20px/600');
const nutPw = await tile('ac_power_status').locator('.bc-pwr').evaluate(n => getComputedStyle(n).getPropertyValue('--brand').trim());
ok(`[2] nút nguồn vẫn lấy màu nhấn đỏ của mauCtl (${nutPw})`, nutPw === '#fb6559');
const tm = { lop: await tile('ac_temp_setting').getAttribute('class'), b: await bien('ac_temp_setting', '--brand'),
  d: await bien('ac_temp_setting', '--brand-deep'), s: await bien('ac_temp_setting', '--brand-soft') };
ok(`[3] mauCtl #ffffff → --brand-deep ${tm.d}, --brand-soft ${tm.s}`,
  /\bmauo\b/.test(tm.lop) && tm.b === '#ffffff' && tm.d === '#c7c7c7' && tm.s === '#ffffff');

// 4. vien: "skin" → viền 2px màu skin
const VIEN = ['ac_eco_mode', 'ac_ifeel_mode', 'ac_is_iclean', 'ac_is_sleep_mode', 'ac_mil_mode', 'ac_mute_mode'];
const vien = await Promise.all(VIEN.map(k => tile(k).evaluate(n => {
  const s = getComputedStyle(n); return { lop: n.classList.contains('vien'), w: s.borderTopWidth, c: s.borderTopColor };
})));
ok(`[4] sáu ô vien:"skin" có class vien, viền 2px ${RGB_SKIN} (${JSON.stringify(vien[0])})`,
  vien.every(v => v.lop && v.w === '2px' && v.c === RGB_SKIN));
ok('[4] ô không khai vien giữ viền 1px', await tile('ac_room_temp').evaluate(n => getComputedStyle(n).borderTopWidth) === '1px');

// 5. vtIco: "duoi" → class vt-duoi, chip column-reverse
const mode = tile('ac_ope_mode');
const khoiMode = await mode.locator('.bc-chips').getAttribute('class');
const huong = await mode.locator('.bc-chip', { hasText: 'Làm lạnh' }).evaluate(n => getComputedStyle(n).flexDirection);
ok(`[5] vtIco "duoi" → khối có vt-duoi, chip ${huong}`, /\bvt-duoi\b/.test(khoiMode) && huong === 'column-reverse');

// 6. gtVt {"Auto":"trai"} → RIÊNG chip Auto có vt-trai
const vtTrai = await mode.locator('.bc-chip.vt-trai').allInnerTexts();
const huongAuto = await mode.locator('.bc-chip', { hasText: 'Tự động' }).evaluate(n => getComputedStyle(n).flexDirection);
ok(`[6] chỉ chip "Tự động" (Auto) có vt-trai — ${JSON.stringify(vtTrai)}, hướng ${huongAuto}`,
  vtTrai.length === 1 && vtTrai[0].trim() === 'Tự động' && huongAuto === 'row');

// 7. ico: "@eco" → .bc-lb > i.bc-lico > img.bc-icoimg từ kho icon
const icoEco = tile('ac_eco_mode').locator('.bc-lb > i.bc-lico > img.bc-icoimg');
const srcEco = await icoEco.getAttribute('src').catch(() => null);
ok(`[7] ico "@eco" → .bc-lb > i.bc-lico > img.bc-icoimg, src ${srcEco}`, await icoEco.count() === 1 && /\/v1\/icons\/eco$/.test(srcEco || ''));
const coIco = await tile('ac_eco_mode').locator('i.bc-lico').evaluate(n => {
  const r = n.getBoundingClientRect(); return `${Math.round(r.width)}×${Math.round(r.height)}`; });
ok(`[7] i.bc-lico 18×18 (${coIco})`, coIco === '18×18');

// 8, 9. nhan.mau và nhan.dam
const plMode = await mode.locator('.bc-pl').evaluate(n => { const s = getComputedStyle(n); return { c: s.color, w: s.fontWeight, a: s.textAlign }; });
ok(`[8] nhan.mau "skin" → tiêu đề ${plMode.c}`, plMode.c === RGB_SKIN);
const plTemp = await tile('ac_temp_setting').locator('.bc-pl').evaluate(n => getComputedStyle(n).color);
ok(`[8] nhan.mau "#ffffff" → tiêu đề ${plTemp}`, plTemp === 'rgb(255, 255, 255)');
ok(`[9] nhan.dam → font-weight ${plMode.w}, căn ${plMode.a}`, plMode.w === '700' && plMode.a === 'center');

// 10. mọi ô có .bc-body bọc nội dung
const thieuBody = await p.locator('.bc-tile').evaluateAll(ns => ns.filter(n => !n.querySelector(':scope > .bc-body')).map(n => n.dataset.k));
ok(`[10] mọi ô có .bc-body (${thieuBody.length ? 'thiếu: ' + thieuBody.join(', ') : 'đủ 12'})`, thieuBody.length === 0);

// Khoảng cách tiêu đề → thân: web.dev `.bc-tile .bc-pl { margin-bottom: 8px }` (đọc CSS 15/10/2026)
const khe = await mode.evaluate(n => Math.round(n.querySelector(':scope > .bc-body').getBoundingClientRect().top
  - n.querySelector(':scope > .bc-pl').getBoundingClientRect().bottom));
ok(`tiêu đề cách thân khối 8px như web.dev (${khe}px)`, khe === 8);

// Hàng cuối thiếu chip thì chip GIÃN kín hàng (web.dev: flex-wrap, chip `flex: 1 0 calc(...)`)
const rong = await mode.evaluate(n => {
  const khoi = n.querySelector('.bc-chips').getBoundingClientRect();
  const cs = [...n.querySelectorAll('.bc-chip')].map(c => c.getBoundingClientRect());
  return { khoi: Math.round(khoi.width), hang1: cs.slice(0, 4).map(r => Math.round(r.width)), cuoi: Math.round(cs[4].width) };
});
ok(`hàng 1 bốn chip rộng bằng nhau (${rong.hang1.join('/')})`, Math.max(...rong.hang1) - Math.min(...rong.hang1) <= 1);
ok(`chip một mình ở hàng 2 kéo kín hàng (${rong.cuoi}px / khối ${rong.khoi}px)`, Math.abs(rong.cuoi - rong.khoi) <= 1);

// 11. hlChon: "vien" → mục đang chọn nền --bg + viền trong, KHÔNG nền --brand.
// Phần trên đã bấm "Sưởi ấm" (Heat) và máy giả ghi nhận, nên chip đó đang chọn.
ok('[11] khối chip có class hl-vien', /\bhl-vien\b/.test(khoiMode));
const chon = mode.locator('.bc-chip.on');
ok(`[11] có đúng một chip đang chọn (${await chon.count()})`, await chon.count() === 1);
const hl = await chon.first().evaluate(n => {
  const thu = document.createElement('div');
  thu.style.background = 'var(--bg,#f6f8f8)'; n.parentElement.appendChild(thu);
  const bg = getComputedStyle(thu).backgroundColor; thu.remove();
  const s = getComputedStyle(n);
  return { chu: n.innerText.trim(), nen: s.backgroundColor, bg, bong: s.boxShadow, mau: s.color };
});
ok(`[11] chip chọn "${hl.chu}" nền ${hl.nen} = --bg ${hl.bg}, không phải màu nhấn`, hl.nen === hl.bg && hl.nen !== RGB_SKIN);
ok(`[11] chip chọn có viền trong màu nhấn (${hl.bong})`, /inset/.test(hl.bong) && hl.bong.includes(RGB_SKIN) && hl.mau === RGB_SKIN);

// Kèm theo: ảnh nền ô và vòng xoay trắng theo mauCtl
const nenTemp = await tile('ac_temp_setting').evaluate(n => ({ lop: n.classList.contains('nen'), anh: getComputedStyle(n).backgroundImage }));
ok(`ô Temp Target có ảnh nền (${nenTemp.anh.slice(0, 60)}…)`, nenTemp.lop && /^url\(.*o-ac_temp_setting/.test(nenTemp.anh));
const dialMau = await tile('ac_temp_setting').evaluate(n => ({
  cung: getComputedStyle(n.querySelectorAll('svg path')[1]).stroke, chu: getComputedStyle(n.querySelector('svg text')).fill }));
ok(`vòng xoay và chữ trong ô Temp Target màu trắng (${dialMau.cung}, ${dialMau.chu})`,
  dialMau.cung === 'rgb(255, 255, 255)' && dialMau.chu === 'rgb(255, 255, 255)');

await p.screenshot({ path: anh('bocuc-ac1-v2'), fullPage: true });
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
