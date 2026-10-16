import { GOC, GOC_GIA, anh, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Dải cảnh báo lỗi (`ui.boCuc.alarm`) với mã catalog KHÔNG khai (docs/viec-hien-ma-loi-la.md).
 *
 * Máy lạnh trên DEV báo `ac_error_catalog = "1"`, trong khi catalog chỉ khai 26 mã chữ–số
 * (C2, E0, L4…). Bản cũ lọc mã theo `cap.values` nên "1" bị loại, dải cảnh báo không vẽ —
 * thiết bị đang lỗi mà người dùng không thấy gì. Giờ mã không tra được tên vẫn hiện, dạng
 * "Mã lỗi 1".
 *
 * Hai ca cuối ("0" và rỗng) chốt rằng bỏ bộ lọc KHÔNG làm "không lỗi" thành "có lỗi": phần
 * bảo vệ đó nằm ở `maLoi()` và phải giữ nguyên.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const AC = '10c81a40-b71d-11f1-b79e-ad8fe8623469';   // Điều hòa L1 - 2, sản phẩm ac_1

const b = await chromium.launch({ executablePath: CHROMIUM });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 160)));

await p.goto(GOC, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await p.locator('#dn-id').fill('p@p.vn');
await p.locator('#dn-pw').fill('x');
await p.locator('button.login-btn').click(); await p.waitForTimeout(2200);
await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await p.waitForTimeout(900);
await p.locator('.device-card').filter({ hasText: 'Điều hòa L1 - 2' }).first().locator('.card-hit').click();
await p.waitForTimeout(1000);

/** Đặt giá trị trên máy chủ giả rồi chờ qua một nhịp đồng bộ của màn chi tiết (2,5 s). */
async function dat(giaTri) {
  await fetch(`${GOC_GIA}/v1/__doi?id=${AC}&key=ac_error_catalog&value=${encodeURIComponent(giaTri)}`);
  await p.waitForTimeout(3200);
  const dai = p.locator('.bc-alarmstrip');
  return { co: await dai.count() === 1, dong: await dai.locator('li').allInnerTexts() };
}

const e5 = await dat('E5');
ok(`"E5" → có dải cảnh báo, tên tra từ labels (${JSON.stringify(e5.dong)})`,
  e5.co && e5.dong.length === 1 && e5.dong[0] === 'Bảo vệ do nhiệt độ đầu đẩy máy nén quá cao');

const mot = await dat('1');
ok(`"1" (catalog không khai) → VẪN có dải cảnh báo, hiện "Mã lỗi 1" (${JSON.stringify(mot.dong)})`,
  mot.co && mot.dong.length === 1 && mot.dong[0] === 'Mã lỗi 1');
await p.screenshot({ path: anh('loi-la-ma-1') });

const hai = await dat('E5,U2');
ok(`"E5,U2" → hai dòng (${JSON.stringify(hai.dong)})`,
  hai.co && hai.dong.length === 2 && hai.dong[1] === 'Bảo vệ do điện áp AC cấp vào dàn nóng bất thường');

const khong = await dat('0');
ok(`"0" → KHÔNG có dải cảnh báo (${khong.co ? 'có' : 'không'})`, !khong.co);

const rong = await dat('');
ok(`rỗng → KHÔNG có dải cảnh báo (${rong.co ? 'có' : 'không'})`, !rong.co);

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
