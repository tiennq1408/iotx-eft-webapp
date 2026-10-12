/** A5 — Chia sẻ (7 ca). Ca cần tài khoản thứ hai và IBS thật thì ghi test tay. */
import { boGhi, moTrinhDuyet, moTrang, vaoTrang, dangNhap, vaoApp, cho, moChiTiet } from './chung.mjs';

const { ghi, ca, thu, xong } = boGhi('a5');
const b = await moTrinhDuyet();

const moChiaSe = async p => {
  await p.locator('.top-actions .icon-btn').last().click(); await cho(300);
  await p.locator('.drawer .drawer-item', { hasText: 'Thành viên' }).click(); await cho(600);
};

await thu('A5-01', async () => {
  const { ctx, p } = await vaoApp(b);
  // Tài khoản không sở hữu nhà nào: bỏ mọi danh mục "house" khỏi /bootstrap.
  await p.route('**/v1/bootstrap**', async route => {
    const r = await route.fetch(); const j = await r.json();
    j.categories = (j.categories || []).filter(c => c.kind !== 'house');
    for (const d of j.devices || []) d.house = '';
    return route.fulfill({ response: r, json: j, headers: { ...r.headers(), etag: `W/"kb-${Date.now()}"` } });
  });
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.locator('.device-card').first().waitFor();
  await moChiaSe(p);
  const chu = await p.locator('.modal-layer').last().innerText();
  ca('A5-01', [['có hướng dẫn "tạo nhà trước"', /chưa có nhà nào/i.test(chu) && /tạo nhà/i.test(chu)], ['không hiện form mời khi chưa có nhà', await p.locator('input[type="email"]').count() === 0]]);
  await ctx.close();
});

ghi('A5-02', 'TAY', 'mời tài khoản 2 ở phạm vi nhà, tài khoản 2 thấy lời mời — cần tài khoản thứ hai trên IBS thật');
ghi('A5-03', 'TAY', 'phạm vi phòng / thiết bị, tài khoản 2 chỉ thấy đúng phạm vi — cần tài khoản thứ hai trên IBS thật');
ghi('A5-04', 'TAY', 'đổi quyền xem / điều khiển / chặn xoá rồi thử bằng tài khoản 2 — cần tài khoản thứ hai trên IBS thật');

await thu('A5-05', async () => {
  // Danh sách "đã chia sẻ" tải lúc đăng nhập, nên phải dựng dữ liệu TRƯỚC khi đăng nhập.
  const { ctx, p, mang } = await moTrang(b);
  await p.route('**/v1/shares', route => route.request().method() === 'GET'
    ? route.fulfill({ json: { granted: [{ id: 77, member_email: 'ban@vi-du.vn', member_sub: 'sub-1', house: 'Nhà A', scope: 'house', perms: { control: true, create: false, delete: false } }], receivedFromOthers: [] } })
    : route.fallback());
  await p.route('**/v1/shares/77', route => route.fulfill({ json: { ok: true } }));
  await vaoTrang(p); await dangNhap(p); await p.locator('.device-card').first().waitFor();
  await moChiaSe(p);
  await p.locator('.modal-layer button[aria-label="Gỡ quyền"]').first().click(); await cho(300);
  const xacNhan = p.locator('button.go-that');
  const coBuoc2 = await xacNhan.count() === 1;
  const chuaGui = !mang.some(r => r.method === 'DELETE' && r.url.includes('/v1/shares/77'));
  if (coBuoc2) { await xacNhan.click(); await cho(600); }
  const daGui = mang.some(r => r.method === 'DELETE' && r.url.includes('/v1/shares/77'));
  ca('A5-05', [['bấm thu hồi → hỏi xác nhận bước hai', coBuoc2], ['chưa xác nhận thì chưa gửi gì', chuaGui], ['xác nhận → DELETE /shares/{id}', daGui]],
    '"mất quyền ngay" phía tài khoản 2 phải thử tay trên IBS thật');
  await ctx.close();
});

await thu('A5-06', async () => {
  const { ctx, p } = await vaoApp(b);
  await p.route('**/v1/shares', route => route.request().method() === 'POST' ? route.fulfill({ status: 404, json: { message: 'not_found' } }) : route.fallback());
  await moChiaSe(p);
  await p.locator('input[type="email"]').fill('khong-ton-tai@vi-du.vn');
  await p.locator('form.stack button[type="submit"], form.stack .primary').first().click(); await cho(700);
  const chu = await p.locator('.form-message, .dynamic-error, [role="alert"], [role="status"]').allInnerTexts().then(x => x.join(' '));
  ca('A5-06', [[`có báo lỗi ("${chu.trim().slice(0, 60)}")`, chu.trim().length > 0], ['câu báo không lộ email có tài khoản hay không', !/không tồn tại|chưa đăng ký|không có tài khoản|no such user/i.test(chu)]]);
  await ctx.close();
});

await thu('A5-07', async () => {
  const dem = async (p, s) => p.locator(`.devpage ${s}`).count();
  // (1) Đúng dữ liệu giả: SBI314 là máy được chia sẻ nhưng perms đủ cả control/create/delete.
  let { ctx, p } = await vaoApp(b);
  await moChiTiet(p, 'SBI314');
  const coHenGio = await dem(p, '.hg-ghim');
  const hienSua = await dem(p, '.dev-but') + await dem(p, '.fav-lon') + await dem(p, 'select.fsel');
  await ctx.close();
  // (2) Quyền điển hình của người nhận: được điều khiển, không được sửa/xoá.
  ({ ctx, p } = await vaoApp(b));
  await p.route('**/v1/bootstrap**', async route => {
    const r = await route.fetch(); const j = await r.json();
    const d = j.devices.find(x => (x.label || x.name) === 'SBI314'); if (d) d.perms = { control: true, create: false, delete: false };
    return route.fulfill({ response: r, json: j, headers: { ...r.headers(), etag: `W/"kb-${Date.now()}"` } });
  });
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.locator('.device-card').first().waitFor();
  await moChiTiet(p, 'SBI314');
  const conSao = await dem(p, '.fav-lon');
  const anKhiKhongQuyen = await dem(p, '.dev-but') + await dem(p, 'select.fsel') === 0;
  ca('A5-07', [['thanh hẹn giờ biến mất trên máy được chia sẻ', coHenGio === 0],
    ['người nhận không có quyền sửa → không thấy bút và ba ô gán', anKhiKhongQuyen],
    [`người nhận không có quyền sửa → không thấy sao ghim (đang hiện ${conSao})`, conSao === 0],
    [`máy được chia sẻ nhưng perms đủ quyền → vẫn hiện ${hienSua} nút sửa (tài liệu đòi ẩn hẳn)`, hienSua === 0]],
    'app ẩn bút + ô gán theo perms.create/control, không theo cờ shared; sao ghim luôn hiện vì là lựa chọn riêng của người dùng (PATCH /devices "theo NGƯỜI DÙNG"); bài dau-man.mjs lại đang đổi tên chính máy chia sẻ SBI314 — cần chốt quy tắc');
  await ctx.close();
});

xong();
await b.close();
