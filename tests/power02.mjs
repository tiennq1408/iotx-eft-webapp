import { GOC, NHAT_KY, anh, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';

/**
 * Kiểu vẽ `power02` — thanh nguồn phủ cả ô (web.dev 22/10/2026).
 *
 * Catalog `ac_1` chép nguyên từ DEV ngày 22/10/2026 (`du-lieu/ac1-power02-dev.json`): nút nguồn
 * `ac_power_status` đã chuyển sang `power02`, da `#2dc3b4`, và `vien` của các ô là MÃ MÀU
 * `"#ffffff"` thay vì `"skin"` (kiểm ở cuối bài). Bơm vào app qua `/v1/products`.
 *
 *   Tắt: nền `--bg`, chữ màu mực, icon mờ .55.  Bật: nền màu nhấn, chữ `o.mauChu` ("skin" → màu
 *   nhấn, mã màu → mã đó), không khai thì `--brand-chu`. Không có `o.ico` thì icon là ⏻.
 *   Ô nhận lớp `p2` (đệm 0) và không in nhãn riêng — nút tự mang tên.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const cho = ms => new Promise(r => setTimeout(r, ms));
const AC1 = JSON.parse(fs.readFileSync(new URL('./du-lieu/ac1-power02-dev.json', import.meta.url), 'utf8'));
const KHOA = 'ac_power_status';

const b = await chromium.launch({ executablePath: CHROMIUM });
const loi = [];

/** `suaO`: chỉnh ô nguồn trong catalog trước khi app nhận. */
async function phien(suaO = o => o) {
  const ac1 = { ...AC1, ui: { ...AC1.ui, boCuc: { ...AC1.ui.boCuc, o: AC1.ui.boCuc.o.map(o => (o.key === KHOA ? suaO({ ...o }) : o)) } } };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => loi.push(String(e).slice(0, 160)));
  await p.route('**/v1/products*', async r => { const g = await (await r.fetch()).json(); await r.fulfill({ json: { ...g, ac_1: ac1 } }); });
  await p.goto(GOC, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('x');
  await p.locator('button.login-btn').click(); await cho(2000);
  await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await cho(800);
  await p.locator('.device-card').filter({ hasText: 'Quạt mới' }).first().locator('.card-hit').click(); await cho(1500);
  return { ctx, p };
}
const tile = p => p.locator(`.bc-tile[data-k="${KHOA}"]`);
const nut = p => tile(p).locator('button.bc-p2');
const doNut = p => nut(p).evaluate(n => {
  const s = getComputedStyle(n), i = n.querySelector('.bc-p2-ico'), r = n.getBoundingClientRect();
  return { lop: n.className, nen: s.backgroundColor, chu: s.color, icoMo: getComputedStyle(i).opacity, ico: i.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height),
    brand: getComputedStyle(n).getPropertyValue('--brand').trim() };
});
/** Đưa nút về trạng thái muốn có (máy giả nhớ giá trị sau mỗi lệnh). */
async function datTrangThai(p, bat) {
  if ((await nut(p).getAttribute('aria-pressed')) !== String(bat)) { await nut(p).click(); await cho(900); }
}

/* ---- Catalog DEV nguyên trạng: power02, không ico, không mauChu ---- */
{
  const { ctx, p } = await phien();
  ok('ô nguồn có lớp p2 và là MỘT nút bc-p2 (không còn nút tròn bc-pwr)',
    /\bp2\b/.test(await tile(p).getAttribute('class')) && await nut(p).count() === 1 && await tile(p).locator('.bc-pwr').count() === 0);
  ok('nút tự mang tên — ô không in nhãn riêng phía trên', await tile(p).locator('.bc-pl').count() === 0 && /Bật\/Tắt/.test(await nut(p).innerText()));
  ok('ô đệm 0, nút phủ kín ô', await tile(p).evaluate(n => getComputedStyle(n).paddingTop) === '0px');
  await datTrangThai(p, true);
  const bat = await doNut(p);
  ok(`bật: nền màu nhấn (${bat.nen}), chữ --brand-chu (${bat.chu}), lớp "on"`,
    /\bon\b/.test(bat.lop) && bat.nen === 'rgb(45, 195, 180)' && bat.chu === 'rgb(255, 255, 255)');
  ok(`không khai ico → icon ⏻ ("${bat.ico}")`, bat.ico === '⏻');
  ok(`vùng chạm ≥44px (${bat.w}×${bat.h})`, bat.h >= 44 && bat.w >= 44);
  await tile(p).screenshot({ path: anh('power02-bat') });

  const truoc = fs.existsSync(NHAT_KY) ? fs.readFileSync(NHAT_KY, 'utf8').trim().split('\n').length : 0;
  await nut(p).click(); await cho(900);
  const lenh = fs.readFileSync(NHAT_KY, 'utf8').trim().split('\n').slice(truoc).map(JSON.parse);
  ok(`bấm → gửi setPower false (${lenh.length} lệnh)`, lenh.length === 1 && /setPower/.test(lenh[0].than) && /false/.test(lenh[0].than));
  const tat = await doNut(p);
  ok(`tắt: nền --bg (${tat.nen}), chữ màu mực (${tat.chu}), icon mờ ${tat.icoMo}`,
    /\boff\b/.test(tat.lop) && tat.nen === 'rgb(244, 249, 248)' && tat.chu === 'rgb(14, 43, 39)' && tat.icoMo === '0.55');
  ok('aria-pressed theo trạng thái', (await nut(p).getAttribute('aria-pressed')) === 'false');
  await tile(p).screenshot({ path: anh('power02-tat') });
  await ctx.close();
}

/* ---- mauChu + ico ---- */
{
  const { ctx, p } = await phien(o => ({ ...o, mauChu: '#ffef00', ico: '@eco', vtIco: 'tren' }));
  await datTrangThai(p, true);
  const d = await doNut(p);
  ok(`mauChu "#ffef00" → chữ lúc bật ${d.chu}`, d.chu === 'rgb(255, 239, 0)');
  ok(`vtIco "tren" → lớp vt-tren (${d.lop})`, /\bvt-tren\b/.test(d.lop));
  const icon = await nut(p).locator('.bc-p2-ico .bc-icoimg').evaluate(n => ({ the: n.tagName, nen: getComputedStyle(n).backgroundColor })).catch(() => null);
  ok(`ico "@eco" → icon kho (${icon?.the}), đơn sắc thì cùng màu chữ (${icon?.nen})`, icon && (icon.the === 'IMG' || icon.nen === d.chu));
  await ctx.close();
}
{
  const { ctx, p } = await phien(o => ({ ...o, mauChu: 'skin' }));
  await datTrangThai(p, true);
  const d = await doNut(p);
  ok(`mauChu "skin" → chữ lúc bật bằng màu nhấn (${d.chu}), như web.dev`, d.chu === 'rgb(45, 195, 180)');
  await ctx.close();
}

/* ---- `vien` là mã màu → viền 2px đúng màu đó (như web.dev: biến --vien) ---- */
{
  const { ctx, p } = await phien();
  const coVien = AC1.ui.boCuc.o.filter(o => o.vien).map(o => o.key);
  const vien = await p.evaluate(ks => ks.map(k => {
    const n = document.querySelector(`.bc-tile[data-k="${k}"]`); if (!n) return null;
    const s = getComputedStyle(n); return { k, lop: n.classList.contains('vien'), w: s.borderTopWidth, c: s.borderTopColor };
  }).filter(Boolean), coVien);
  const sai = vien.filter(v => !(v.lop && v.w === '2px' && v.c === 'rgb(255, 255, 255)'));
  ok(`vien "#ffffff" → ${vien.length} ô viền 2px trắng${sai.length ? ' — sai: ' + JSON.stringify(sai.slice(0, 2)) : ''}`, vien.length >= 10 && sai.length === 0);
  ok('ô không khai vien giữ viền mảnh 1px', await tile(p).evaluate(n => getComputedStyle(n).borderTopWidth) === '1px');
  await ctx.close();
}
{
  const { ctx, p } = await phien(o => ({ ...o, vien: 'skin' }));
  const v = await tile(p).evaluate(n => ({ w: getComputedStyle(n).borderTopWidth, c: getComputedStyle(n).borderTopColor }));
  ok(`vien "skin" vẫn chạy: viền 2px màu nhấn (${v.c})`, v.w === '2px' && v.c === 'rgb(45, 195, 180)');
  await ctx.close();
}

/* ---- Tắt / chưa chọn → icon mờ .55 (web.dev 23/10/2026) ---- */
{
  const { ctx, p } = await phien();
  const eco = p.locator('.bc-tile[data-k="ac_eco_mode"]');
  const doEco = () => eco.evaluate(n => ({ tat: n.querySelector('.bc-lb').classList.contains('tat'),
    mo: getComputedStyle(n.querySelector('.bc-lb .bc-lico')).opacity, bat: n.querySelector('[role=switch]').getAttribute('aria-checked') }));
  let e = await doEco();
  if (e.bat === 'true') { await eco.locator('[role=switch]').click(); await cho(900); e = await doEco(); }
  ok(`công tắc đang TẮT → nhãn có lớp tat, icon cố định mờ ${e.mo}`, e.bat === 'false' && e.tat && e.mo === '0.55');
  await eco.locator('[role=switch]').click(); await cho(900); e = await doEco();
  ok(`bật lên → bỏ lớp tat, icon rõ ${e.mo}`, e.bat === 'true' && !e.tat && e.mo === '1');
  const mode = p.locator('.bc-tile[data-k="ac_ope_mode"]');
  await mode.locator('.bc-chip').first().click(); await cho(900);
  const chip = await mode.evaluate(n => [...n.querySelectorAll('.bc-chip')].map(c => ({ on: c.classList.contains('on'), mo: getComputedStyle(c.querySelector(':scope > i')).opacity })));
  ok(`chip đang chọn icon rõ, chip chưa chọn icon mờ .55 (${JSON.stringify(chip.slice(0, 3))})`,
    chip.some(c => c.on) && chip.every(c => c.mo === (c.on ? '1' : '0.55')));
  await ctx.close();
}

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
