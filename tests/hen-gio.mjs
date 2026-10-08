import { GOC, GOC_GIA, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Hẹn giờ theo thiết bị — hợp đồng D4 (`/devices/{id}/hen-gio/*`).
 *
 * Màn này dựng xong từ lâu nhưng CHƯA từng có bài kiểm nào: máy chủ giả chỉ có một dòng
 * stub trả thiếu cả `capChoPhep`, `dangDung`, `dangChay`. Giờ máy chủ giả cài thật, nên
 * đi được hết luồng, kể cả ba nhánh chối mà stub không bao giờ dựng ra:
 *   403 sản phẩm tắt hẹn giờ · 404 máy được chia sẻ · 409 sửa `motlan` đang chạy.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 140)));
// Đếm DELETE chương trình bắn ra khỏi trình duyệt — máy chủ giả không ghi nhật ký cửa này.
let soDelete = 0;
p.on('request', r => { if (r.method() === 'DELETE' && /\/hen-gio\/chuong-trinh\/\d+$/.test(r.url())) soDelete++; });
const FAN = '29ff86a0-a76a-11f1-b79e-ad8fe8623469';   // 03092026A1

await p.goto(GOC, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await p.getByPlaceholder(/Email hoặc/).fill('p@p');
await p.getByPlaceholder(/Mật khẩu/).fill('x');
await p.locator('button.login-btn').click(); await p.waitForTimeout(2200);
await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await p.waitForTimeout(900);

const mo = async ten => {
  await p.locator('.device-card').filter({ hasText: ten }).first().locator('.card-hit').click();
  await p.waitForTimeout(1400);
};
const dongMan = async () => { await p.locator('.devback').click(); await p.waitForTimeout(700); };
const ghim = () => p.locator('.hg-ghim');
const moHenGio = async () => { await ghim().click(); await p.waitForTimeout(1200); };
const dongPanel = async () => { await p.locator('.full-panel .icon-button').first().click(); await p.waitForTimeout(800); };
const than = () => p.locator('.full-panel .panel-body').innerText();

try {
  /* ---------- 1. Thanh ghim: hiện/ẩn và nói đúng ---------- */
  await mo('03092026A1');                         // fan_sbi314, CHỦ sở hữu, có hẹn giờ
  ok('máy của mình có hẹn giờ → hiện thanh ghim', await ghim().count() === 1);
  ok('chưa đặt gì thì nói đúng là chưa đặt gì', /chưa đặt gì/.test(await ghim().innerText()));
  await dongMan();

  await mo('fan63903');                            // fan_smart: catalog KHÔNG khai henGio
  ok('sản phẩm không khai hẹn giờ → GIẤU hẳn thanh ghim', await ghim().count() === 0);
  await dongMan();

  await mo('Điều hòa L1 - 2');                     // máy ĐƯỢC CHIA SẺ → hợp đồng trả 404
  ok('máy được chia sẻ → cũng giấu thanh, không mời bấm vào màn báo lỗi', await ghim().count() === 0);
  await dongMan();

  /* ---------- 2. Đặt hẹn bật/tắt ---------- */
  await mo('03092026A1');
  await moHenGio();
  ok('mở được màn hẹn giờ', await p.locator('.full-panel h2').innerText() === 'Hẹn giờ thiết bị');
  ok('chưa có hẹn nào', /Chưa có hẹn|chưa/i.test(await than()));

  await p.locator('.seg-btn', { hasText: 'Sau bao lâu' }).click();
  await p.locator('input[type=number]').first().fill('90');
  await p.locator('button.primary.full').click(); await p.waitForTimeout(1200);
  const sauDat = await than();
  ok('đặt hẹn sau 90 phút: màn hiện hẹn đang chờ', /Sẽ (bật|tắt)/.test(sauDat) && /Huỷ hẹn/.test(sauDat));

  await dongPanel();
  const chuGhim = await ghim().innerText();
  ok(`thanh ghim cập nhật theo hẹn vừa đặt (${chuGhim.split('\n').pop()})`, /sẽ (BẬT|TẮT) lúc/.test(chuGhim));

  await moHenGio();
  await p.locator('.ao-row button.secondary', { hasText: 'Huỷ hẹn' }).first().click(); await p.waitForTimeout(1200);
  ok('huỷ hẹn xong thì về lại trạng thái chưa có hẹn', /Chưa đặt hẹn nào/.test(await p.locator('.soft-card').innerText()));

  /* ---------- 3. Trình soạn chặn đúng từng ràng buộc của spec ---------- */
  await p.locator('.smart-create-button').click(); await p.waitForTimeout(700);
  // Hợp lệ thì KHÔNG có gợi ý nào — đừng để chờ hết hạn rồi báo lỗi nhầm chỗ.
  const goiY = async () => (await p.locator('.full-panel .hint').count()) ? p.locator('.full-panel .hint').last().innerText() : '';
  ok('chưa có tên → nói thiếu tên', /tên/i.test(await goiY()));

  await p.locator('.field input').first().fill('Buổi sáng');
  await p.waitForTimeout(300);
  ok('có tên nhưng bước chưa có hành động → nói đúng bước', /Bước 1/.test(await goiY()));

  await p.locator('.rule-add button.secondary').first().click(); await p.waitForTimeout(400);
  ok('thêm hành động xong thì hợp lệ, nút Lưu mở ra', await p.locator('.form-actions button.primary').isEnabled());

  // mốc giờ TRÙNG nhau — bản cũ không hề bắt, cứ gửi lên rồi nhận 400
  await p.locator('.smart-add-point').click(); await p.waitForTimeout(400);
  await p.locator('.rule-row').nth(1).locator('.rule-add button.secondary').first().click(); await p.waitForTimeout(300);
  await p.locator('.rule-row').nth(1).locator('input[type=time]').fill(await p.locator('.rule-row').first().locator('input[type=time]').inputValue());
  await p.waitForTimeout(400);
  ok('hai bước trùng giờ → chặn ngay trên máy, nêu đúng bước', /Bước 2/.test(await goiY()) && /trùng/i.test(await goiY()));
  await p.locator('.rule-row').nth(1).locator('input[type=time]').fill('07:30'); await p.waitForTimeout(400);
  ok('sửa lệch giờ ra thì hết lỗi', await p.locator('.form-actions button.primary').isEnabled());

  // Đổi sang mốc "phút kể từ lúc bắt đầu": hợp đồng đòi thêm giờ bắt đầu khi còn lặp lại.
  // Ô nhập phải GIEO giá trị vào state chứ không chỉ bày ra màn — bản cũ hiện "06:00" trong
  // khi state vẫn null, nên người dùng nhìn thấy giờ mà màn vẫn báo thiếu giờ, gõ lại đúng
  // 06:00 thì trình duyệt không bắn onChange, và họ kẹt luôn ở đó.
  await p.locator('.seg-btn', { hasText: 'Phút kể từ' }).click(); await p.waitForTimeout(600);
  const gioBatDau = p.locator('.full-panel .field input[type=time]').first();
  ok('đổi sang mốc theo khoảng: giờ bắt đầu được gieo sẵn, không bày số giả',
    (await gioBatDau.inputValue()) === '06:00' && await p.locator('.form-actions button.primary').isEnabled());
  await gioBatDau.fill(''); await p.waitForTimeout(500);
  ok('xoá trắng giờ bắt đầu → chặn', /giờ bắt đầu/i.test(await goiY()));
  await gioBatDau.fill('06:30'); await p.waitForTimeout(500);
  ok('điền lại thì hết lỗi', await p.locator('.form-actions button.primary').isEnabled());

  // mốc khoảng phải TĂNG DẦN
  const soMoc = p.locator('.rule-row input[type=number]');
  await soMoc.nth(1).fill('10'); await p.waitForTimeout(400);   // bước 2 nhỏ hơn bước 1
  ok('mốc khoảng không tăng dần → chặn, nêu đúng bước', /Bước 2/.test(await goiY()) && /muộn hơn/.test(await goiY()));
  await soMoc.nth(1).fill('1500'); await p.waitForTimeout(400); // vượt trần 1440
  ok('mốc vượt 1440 → chặn', /1440/.test(await goiY()));
  await soMoc.nth(1).fill('90'); await p.waitForTimeout(400);
  ok('cho tăng dần trở lại thì hợp lệ', await p.locator('.form-actions button.primary').isEnabled());

  // lặp lại mà bỏ sạch ngày
  let conNgay = await p.locator('.weekday-row button.active').count();
  while (conNgay > 0) { await p.locator('.weekday-row button.active').first().click(); conNgay = await p.locator('.weekday-row button.active').count(); }
  await p.waitForTimeout(400);
  ok('lặp lại mà không chọn ngày nào → chặn', /ngày/i.test(await goiY()) && !await p.locator('.form-actions button.primary').isEnabled());
  await p.locator('.weekday-row button').nth(1).click(); await p.waitForTimeout(400);
  ok('chọn lại một ngày thì hợp lệ', await p.locator('.form-actions button.primary').isEnabled());

  /* ---------- 4. Lưu, kích hoạt, thôi dùng, xoá ---------- */
  await p.locator('.form-actions button.primary').click(); await p.waitForTimeout(1500);
  ok('lưu xong quay về danh sách và thấy chương trình', /Buổi sáng/.test(await than()));

  await p.locator('.space-list .ao-row button.secondary').filter({ hasText: /^Dùng$/ }).first().click(); await p.waitForTimeout(1300);
  ok('kích hoạt: chương trình được đánh dấu đang dùng', /đang dùng/i.test(await than()));

  await dongPanel();
  ok('thanh ghim nói đang dùng chương trình nào', /Buổi sáng/.test(await ghim().innerText()));

  await moHenGio();
  await p.locator('.space-list .ao-row button.secondary').filter({ hasText: 'Thôi dùng' }).first().click(); await p.waitForTimeout(1300);
  ok('thôi dùng: hết đánh dấu đang dùng', !/đang dùng/i.test(await than()));

  /* ---------- 5. Khoá sửa đúng trường hợp 409 ---------- */
  // Nút trong một hàng theo vị trí (NFC/NFD làm so aria-label hay trượt): [Dùng|Thôi dùng, Sửa, Xoá].
  const hang = i => p.locator('.space-list .ao-row').nth(i);
  // `lap` đang dùng: sửa là hợp lệ (200) → nút sửa PHẢI còn bấm được. Đây là chỗ dễ khoá nhầm.
  await hang(0).locator('button.secondary').filter({ hasText: /^Dùng$/ }).click(); await p.waitForTimeout(1300);
  ok('chương trình `lap` đang dùng → nút sửa vẫn bấm được', await hang(0).locator('button').nth(1).isEnabled());
  await hang(0).locator('button.secondary').filter({ hasText: 'Thôi dùng' }).click(); await p.waitForTimeout(1300);

  // `motlan` đang chạy giữa chừng: PUT luôn 409 → không mời bấm. Dựng thẳng trên máy chủ giả.
  // Gọi thẳng từ Node tới máy chủ giả (trong trang thì vướng CORS preflight của POST+JSON).
  const taoRa = await (await fetch(`${GOC_GIA}/v1/devices/${FAN}/hen-gio/chuong-trinh`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ten: 'Một lần', kieu: 'gio', chay: 'motlan', buoc: [{ moc: '06:00', hd: [{ cap: 'power', val: true }] }] }) })).json();
  await fetch(`${GOC_GIA}/v1/devices/${FAN}/hen-gio/chuong-trinh/${taoRa.id}/dung`, { method: 'POST' });
  await dongPanel(); await moHenGio();   // nạp lại tổng quan
  const hangMotLan = p.locator('.space-list .ao-row').filter({ hasText: 'Một lần' });
  ok('chương trình `motlan` đang chạy → nút sửa bị khoá', await hangMotLan.locator('button').nth(1).isDisabled());
  await fetch(`${GOC_GIA}/v1/devices/${FAN}/hen-gio/dang-dung`, { method: 'DELETE' });

  /* ---------- 6. Xoá phải hỏi lại ---------- */
  const truocXoa = await p.locator('.space-list .ao-row').count();
  const deleteTruoc = soDelete;
  await hang(0).locator('button').last().click(); await p.waitForTimeout(500);
  ok('bấm thùng rác một lần → KHÔNG gửi DELETE', soDelete === deleteTruoc);
  ok('và hiện nút xác nhận "Xoá thật?"', await hang(0).locator('button.canh-bao').count() === 1);
  ok('hàng ở trạng thái chờ xác nhận không tràn ngang', await p.locator('.full-panel .panel-body').evaluate(n => n.scrollWidth <= n.clientWidth));
  const nhoXoa = await hang(0).locator('button').evaluateAll(ns => ns.map(n => n.getBoundingClientRect()).filter(r => r.height < 44).length);
  ok(`cả hai nút xác nhận/huỷ ≥44px (${nhoXoa} nhỏ)`, nhoXoa === 0);
  await hang(0).locator('button.secondary', { hasText: 'Huỷ' }).click(); await p.waitForTimeout(400);
  ok('bấm "Huỷ" → không gửi DELETE, thùng rác trở lại', soDelete === deleteTruoc && await hang(0).locator('button.canh-bao').count() === 0);
  await hang(0).locator('button').last().click(); await p.waitForTimeout(400);
  await hang(0).locator('button.canh-bao').click(); await p.waitForTimeout(1300);
  const sauXoa = await p.locator('.space-list .ao-row').count();
  ok(`bấm xác nhận → mới gửi DELETE và chương trình biến mất (${truocXoa} → ${sauXoa})`, soDelete === deleteTruoc + 1 && sauXoa < truocXoa);

  /* ---------- 7. Lỗi tạm giữ thanh ghim, lỗi vĩnh viễn mới giấu ---------- */
  await dongPanel(); await dongMan();
  await p.route('**/hen-gio', route => route.fulfill({ status: 503, json: { message: 'upstream_unavailable' } }));
  await mo('03092026A1');
  ok('máy chủ trả 503 cho GET /hen-gio → thanh ghim VẪN hiện', await ghim().count() === 1);
  ok('…và dòng tóm tắt nói lỗi thay vì "chưa đặt gì"', !/chưa đặt gì/.test(await ghim().innerText()));
  await dongMan();
  await p.unroute('**/hen-gio');
  await p.route('**/hen-gio', route => route.fulfill({ status: 404, json: { message: 'not_found' } }));
  await mo('03092026A1');
  ok('máy chủ trả 404 → thanh ghim biến mất', await ghim().count() === 0);
  await p.unroute('**/hen-gio');
} catch (e) {
  // Vấp giữa chừng vẫn phải in những gì đã đo — không thì mỗi lần hỏng là mất sạch dấu vết.
  R.push(`FAIL  dừng giữa chừng: ${String(e).split('\n')[0].slice(0, 160)}`);
} finally {
console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
}
