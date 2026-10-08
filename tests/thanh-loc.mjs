import { GOC, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
const R=[]; const ok=(t,c)=>R.push(`${c?'PASS':'FAIL'}  ${t}`);
const b=await chromium.launch({executablePath:CHROMIUM});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const loi=[]; p.on('pageerror',e=>loi.push(String(e).slice(0,140)));
await p.goto(GOC,{waitUntil:'networkidle'});
await p.addStyleTag({content:'nextjs-portal{display:none!important}'});
await p.getByPlaceholder(/Email hoặc/).fill('demo');
await p.getByPlaceholder(/Mật khẩu/).fill('demo');
await p.locator('button.login-btn').click(); await p.waitForTimeout(1600);

// 1) không còn cờ ngôn ngữ ở trang chủ và màn thiết bị
ok('Trang chủ: không còn hàng cờ', await p.locator('.filter-row .flag-row, .filter-row .flag-btn').count()===0);
await p.locator('.bn-item',{hasText:'Thiết bị'}).click(); await p.waitForTimeout(700);
ok('Màn thiết bị: không còn hàng cờ', await p.locator('.filter-row .flag-row, .filter-row .flag-btn').count()===0);

// 2+5) một hàng, trải hết bề ngang
const o=await p.locator('.filter-row').boundingBox();
const nut=await p.locator('.filter-row > button').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};}));
ok(`Đúng 4 nút trên thanh lọc (${nut.length})`, nut.length===4);
ok('Tất cả nằm trên MỘT hàng', new Set(nut.map(n=>n.y)).size===1);
const phai=Math.max(...nut.map(n=>n.x+n.w));
ok(`Trải hết bề ngang (hở ${Math.round(o.x+o.width-phai)}px)`, (o.x+o.width-phai)<=1);
ok('Mọi nút cao ≥44px', nut.every(n=>n.h>=44));

// 3) nhãn ngắn khi chưa lọc, tên nhà khi đã lọc
const chu=async i=>(await p.locator('.filter-row > button').nth(i).innerText()).trim();
ok(`Nút 1 là "Nhà" (đang: "${await chu(0)}")`, (await chu(0))==='Nhà');
ok(`Nút 2 là "Phòng" (đang: "${await chu(1)}")`, (await chu(1))==='Phòng');
ok(`Nút 3 là "Nhóm" (đang: "${await chu(2)}")`, (await chu(2))==='Nhóm');
await p.locator('.filter-row > button').nth(0).click(); await p.waitForTimeout(500);
const hang=p.locator('.radio-list-row').nth(1);
const tenNha=(await hang.innerText()).trim();
await hang.click(); await p.waitForTimeout(600);
ok(`Chọn nhà xong nút hiện tên nhà ("${await chu(0)}" ⟵ "${tenNha}")`, (await chu(0))===tenNha);

// 4) Thêm thiết bị mở thẳng luồng ghép nối (nút nằm ở màn Thiết bị)
await p.locator('.bn-item',{hasText:'Thiết bị'}).click(); await p.waitForTimeout(700);
const nutThem=p.locator('.add-device-btn');
if (await nutThem.count()) {
  await nutThem.click(); await p.waitForTimeout(900);
  const coLuong=await p.locator('.full-panel.add-flow').count();
  const than=coLuong ? await p.locator('.full-panel.add-flow').innerText() : '';
  ok('Thêm thiết bị vào THẲNG luồng ghép nối', coLuong>0 && /cách nào|Quét mã QR/i.test(than));
  ok('Luồng mở ngay ở bước 1/5', /1\/5/.test(than));
  console.log('   nội dung:', than.replace(/\n+/g,' | ').slice(0,110));
} else ok('Tìm thấy nút Thêm thiết bị', false);
// Đóng luồng ghép nối trước, nếu không nó che mất thanh điều hướng.
const dongLuong=p.locator('.add-flow .panel-head button').first();
if (await dongLuong.count()) { await dongLuong.click(); await p.waitForTimeout(700); }

// Biểu tượng thiết bị: thẻ và màn chi tiết phải vẽ CÙNG một thứ.
await p.locator('.bn-item',{hasText:'Thiết bị'}).click(); await p.waitForTimeout(700);
const coAnh=await p.locator('.dvisual img').count();
const coBt=await p.locator('.dvisual-bt').count();
ok('Thẻ nào không có ảnh thì vẽ biểu tượng, không để vòng trống', await p.locator('.dvisual .ring').count()===0 && (coAnh+coBt)>0);
if (coBt) {
  const bt=await p.locator('.device-card').filter({has:p.locator('.dvisual-bt')}).first();
  const ten=await bt.locator('.dname').innerText();
  const btThe=(await bt.locator('.dvisual-bt').textContent()).trim();
  await bt.locator('.card-hit').click(); await p.waitForTimeout(900);
  const btMan=(await p.locator('.devdau .dev-ico').textContent()).trim();
  ok(`Biểu tượng thẻ và màn chi tiết khớp nhau ("${btThe}" ⟵ ${ten.slice(0,14)})`, btThe===btMan);
  await p.locator('.devback').click(); await p.waitForTimeout(500);
}
console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length?[...new Set(loi)].join(' | '):'không có');
console.log(`${R.filter(r=>r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
