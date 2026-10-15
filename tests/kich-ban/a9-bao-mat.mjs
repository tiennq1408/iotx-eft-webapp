/** A9 — Bảo mật và hợp đồng (6 ca). */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { boGhi, moTrinhDuyet, moTrang, vaoTrang, dangNhap, cho, moChiTiet, dongChiTiet, GOC } from './chung.mjs';

const { ghi, ca, thu, xong } = boGhi('a9');
const b = await moTrinhDuyet();
// fileURLToPath chứ không `.pathname`: thư mục dự án có dấu cách, `.pathname` ra `%20` và
// bài quét im lặng không tìm thấy gì — tức là "đạt" mà chưa quét.
const GOC_DA = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const MAT_KHAU = 'KichBan-MatKhau-Bi-Mat-2026';
const VE = 've-truy-cap-kich-ban-1f9c2e7a';

/**
 * Một buổi dùng app đủ các luồng chính, với vé và mật khẩu NHẬN DIỆN ĐƯỢC để soát xem
 * chúng có lọt ra URL, console hay request lạ không.
 */
async function buoiDung() {
  const t = await moTrang(b);
  const { p } = t;
  const diaChi = [];
  p.on('framenavigated', f => { if (f === p.mainFrame()) diaChi.push(f.url()); });
  await p.route('**/v1/auth/login', route => route.fulfill({ json: { accessToken: VE, refreshToken: `r-${VE}`, expiresIn: 300, tenant: 'livotec' } }));
  await vaoTrang(p);
  await dangNhap(p, { mk: MAT_KHAU });
  await p.locator('.device-card').first().waitFor();
  await p.locator('.device-card .switch-hit[role="switch"]').first().click(); await cho(600);
  await p.locator('.device-card .switch-hit[role="switch"]').first().click(); await cho(600);
  await moChiTiet(p, 'fan63903'); await dongChiTiet(p);
  await p.locator('.top-actions .icon-btn').last().click(); await cho(300);
  await p.locator('.drawer .drawer-item').filter({ hasText: /Thêm thiết bị|Add device/ }).click(); await cho(500);
  await p.locator('.method-card').first().click(); await cho(300);
  await p.getByPlaceholder(/fan81029/).fill('tem-kich-ban'); await p.getByPlaceholder(/5 số/).fill('54321');
  await p.locator('.add-flow .panel-head .icon-button').click(); await cho(400);
  await p.locator('.top-bar .profile-chip').click(); await cho(300);
  await p.locator('.tk-popup .menu-dang-xuat').click(); await cho(800);
  diaChi.push(p.url());
  return { ...t, diaChi };
}

const buoi = await buoiDung();

await thu('A9-01', async () => {
  const goc = new URL(GOC).origin;
  const ngoai = buoi.mang.filter(r => !r.url.startsWith('data:') && !r.url.startsWith('blob:') && new URL(r.url).origin !== goc).map(r => r.url);
  const api = buoi.mang.filter(r => new URL(r.url).origin === goc && !/^\/(_next|images|favicon|icons?)\b|\.(png|jpe?g|svg|webp|ico|woff2?|css|js)$/.test(new URL(r.url).pathname) && new URL(r.url).pathname !== '/');
  const ngoaiV1 = api.filter(r => !new URL(r.url).pathname.startsWith('/v1/')).map(r => new URL(r.url).pathname);
  const cam = buoi.mang.filter(r => /keycloak|\/realms\/|thingsboard|\/api\/plugins|\/v1\/(admin|internal)\b/i.test(r.url)).map(r => r.url);
  ca('A9-01', [[`không gọi ra ngoài trang (${ngoai.length}${ngoai.length ? ': ' + [...new Set(ngoai)].slice(0, 3).join(', ') : ''})`, ngoai.length === 0],
    [`mọi lời gọi dữ liệu đi qua /v1/* (${api.length} request${ngoaiV1.length ? '; lạc: ' + [...new Set(ngoaiV1)].slice(0, 3).join(', ') : ''})`, ngoaiV1.length === 0],
    ['không Keycloak, không ThingsBoard, không admin/*, internal/*', cam.length === 0]]);
});

await thu('A9-02', async () => {
  const lo = buoi.diaChi.filter(u => [VE, MAT_KHAU, '54321', 'tem-kich-ban', 'r-' + VE].some(x => u.split('#')[0].includes(x)));
  const lichSu = await buoi.p.evaluate(() => history.length);
  ca('A9-02', [[`${buoi.diaChi.length} địa chỉ đã đi qua không chứa vé, mật khẩu, mã claim`, lo.length === 0]],
    `lịch sử có ${lichSu} mục — app một trang, không đẩy URL mới theo màn`);
});

await thu('A9-03', async () => {
  const MAU = [
    [/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\./, 'JWT'],
    [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'khoá riêng'],
    [/\bAKIA[0-9A-Z]{16}\b/, 'khoá AWS'],
    [/AIza[0-9A-Za-z_-]{35}/, 'khoá Google API'],
    [/client_secret\s*[:=]\s*["'][^"'\s]{8,}/i, 'client_secret'],
    [/(password|passwd|mat_?khau)\s*[:=]\s*["'][^"'\s]{6,}["']/i, 'mật khẩu viết cứng'],
  ];
  let soTep = 0;
  const quet = (thuMuc, duoi) => {
    const ra = [];
    const di = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const day = path.join(d, f.name);
      if (f.isDirectory()) { if (!/node_modules|\.git|\.next\/cache|\.tam|\.venv|ketqua/.test(day)) di(day); continue; }
      if (!duoi.test(f.name)) continue;
      soTep++;
      const chu = fs.readFileSync(day, 'utf8');
      for (const [m, ten] of MAU) if (m.test(chu)) ra.push(`${path.relative(GOC_DA, day)} (${ten})`);
    } };
    if (fs.existsSync(thuMuc)) di(thuMuc);
    return ra;
  };
  const thuMucNguon = ['app', 'components', 'lib', 'hooks', 'public'].map(d => path.join(GOC_DA, d));
  if (!thuMucNguon.every(d => fs.existsSync(d))) throw new Error(`không thấy thư mục mã nguồn ở ${GOC_DA}`);
  const nguon = thuMucNguon.flatMap(d => quet(d, /\.(tsx?|jsx?|mjs|json|css|html)$/));
  const tepNguon = soTep; soTep = 0;
  const banBuild = quet(path.join(GOC_DA, '.next', 'static'), /\.(js|json|html)$/);
  const coBuild = fs.existsSync(path.join(GOC_DA, '.next', 'static'));
  const tepBuild = soTep;
  ca('A9-03', [[`${tepNguon} tệp nguồn không chứa mật khẩu, khoá, token${nguon.length ? ': ' + nguon.slice(0, 4).join(', ') : ''}`, nguon.length === 0],
    [`${tepBuild} tệp build (.next/static) sạch${coBuild ? '' : ' — CHƯA có bản build để soát'}${banBuild.length ? ': ' + banBuild.slice(0, 4).join(', ') : ''}`, coBuild && tepBuild > 0 && banBuild.length === 0], ['thật sự đã quét (> 50 tệp nguồn)', tepNguon > 50]]);
});

ghi('A9-04', 'TAY', 'webapp không có URL theo thiết bị (app một trang) — thử bằng curl GET/PATCH /v1/devices/<id máy người khác> trên DEV, mong đợi 404 {"message":"not_found"}');

await thu('A9-05', async () => {
  const lo = buoi.console_.filter(x => x.includes(VE) || x.includes(MAT_KHAU) || x.includes('r-' + VE));
  ca('A9-05', [[`${buoi.console_.length} dòng console không in vé hay mật khẩu`, lo.length === 0]]);
  await buoi.ctx.close();
});

await thu('A9-06', async () => {
  // Gửi đường dẫn THÔ, không chuẩn hoá — tương đương `curl --path-as-is`.
  const goi = duong => new Promise(res => {
    const u = new URL(GOC);
    const req = http.request({ host: u.hostname, port: u.port, path: duong, method: 'GET' }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ ma: r.statusCode, than: d })); });
    req.on('error', e => res({ ma: 0, than: String(e) })); req.end();
  });
  const duong = ['/v1/admin/tenants', '/v1/internal/telemetry', '/v1/../internal/telemetry', '/v1/%2e%2e/internal/telemetry', '/v1/%2E%2E/admin/x',
    '/v1/x/../admin/y', '/v1/ADMIN/x', '/v1/./internal/x', '/v1/devices/..%2f..%2finternal', '/v1/health'];
  const lot = [];
  for (const d of duong) { const r = await goi(d); if (r.ma === 200 || r.than.includes('loRa')) lot.push(`${d} → ${r.ma}`); }
  ca('A9-06', [[`${duong.length} đường thử admin/internal/.. qua proxy đều bị chặn${lot.length ? ' — LỌT: ' + lot.join(', ') : ''}`, lot.length === 0]],
    'đo proxy /v1 của webapp; Caddy trên DEV phải thử thêm bằng curl --path-as-is');
});

xong();
await b.close();
