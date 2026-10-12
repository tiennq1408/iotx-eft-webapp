/**
 * A4 — Cập nhật thời gian thực (6 ca).
 *
 * Lưu ý chỗ lệch với tài liệu: kịch bản ghi "bản mới KHÔNG dùng SSE". Mã thật
 * (`hooks/useDongBoNen.ts`) giữ CẢ luồng SSE `/v1/stream` LẪN nhịp hỏi `/bootstrap`
 * (2,5 s khi mở màn chi tiết, 10 s ở danh sách). Các ca dưới đo nhịp hỏi vòng — máy chủ giả
 * không phát SSE khi đổi trạng thái qua RPC, nên cập nhật nào thấy được là nhờ hỏi vòng.
 */
import { boGhi, moTrinhDuyet, vaoApp, doi, cho, moChiTiet, dongChiTiet, giaVeHetHan, datHienTab } from './chung.mjs';

const { ca, thu, xong } = boGhi('a4');
const b = await moTrinhDuyet();
const laBootstrap = r => new URL(r.url).pathname.endsWith('/v1/bootstrap');
/**
 * Máy chủ giả không gửi nhịp giữ kết nối trên SSE, nên cứ ~35 s app coi luồng là chết, nối
 * lại và đồng bộ MỘT lần (IBS thật gửi nhịp mỗi 25 s, không gặp chuyện này). Lượt đồng bộ
 * đó không thuộc nhịp hỏi vòng — bỏ ra khi đo nhịp.
 */
const nhipHoi = (mang, tu) => {
  const noiLai = mang.filter(r => r.luc >= tu - 2000 && new URL(r.url).pathname.endsWith('/v1/stream')).map(r => r.luc);
  return mang.filter(r => r.luc >= tu && laBootstrap(r) && !noiLai.some(t => r.luc >= t && r.luc - t < 2000));
};
const khoang = ds => ds.slice(1).map((x, i) => (x.luc - ds[i].luc) / 1000);
const trungVi = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

await thu('A4-01', async () => {
  const ten = '03092026A1';
  const mot = await vaoApp(b), hai = await vaoApp(b);
  await moChiTiet(hai.p, ten);
  const nguon = hai.p.locator('.devpage .bc-pwr');
  const truoc = await nguon.getAttribute('aria-pressed');
  const cong = mot.p.locator('.device-card').filter({ has: mot.p.locator('.dname', { hasText: ten }) }).first().locator('.switch-hit[role="switch"]');
  const t0 = Date.now();
  await cong.click();
  const kip = await doi(async () => await nguon.getAttribute('aria-pressed') !== truoc, 3000);
  const ms = Date.now() - t0;
  ca('A4-01', [[`trình duyệt 2 (đang mở màn chi tiết) cập nhật sau ${(ms / 1000).toFixed(1)} s (≤ 3 s)`, kip]]);
  await cong.click(); await cho(400);
  await mot.ctx.close(); await hai.ctx.close();
});

await thu('A4-02', async () => {
  const { ctx, p, mang } = await vaoApp(b);
  await moChiTiet(p, '03092026A1');
  const tu1 = Date.now(); await cho(13000);
  const ct = khoang(nhipHoi(mang, tu1));
  await dongChiTiet(p);
  const tu2 = Date.now(); await cho(33000);
  const ds = khoang(nhipHoi(mang, tu2));
  const a = trungVi(ct), c = trungVi(ds);
  ca('A4-02', [[`màn chi tiết: nhịp ${a.toFixed(2)} s (${ct.map(x => x.toFixed(1)).join(', ')}) ≈ 2,5 s`, a >= 2.3 && a <= 3.2],
    [`danh sách: nhịp ${c.toFixed(2)} s (${ds.map(x => x.toFixed(1)).join(', ')}) ≈ 10 s`, c >= 9.5 && c <= 11.5]]);
  await ctx.close();
});

await thu('A4-03', async () => {
  const { ctx, p, mang } = await vaoApp(b);
  await ctx.setOffline(true);
  await cho(60000);
  const tu = Date.now();
  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  const lanh = await doi(async () => mang.some(r => r.luc >= tu && laBootstrap(r)), 12000);
  await cho(3000);
  const chum = mang.filter(r => r.luc >= tu && r.luc <= tu + 3000 && /\/v1\//.test(r.url)).length;
  const conApp = await p.locator('.top-bar').count() === 1 && await p.locator('.device-card').count() > 0;
  ca('A4-03', [['mất mạng 60 s rồi có lại → tự hỏi lại /bootstrap', lanh], [`không dồn một chùm request (${chum} request /v1 trong 3 s đầu)`, chum <= 4], ['vẫn trong app, danh sách còn nguyên', conApp]]);
  await ctx.close();
});

await thu('A4-04', async () => {
  const { ctx, p, mang } = await vaoApp(b);
  await datHienTab(p, false);
  const tu = Date.now(); await cho(25000);
  const khiNen = mang.filter(r => r.luc >= tu && laBootstrap(r)).length;
  const tu2 = Date.now();
  await datHienTab(p, true);
  const ngay = await doi(async () => mang.some(r => r.luc >= tu2 && laBootstrap(r)), 2500);
  ca('A4-04', [[`tab chạy nền 25 s → không hỏi /bootstrap (${khiNen} lượt)`, khiNen === 0], ['quay lại tab → cập nhật ngay (≤ 2,5 s)', ngay]],
    'rút 10 phút của tài liệu còn 25 s (hơn hai nhịp 10 s)');
  await ctx.close();
});

await thu('A4-05', async () => {
  const { ctx, p, mang } = await vaoApp(b);
  const soLamMoi = await giaVeHetHan(p);
  const tu = Date.now(); await cho(13000);
  const hoiTiep = mang.filter(r => r.luc >= tu && laBootstrap(r) && /ve-moi-/.test(r.headers.authorization || '')).length;
  ca('A4-05', [[`vé hết hạn giữa lúc hỏi vòng → làm mới đúng 1 lần (${soLamMoi()})`, soLamMoi() === 1], ['không đá ra màn đăng nhập', await p.locator('button.login-btn').count() === 0],
    [`nhịp hỏi chạy tiếp bằng vé mới (${hoiTiep} lượt)`, hoiTiep >= 1]]);
  await ctx.close();
});

await thu('A4-06', async () => {
  const { ctx, p } = await vaoApp(b);
  await moChiTiet(p, '03092026A1');
  // Lệnh tới máy chủ chậm 5 s: trong lúc đó nhịp hỏi 2,5 s vẫn mang về giá trị CŨ.
  await p.route('**/v1/devices/*/rpc', async route => { await cho(5000); await route.fallback(); });
  const nguon = p.locator('.devpage .bc-pwr');
  const truoc = await nguon.getAttribute('aria-pressed');
  await nguon.click();
  const mau = [];
  for (let i = 0; i < 15; i++) { await cho(300); mau.push(await nguon.getAttribute('aria-pressed')); }
  const lat = mau.filter(x => x === truoc).length;
  ca('A4-06', [[`nút vừa bấm giữ trạng thái mới suốt 4,5 s chờ phản hồi (${lat}/15 mẫu bị lật ngược)`, lat === 0]]);
  await p.unroute('**/v1/devices/*/rpc'); await cho(5500);
  await nguon.click(); await cho(800);
  await ctx.close();
});

xong();
await b.close();
