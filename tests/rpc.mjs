import { GOC, GOC_GIA, NHAT_KY } from './chung.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
const R=[]; const ok=(t,c)=>R.push(`${c?'PASS':'FAIL'}  ${t}`);
const doc=()=>{try{return fs.readFileSync(NHAT_KY,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);}catch{return[];}};
try{fs.unlinkSync(NHAT_KY);}catch{}
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const loi=[]; p.on('pageerror',e=>loi.push(String(e).slice(0,120)));
await p.goto(GOC,{waitUntil:'networkidle'});
await p.addStyleTag({content:'nextjs-portal{display:none!important}'});
await p.getByPlaceholder(/Tên đăng nhập/).fill('p@p');
await p.getByPlaceholder(/Mật khẩu/).fill('x');
await p.locator('button.login-btn').click(); await p.waitForTimeout(2500);
await p.locator('.bn-item',{hasText:'Thiết bị'}).click(); await p.waitForTimeout(700);

/* ---------- 1. SSE: thiết bị bật ở NƠI KHÁC thì app này phải sáng lên ---------- */
const AC='10c81a40-b71d-11f1-b79e-ad8fe8623469';   // Điều hòa L1 - 2, khóa nguồn ac_power_status
const the=n=>p.locator('.device-card').filter({has:p.locator('.dname',{hasText:n})}).first();
const batTruoc=await the('Điều hòa L1 - 2').locator('.switch').getAttribute('class');
await p.evaluate(u=>fetch(u), `${GOC_GIA}/v1/__phat?id=${AC}&key=ac_power_status&value=true`);
await p.waitForTimeout(900);
const batSau=await the('Điều hòa L1 - 2').locator('.switch').getAttribute('class');
ok('SSE ac_power_status: thẻ đổi sang BẬT', !batTruoc.includes('on') && batSau.includes('on'));
await p.evaluate(u=>fetch(u), `${GOC_GIA}/v1/__phat?id=${AC}&key=ac_temp_setting&value=27`);
await p.waitForTimeout(800);
ok('SSE ac_temp_setting: dòng trạng thái có 27', (await the('Điều hòa L1 - 2').locator('.dline').innerText()).includes('27'));

/* ---------- 2. Trong màn chi tiết, từng kiểu control phải gửi lệnh đúng ---------- */
await the('Điều hòa L1 - 2').locator('.card-hit').click(); await p.waitForTimeout(900);
ok('SSE vào tận màn chi tiết: vòng hiện 27', (await p.locator('.ctl-dial').innerText()).includes('27'));
const dem=()=>doc().length;
let n=dem();
await p.locator('.ctl-steprow .ctl-step').last().click(); await p.waitForTimeout(700);
let g=doc(); ok('Vòng +: có gửi lệnh', g.length>n); n=g.length;
const than=g.length?JSON.parse(g[g.length-1].than):null;
ok('Vòng +: đúng method setTempTarget + params số', than?.method==='setTempTarget' && than?.params?.ac_temp_setting===28);
ok('Vòng +: có Idempotency-Key', Boolean(g[g.length-1].idem));
await p.locator('.card .mchips span').nth(2).click(); await p.waitForTimeout(700);
g=doc(); const t2=g.length>n?JSON.parse(g[g.length-1].than):null; n=g.length;
ok('Chip chế độ: gửi setMode kèm chuỗi', t2?.method==='setMode' && typeof t2?.params?.ac_ope_mode==='string');
await p.locator('.ctl-pwrbtn').click(); await p.waitForTimeout(700);
g=doc(); const t3=g.length>n?JSON.parse(g[g.length-1].than):null; n=g.length;
ok('Nút nguồn: gửi setPower kèm boolean', t3?.method==='setPower' && typeof t3?.params?.ac_power_status==='boolean');
const idems=new Set(doc().map(x=>x.idem));
ok('Mỗi lệnh một Idempotency-Key riêng', idems.size===doc().length && !idems.has(null));
await p.locator('.devback').click(); await p.waitForTimeout(500);

/* ---------- 3. Quạt: thanh trượt và công tắc phụ ---------- */
await the('SBI314').locator('.card-hit').click(); await p.waitForTimeout(900);
n=dem();
const truot=p.locator('.devbody input[type=range]').first();
if (await truot.count()) { await truot.fill('7'); await truot.dispatchEvent('change'); await p.waitForTimeout(700); }
else { await p.locator('.ctl-steprow .ctl-step').last().click(); await p.waitForTimeout(700); }
g=doc(); const t4=g.length>n?JSON.parse(g[g.length-1].than):null; n=g.length;
// Thanh trượt đầu màn của SBI314 là `timerOff`, không phải `speed` — kiểm tra theo kiểu
// dữ liệu chứ đừng đoán tên: capability `level` thì params phải là SỐ, không phải chuỗi.
ok('Quạt, capability mức: gửi lệnh kèm SỐ', Boolean(t4?.method) && typeof Object.values(t4?.params??{})[0]==='number');
const ct=p.locator('.devbody button.switch-hit, .devbody .ctl-sw button').first();
if (await ct.count()) { await ct.click(); await p.waitForTimeout(700); }
g=doc(); ok('Quạt, công tắc phụ: có gửi lệnh', g.length>n);

/* ---------- 4. Lệnh hỏng thì phải trả trạng thái về, không nuốt ---------- */
await p.evaluate(()=>{const f=window.fetch;window.fetch=(u,o)=>String(u).includes('/rpc')?Promise.resolve(new Response(JSON.stringify({message:'quota'}),{status:429,headers:{'Content-Type':'application/json'}})):f(u,o);});
const tt=await p.locator('.ctl-pwr .ctl-pwrlab, .ctl-pwr').first().innerText().catch(()=>'');
await p.locator('.ctl-pwrbtn').click().catch(()=>{}); await p.waitForTimeout(800);
ok('Lệnh hỏng: có báo lỗi ngay trên màn', await p.locator('.form-message').count()>0);
await p.waitForTimeout(300);
ok('Lệnh hỏng: trạng thái quay lại như cũ', (await p.locator('.ctl-pwr .ctl-pwrlab, .ctl-pwr').first().innerText().catch(()=>''))===tt);

console.log(R.join('\n'));
console.log('\nLệnh đã ghi nhận ở máy chủ:');
doc().forEach(x=>console.log('  ', x.than));
console.log('\nLỗi JS:', loi.length?loi.join(' | '):'không có');
console.log(`\n${R.filter(r=>r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
