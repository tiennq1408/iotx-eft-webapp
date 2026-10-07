import { GOC } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Ảnh đại diện sản phẩm. Catalog thật để nó ở `product.icon`, và CÙNG trường đó có sản
 * phẩm là emoji, có sản phẩm là URL ảnh — nên phải kiểm cả hai nhánh, và kiểm rằng thẻ
 * ngoài danh sách với màn chi tiết vẽ ra cùng một thứ.
 */
const R=[]; const ok=(t,c)=>R.push(`${c?'PASS':'FAIL'}  ${t}`);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const loi=[]; p.on('pageerror',e=>loi.push(String(e).slice(0,140)));
await p.goto(GOC,{waitUntil:'networkidle'});
await p.addStyleTag({content:'nextjs-portal{display:none!important}'});
await p.getByPlaceholder(/Tên đăng nhập/).fill('p@p');
await p.getByPlaceholder(/Mật khẩu/).fill('x');
await p.locator('button.login-btn').click(); await p.waitForTimeout(2200);
await p.locator('.bn-item',{hasText:'Thiết bị'}).click(); await p.waitForTimeout(800);

const soAnh=await p.locator('.dvisual img').count();
const soChu=await p.locator('.dvisual-bt').count();
ok(`Thẻ dùng ảnh khi catalog có ảnh (${soAnh} thẻ)`, soAnh>0);
ok(`Thẻ dùng emoji khi catalog chỉ có emoji (${soChu} thẻ)`, soChu>0);
ok('Không còn vòng tròn trống', await p.locator('.dvisual .ring').count()===0);
ok('Không thẻ nào in URL ra màn', !/https?:\/\/|data:image/.test(await p.locator('.device-grid').innerText()));

const hong=await p.locator('.dvisual img').evaluateAll(ns=>ns.filter(n=>!n.complete||n.naturalWidth===0).length);
ok('Mọi ảnh trên thẻ tải được', hong===0);

// Thẻ có ảnh → màn chi tiết cũng phải là ảnh, cùng địa chỉ
const theAnh=p.locator('.device-card').filter({has:p.locator('.dvisual img')}).first();
const srcThe=await theAnh.locator('.dvisual img').getAttribute('src');
await theAnh.locator('.card-hit').click(); await p.waitForTimeout(900);
ok('Màn chi tiết cũng vẽ ảnh', await p.locator('.devdau .dev-ico img').count()===1);
ok('Ảnh hai nơi cùng một địa chỉ', await p.locator('.devdau .dev-ico img').getAttribute('src')===srcThe);
await p.locator('.devback').click(); await p.waitForTimeout(600);

// Thẻ chỉ có emoji → màn chi tiết cũng emoji, cùng ký tự
const theChu=p.locator('.device-card').filter({has:p.locator('.dvisual-bt')}).first();
const chuThe=(await theChu.locator('.dvisual-bt').textContent()).trim();
await theChu.locator('.card-hit').click(); await p.waitForTimeout(900);
const chuMan=(await p.locator('.devdau .dev-ico').textContent()).trim();
ok(`Emoji hai nơi khớp nhau ("${chuThe}")`, chuThe===chuMan && chuThe.length>0);

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length?[...new Set(loi)].join(' | '):'không có');
console.log(`${R.filter(r=>r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
