/** A6 — Luật tự động, hẹn giờ, thông báo (7 ca). */
import { boGhi, moTrinhDuyet, moTrang, vaoTrang, dangNhap, vaoApp, doi, cho, sangTab } from './chung.mjs';

const { ghi, ca, thu, xong } = boGhi('a6');
const b = await moTrinhDuyet();

/** Mở trình soạn Nếu–Thì và điền tối thiểu: tên, một điều kiện thiết bị, một hành động thông báo. */
async function dienLuat(p) {
  await sangTab(p, 'Tự động');
  await p.locator('.auto-btn.primary').click(); await cho(500);
  const khung = p.locator('.editor-panel');
  await khung.locator('label.field input').first().fill('Kịch bản A6');
  const dk = khung.locator('.rule-section').first().locator('.rule-grid.four').first();
  await dk.locator('select').nth(0).selectOption({ index: 1 }); await cho(200);
  await dk.locator('select').nth(1).selectOption({ index: 1 }); await cho(200);
  const giaTri = dk.locator('select, input').nth(3);
  if (await giaTri.evaluate(n => n.tagName) === 'INPUT') await giaTri.fill('1');
  // Hành động: gửi thông báo cho gọn, khỏi phụ thuộc thiết bị nào đang có lệnh gì.
  const loai = khung.locator('select[aria-label]').filter({ has: p.locator('option[value="notify"]') }).first();
  await loai.selectOption('notify'); await cho(200);
  await khung.locator('input[placeholder]').last().fill('Thông báo thử');
  return khung;
}

await thu('A6-01', async () => {
  const { ctx, p } = await vaoApp(b);
  let than = null;
  await p.route('**/v1/rules', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    than = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { ok: true, id: 901, shadow: true } });
  });
  const khung = await dienLuat(p);
  await khung.locator('button.primary.full').click();
  await doi(async () => than !== null, 4000);
  ca('A6-01', [['lưu luật mới gửi POST /rules', than !== null], [`mặc định ở chế độ thử (shadow = ${than?.shadow})`, than?.shadow === true]]);
  await ctx.close();
});

await thu('A6-02', async () => {
  const { ctx, p } = await vaoApp(b);
  let goi = 0;
  await p.route('**/v1/rules/simulate', route => {
    goi++;
    const c = route.request().postDataJSON().conds?.[0] || {};
    return route.fulfill({ json: { willFire: false, why: 'Điều kiện "Nếu" chưa đúng.', conditions: [{ ...c, pass: false, current: '0' }], gates: [], exclusions: [] } });
  });
  const khung = await dienLuat(p);
  await khung.locator('button.secondary.full').click(); await cho(800);
  const kq = await khung.locator('.rule-preview').innerText().catch(() => '');
  ca('A6-02', [[`bấm mô phỏng gọi /rules/simulate (${goi})`, goi === 1], [`hiện kết quả luật có kích hay không ("${kq.split('\n')[0]}")`, /không chạy|sẽ chạy|chưa đúng/i.test(kq)]],
    'kết quả mô phỏng do máy chủ giả trả — nội dung thật soát trên DEV');
  await ctx.close();
});

ghi('A6-03', 'TAY', 'bật luật thật rồi kích điều kiện bằng thiết bị thật, xem lịch sử chạy — cần IBS + mạch thật');
ghi('A6-04', 'KHAC', 'tests/hen-gio.mjs (37 phép: tạo · kích hoạt · thôi dùng · sửa · xoá) — chạy nhóm api');
ghi('A6-05', 'KHAC', 'tests/hen-gio.mjs — 409 "Chương trình đang chạy giữa chừng — dừng rồi hãy sửa" hiện nguyên văn');
ghi('A6-06', 'KHAC', 'tests/quyet-dinh.mjs — đủ hạn mức luật thì khoá nút Nếu–Thì và nói con số');

await thu('A6-07', async () => {
  // Danh sách thông báo tải lúc đăng nhập: dựng dữ liệu trước.
  const { ctx, p, mang } = await moTrang(b);
  const items = [
    { id: 1, type: 'device', title: 'Máy lọc nước', body: 'Lõi lọc còn 15%', read: false, created_at: new Date().toISOString() },
    { id: 2, type: 'device', title: 'Điều hoà', body: 'Đã bật ở 26°C', read: false, created_at: new Date().toISOString() },
  ];
  let daDoc = false;
  await p.route('**/v1/notifications', route => route.fulfill({ json: { unread: daDoc ? 0 : 2, items: items.map(x => ({ ...x, read: daDoc })) } }));
  await p.route('**/v1/notifications/read', route => { daDoc = true; return route.fulfill({ json: { ok: true } }); });
  await vaoTrang(p); await dangNhap(p); await p.locator('.device-card').first().waitFor();
  const chuong = p.locator('.top-actions .icon-btn').first();
  const nhanTruoc = await chuong.getAttribute('aria-label');
  const coCham = await p.locator('.top-actions .dot').count() === 1;
  await chuong.click(); await cho(600);
  const soDong = await p.locator('.notif-row').count();
  const guiDoc = mang.some(r => r.url.includes('/v1/notifications/read'));
  await p.locator('.modal-close').first().click(); await cho(300);
  ca('A6-07', [[`số đếm trên chuông đúng ("${nhanTruoc}")`, /\(2\)/.test(nhanTruoc || '') && coCham], [`danh sách hiện ${soDong} thông báo`, soDong === 2],
    ['mở ra thì đánh dấu đã đọc (POST /notifications/read)', guiDoc], ['chấm đỏ tắt sau khi đọc', await p.locator('.top-actions .dot').count() === 0]]);
  await ctx.close();
});

xong();
await b.close();
