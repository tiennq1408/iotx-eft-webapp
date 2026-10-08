import { GOC, anh, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
const R=[]; const ok=(t,c)=>R.push(`${c?'PASS':'FAIL'}  ${t}`);
const b=await chromium.launch({executablePath:CHROMIUM});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const loi=[]; p.on('pageerror',e=>loi.push(String(e).slice(0,140)));
p.on('console',m=>{if(m.type()==='error')loi.push(m.text().slice(0,140));});
await p.goto(GOC,{waitUntil:'networkidle'});
await p.addStyleTag({content:'nextjs-portal{display:none!important}'});
await p.getByPlaceholder(/Email hoặc/).fill('demo');
await p.getByPlaceholder(/Mật khẩu/).fill('demo');
await p.locator('button.login-btn').click(); await p.waitForTimeout(1600);
await p.locator('.bn-item',{hasText:'Thiết bị'}).click(); await p.waitForTimeout(700);
await p.locator('.device-card').filter({has:p.locator('.dname',{hasText:'Máy lọc nước'})}).first().locator('.card-hit').click();
await p.waitForTimeout(900);

ok('Khối vật tư đã hiện trên màn', await p.locator('.ctl-vattu').count()>0);
const hang = await p.locator('.ctl-vattu .vat-tu-row').count();
ok(`Có danh sách lõi lọc (${hang} mục)`, hang>0);
ok('Có thanh phần trăm còn lại', await p.locator('.ctl-vattu .progress-bar').count()>0);
ok('Có nút Thay', await p.locator('.ctl-vattu button', {hasText:'Thay'}).count()>0);
ok('Có nút Thêm', await p.locator('.ctl-vattu .btn-full').count()>0);

// Bấm "Sửa tuổi thọ" phải mở ô nhập
const sua = p.locator('.ctl-vattu .vat-tu-row').first().locator('button').nth(1);
await sua.click(); await p.waitForTimeout(400);
ok('Bấm sửa tuổi thọ: mở ô nhập', await p.locator('.ctl-vattu .vat-tu-sua input').count()>0);
await sua.click(); await p.waitForTimeout(300);

// "Ngừng theo dõi" phải hỏi lại trước khi làm
const bo = p.locator('.ctl-vattu .vat-tu-row').first().locator('button').last();
const chuTruoc = await bo.innerText();
await bo.click(); await p.waitForTimeout(400);
const chuSau = await p.locator('.ctl-vattu .vat-tu-row').first().locator('button').last().innerText();
ok('Ngừng theo dõi: hỏi xác nhận trước', chuTruoc!==chuSau);

// Thêm lõi mở form
await p.locator('.ctl-vattu .btn-full').first().click(); await p.waitForTimeout(400);
ok('Bấm Thêm: mở form nhập tên/serial', await p.locator('.ctl-vattu .vat-tu-them input').count()>=2);

// vùng chạm
const nho = await p.locator('.ctl-vattu button').evaluateAll(ns=>ns.filter(n=>{
  const r=n.getBoundingClientRect(); return r.width&&r.height&&(r.width<44||r.height<44);
}).map(n=>n.className+' '+Math.round(n.getBoundingClientRect().width)+'x'+Math.round(n.getBoundingClientRect().height)));
ok('Mọi nút đạt 44px', nho.length===0);
if(nho.length) console.log('  nút nhỏ:', [...new Set(nho)].join(' | '));
await p.screenshot({path:anh('30-vattu'),fullPage:true});
console.log(R.join('\n'));
console.log('\nLỗi JS:', loi.length?[...new Set(loi)].join(' | '):'không có');
console.log(`${R.filter(r=>r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
