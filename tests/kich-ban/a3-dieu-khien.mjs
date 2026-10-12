/** A3 — Điều khiển thiết bị (10 ca). */
import fs from 'node:fs';
import { boGhi, moTrinhDuyet, vaoApp, doi, cho, moChiTiet, dongChiTiet, docNhatKy } from './chung.mjs';

const { ghi, ca, thu, xong } = boGhi('a3');
const b = await moTrinhDuyet();
const bs = JSON.parse(fs.readFileSync(new URL('../du-lieu/bootstrap.json', import.meta.url)));
const pr = JSON.parse(fs.readFileSync(new URL('../du-lieu/products.json', import.meta.url)));
const idCua = ten => bs.devices.find(d => (d.label || d.name) === ten)?.id;
const lenhCua = (id, tu = 0) => docNhatKy().slice(tu).filter(x => x.id === id && 'idem' in x);
const theCua = (p, ten) => p.locator('.device-card').filter({ has: p.locator('.dname', { hasText: ten }) }).first();

await thu('A3-01', async () => {
  const { ctx, p } = await vaoApp(b);
  const ten = '03092026A1', id = idCua(ten);
  const cong = theCua(p, ten).locator('.switch-hit[role="switch"]');
  const truoc = await cong.getAttribute('aria-checked');
  const moc = docNhatKy().length;
  const t0 = Date.now();
  await cong.click();
  const doiKip = await doi(async () => await cong.getAttribute('aria-checked') !== truoc, 1000);
  const ms = Date.now() - t0;
  await cho(600);
  const lenh = lenhCua(id, moc);
  ca('A3-01', [[`công tắc trên thẻ đổi trạng thái sau ${ms} ms (≤ 1 s)`, doiKip], [`gửi đúng 1 lệnh tới thiết bị (${lenh.length})`, lenh.length === 1]],
    'phần "thiết bị thật phản hồi" phải test tay với quạt thật');
  await cong.click(); await cho(500);   // trả lại như cũ
  await ctx.close();
});

await thu('A3-02', async () => {
  const { ctx, p } = await vaoApp(b);
  const ten = 'fan63903', id = idCua(ten);
  await moChiTiet(p, ten);
  const thanh = p.locator('.devpage input[type="range"]').first();
  const hop = await thanh.boundingBox();
  const moc = docNhatKy().length;
  const y = hop.y + hop.height / 2;
  await p.mouse.move(hop.x + 6, y); await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(hop.x + 6 + (hop.width - 12) * i / 8, y); await cho(80); }
  await cho(400);
  const trongLucKeo = lenhCua(id, moc).length;
  await p.mouse.up(); await cho(900);
  const sauKhiTha = lenhCua(id, moc).length - trongLucKeo;
  ca('A3-02', [[`không gửi lệnh trong lúc kéo (gửi ${trongLucKeo})`, trongLucKeo === 0], [`thả tay thì gửi đúng 1 lệnh (gửi ${sauKhiTha})`, sauKhiTha === 1]],
    `thanh "${await thanh.getAttribute('aria-label')}" của ${ten}`);
  await ctx.close();
});

await thu('A3-03', async () => {
  const { ctx, p } = await vaoApp(b);
  const ten = '03092026A1', id = idCua(ten);
  await moChiTiet(p, ten);
  const chip = p.locator('.devpage .bc-chip[aria-pressed="false"]').first();
  const nhan = await chip.getAttribute('title');
  const moc = docNhatKy().length;
  await chip.click(); await cho(800);
  const sau = p.locator(`.devpage .bc-chip[title="${nhan}"]`);
  const lenh = lenhCua(id, moc);
  ca('A3-03', [[`chip "${nhan}" chuyển sang đang chọn`, await sau.getAttribute('aria-pressed') === 'true'], [`lệnh gửi đi (${lenh.length}, ${lenh[0]?.than ?? ''})`, lenh.length === 1]]);
  await ctx.close();
});

await thu('A3-04', async () => {
  const { ctx, p } = await vaoApp(b);
  const kiem = [];
  for (const [ten, nhanCamBien] of [['fan63903', ['Nhiệt độ phòng', 'Độ ẩm phòng']], ['22022026A1', ['Danh sách lỗi', 'Voltage']]]) {
    await moChiTiet(p, ten);
    for (const nhan of nhanCamBien) {
      const r = await p.evaluate(nh => {
        const n = [...document.querySelectorAll('.devpage .devbody *')].find(x => x.childElementCount === 0 && x.textContent.trim() === nh);
        if (!n) return { thay: false };
        const o = n.closest('.card, .bc-tile, .readout, [class*="tile"], [class*="cap"]') || n.parentElement;
        return { thay: true, coNut: Boolean(o.querySelector('button, input, select, [role="button"], [role="switch"]')) || Boolean(n.closest('button, [role="button"]')) };
      }, nhan);
      kiem.push([`${ten} · "${nhan}" chỉ đọc`, r.thay && !r.coNut]);
    }
    await dongChiTiet(p);
  }
  ca('A3-04', kiem);
  await ctx.close();
});

await thu('A3-05', async () => {
  const { ctx, p } = await vaoApp(b);
  const ten = '03092026A1', id = idCua(ten);
  const cong = theCua(p, ten).locator('.switch-hit[role="switch"]');
  const truoc = await cong.getAttribute('aria-checked');
  const moc = docNhatKy().length;
  await cong.dblclick({ delay: 60 }); await cho(1500);
  const lenh = lenhCua(id, moc);
  const khoa = lenh.map(x => x.idem);
  const sau = await cong.getAttribute('aria-checked');
  const cuoi = lenh.at(-1) ? JSON.parse(lenh.at(-1).than || '{}') : {};
  ca('A3-05', [[`2 lần bấm → 2 lệnh (${lenh.length})`, lenh.length === 2], ['mỗi lệnh một Idempotency-Key khác nhau', khoa.length === 2 && khoa.every(Boolean) && khoa[0] !== khoa[1]],
    [`trạng thái cuối khớp lần bấm cuối (${truoc} → ${sau}, lệnh cuối ${JSON.stringify(cuoi.params ?? {})})`, sau === truoc && String(Object.values(cuoi.params ?? {})[0]) === truoc]]);
  await ctx.close();
});

await thu('A3-06', async () => {
  const { ctx, p } = await vaoApp(b);
  const ten = '05092026A2', id = idCua(ten);
  await moChiTiet(p, ten);
  const nhac = /ngoại tuyến/i.test(await p.locator('.devpage .devbody').innerText());
  const moc = docNhatKy().length;
  await p.locator('.devpage .bc-pwr, .devpage .ctl-pwrbtn').first().click(); await cho(900);
  ca('A3-06', [['có nhắc "đang ngoại tuyến"', nhac], [`vẫn gửi được lệnh (${lenhCua(id, moc).length})`, lenhCua(id, moc).length === 1]]);
  await ctx.close();
});

ghi('A3-07', 'TAY', 'cánh quạt xoay quanh đúng trục, không nhoè — phải nhìn bằng mắt khi quạt đang chạy');

await thu('A3-08', async () => {
  const { ctx, p } = await vaoApp(b);
  const lo = [];
  for (const d of bs.devices) {
    const ten = d.label || d.name;
    const khoa = (pr[d.type]?.capabilities || []).map(c => c.key).filter(k => /[_A-Z]/.test(k) || k.length > 3);
    await moChiTiet(p, ten);
    const nut = p.locator('.devpage .ctl-more');
    if (await nut.count()) { await nut.click(); await cho(300); }
    const chu = await p.locator('.devpage .devbody').innerText();
    for (const k of khoa) if (new RegExp(`(^|[^\\w])${k}([^\\w]|$)`).test(chu)) lo.push(`${ten}: ${k}`);
    await dongChiTiet(p);
  }
  ca('A3-08', [[`không hiện khoá kỹ thuật ở ${bs.devices.length} màn chi tiết (kể cả "Xem thêm")${lo.length ? ' — lộ: ' + lo.slice(0, 6).join(', ') : ''}`, lo.length === 0]]);
  await ctx.close();
});

await thu('A3-09', async () => {
  const { ctx, p } = await vaoApp(b);
  await moChiTiet(p, 'Quạt mới');   // ac_1 mang ui.boCuc thật của DEV
  const cot = await p.locator('.devpage [class*="bc-grid"], .devpage .bc-luoi').first().evaluate(n => getComputedStyle(n).gridTemplateColumns.split(' ').filter(Boolean).length).catch(() => 0);
  ca('A3-09', [[`lưới ui.boCuc vẽ ${cot} cột`, cot === 4]]);
  await ctx.close();
});

await thu('A3-10', async () => {
  const { ctx, p } = await vaoApp(b);
  const ten = 'SBI814', id = idCua(ten);
  await moChiTiet(p, ten);
  const moc = docNhatKy().length;
  await p.locator('.devpage .dev-but').click();
  await p.locator('.devpage .dev-teno').fill('SBI814 thử'); await p.keyboard.press('Enter'); await cho(700);
  await p.locator('.devpage .fav-lon').click(); await cho(700);
  const chon = p.locator('.devpage select.fsel');
  await chon.nth(0).selectOption({ label: 'Nhà A' }); await cho(700);
  await chon.nth(1).selectOption({ label: 'Phòng Khách' }); await cho(700);
  await chon.nth(2).selectOption({ label: 'Mặc định' }); await cho(700);
  const patch = docNhatKy().slice(moc).filter(x => x.cua === 'PATCH /devices' && x.id === id).map(x => x.patch);
  const co = k => patch.some(x => k in x);
  ca('A3-10', [[`bút đổi tên → PATCH label (${patch.find(x => 'label' in x)?.label ?? 'không thấy'})`, co('label')], ['sao ghim → PATCH fav', co('fav')],
    ['ba ô gán → PATCH house / room / grp', co('house') && co('room') && co('grp')]]);
  // trả lại tên cũ
  await p.locator('.devpage .dev-but').click();
  await p.locator('.devpage .dev-teno').fill(ten); await p.keyboard.press('Enter'); await cho(500);
  await p.locator('.devpage .fav-lon').click(); await cho(500);
  await ctx.close();
});

xong();
await b.close();
