import { GOC, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
const R=[]; const errs=[];
const ok=(n,c,d='')=>R.push(`${c?'PASS':'FAIL'}  ${n}${d?' — '+d:''}`);
const br=await chromium.launch({executablePath:CHROMIUM});
const p=await (await br.newContext({viewport:{width:390,height:844}})).newPage();
p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
p.on('pageerror',e=>errs.push('pageerror: '+e.message));
p.on('response',r=>{if(r.status()>=400)errs.push(`HTTP ${r.status()} ${r.url()}`)});
const w=(ms=400)=>p.waitForTimeout(ms);
const card=n=>p.locator('.device-card').filter({has:p.locator('.dname',{hasText:n})});
const mo=async n=>{await card(n).locator('.card-hit').click();await w(600)};
const back=async()=>{await p.locator('.devback').click();await w(400)};

await p.goto(GOC,{waitUntil:'networkidle'});
await p.addStyleTag({content:'nextjs-portal{display:none!important}'});
await p.locator('#dn-id').fill('demo@demo.vn');
await p.locator('#dn-pw').fill('demo');
await p.locator('button.login-btn').click(); await w(900);
await p.locator('.bn-item',{hasText:'Thiết bị'}).click(); await w(400);

await mo('Điều hòa phòng khách');
ok('Khung .sheet.devpage như bản tham chiếu', await p.locator('.sheet.devpage').count()===1);
ok('Chỉ MỘT hàng tên, nút trở lại nằm trong hàng đó', await p.locator('.devbar').count()===0 && await p.locator('.devdau .devback').count()===1);
ok('Hàng thiết bị .dev-ico/.dev-ten/.dev-dot', await p.locator('.row .dev-ico').count()===1 && await p.locator('.dev-dot').count()===1);
ok('Khối chính là vòng .ctl-dial', await p.locator('.card.ctl-hero .ctl-dial svg circle').count()===2);
ok('Vòng có − và +', await p.locator('.ctl-steprow .ctl-step').count()===2);
ok('Chế độ vẽ bằng .mchips', await p.locator('.card .mchips').count()>=1);
ok('Nguồn là .ctl-pwr + .ctl-pwrbtn', await p.locator('.card.ctl-pwr .ctl-pwrbtn').count()===1);
ok('Có nút ⋯ Xem thêm', await p.locator('.ctl-more').count()===1);
const soThem=await p.locator('.ctl-more b').innerText();
ok('Xem thêm có đếm số', Number(soThem)>0, soThem);
ok('Số đọc nằm trong .ctl-hang', await p.locator('.ctl-hang').count()===1);
ok('Da lấy từ ui.skin (sunset)', (await p.locator('.card.ctl-pwr').evaluate(e=>getComputedStyle(e).borderTopColor))==='rgb(234, 118, 11)');

const t0=await p.locator('.ctl-dial-big').innerText();
await p.locator('.ctl-steprow .ctl-step').nth(1).click(); await w(400);
ok('Bấm + đổi được giá trị', (await p.locator('.ctl-dial-big').innerText())!==t0, `${t0} → ${await p.locator('.ctl-dial-big').innerText()}`);
await p.locator('.card .mchips span').nth(1).click(); await w(400);
ok('Bấm chip đổi được chế độ', await p.locator('.mchips span.on').count()>=1);
await p.locator('.ctl-pwrbtn').click(); await w(400);
ok('Bấm nút nguồn được', true);

await p.locator('.ctl-more').click(); await w(300);
ok('Mở Xem thêm ra thêm thẻ', await p.locator('.btn.gh', {hasText:'Thu gọn'}).count()===1);
await p.locator('.btn.gh',{hasText:'Thu gọn'}).click(); await w(300);
ok('Thu gọn lại được', await p.locator('.ctl-more').count()===1);

ok('Có nút hẹn giờ .hg-ghim', await p.locator('.hg-ghim').count()===1);
await back();
ok('Quay lại danh sách', await p.locator('.sheet.devpage').count()===0);

for (const [ten,kh] of [['Máy lọc nước','waterfilter'],['Quạt cây phòng khách','fan'],['Bình nóng lạnh phòng tắm','heater']]) {
  await mo(ten);
  ok(`${ten}: dựng được màn (khuôn ${kh})`, await p.locator('.devbody .card').count()>0);
  ok(`${ten}: chỉ một khối chính`, await p.locator('.card.ctl-hero').count()<=1);
  await back();
}

/* ---- trạng thái chặn: phải nói rõ, không chết lặng ---- */
const sua = async (id, vaTro) => {
  await p.evaluate(({id,vaTro})=>{const d=JSON.parse(localStorage.getItem('livotec-home-v5'));Object.assign(d.devices.find(x=>x.id===id),vaTro);localStorage.setItem('livotec-home-v5',JSON.stringify(d));},{id,vaTro});
  await p.reload({waitUntil:'networkidle'});
  await p.addStyleTag({content:'nextjs-portal{display:none!important}'});
  await w(900); await p.locator('.bn-item',{hasText:'Thiết bị'}).click(); await w(400);
};
await sua('ac1', { online: false });
await mo('Điều hòa phòng khách');
ok('Ngoại tuyến: vẫn bấm được', !(await p.locator('.ctl-steprow .ctl-step').first().isDisabled()));
ok('Ngoại tuyến: có câu nhắc', (await p.locator('.devbody .small.dim').last().innerText()).includes('ngoại tuyến'));
await p.locator('.card .mchips span').nth(1).click({force:true}); await w(300);
ok('Ngoại tuyến: bấm chip không bị chặn', await p.locator('.form-message').count()===0);
await back();
await sua('ac1', { online: true, perms: { control: false } });
await mo('Điều hòa phòng khách');
ok('Chỉ xem: có câu giải thích', (await p.locator('.devbody .small.dim').last().innerText()).includes('quyền'));
await back();
await sua('ac1', { perms: {} });

console.log(R.join('\n'));
const f=R.filter(r=>r.startsWith('FAIL')).length;
console.log(`\n${R.length-f}/${R.length} kịch bản đạt`);
console.log(errs.length?'LỖI:\n'+[...new Set(errs)].join('\n'):'Không có lỗi console/HTTP.');
await br.close(); process.exit(f||errs.length?1:0);
