import { GOC, GOC_GIA, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
const R=[]; const ok=(t,c)=>R.push(`${c?'PASS':'FAIL'}  ${t}`);
const b=await chromium.launch({executablePath:CHROMIUM});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
await p.goto(GOC,{waitUntil:'networkidle'});
await p.addStyleTag({content:'nextjs-portal{display:none!important}'});
await p.getByPlaceholder(/Email hoặc/).fill('p@p');
await p.getByPlaceholder(/Mật khẩu/).fill('x');
await p.locator('button.login-btn').click(); await p.waitForTimeout(2200);
await p.locator('.bn-item',{hasText:'Thiết bị'}).click(); await p.waitForTimeout(600);
const AC='10c81a40-b71d-11f1-b79e-ad8fe8623469';
const the=()=>p.locator('.device-card').filter({has:p.locator('.dname',{hasText:'Điều hòa L1 - 2'})}).first();
ok('Trước: đang TẮT', !(await the().locator('.switch').getAttribute('class')).includes('on'));

// tab chạy nền: bật ở nơi khác, KHÔNG có sự kiện nào tới
await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
await p.evaluate(u=>fetch(u),`${GOC_GIA}/v1/__doi?id=${AC}&key=ac_power_status&value=true`);
await p.waitForTimeout(1200);
ok('Đang chạy nền: vẫn TẮT (đúng, chưa hay biết)', !(await the().locator('.switch').getAttribute('class')).includes('on'));

// quay lại tab
await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});document.dispatchEvent(new Event('visibilitychange'));});
let doi=false;
for(let i=0;i<24;i++){ if((await the().locator('.switch').getAttribute('class')).includes('on')){doi=true;break;} await p.waitForTimeout(250); }
ok('Quay lại tab: tự đồng bộ thành BẬT', doi);

// chặn nhịp: bật/tắt tab liên tục không thành tràng request
let n=0; p.on('request',r=>{if(r.url().includes('/v1/devices'))n++;});
for(let i=0;i<6;i++){ await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange'))); await p.waitForTimeout(120); }
await p.waitForTimeout(600);
ok('Chuyển tab dồn dập: không spam /devices', n<=1);
console.log(R.join('\n'));
console.log(`\n${R.filter(r=>r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
