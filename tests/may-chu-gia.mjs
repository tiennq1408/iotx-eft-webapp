// Máy chủ giả lập IBS: trả ĐÚNG những gì DEV thật trả (chuỗi thay vì số/bool, nhãn là
// khóa i18n, nhà/phòng rỗng…) để soi xem app local dựng ra cái gì.
import http from 'node:http';
import fs from 'node:fs';
import { NHAT_KY, CONG_GIA } from './chung.mjs';
const bs = JSON.parse(fs.readFileSync(new URL('./du-lieu/bootstrap.json', import.meta.url), 'utf8'));
const pr = JSON.parse(fs.readFileSync(new URL('./du-lieu/products.json', import.meta.url), 'utf8'));
const strings = { 'cap.power':'cap.power', 'cap.mode':'cap.mode', 'cap.speed':'Tốc độ gió',
  'cap.buzzer':'Âm thanh', 'cap.light':'Đèn', 'cap.oscillate':'Xoay trái–phải',
  'cap.curSpeed':'Tốc độ đang quay', 'cap.timerOff':'Hẹn giờ tắt',
  'cap.mode.normal':'Thường','cap.mode.sleep':'Ngủ','cap.mode.natural':'Tự nhiên','cap.mode.turbo':'Mạnh' };
const khach = new Set();
const J = (res,obj,code=200)=>{res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(obj));};
http.createServer((req,res)=>{
  const u = new URL(req.url,'http://x');
  const p = u.pathname.replace(/^\/v1/,'');
  if (req.method==='OPTIONS') return J(res,{});
  if (p==='/auth/login') return J(res,{accessToken:'a',refreshToken:'r',tenant:'livotec',expiresIn:300});
  if (p==='/auth/refresh') return J(res,{accessToken:'a',refreshToken:'r',tenant:'livotec',expiresIn:300});
  if (p==='/tenant/theme') return J(res,{colorPrimary:'#02b6ac',tenantName:'Livotec Home',logoUrl:null});
  if (p==='/i18n') return J(res,{lang:'vi',langs:['en','th','vi'],strings});
  if (p==='/bootstrap') return J(res,bs);
  if (p==='/products') return J(res,pr);
  if (p==='/devices') return J(res,bs.devices);
  if (p==='/categories') return J(res,bs.categories);
  if (p==='/notifications') return J(res,{unread:0,items:[]});
  if (p==='/shares') return J(res,{granted:[],receivedFromOthers:[]});
  if (p==='/rules') return J(res,{rules:[],tuThietBi:[]});
  if (p==='/me') return J(res,bs.me);
  if (p.endsWith('/rpc')) {
    let raw=''; req.on('data',c=>raw+=c); 
    return req.on('end',()=>{
      const ghi={id:p.split('/')[2], idem:req.headers['idempotency-key']||null, than:raw};
      fs.appendFileSync(NHAT_KY, JSON.stringify(ghi)+'\n');
      J(res,{ok:true});
    });
  }
  if (p.includes('/hen-gio')) return J(res,{batDuoc:true,hen:null,chuongTrinh:[]});
  if (p==='/stream') {
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
    khach.add(res); req.on('close',()=>khach.delete(res));
    res.write(': mo\n\n');
    return;
  }
  // Đổi giá trị ngay trong dữ liệu giả, KHÔNG phát SSE — giả cảnh đổi ở nơi khác trong
  // lúc tab này đang chạy nền và không nhận được sự kiện.
  if (p==='/__doi') {
    const d = bs.devices.find(x=>x.id===u.searchParams.get('id'));
    if (d) d.lastValues[u.searchParams.get('key')] = u.searchParams.get('value');
    return J(res,{ok:!!d});
  }
  // Bơm ồ ạt như DEV thật: ~100 thiết bị mô phỏng nhả `simulatorTs` mỗi giây.
  if (p==='/__bao') {
    const n = Number(u.searchParams.get('n')||500);
    for (let i=0;i<n;i++) {
      const d = JSON.stringify({deviceId:'sim-'+(i%100), key:'simulatorTs', value:Date.now(), ts:new Date().toISOString()});
      for (const k of khach) k.write(`event: trang-thai\ndata: ${d}\n\n`);
    }
    return J(res,{sent:n});
  }
  // Cửa riêng cho bài test: bơm một sự kiện trang-thai xuống mọi trình duyệt đang nghe.
  if (p==='/__phat') {
    const d = JSON.stringify({deviceId:u.searchParams.get('id'),key:u.searchParams.get('key'),value:u.searchParams.get('value'),ts:Date.now()});
    for (const k of khach) k.write(`event: trang-thai\ndata: ${d}\n\n`);
    return J(res,{sent:khach.size});
  }
  J(res,{message:'not_found'},404);
}).listen(CONG_GIA,()=>console.log('máy chủ giả đang chạy ở cổng '+CONG_GIA));
