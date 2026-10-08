/**
 * Ba quyết định sản phẩm ở lượt rà soát thứ hai:
 * - sản phẩm không khai archetype vẫn có màn điều khiển (khuôn chung), không bao giờ trống;
 * - đủ hạn mức luật (`theme.quotas.rules`) thì khoá nút tạo và nói lý do;
 * - đổi ngôn ngữ thì `/bootstrap` và `/products` được hỏi lại với `?lang=` mới.
 */
import { GOC, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { THU_MUC } from './chung.mjs';

const SAN_PHAM = JSON.parse(fs.readFileSync(path.join(THU_MUC, 'du-lieu', 'products.json'), 'utf8'));

const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const b = await chromium.launch({ executablePath: CHROMIUM });
const cho = ms => new Promise(r => setTimeout(r, ms));
async function doi(dk, ms = 6000) {
  for (let i = 0; i < ms / 250; i++) { if (await dk()) return true; await cho(250); }
  return false;
}
const AN = 'nextjs-portal{display:none!important}';
const FAN_THUONG = '78ce3ec0';   // thiết bị `fan` 40A00008901 — sẽ bị đổi sang sản phẩm lạ

async function dangNhap(truocKhiVao) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  if (truocKhiVao) await truocKhiVao(ctx);
  const p = await ctx.newPage();
  const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 160)));
  await p.goto(GOC, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: AN });
  await p.locator('#dn-id').fill('p@p.vn');
  await p.locator('#dn-pw').fill('x');
  await p.locator('button.login-btn').click();
  await p.locator('.top-bar').waitFor({ timeout: 8000 }).catch(() => undefined);
  return { ctx, p, loi };
}

/** Sửa thân JSON của một cửa đọc, bỏ ETag để máy chủ giả luôn trả thân đầy đủ. */
const suaThan = (ctx, mau, sua) => ctx.route(mau, async route => {
  const headers = { ...route.request().headers() }; delete headers['if-none-match'];
  const r = await route.fetch({ headers });
  const than = await r.json();
  await route.fulfill({ response: r, json: sua(than) ?? than });
});

/* 1. Sản phẩm lạ (`ui_hopdong_la`, productGroup `khuon_la`, 3 capability) vẫn có điều khiển. */
{
  const { ctx, p, loi } = await dangNhap(async c => {
    await suaThan(c, '**/v1/bootstrap**', than => {
      for (const d of than.devices) if (d.id.startsWith(FAN_THUONG)) d.type = 'ui_hopdong_la';
    });
  });
  await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await cho(600);
  await p.locator('.device-card').filter({ hasText: '40A00008901' }).first().locator('.card-hit').click();
  await p.locator('.devpage').waitFor({ timeout: 5000 });
  await cho(400);
  const soO = await p.locator('.devbody .card').count();
  const dieuKhien = await p.locator('.devbody .card button, .devbody .card input, .devbody .card [role="button"]').count();
  ok(`Sản phẩm lạ: có ${soO} ô trên màn (≥ 3)`, soO >= 3);
  ok(`Sản phẩm lạ: có ${dieuKhien} điều khiển bấm được (> 0)`, dieuKhien > 0);
  ok('Sản phẩm lạ: không còn câu "chưa dựng được màn"', await p.getByText(/chưa khai capability|chưa dựng được/).count() === 0);
  ok(`Sản phẩm lạ: không lỗi trang (${loi.length})`, loi.length === 0);
  await ctx.close();
}

/* 2. Hạn mức luật: 1 luật trên trần 1 → nút "Nếu–Thì" khoá, "Theo thời gian" vẫn mở. */
{
  const { ctx, p } = await dangNhap(async c => {
    await suaThan(c, '**/v1/tenant/theme**', than => ({ ...than, quotas: { rules: 1, devices: 10000 } }));
    await c.route('**/v1/rules', route => route.request().method() === 'GET'
      ? route.fulfill({ json: { rules: [{ id: 1, name: 'Luật duy nhất', kind: 'cond', enabled: true, shadow: true, conds: [], actions: [] }], tuThietBi: [] } })
      : route.fallback());
  });
  await p.locator('.bn-item', { hasText: 'Tự động' }).click(); await cho(500);
  ok('Đầy hạn mức: nút Nếu–Thì bị khoá', await doi(async () => await p.locator('.auto-btn.primary:disabled').count() === 1));
  ok('Đầy hạn mức: nút Theo thời gian vẫn bấm được', await p.locator('.auto-btn.secondary:not(:disabled)').count() === 1);
  ok('Đầy hạn mức: có câu giải thích nêu con số', await p.getByText(/Đã đủ 1 luật/).count() === 1);
  await ctx.close();
}

/* 3. Đổi ngôn ngữ: máy chủ dịch nhãn theo `?lang`, nên phải hỏi lại catalog và bootstrap. */
{
  const { ctx, p } = await dangNhap();
  const hoi = [];
  p.on('request', r => { const u = new URL(r.url()); if (/\/v1\/(bootstrap|products)$/.test(u.pathname)) hoi.push(`${u.pathname.split('/').pop()}?${u.searchParams.get('lang')}`); });
  await p.locator('.top-actions .icon-btn').last().click(); await cho(300);
  await p.locator('.lang-flag').nth(1).click();   // English
  ok('Đổi sang EN: hỏi lại /bootstrap?lang=en', await doi(async () => hoi.includes('bootstrap?en')));
  ok('Đổi sang EN: hỏi lại /products?lang=en', await doi(async () => hoi.includes('products?en')));
  await ctx.close();
}

/* 4. Một luật nút nguồn: `ac` (không khai `ui`) có `ac_power_status` → nút nguồn trên màn chi tiết,
   hai công tắc còn lại (IoT status, eco) vẫn là công tắc thường. */
{
  const { ctx, p } = await dangNhap();
  await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await cho(600);
  await p.locator('.device-card').filter({ hasText: '22022026A1' }).first().locator('.card-hit').click();
  await p.locator('.devpage').waitFor({ timeout: 5000 }); await cho(400);
  const nutNguon = p.locator('.devbody .card.ctl-pwr .ctl-pwrbtn');
  ok('ac: có đúng một nút nguồn trên màn chi tiết', await nutNguon.count() === 1);
  // Nhãn của nút phải là nhãn catalog của ĐÚNG ac_power_status ("Bật/Tắt điều hòa"), không
  // phải của ac_IoT_status đứng trước nó trong danh sách.
  const nhanNguon = SAN_PHAM.ac.capabilities.find(c => c.key === 'ac_power_status').label;
  ok(`ac: nút nguồn là ac_power_status (nhãn "${await nutNguon.getAttribute('aria-label')}")`, (await nutNguon.getAttribute('aria-label')) === nhanNguon);
  ok('ac: không có công tắc nào khác bị coi là nguồn', await p.locator('.devbody .card.ctl-pwr').count() === 1);
  await ctx.close();
}

console.log(R.join('\n'));
console.log(`\n${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
