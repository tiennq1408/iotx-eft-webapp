import { GOC } from './chung.mjs';
// Quét mọi màn xem có khóa kỹ thuật nào lọt ra giao diện sau khi cắt bảng chữ.
import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
await p.goto(GOC,{waitUntil:'networkidle'});
await p.addStyleTag({content:'nextjs-portal{display:none!important}'});
const KHOA=/(^|\s)(routine|share|virtual|common|dur|dow|op|cap|place|state|menu|nav|supplies|chan|nhac|hg|khung)[._][a-zA-Z0-9_]+/;
let n=0;
const quet=async ten=>{const t=await p.locator('body').innerText();
  const x=[...new Set(t.split('\n').map(s=>s.trim()).filter(s=>KHOA.test(s)))];
  if(x.length){n+=x.length;console.log(`${ten}: LỌT → ${x.slice(0,5).join(' | ')}`);} else console.log(`${ten}: sạch`);};
await quet('Đăng nhập');
await p.getByPlaceholder(/Tên đăng nhập/).fill('demo');
await p.getByPlaceholder(/Mật khẩu/).fill('demo');
await p.locator('button.login-btn').click(); await p.waitForTimeout(1600);
await quet('Trang chủ');
for (const nut of ['Thiết bị','Tự động','Dịch vụ','Khám phá']) {
  const l=p.locator('.bn-item',{hasText:nut}); if(await l.count()){await l.first().click();await p.waitForTimeout(700);await quet(nut);}
}
await p.locator('.bn-item',{hasText:'Thiết bị'}).first().click(); await p.waitForTimeout(600);
for (const ten of ['Điều hòa phòng khách','Máy lọc nước','Quạt cây phòng khách']) {
  const c=p.locator('.device-card').filter({has:p.locator('.dname',{hasText:ten})}).first();
  if(await c.count()){await c.locator('.card-hit').click();await p.waitForTimeout(800);await quet('chi tiết '+ten);
    const xt=p.locator('.ctl-more'); if(await xt.count()){await xt.click();await p.waitForTimeout(500);await quet('xem thêm '+ten);}
    await p.locator('.devback').click();await p.waitForTimeout(500);}
}
console.log(n===0?'\nKẾT LUẬN: không khóa nào lọt ra màn':`\nKẾT LUẬN: ${n} chỗ lọt khóa`);
await b.close();
