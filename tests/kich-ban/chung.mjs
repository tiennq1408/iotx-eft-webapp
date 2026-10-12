/**
 * Dùng chung cho bộ kiểm theo KỊCH BẢN — Phần A của `kich-ban-test.md` (bản 3, 09/10/2026).
 *
 * Mỗi ca in đúng MÃ của tài liệu (A1-01, A2-03…) kèm một trong sáu trạng thái, và ghi ra
 * `tests/.tam/kich-ban/<nhóm>.json` để `bao-cao.mjs` gộp thành bảng ghi kết quả.
 *
 * Chạy trên máy chủ GIẢ (tests/may-chu-gia.mjs) qua proxy `/v1` thật của app — nên đo được
 * hành vi của webapp, KHÔNG đo được IBS thật. Ca nào phải có phần cứng, Safari, tài khoản
 * thứ hai hay DEV thì ghi "Test tay" kèm lý do, không giả vờ là đã kiểm.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { GOC, CHROMIUM, TAM, NHAT_KY } from '../chung.mjs';

export { GOC, NHAT_KY };
export const GOC_GIA_KB = `http://localhost:${Number(process.env.CONG_GIA || 3200)}`;

/** Sáu trạng thái. Chỉ HONG làm bộ chạy báo đỏ; các trạng thái khác là ghi nhận. */
export const TT = {
  DAT: 'Đạt',
  HONG: 'Hỏng',
  TAY: 'Test tay',
  KHAC: 'Phủ bởi bài khác',
  CHUA_CO: 'Chưa có tính năng',
  BIET: 'Lỗi đã biết',
};
const NHAN_IN = { DAT: 'PASS', HONG: 'FAIL', TAY: 'TAY', KHAC: 'KHAC', CHUA_CO: 'CHUA-CO', BIET: 'DA-BIET' };

export const cho = ms => new Promise(r => setTimeout(r, ms));

/** Đợi điều kiện đúng trong `ms`, hỏi mỗi 200ms. */
export async function doi(dk, ms = 6000) {
  const het = Date.now() + ms;
  while (Date.now() < het) {
    try { if (await dk()) return true; } catch { /* phần tử chưa có */ }
    await cho(200);
  }
  return false;
}

export function boGhi(nhom) {
  const ds = [];
  const ghi = (ma, tt, ghiChu = '') => {
    if (!TT[tt]) throw new Error(`trạng thái lạ: ${tt}`);
    ds.push({ ma, tt, ghiChu });
    console.log(`${NHAN_IN[tt].padEnd(8)}${ma}  ${ghiChu}`);
  };
  /** Một ca tự động: đạt khi MỌI phép con đúng. `phep` = [[mô tả, đúng/sai], …]. */
  const ca = (ma, phep, ghiChu = '') => {
    const sai = phep.filter(([, dung]) => !dung).map(([t]) => t);
    const moTa = phep.map(([t]) => t).join('; ');
    ghi(ma, sai.length ? 'HONG' : 'DAT', sai.length ? `sai: ${sai.join('; ')}${ghiChu ? ' — ' + ghiChu : ''}` : `${moTa}${ghiChu ? ' — ' + ghiChu : ''}`);
  };
  /** Ca dừng giữa chừng vì lỗi kịch bản/app: ghi Hỏng kèm lý do, không làm sập cả nhóm. */
  const thu = async (ma, fn) => {
    try { await fn(); } catch (e) { ghi(ma, 'HONG', `dừng giữa chừng: ${String(e).split('\n')[0].slice(0, 160)}`); }
  };
  const xong = () => {
    const thuMuc = path.join(TAM, 'kich-ban');
    fs.mkdirSync(thuMuc, { recursive: true });
    fs.writeFileSync(path.join(thuMuc, `${nhom}.json`), JSON.stringify(ds, null, 1));
    const dat = ds.filter(x => x.tt === 'DAT').length;
    const hong = ds.filter(x => x.tt === 'HONG').length;
    console.log(`${dat}/${dat + hong} đạt · ${ds.length - dat - hong} ca ghi nhận khác (test tay / bài khác / chưa có / lỗi đã biết)`);
  };
  return { ghi, ca, thu, xong };
}

export const moTrinhDuyet = () => chromium.launch({ executablePath: CHROMIUM });

/**
 * Ngữ cảnh mới + ghi lại MỌI request của trang (để soát `/v1`, đếm `/auth/refresh`, nhịp
 * `/bootstrap`, header `Idempotency-Key`…). `mang` là mảng sống, đọc lúc nào cũng được.
 */
export async function moTrang(b, { rong = 390, cao = 844, ...khac } = {}) {
  const ctx = await b.newContext({ viewport: { width: rong, height: cao }, ...khac });
  const p = await ctx.newPage();
  const mang = [];
  const loiJs = [];
  const console_ = [];
  p.on('request', r => mang.push({ url: r.url(), method: r.method(), luc: Date.now(), headers: r.headers(), body: r.postData() }));
  p.on('pageerror', e => loiJs.push(String(e).slice(0, 160)));
  p.on('console', m => console_.push(m.text()));
  return { ctx, p, mang, loiJs, console_ };
}

export const anOverlayDev = p => p.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => undefined);

export async function vaoTrang(p) {
  await p.goto(GOC, { waitUntil: 'networkidle' });
  await anOverlayDev(p);
}

export async function dangNhap(p, { tk = 'p@p.vn', mk = 'MatKhauThu-123' } = {}) {
  await p.locator('#dn-id').fill(tk);
  await p.locator('#dn-pw').fill(mk);
  await p.locator('button.login-btn').click();
  await p.locator('.top-bar').waitFor({ timeout: 10000 });
  await anOverlayDev(p);
}

/** Mở trang + đăng nhập, trả về đủ bộ đồ nghề. */
export async function vaoApp(b, tuyChon = {}) {
  const t = await moTrang(b, tuyChon);
  await vaoTrang(t.p);
  await dangNhap(t.p, tuyChon);
  await t.p.locator('.device-card').first().waitFor({ timeout: 10000 });
  return t;
}

export const laV1 = url => /\/v1\//.test(new URL(url).pathname);
export const demYeuCau = (mang, mau, tu = 0) => mang.filter(r => r.luc >= tu && mau.test(new URL(r.url).pathname)).length;

/**
 * Giả cảnh VÉ HẾT HẠN mà không phải chờ 300 giây: request mang vé hiện tại nhận 401, lượt
 * `/auth/refresh` trả vé mới, request mang vé mới đi tiếp tới máy chủ giả. Trả về hàm đếm
 * số lượt refresh đã gọi.
 */
export async function giaVeHetHan(p, { refreshHong = false } = {}) {
  let lanLamMoi = 0;
  const veMoi = `ve-moi-${Date.now()}`;
  await p.route('**/v1/**', async route => {
    const req = route.request();
    const url = req.url();
    if (url.includes('/v1/auth/refresh')) {
      lanLamMoi++;
      if (refreshHong) return route.fulfill({ status: 401, json: { message: 'invalid_token' } });
      return route.fulfill({ status: 200, json: { accessToken: veMoi, refreshToken: `r-${veMoi}`, expiresIn: 300, tenant: 'livotec' } });
    }
    if (/\/v1\/auth\//.test(url)) return route.fallback();
    const ve = (req.headers()['authorization'] || '').replace(/^Bearer /, '');
    if (ve && ve !== veMoi) return route.fulfill({ status: 401, json: { message: 'unauthorized' } });
    return route.fallback();
  });
  return () => lanLamMoi;
}

export const quayLaiTab = p => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

/** Giả tab chạy nền / quay lại: đổi `visibilityState` rồi phát sự kiện như trình duyệt thật. */
export async function datHienTab(p, hien) {
  await p.evaluate(h => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'visible' : 'hidden') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !h });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hien);
}

export function docNhatKy() {
  if (!fs.existsSync(NHAT_KY)) return [];
  return fs.readFileSync(NHAT_KY, 'utf8').trim().split('\n').filter(Boolean).map(d => { try { return JSON.parse(d); } catch { return null; } }).filter(Boolean);
}

export const moChiTiet = async (p, ten) => {
  await p.locator('.device-card').filter({ has: p.locator('.dname', { hasText: ten }) }).first().locator('.card-hit').click();
  await p.locator('.devpage').waitFor({ timeout: 6000 });
  await cho(400);
};
export const dongChiTiet = async p => { await p.locator('.devpage .devback').click(); await cho(400); };
export const sangTab = async (p, ten) => { await p.locator('.bn-item', { hasText: ten }).click(); await cho(500); };
