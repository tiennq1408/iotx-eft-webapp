import { GOC, anh, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Nút thông tin + bảng phải ở màn chi tiết (docs/viec-bang-phai-thiet-bi.md).
 *
 * Mục 1 là dữ liệu local, hiện ngay. Mục 2 gọi `GET /v1/serials/lookup` (S-Factory) — máy chủ
 * giả trả found:true cho SNB6DRE9USGD và found:false cho serial lạ; các nhánh còn lại (warranty
 * null, 502, 503) chặn bằng page.route để bài đoán được.
 *
 * Thiết bị dùng: "Điều hòa L1 - 2" — `name` (= serial) "DHL10002" khác hẳn `label`.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const cho = ms => new Promise(r => setTimeout(r, ms));
const TB = 'Điều hòa L1 - 2', SERIAL = 'DHL10002';
const SNB = { found: true, serial: 'SNB6DRE9USGD', product: { name: 'Máy lọc nước nóng lạnh Karofi KAD-X59', code: '1001040629' },
  manufactureDate: '2025-07-11', purchaseDate: '2025-08-02',
  warranty: { months: 24, activatedAt: '2025-08-02', expiredAt: '2027-08-02', status: 'Inactive', code: 'BHGK1VJYCUFC', exportedAt: '2025-07-18' },
  source: 'sfactory' };

const b = await chromium.launch({ executablePath: CHROMIUM });
const loi = [];

/**
 * Một phiên mới, đã vào màn chi tiết của thiết bị.
 * `traLoi`: trả lời cho /serials/lookup (object → 200 JSON; { status, json } → nguyên văn).
 * `suaBs`: sửa /bootstrap trước khi app nhận.
 */
async function phien({ w = 390, h = 844, traLoi, treMs = 0, suaBs, tz } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, ...(tz ? { timezoneId: tz } : {}) });
  const p = await ctx.newPage();
  p.on('pageerror', e => loi.push(String(e).slice(0, 160)));
  const goi = [];
  await p.route('**/v1/serials/lookup*', async r => {
    goi.push(new URL(r.request().url()).searchParams.get('serial'));
    if (treMs) await cho(treMs);
    if (!traLoi) return r.continue();
    return r.fulfill(traLoi.status ? traLoi : { status: 200, json: traLoi });
  });
  if (suaBs) await p.route('**/v1/bootstrap*', async r => {
    const goc = await r.fetch(); const j = await goc.json();
    await r.fulfill({ status: 200, json: suaBs(j) });
  });
  await p.goto(GOC, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('x');
  await p.locator('button.login-btn').click(); await cho(2000);
  await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await cho(800);
  await p.locator('.device-card').filter({ hasText: TB }).first().locator('.card-hit').click(); await cho(900);
  return { ctx, p, goi };
}
const nut = p => p.locator('.devdau .tt-lon[aria-haspopup="dialog"]');
const bang = p => p.locator('.drawer.tt');
const dong = (p, nhan) => bang(p).locator('.tt-dong').filter({ has: p.locator(`dt:text-is("${nhan}")`) }).locator('dd');
const moBang = async (p, doi = 900) => { await nut(p).click(); await cho(doi); };

/* ---- 1, 3, 4, 5. Có nút; bấm → bảng trượt từ phải, mục 1 hiện NGAY; Serial = name, Tên = label ---- */
{
  const { ctx, p, goi } = await phien({ treMs: 1500 });
  ok('[1] thiết bị có serial → có nút thông tin', await nut(p).count() === 1);
  const vt = await p.evaluate(() => {
    const f = document.querySelector('.devdau .fav-lon').getBoundingClientRect(), n = document.querySelector('.devdau .tt-lon').getBoundingClientRect();
    return { canh: Math.abs(n.left - f.right) <= 12 && Math.abs((n.top + n.bottom) / 2 - (f.top + f.bottom) / 2) <= 2, w: Math.round(n.width), h: Math.round(n.height) };
  });
  ok(`[1] …nằm ngay cạnh nút Ghim, vùng chạm ${vt.w}×${vt.h}`, vt.canh && vt.w >= 44 && vt.h >= 44);
  await moBang(p, 300);
  ok('[3] bấm → mở bảng', await bang(p).count() === 1);
  const phai = await p.evaluate(() => {
    const d = document.querySelector('.drawer.tt').getBoundingClientRect(), k = document.querySelector('.app-shell').getBoundingClientRect();
    return Math.abs(d.right - k.right) <= 1 && d.left > k.left;
  });
  ok('[3] …bảng bám mép PHẢI của khung', phai);
  ok('[3] …mục 1 hiện NGAY (đủ 9 dòng) trong lúc mục bảo hành còn "Đang tra cứu…"',
    await bang(p).locator('.tt-ds').first().locator('.tt-dong').count() === 9 && /Đang tra cứu/.test(await bang(p).locator('.tt-bh').innerText()));
  ok('[3] …bốn dòng sản phẩm hiện "…" trong lúc chờ tra cứu',
    (await Promise.all(['Tên sản phẩm', 'Mã sản phẩm', 'Ngày mua', 'Ngày sản xuất'].map(n => dong(p, n).innerText()))).every(v => v === '…'));
  ok(`[4] Serial = name của API ("${await dong(p, 'Serial').innerText()}"), không phải label`, (await dong(p, 'Serial').innerText()) === SERIAL);
  ok(`[5] Tên ("${await dong(p, 'Tên').innerText()}") ≠ Serial`, (await dong(p, 'Tên').innerText()) === TB);
  ok('[3] …gọi /serials/lookup ngay khi mở, không chờ bấm', goi.length === 1 && goi[0] === SERIAL);
  await ctx.close();
}

/* ---- 2. Thiết bị KHÔNG có serial → không vẽ nút ---- */
{
  const { ctx, p } = await phien({ suaBs: j => ({ ...j, devices: j.devices.map(d => d.label === TB ? { ...d, name: '' } : d) }) });
  ok('[2] thiết bị không có serial → KHÔNG có nút', await nut(p).count() === 0 && await p.locator('.devdau .fav-lon').count() === 1);
  await ctx.close();
}

/* ---- 6. found:true → đủ dòng, ngày d/M/yyyy ---- */
{
  const { ctx, p } = await phien({ traLoi: SNB });
  await moBang(p);
  // Thứ tự mục 1 (yêu cầu 20/10/2026): Tên sản phẩm · Mã sản phẩm · Ngày mua · Ngày sản xuất ngay dưới Serial.
  const thuTu = await bang(p).locator('.tt-ds').first().locator('dt').allInnerTexts();
  const sau = thuTu.slice(thuTu.indexOf('Serial') + 1, thuTu.indexOf('Serial') + 5);
  ok(`[6] mục 1: dưới Serial là ${sau.join(' · ')}`, sau.join('|') === 'Tên sản phẩm|Mã sản phẩm|Ngày mua|Ngày sản xuất');
  ok('[6] …mục Bảo hành không lặp lại bốn dòng đó',
    await bang(p).locator('.tt-bh dt', { hasText: /^(Tên sản phẩm|Mã sản phẩm|Ngày mua|Ngày sản xuất)$/ }).count() === 0);
  const can = { 'Tên sản phẩm': SNB.product.name, 'Mã sản phẩm': '1001040629', 'Ngày sản xuất': '11/7/2025', 'Ngày mua': '2/8/2025',
    'Bảo hành': 'Inactive', 'Thời hạn': '24 tháng', 'Kích hoạt': '2/8/2025', 'Hết hạn': '2/8/2027', 'Mã bảo hành': 'BHGK1VJYCUFC', 'Ngày xuất kho': '18/7/2025' };
  const sai = [];
  for (const [nhan, gt] of Object.entries(can)) {
    const v = await dong(p, nhan).first().innerText().catch(() => '(không có)');
    if (v !== gt) sai.push(`${nhan}="${v}"`);
  }
  ok(`[6] found:true → đủ 10 dòng bảo hành, ngày d/M/yyyy${sai.length ? ' — lệch: ' + sai.join(', ') : ''}`, sai.length === 0);
  await p.screenshot({ path: anh('bang-thiet-bi') });
  await ctx.close();
}

/* ---- 7. warranty: null → MỘT dòng, không phải sáu dòng rỗng ---- */
{
  const { ctx, p } = await phien({ traLoi: { ...SNB, warranty: null } });
  await moBang(p);
  ok('[7] warranty null → đúng một dòng "Chưa có thông tin bảo hành"',
    await bang(p).locator('.tt-khong-bh').count() === 1 && /Chưa có thông tin bảo hành/.test(await bang(p).locator('.tt-khong-bh').innerText()));
  ok('[7] …và KHÔNG vẽ các dòng bảo hành rỗng', await dong(p, 'Kích hoạt').count() === 0 && await dong(p, 'Mã bảo hành').count() === 0);
  ok('[7] …mục 1 vẫn có tên sản phẩm', (await dong(p, 'Tên sản phẩm').innerText()) === SNB.product.name);
  await ctx.close();
}

/* ---- 8. found:false → câu thường, KHÔNG tô đỏ ---- */
{
  const { ctx, p } = await phien();                               // máy giả: DHL10002 → found:false
  await moBang(p);
  const bh = bang(p).locator('.tt-bh');
  ok('[8] found:false → "Chưa có dữ liệu cho serial này"', /Chưa có dữ liệu cho serial này/.test(await bh.innerText()));
  ok('[8] …không phải lỗi: không tô đỏ, không role=alert', await bh.locator('.tt-loi, [role=alert]').count() === 0);
  ok('[8] …bốn dòng sản phẩm ở mục 1 hiện "—"',
    (await Promise.all(['Tên sản phẩm', 'Mã sản phẩm', 'Ngày mua', 'Ngày sản xuất'].map(n => dong(p, n).innerText()))).every(v => v === '—'));
  await ctx.close();
}

/* ---- 9. 502 → câu S-Factory + Thử lại, KHÔNG phải câu "Không kết nối được máy chủ" ---- */
{
  const { ctx, p, goi } = await phien({ traLoi: { status: 502, json: { message: 'S-Factory timeout', error: 'timeout' } } });
  await moBang(p);
  const chu = await bang(p).locator('.tt-bh').innerText();
  ok(`[9] 502 → "Không gọi được S-Factory, thử lại sau" ("${chu.split('\n')[0]}")`, /Không gọi được S-Factory/.test(chu));
  ok('[9] …KHÔNG nói "Không kết nối được máy chủ" (moTaLoi)', !/Không kết nối được máy chủ/.test(chu));
  const thuLai = bang(p).locator('.tt-thu-lai');
  ok('[9] …có nút Thử lại', await thuLai.count() === 1);
  await thuLai.click(); await cho(800);
  ok(`[9] …bấm Thử lại → gọi lại lần nữa (${goi.length} lần)`, goi.length === 2);
  await ctx.close();
}

/* ---- 10. 503 → báo chưa khai, và LẦN SAU không vẽ nút ---- */
{
  const { ctx, p } = await phien({ traLoi: { status: 503, json: { message: 'Chưa khai S-Factory', error: 'not_configured' } } });
  await moBang(p);
  ok('[10] 503 → "Chưa khai S-Factory", không có nút Thử lại',
    /Chưa khai S-Factory/.test(await bang(p).locator('.tt-bh').innerText()) && await bang(p).locator('.tt-thu-lai').count() === 0);
  await bang(p).locator('.nut-dong-goc').click(); await cho(400);
  ok('[10] …đóng bảng → nút thông tin không còn (nhớ cho cả phiên)', await nut(p).count() === 0);
  await p.locator('.devback').click(); await cho(500);
  await p.locator('.device-card').filter({ hasText: 'SBI314' }).first().locator('.card-hit').click(); await cho(800);
  ok('[10] …thiết bị khác cũng không có nút', await nut(p).count() === 0);
  await ctx.close();
}

/* ---- 11. Khổ 360px: không cuộn ngang (UUID xuống dòng) ---- */
{
  const { ctx, p } = await phien({ w: 360, h: 780, traLoi: SNB });
  await moBang(p);
  const tran = await p.evaluate(() => {
    const d = document.querySelector('.drawer.tt');
    return { bang: d.scrollWidth > d.clientWidth, trang: document.documentElement.scrollWidth > innerWidth, phai: d.getBoundingClientRect().right > innerWidth + 0.5 };
  });
  ok(`[11] 360px: bảng không cuộn ngang, trang không cuộn ngang (${JSON.stringify(tran)})`, !tran.bang && !tran.trang && !tran.phai);
  await ctx.close();
}

/* ---- 12. Màn rộng 1280px: bảng nằm TRONG khung ---- */
{
  const { ctx, p } = await phien({ w: 1280, h: 900, traLoi: SNB });
  await moBang(p);
  const trong = await p.evaluate(() => {
    const k = document.querySelector('.app-shell').getBoundingClientRect();
    const o = document.querySelector('.drawer-overlay').getBoundingClientRect(), d = document.querySelector('.drawer.tt').getBoundingClientRect();
    const vao = r => r.left >= k.left - 1 && r.right <= k.right + 1 && r.top >= k.top - 1 && r.bottom <= k.bottom + 1;
    return { vao: vao(o) && vao(d), pos: getComputedStyle(document.querySelector('.drawer-overlay')).position, w: Math.round(d.width) };
  });
  ok(`[12] 1280px: nền mờ và bảng nằm gọn trong khung (${trong.pos}, rộng ${trong.w}px)`, trong.vao && trong.pos !== 'fixed' && trong.w <= 360);
  await ctx.close();
}

/* ---- 13. "2025-07-11" hiện 11/7/2025 ở MỌI múi giờ (kể cả múi giờ âm) ---- */
{
  const { ctx, p } = await phien({ traLoi: SNB, tz: 'America/Los_Angeles' });
  await moBang(p);
  ok(`[13] múi giờ Los Angeles: Ngày sản xuất "${await dong(p, 'Ngày sản xuất').innerText()}"`, (await dong(p, 'Ngày sản xuất').innerText()) === '11/7/2025');
  await ctx.close();
}

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
