import { GOC, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
/**
 * Đo hai thứ trên từng trạng thái màn: vùng chạm dưới 44px, và tương phản chữ.
 *
 * Bộ đo tương phản đi ngược cây DOM tìm nền, nên KHÔNG thấy `background-image` — chữ trên
 * nền gradient sẽ bị báo nhầm là ~1,1:1. Những chỗ đó phải đo lại bằng điểm ảnh thật.
 */
const AUDIT = `(() => {
  const lum = c => { const [r,g,b]=c.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}); return 0.2126*r+0.7152*g+0.0722*b; };
  const parse = s => { const m=s.match(/rgba?\\(([^)]+)\\)/); if(!m) return null; const p=m[1].split(',').map(x=>parseFloat(x)); return {rgb:[p[0],p[1],p[2]], a:p.length>3?p[3]:1}; };
  const bgOf = el => { let n=el; while(n && n!==document.documentElement){ const b=parse(getComputedStyle(n).backgroundColor); if(b && b.a>0.9) return b.rgb; n=n.parentElement; } return [255,255,255]; };
  const ratio = (f,b) => { const L1=lum(f),L2=lum(b); const a=Math.max(L1,L2),c=Math.min(L1,L2); return (a+0.05)/(c+0.05); };
  const small=[], lowc=[];
  for (const el of document.querySelectorAll('button,a,input,select,[role=button],[tabindex]')) {
    const r=el.getBoundingClientRect(); if(!r.width||!r.height) continue;
    const cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none') continue;
    let w=r.width,h=r.height;
    const be=getComputedStyle(el,'::before');
    if(be && be.content!=='none' && be.position==='absolute'){ w=Math.max(w,parseFloat(be.width)||0); h=Math.max(h,parseFloat(be.height)||0); }
    if(w<44||h<44) small.push(el.tagName.toLowerCase()+'.'+(el.className||'').toString().slice(0,42)+' '+Math.round(w)+'x'+Math.round(h));
  }
  for (const el of document.querySelectorAll('body *')) {
    const direct=[...el.childNodes].some(n=>n.nodeType===3 && n.textContent.trim().length>1);
    if(!direct) continue;
    const cs=getComputedStyle(el);
    // Độ mờ KHÔNG di truyền xuống kết quả tính kiểu của con: tấm băng quảng cáo đang ẩn
    // có opacity 0, nhưng chữ bên trong nó vẫn báo 1. Phải nhân dọc lên tổ tiên.
    let mo=1, tt=el;
    while(tt && tt!==document.documentElement){
      const c=getComputedStyle(tt);
      if(c.visibility==='hidden'||c.display==='none'){ mo=0; break; }
      mo *= parseFloat(c.opacity);
      tt=tt.parentElement;
    }
    if(mo<0.5) continue;
    const r=el.getBoundingClientRect(); if(!r.width||!r.height) continue;
    // Băng quảng cáo giữ cả ba tấm trong DOM, tấm không hiển thị vẫn có kích thước — đo nó
    // là đo màu của tấm đang nằm đè lên. Chỉ đo phần tử thực sự ở trên cùng tại tâm của nó.
    const tren = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
    if (!tren || !(tren === el || el.contains(tren) || tren.contains(el))) continue;
    const f=parse(cs.color); if(!f) continue;
    const bg=bgOf(el);
    const size=parseFloat(cs.fontSize), bold=parseInt(cs.fontWeight)>=700;
    const need=(size>=24||(size>=18.66&&bold))?3:4.5;
    const rt=ratio(f.rgb,bg);
    if(rt<need){
      el.setAttribute('data-do','1');
      lowc.push({ mo: el.tagName.toLowerCase()+'.'+(el.className||'').toString().slice(0,34),
                  chu: el.textContent.trim().slice(0,24), fg: f.rgb, need,
                  // Toạ độ ô là theo KHUNG NHÌN, còn ảnh chụp cắt theo TRANG — cuộn là lệch.
                  o: {x:Math.round(r.x+scrollX), y:Math.round(r.y+scrollY), w:Math.round(r.width), h:Math.round(r.height)} });
    }
  }
  return { small:[...new Set(small)], lowc };
})()`;

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const out = {};
/**
 * Bộ đo trong trang đi ngược cây DOM tìm nền, nên KHÔNG thấy `background-image` — chữ trên
 * gradient bị báo nhầm ~1,1:1. Ở đây chụp đúng vùng phần tử rồi lấy màu NỀN là màu xuất
 * hiện nhiều nhất trong ảnh (chữ luôn là thiểu số điểm ảnh), và tính lại tỉ số thật.
 */
const lum = c => { const [r,g,b]=c.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}); return 0.2126*r+0.7152*g+0.0722*b; };
const tiSo = (f,b) => { const a=Math.max(lum(f),lum(b)), c=Math.min(lum(f),lum(b)); return (a+0.05)/(c+0.05); };

async function doLaiBangDiemAnh(muc) {
  const ra = [];
  for (const m of muc) {
    if (m.o.w < 2 || m.o.h < 2) continue;
    let dem;
    try {
      const png = await page.screenshot({ clip: { x: m.o.x, y: m.o.y, width: m.o.w, height: m.o.h } });
      dem = PNG.sync.read(png);
    } catch { continue; }
    // Nền = màu hay gặp nhất SAU KHI bỏ những điểm gần giống màu chữ. Lấy thẳng màu hay
    // gặp nhất thì với tiêu đề chữ to, chính chữ chiếm đa số và ta đo chữ với chữ = 1,00.
    const gan = (a, b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]) < 90;
    const soLan = new Map();
    for (let i = 0; i < dem.data.length; i += 4) {
      const px = [dem.data[i], dem.data[i+1], dem.data[i+2]];
      if (gan(px, m.fg)) continue;
      const k = px.join(',');
      soLan.set(k, (soLan.get(k) || 0) + 1);
    }
    if (soLan.size === 0) continue;   // cả ô toàn màu chữ: không đo được nền, bỏ qua
    const nen = [...soLan.entries()].sort((a,b)=>b[1]-a[1])[0][0].split(',').map(Number);
    const t = tiSo(m.fg, nen);
    if (t < m.need) ra.push(`${m.mo} ${t.toFixed(2)}<${m.need} "${m.chu}" (nền thật ${nen.join(',')})`);
  }
  return ra;
}

const audit = async k => {
  const kq = await page.evaluate(AUDIT);
  out[k] = { small: kq.small, lowc: await doLaiBangDiemAnh(kq.lowc) };
};
const wait = (ms = 450) => page.waitForTimeout(ms);
const card = name => page.locator('.device-card').filter({ has: page.locator('.dname', { hasText: name }) });
const back = async () => { await page.locator('.devback').click(); await wait(400); };

await page.goto(GOC, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: 'nextjs-portal{display:none!important} .banner-slide{transition:none!important}' });
await audit('01-login');
await page.getByPlaceholder(/Tên đăng nhập/).fill('demo');
await page.getByPlaceholder(/Mật khẩu/).fill('demo');
await page.locator('button.login-btn').click(); await wait(900);
await audit('02-home');
await page.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await wait(400);
await audit('03-devices');

const MAN = [
  ['Điều hòa phòng khách', '10-aircon'],
  ['Bếp từ đôi', '11-cooktop'],
  ['Máy hút mùi', '12-hood'],
  ['Nồi cơm điện tử', '13-ricecooker'],
  ['Máy lọc nước', '14-purifier'],
  ['Bình nóng lạnh phòng tắm', '15-wh-indirect'],
  ['Quạt treo phòng ngủ', '16-fan-ac'],
  ['Quạt cây phòng khách', '17-fan-bldc'],
];

for (const [ten, khoa] of MAN) {
  await card(ten).locator('.card-hit').click(); await wait(600);
  await audit(khoa);
  if (khoa === '10-aircon') {
    await page.locator('.ctl-more').click(); await wait(400); await audit('18-xem-them');
  }
  await back();
}

// Bình nóng lạnh trực tiếp ở nhà thứ hai
await page.locator('.filter-pill').nth(0).click(); await wait(350);
await page.locator('.radio-list-row', { hasText: 'Căn hộ Vinhomes' }).click(); await wait(500);
await card('Bình nóng lạnh trực tiếp').locator('.card-hit').click(); await wait(600);
await audit('20-wh-direct-tat');
await audit('21-wh-direct');
await back();

let nSmall = 0, nLow = 0;
for (const k of Object.keys(out).sort()) {
  const v = out[k];
  nSmall += v.small.length; nLow += v.lowc.length;
  console.log(`\n${k}: ${(v.small.length || v.lowc.length) ? 'CẦN SỬA' : 'đạt'}`);
  v.small.forEach(x => console.log('  <44px  ' + x));
  v.lowc.forEach(x => console.log('  contrast ' + x));
}
console.log(`\nTổng: ${Object.keys(out).length} màn — ${nSmall} nút dưới 44px, ${nLow} chỗ báo thiếu tương phản.`);
await browser.close();
