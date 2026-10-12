/**
 * A7 — Thêm thiết bị (22 ca). A7a (mã ① và trang portal trên mạch) là việc của phần cứng và
 * điện thoại thật — ghi test tay. A7b đo trên webapp với máy chủ giả.
 */
import { boGhi, moTrinhDuyet, moTrang, vaoTrang, dangNhap, vaoApp, cho, GOC } from './chung.mjs';

const { ghi, ca, thu, xong } = boGhi('a7');
const b = await moTrinhDuyet();

const TAY_A7A = [
  ['A7-01', 'quét mã ① bằng camera iPhone → "Kết nối mạng mzService"'],
  ['A7-02', 'quét mã ① bằng camera 2–3 dòng Android'],
  ['A7-03', 'quét mã ① bằng Zalo — ghi tự kết nối hay chỉ hiện chữ WIFI:…'],
  ['A7-04', 'vào mạng mzService → trang portal tự bật lên'],
  ['A7-05', 'danh sách Wi-Fi trên portal: chỉ 2,4 GHz, sắp theo sóng, không trùng tên'],
  ['A7-06', 'nhập sai mật khẩu Wi-Fi → báo rõ, thử lại không phải rút điện mạch'],
  ['A7-07', 'mật khẩu Wi-Fi dưới 8 ký tự → chặn ngay trên trang portal'],
  ['A7-08', 'mật khẩu đúng → "Đã vào Wi-Fi" hoặc "Mất kết nối với thiết bị"'],
  ['A7-09', 'điện thoại tự quay về Wi-Fi nhà; mạch tắt mzService'],
  ['A7-10', '"Mạng của tôi không có trong danh sách" → nhập được tên mạng ẩn'],
  ['A7-11', 'mạng không mật khẩu → không hỏi mật khẩu'],
];
for (const [ma, viec] of TAY_A7A) ghi(ma, 'TAY', `${viec} — trang portal chạy trên mạch, cần mạch thật + điện thoại`);

const moThem = async p => {
  await p.locator('.top-actions .icon-btn').last().click(); await cho(300);
  await p.locator('.drawer-item').filter({ has: p.locator('.emo:text("📶")') }).click(); await cho(500);
};
const tiep = p => p.locator('.add-flow button.primary.full');
async function nhanQuaTem(p, ten, ma, tenHienThi = '') {
  await moThem(p);
  await p.locator('.method-card').first().click(); await cho(300);
  await p.getByPlaceholder(/fan81029/).fill(ten);
  await p.getByPlaceholder(/5 số/).fill(ma);
  await tiep(p).click(); await cho(300);                                   // → ghép nối
  const boQua = p.locator('.add-flow button.secondary.full', { hasText: /Bỏ qua/ });
  await (await boQua.count() ? boQua : tiep(p)).click(); await cho(300);   // → Wi-Fi (mô phỏng)
  await tiep(p).click(); await cho(300);                                   // → đặt tên
  if (tenHienThi) await p.locator('.add-flow .field input').first().fill(tenHienThi);
  await tiep(p).click(); await cho(1500);                                  // Hoàn tất → POST /claim
}

ghi('A7-12', 'KHAC', 'tests/them-thiet-bi.mjs — POST /claim mang name = TÊN TRÊN TEM, PATCH /devices mang tên hiển thị');
ghi('A7-13', 'KHAC', 'tests/them-thiet-bi.mjs — nhánh mạch thật gọi /claim-mach-that NGAY, không qua màn Wi-Fi');

await thu('A7-14', async () => {
  // Thử các dạng deep-link mã ② hay gặp; app chưa có thì không mở màn thêm thiết bị.
  const { ctx, p } = await vaoApp(b);
  const mo = [];
  for (const duoi of ['/#claim=fan81029:12345', '/?claim=fan81029&ma=12345', '/them-thiet-bi#fan81029:12345']) {
    await p.goto(GOC + duoi, { waitUntil: 'domcontentloaded' }); await cho(2500);
    mo.push(await p.locator('.add-flow').count() > 0);
  }
  ghi('A7-14', mo.some(Boolean) ? 'DAT' : 'CHUA_CO', mo.some(Boolean) ? 'deep-link mở thẳng màn thêm thiết bị' : 'app chưa có deep-link mã ② — mở link (#claim=…, ?claim=…, /them-thiet-bi#…) chỉ vào màn chính');
  await ctx.close();
});
ghi('A7-15', 'CHUA_CO', 'phụ thuộc A7-14: chưa có deep-link nên chưa có "đăng nhập xong quay về đúng màn, giữ tên + mã"');
ghi('A7-16', 'CHUA_CO', 'phụ thuộc A7-14: chưa có link mã ② để soát mã claim trong request');

await thu('A7-17', async () => {
  const { ctx, p } = await vaoApp(b);
  const truoc = await p.locator('.device-card').count();
  await nhanQuaTem(p, 'fan81029', '12345', 'Quạt kịch bản A7');
  const xongMan = await p.locator('.add-flow .finished').count() === 1;
  await p.locator('.add-flow .panel-head .icon-button').click(); await cho(1200);
  const sau = await p.locator('.device-card').count();
  const trongDs = await p.locator('.device-card .dname', { hasText: 'Quạt kịch bản A7' }).count() === 1;
  ca('A7-17', [['nhận hợp lệ (201) → màn báo đã thêm', xongMan], [`thiết bị xuất hiện trong danh sách (${truoc} → ${sau} thẻ)`, trongDs && sau === truoc + 1]]);
  await ctx.close();
});

ghi('A7-18', 'KHAC', 'tests/them-thiet-bi.mjs — 404 → ở lại bước, hiện câu chung "Không tìm thấy, hoặc bạn không có quyền"');

await thu('A7-19', async () => {
  const { ctx, p } = await moTrang(b);
  await p.route('**/v1/claim', route => route.fulfill({ status: 403, json: { message: 'Bạn đã thử sai quá nhiều lần. Thử lại sau 10 phút.' } }));
  await p.route('**/v1/claim-mach-that', route => route.fulfill({ status: 400, json: { message: 'Bạn đã thử quá 10 lần trong 10 phút. Thử lại sau 10 phút.' } }));
  await vaoTrang(p); await dangNhap(p); await p.locator('.device-card').first().waitFor();
  await nhanQuaTem(p, 'saitem', '99999');
  const cau403 = (await p.locator('.add-flow .form-message').innerText().catch(() => '')).trim();
  await p.locator('.add-flow .panel-head .icon-button').click(); await cho(400);
  await moThem(p);
  await p.locator('.method-card').nth(1).click(); await cho(300);
  await p.locator('.add-flow .field input').first().fill('40A99999999');
  await tiep(p).click(); await cho(1200);
  const cau400 = (await p.locator('.add-flow .form-message').innerText().catch(() => '')).trim();
  // Hợp đồng: 403 mang {"message":"<câu tiếng Việt>"} — app phải hiện được câu đó.
  ca('A7-19', [[`tem QR: 403 → câu dễ hiểu, nói chờ rồi thử lại ("${cau403}")`, /thử lại sau 10 phút/i.test(cau403)],
    [`mạch thật: 400 quá 10 lần → hiện nguyên văn câu máy chủ ("${cau400.slice(0, 50)}…")`, cau400.includes('Thử lại sau 10 phút')]]);
  await ctx.close();
});

await thu('A7-20', async () => {
  const { ctx, p } = await vaoApp(b);
  await nhanQuaTem(p, 'fan81029', '12345');   // đã nhận ở A7-17 → máy chủ trả 404
  const cau = (await p.locator('.add-flow .form-message').innerText().catch(() => '')).trim();
  ca('A7-20', [[`nhận lại thiết bị vừa nhận → 404, câu chung ("${cau}")`, /Không tìm thấy, hoặc bạn không có quyền/.test(cau)], ['không báo đã thêm', await p.locator('.add-flow .finished').count() === 0]]);
  await ctx.close();
});

ghi('A7-21', 'KHAC', 'tests/them-thiet-bi.mjs — serial sai → 400, hiện NGUYÊN VĂN message tiếng Việt của máy chủ');
ghi('A7-22', 'KHAC', 'tests/them-thiet-bi.mjs — dangNoi:false → có dòng nhắc mạch chưa online');

xong();
await b.close();
