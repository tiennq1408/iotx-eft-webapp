/** A2 — Danh sách thiết bị (7 ca). */
import fs from 'node:fs';
import { boGhi, moTrinhDuyet, vaoApp, cho, moChiTiet, dongChiTiet, sangTab, quayLaiTab } from './chung.mjs';

const { ghi, ca, thu, xong } = boGhi('a2');
const b = await moTrinhDuyet();
const bs = JSON.parse(fs.readFileSync(new URL('../du-lieu/bootstrap.json', import.meta.url)));

/** Sửa thân `/bootstrap` ngay trong trình duyệt — dựng ca "chưa có giá trị", "tên dài". */
async function suaBootstrap(p, sua) {
  await p.route('**/v1/bootstrap**', async route => {
    const r = await route.fetch();
    if (r.status() !== 200) return route.fulfill({ response: r });
    const j = await r.json();
    sua(j);
    return route.fulfill({ response: r, json: j, headers: { ...r.headers(), etag: `W/"kb-${Date.now()}"` } });
  });
}

await thu('A2-01', async () => {
  const { ctx, p } = await vaoApp(b);
  const the = await p.locator('.device-card').evaluateAll(ns => ns.map(n => ({
    ten: n.querySelector('.dname')?.textContent?.trim() || '',
    trangThai: n.querySelector('.dline')?.textContent?.trim() || '',
    cham: Boolean(n.querySelector('.status-dot')),
  })));
  const thieu = the.filter(x => !x.ten || !x.trangThai || !x.cham);
  ca('A2-01', [[`${the.length} thẻ đều có tên, dòng trạng thái và chấm online/offline`, the.length > 0 && thieu.length === 0]]);
  // Ngoại tuyến phải nói ra chữ, không chỉ đổi màu chấm.
  const offline = bs.devices.filter(d => !d.active).map(d => d.label || d.name);
  const theOff = the.filter(x => offline.includes(x.ten));
  ca('A2-01', [[`${theOff.length} máy ngoại tuyến đều ghi chữ "Ngoại tuyến"`, theOff.length > 0 && theOff.every(x => /Ngoại tuyến/.test(x.trangThai))]]);
  await ctx.close();
});

await thu('A2-02', async () => {
  const { ctx, p } = await vaoApp(b);
  // Điều hoà trong dữ liệu giả TẮT và mọi số đo là null (thẻ đúng là chỉ ghi "Tắt"); cho nó
  // bật và có nhiệt độ để thẻ phải nói số đo kèm đơn vị của capability.
  await suaBootstrap(p, j => { const d = j.devices.find(x => (x.label || x.name) === '22022026A1'); if (d) d.lastValues = { ...d.lastValues, ac_power_status: 'true', ac_temp_setting: '25', ac_room_temp: '29' }; });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.locator('.device-card').first().waitFor();
  // Bằng mã: hàm dựng dòng trạng thái không có nhánh nào theo loại máy.
  const ma = fs.readFileSync(new URL('../../components/newui/home.tsx', import.meta.url), 'utf8');
  const than = ma.slice(ma.indexOf('function dongTrangThai'), ma.indexOf('export type HanhDongThietBi'));
  const cungQuat = /quạt|\bfan\b|fan_|"Tốc độ|speed/i.test(than.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''));
  // Bằng mắt: điều hoà ra °C theo đơn vị capability, không mượn chữ của quạt.
  const dl = await p.locator('.device-card').filter({ has: p.locator('.dname', { hasText: '22022026A1' }) }).locator('.dline').innerText();
  ca('A2-02', [['dòng trạng thái dựng theo capability, không có chữ viết cứng cho quạt', !cungQuat], [`điều hoà hiện đơn vị của capability ("${dl}")`, /°C/.test(dl)]],
    'cảm biến / máy lọc thật chưa có trong dữ liệu giả — soát thêm bằng tay trên DEV');
  await ctx.close();
});

await thu('A2-03', async () => {
  const { ctx, p } = await vaoApp(b);
  await suaBootstrap(p, j => { const d = j.devices.find(x => (x.label || x.name) === 'fan63903'); if (d) d.lastValues = {}; });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.locator('.device-card').first().waitFor();
  const dl = await p.locator('.device-card').filter({ has: p.locator('.dname', { hasText: 'fan63903' }) }).locator('.dline').innerText();
  await moChiTiet(p, 'fan63903');
  const chiTiet = await p.locator('.devpage .devbody').innerText();
  // Số 0 đứng riêng (không phải 10, 0.5, 30°C) là dấu hiệu bịa giá trị.
  const coSo0 = /(^|[\s·:])0(?![\d.,])(\s|$|°|%)/m.test(chiTiet);
  ca('A2-03', [[`thẻ không bịa số ("${dl}")`, !/(^|\s)0(\s|$|°|%)/.test(dl)], ['màn chi tiết hiện "—" cho ô chưa có giá trị', chiTiet.includes('—')], ['màn chi tiết không hiện "0" thay cho "chưa có"', !coSo0]]);
  await ctx.close();
});

await thu('A2-04', async () => {
  const { ctx, p } = await vaoApp(b, { rong: 360, cao: 780 });
  const tenDai = 'Máy lọc không khí phòng ngủ tầng hai bên trái';
  await suaBootstrap(p, j => { const d = j.devices.find(x => (x.label || x.name) === 'fan63903'); if (d) d.label = tenDai; });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.locator('.device-card').first().waitFor();
  const o = p.locator('.device-card .dname', { hasText: 'Máy lọc' }).first();
  const rongThe = await o.evaluate(n => n.clientWidth);
  const kyTu = await o.evaluate(n => { const c = document.createElement('span'); c.style.cssText = getComputedStyle(n).font ? `font:${getComputedStyle(n).font};position:absolute;visibility:hidden;white-space:nowrap` : ''; c.textContent = 'Máy lọc k'; document.body.append(c); const w = c.getBoundingClientRect().width; c.remove(); return w; });
  await o.locator('xpath=ancestor::div[contains(@class,"device-card")]').locator('.card-hit').click();
  await p.locator('.devpage').waitFor(); await cho(300);
  const rongCT = await p.locator('.devpage .dev-ten').evaluate(n => n.clientWidth);
  ca('A2-04', [[`thẻ ở 360px còn đủ chỗ cho ≥ 9 ký tự (${rongThe}px, cần ${Math.round(kyTu)}px)`, rongThe >= kyTu], [`đầu màn chi tiết không cắt còn 2–3 ký tự (${rongCT}px)`, rongCT >= 100]]);
  await ctx.close();
});

await thu('A2-05', async () => {
  const { ctx, p } = await vaoApp(b);
  const nutTrenThe = await p.locator('.device-card button').evaluateAll(ns => ns.map(n => n.getAttribute('aria-label') || n.className).filter(x => /xo[aá]|ẩn|hide|delete/i.test(x)));
  await moChiTiet(p, '03092026A1');
  const nut = p.locator('.devpage button', { hasText: 'Ẩn thiết bị khỏi danh sách' });
  const hop = await nut.boundingBox();
  await dongChiTiet(p);
  const mat = p.locator('.filter-pill.eye');
  ca('A2-05', [[`thẻ không có nút xoá/ẩn bấm nhầm (${nutTrenThe.length})`, nutTrenThe.length === 0],
    [`nút ẩn ở màn chi tiết ≥44×44 (${Math.round(hop.width)}×${Math.round(hop.height)}) và nói đúng việc nó làm`, hop.width >= 44 && hop.height >= 44],
    ['có chỗ bỏ ẩn: nút mắt "Thiết bị đã ẩn" trên hàng lọc', await mat.getAttribute('aria-label') === 'Thiết bị đã ẩn']],
    'nút ẩn nằm ở màn chi tiết, không nằm trên thẻ');
  await ctx.close();
});

await thu('A2-06', async () => {
  const ten = '05092026A2';
  let { ctx, p } = await vaoApp(b);
  await moChiTiet(p, ten);
  await p.locator('.devpage button', { hasText: 'Ẩn thiết bị khỏi danh sách' }).click(); await cho(800);
  await ctx.close();
  ({ ctx, p } = await vaoApp(b));
  const conAn = await p.locator('.device-card .dname', { hasText: ten }).count() === 0;
  await sangTab(p, 'Thiết bị');
  await p.locator('.filter-pill.eye').click(); await cho(500);
  const trongDaAn = await p.locator('.device-card .dname', { hasText: ten }).count() === 1;
  // Trả lại như cũ cho các ca sau.
  await moChiTiet(p, ten);
  await p.locator('.devpage button', { hasText: 'Hiện lại thiết bị' }).click(); await cho(600);
  ca('A2-06', [['đăng nhập lại (ngữ cảnh trình duyệt mới) → máy vẫn ẩn', conAn], ['máy nằm trong danh sách "Thiết bị đã ẩn"', trongDaAn]],
    'ẩn lưu ở máy chủ (PATCH hidden), không chỉ ở trình duyệt');
  await ctx.close();
});

await thu('A2-07', async () => {
  const { ctx, p, mang } = await vaoApp(b);
  const so = await p.locator('.device-card').count();
  const tu = Date.now();
  await quayLaiTab(p); await cho(1500);
  const dongBo = mang.filter(r => r.luc >= tu && r.url.includes('/v1/bootstrap')).length;
  const sau = await p.locator('.device-card').count();
  ghi('A2-07', 'CHUA_CO', `app chưa có cử chỉ kéo để làm mới; danh sách tự cập nhật bằng nhịp hỏi vòng và khi quay lại tab (${dongBo} lượt /bootstrap). Sau đồng bộ không nhân đôi thẻ: ${so} → ${sau}${sau === so ? '' : ' — LỆCH'}`);
  await ctx.close();
});

xong();
await b.close();
