import { GOC, NHAT_KY, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';

/**
 * Luồng thêm thiết bị — cơ chế theo web.dev (đo 08/10/2026), giao diện của local.
 *
 * `/claim` đòi `name` là TÊN IN TRÊN TEM, không phải tên hiển thị; nhánh serial gọi
 * `/claim-mach-that` ngay, không đi qua màn Wi-Fi. Bài này soi nhật ký máy chủ giả để chắc
 * mỗi cửa nhận đúng trường, và soi cả cách báo lỗi — bản web.dev nuốt lỗi 404, local thì không.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
try { fs.unlinkSync(NHAT_KY); } catch { /* chưa có */ }
const ghi = cua => (fs.existsSync(NHAT_KY) ? fs.readFileSync(NHAT_KY, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [])
  .filter(x => x.cua === cua);

const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 140)));

await p.goto(GOC, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await p.getByPlaceholder(/Email hoặc/).fill('p@p');
await p.getByPlaceholder(/Mật khẩu/).fill('x');
await p.locator('button.login-btn').click(); await p.waitForTimeout(2200);

const moThem = async () => {
  await p.locator('.top-actions .icon-btn').last().click(); await p.waitForTimeout(300);
  await p.locator('.drawer-item').filter({ has: p.locator('.emo:text("📶")') }).click(); await p.waitForTimeout(500);
};
const dongThem = async () => { await p.locator('.add-flow .panel-head .icon-button').click(); await p.waitForTimeout(400); };
const buoc = () => p.locator('.add-flow .panel-head span').innerText();
const tiep = () => p.locator('.add-flow button.primary.full');
const loiMan = () => p.locator('.add-flow .form-message');
/**
 * Bước ghép nối: trình duyệt có Web Bluetooth (Chromium) thì nút chính mở hộp chọn thiết bị
 * thật — không tự động được trong bài kiểm — nên đi tiếp bằng "Bỏ qua (mô phỏng)"; trình
 * duyệt không có (iPhone) thì chỉ còn nút mô phỏng.
 */
const quaGhepNoi = async () => {
  const boQua = p.locator('.add-flow button.secondary.full', { hasText: /Bỏ qua/ });
  await (await boQua.count() ? boQua : tiep()).click();
  await p.waitForTimeout(300);
};

try {
  /* ---------- A. Nhánh QR, tên/mã sai → 404: ở lại bước, hiện câu chung ---------- */
  await moThem();
  await p.locator('.method-card').first().click(); await p.waitForTimeout(300);
  ok('nhánh QR có HAI ô: tên trên tem và mã 5 số', await p.getByPlaceholder(/fan81029/).count() === 1 && await p.getByPlaceholder(/5 số/).count() === 1);
  await p.getByPlaceholder(/fan81029/).fill('khongco');
  await p.getByPlaceholder(/5 số/).fill('99999');
  await tiep().click(); await p.waitForTimeout(300);                       // → ghép nối
  const chuGhepNoi = await p.locator('.add-flow .panel-body').innerText();
  ok('bước ghép nối: hoặc mời ghép nối thật theo tên tem, hoặc nói rõ là mô phỏng', /khongco|mô phỏng/i.test(chuGhepNoi));
  await quaGhepNoi();                                                      // → Wi-Fi (mô phỏng)
  ok('bước Wi-Fi cũng nói rõ là mô phỏng', /mô phỏng/i.test(await p.locator('.add-flow .panel-body').innerText()));
  await tiep().click(); await p.waitForTimeout(300);                       // → đặt tên
  const buocTruoc = await buoc();
  await tiep().click(); await p.waitForTimeout(1200);                      // Hoàn tất → claim → 404
  ok(`máy chủ 404 → màn VẪN ở bước đang đứng (${buocTruoc} → ${await buoc()})`, (await buoc()) === buocTruoc && await p.locator('.add-flow .finished').count() === 0);
  ok('…và hiện câu lỗi CHUNG, không đoán nguyên nhân', /Không tìm thấy, hoặc bạn không có quyền/.test(await loiMan().innerText()));
  await dongThem();

  /* ---------- B. Nhánh QR, đúng tem → claim nhận tên tem, PATCH nhận tên hiển thị ---------- */
  await moThem();
  await p.locator('.method-card').first().click(); await p.waitForTimeout(300);
  await p.getByPlaceholder(/fan81029/).fill('fan81029');
  await p.getByPlaceholder(/5 số/).fill('1234');
  ok('mã 5 số mới có 4 chữ số → nút tiếp tục khoá', await tiep().isDisabled());
  await p.getByPlaceholder(/5 số/).fill('12345');
  ok('đủ 5 chữ số → mở', await tiep().isEnabled());
  await tiep().click(); await p.waitForTimeout(300);                       // → ghép nối
  await quaGhepNoi();                                                      // → Wi-Fi
  await tiep().click(); await p.waitForTimeout(300);                       // → đặt tên
  await p.locator('.add-flow .field input').first().fill('Quạt phòng khách');
  await tiep().click(); await p.waitForTimeout(1500);
  const claim = ghi('POST /claim').at(-1);
  ok(`/claim nhận đúng tên TEM + mã (${JSON.stringify(claim?.than)})`, claim?.than?.name === 'fan81029' && claim?.than?.secret === '12345');
  const patchQr = ghi('PATCH /devices').find(x => x.id === claim?.id);
  ok('nhận xong → PATCH /devices mang label = tên HIỂN THỊ, kèm house/room/grp',
    patchQr?.patch?.label === 'Quạt phòng khách' && 'house' in (patchQr?.patch ?? {}) && 'room' in (patchQr?.patch ?? {}) && 'grp' in (patchQr?.patch ?? {}));
  ok('màn báo đã thêm', await p.locator('.add-flow .finished').count() === 1);
  await dongThem();

  /* ---------- C. Nhánh serial: gọi claim-mach-that NGAY, 400 hiện nguyên văn ---------- */
  await moThem();
  await p.locator('.method-card').nth(1).click(); await p.waitForTimeout(300);
  ok('nhánh serial: thanh tiến trình chỉ có 3 đoạn', await p.locator('.add-flow .progress i').count() === 3 && /\/3$/.test(await buoc()));
  const serialInput = p.locator('.add-flow .field input').first();
  await serialInput.fill('XXX');
  await tiep().click(); await p.waitForTimeout(1200);
  const machSai = ghi('POST /claim-mach-that').at(-1);
  ok('nhập serial rồi bấm → gọi POST /claim-mach-that NGAY', machSai?.than?.serial === 'XXX');
  ok('không đi qua màn Wi-Fi', await p.locator('.add-flow select').count() === 0 && await p.locator('.add-flow .pairing').count() === 0);
  ok('máy chủ 400 kèm câu tiếng Việt → hiện NGUYÊN VĂN', (await loiMan().innerText()).trim() === 'Không nhận được mạch này. Kiểm lại serial in trên vỏ; nếu đúng rồi thì mạch có thể đã thuộc tài khoản khác.');

  await serialInput.fill('OFF00001');                                      // máy chủ giả: nhận được nhưng chưa online
  await tiep().click(); await p.waitForTimeout(1200);
  ok('nhận xong nhảy thẳng tới bước đặt tên', await p.locator('.add-flow .success-hero').count() === 1 && await p.locator('.add-flow select').count() === 1);
  ok('dangNoi:false → có dòng nhắc mạch chưa online', /chưa thấy|chưa online|online/i.test(await p.locator('.add-flow .hint').innerText()));
  await p.locator('.add-flow .field input').first().fill('Mạch thử');
  await tiep().click(); await p.waitForTimeout(1500);
  const mach = ghi('POST /claim-mach-that').at(-1);
  const patchMach = ghi('PATCH /devices').find(x => x.id === mach?.id);
  ok('nhánh serial: PATCH /devices mang tên hiển thị', patchMach?.patch?.label === 'Mạch thử');
  ok('màn báo đã thêm, vẫn nhắc chưa online', await p.locator('.add-flow .finished').count() === 1 && await p.locator('.add-flow .finished .hint').count() === 1);

  /* ---------- D. Khổ hẹp: không tràn ngang, nút ≥44px ---------- */
  ok('không tràn ngang ở 390px', await p.locator('.add-flow .panel-body').evaluate(n => n.scrollWidth <= n.clientWidth));
  const nho = await p.locator('.add-flow button').evaluateAll(ns => ns.map(n => n.getBoundingClientRect()).filter(r => r.width > 0 && (r.height < 44 || r.width < 44)).length);
  ok(`mọi nút ≥44px (${nho} nhỏ)`, nho === 0);
} catch (e) {
  R.push(`FAIL  dừng giữa chừng: ${String(e).split('\n')[0].slice(0, 160)}`);
} finally {
  console.log(R.join('\n'));
  console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
  console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
  await b.close();
}
