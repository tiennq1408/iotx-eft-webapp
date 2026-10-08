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
let lamNgo = false;   // xem /__lam_ngo
/* ──────────────────── hẹn giờ theo thiết bị ──────────────────── */
const TRAN = { chuongTrinh: 10, buoc: 8, hanhDong: 5, ten: 40 };
/** deviceId → {hen, dangDung, dangChay, chuongTrinh[], tiepId} */
const khoHenGio = new Map();
const soHenGio = id => {
  if (!khoHenGio.has(id)) khoHenGio.set(id, { hen: null, dangDung: null, dangChay: null, chuongTrinh: [], tiepId: 1 });
  return khoHenGio.get(id);
};

/** Cap được phép trong bước: điều khiển được (có rpc, không phải sensor) và không bị tatCap loại. */
function capChoPhepCua(d) {
  const sp = pr[d.type] || {};
  const tat = new Set((sp.henGio && sp.henGio.tatCap) || []);
  return (sp.capabilities || []).filter(c => c.rpc && c.kind !== 'sensor' && !tat.has(c.key)).map(c => c.key);
}

/** Thân chương trình — trả câu tiếng Việt nêu đúng chỗ sai, hoặc null khi hợp lệ. */
function soatChuongTrinh(than, capOk) {
  if (!than || typeof than !== 'object') return 'Thân yêu cầu không hợp lệ.';
  if (!than.ten || String(than.ten).length > TRAN.ten) return 'Tên chương trình không hợp lệ.';
  if (!['gio','khoang'].includes(than.kieu)) return 'Kiểu chương trình không hợp lệ.';
  if (!['motlan','lap'].includes(than.chay)) return 'Cách chạy không hợp lệ.';
  if (!Array.isArray(than.buoc) || than.buoc.length < 1 || than.buoc.length > TRAN.buoc)
    return `Chương trình cần 1..${TRAN.buoc} bước.`;
  const gap = new Set(); let truoc = -1;
  for (let i = 0; i < than.buoc.length; i++) {
    const b = than.buoc[i], n = i + 1;
    if (!Array.isArray(b.hd) || b.hd.length < 1 || b.hd.length > TRAN.hanhDong)
      return `Bước ${n} cần 1..${TRAN.hanhDong} hành động.`;
    for (const h of b.hd) if (!h || !capOk.includes(h.cap)) return `Bước ${n} dùng chức năng không được phép.`;
    if (than.kieu === 'gio') {
      if (!/^\d{2}:\d{2}$/.test(String(b.moc))) return `Bước ${n} sai định dạng giờ.`;
      if (gap.has(String(b.moc))) return `Bước ${n} trùng mốc giờ.`;
      gap.add(String(b.moc));
    } else {
      const m = Number(b.moc);
      if (!Number.isInteger(m) || m < 1 || m > 1440) return `Bước ${n} có mốc phút ngoài 1..1440.`;
      if (m <= truoc) return `Bước ${n} phải lớn hơn mốc trước.`;
      truoc = m;
    }
  }
  if (than.chay === 'lap' && !(Array.isArray(than.ngay) && than.ngay.length >= 1)) return 'Lặp lại cần ít nhất một ngày.';
  if (than.kieu === 'khoang' && than.chay === 'lap' && !than.batDau) return 'Chu kỳ theo khoảng cần giờ bắt đầu.';
  return null;
}

function henGio(req, res, p) {
  const phan = p.split('/');            // ['', 'devices', '<id>', 'hen-gio', ...]
  const id = phan[2];
  const duoi = phan.slice(4);           // [] | ['hen'] | ['chuong-trinh', ...] | ['dang-dung']
  const d = bs.devices.find(x => x.id === id);

  // 404 ĐỒNG NHẤT: không có máy, HOẶC máy được chia sẻ (hợp đồng: hẹn giờ chỉ cho CHỦ).
  if (!d || d.shared) return J(res, { message: 'not_found' }, 404);

  const sp = pr[d.type] || {};
  const capOk = capChoPhepCua(d);
  const batDuoc = (sp.henGio ? sp.henGio.bat !== false : false) && capOk.length > 0;
  const so = soHenGio(id);
  const ghi = req.method !== 'GET' && req.method !== 'DELETE';
  // Cửa GHI bị chối khi sản phẩm tắt hẹn giờ; cửa XOÁ vẫn mở để còn dọn dữ liệu cũ.
  if (ghi && !batDuoc) return J(res, { message: 'Sản phẩm này không hỗ trợ hẹn giờ.' }, 403);

  const doc = () => new Promise(giai => { let raw = ''; req.on('data', c => raw += c); req.on('end', () => { try { giai(JSON.parse(raw || '{}')); } catch { giai(null); } }); });

  if (duoi.length === 0 && req.method === 'GET') {
    return J(res, { batDuoc, capChoPhep: capOk, hen: so.hen, dangDung: so.dangDung, dangChay: so.dangChay,
      chuongTrinh: so.chuongTrinh.map(c => ({ ...c, capThuHoi: (c.buoc.flatMap(b => b.hd.map(h => h.cap))).filter(k => !capOk.includes(k)) })) });
  }

  if (duoi[0] === 'hen') {
    if (req.method === 'DELETE') { so.hen = null; return J(res, { ok: true }); }
    if (req.method === 'PUT') return doc().then(than => {
      if (!than || typeof than.bat !== 'boolean') return J(res, { message: 'Thiếu trường bat.' }, 400);
      const coPhut = than.phut !== undefined, coLuc = than.luc !== undefined;
      if (coPhut === coLuc) return J(res, { message: 'Chọn đúng một trong phut hoặc luc.' }, 400);
      let luc;
      if (coPhut) {
        if (!Number.isInteger(than.phut) || than.phut < 1 || than.phut > 720) return J(res, { message: 'phut phải trong 1..720.' }, 400);
        luc = Date.now() + than.phut * 60000;
      } else {
        if (!/^\d{2}:\d{2}$/.test(String(than.luc))) return J(res, { message: 'luc phải dạng HH:MM.' }, 400);
        const [h, m] = String(than.luc).split(':').map(Number);
        const t = new Date(); t.setHours(h, m, 0, 0);
        if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1);   // đã qua trong ngày → NGÀY MAI
        luc = t.getTime();
      }
      so.hen = { luc, bat: than.bat };
      return J(res, { ok: true, hen: so.hen });
    });
  }

  if (duoi[0] === 'chuong-trinh') {
    const ctId = duoi[1] !== undefined ? Number(duoi[1]) : null;
    if (ctId === null && req.method === 'POST') return doc().then(than => {
      if (so.chuongTrinh.length >= TRAN.chuongTrinh) return J(res, { message: `Mỗi thiết bị chỉ giữ ${TRAN.chuongTrinh} chương trình.` }, 400);
      const loi = soatChuongTrinh(than, capOk);
      if (loi) return J(res, { message: loi }, 400);
      const moi = { ...than, id: so.tiepId++ };
      so.chuongTrinh.push(moi);
      return J(res, { ok: true, id: moi.id }, 201);
    });

    const vt = so.chuongTrinh.findIndex(c => c.id === ctId);
    if (vt < 0) return J(res, { message: 'not_found' }, 404);

    if (req.method === 'PUT') return doc().then(than => {
      // motlan đang chạy giữa chừng thì phải dừng rồi mới sửa.
      if (so.dangDung === ctId && so.dangChay) return J(res, { message: 'Chương trình đang chạy — dừng rồi hãy sửa.' }, 409);
      const loi = soatChuongTrinh(than, capOk);
      if (loi) return J(res, { message: loi }, 400);
      so.chuongTrinh[vt] = { ...than, id: ctId };
      return J(res, { ok: true });
    });

    if (req.method === 'DELETE') {
      so.chuongTrinh.splice(vt, 1);
      if (so.dangDung === ctId) { so.dangDung = null; so.dangChay = null; }   // xoá cái đang dùng → thôi dùng luôn
      return J(res, { ok: true });
    }

    if (duoi[2] === 'dung' && req.method === 'POST') {
      const ct = so.chuongTrinh[vt];
      so.dangDung = ctId;
      so.dangChay = ct.chay === 'motlan' ? { buocXong: 0, tuLuc: Date.now() } : null;
      return J(res, { ok: true, dangDung: ctId, dangChay: so.dangChay }, 201);
    }
  }

  if (duoi[0] === 'dang-dung' && req.method === 'DELETE') {
    so.dangDung = null; so.dangChay = null;
    return J(res, { ok: true });
  }

  return J(res, { message: 'not_found' }, 404);
}

const J = (res,obj,code=200)=>{res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(obj));};
http.createServer((req,res)=>{
  const u = new URL(req.url,'http://x');
  const p = u.pathname.replace(/^\/v1/,'');
  if (req.method==='OPTIONS') return J(res,{});
  // IBS thật CÓ các nhánh này (quản trị, nội bộ, thăm dò sức khoẻ). Trả 200 để bài bao-ve
  // đo được proxy /v1 có chặn thật không, thay vì ăn may nhờ 404 của máy giả.
  if (/^\/(admin|internal|danh-muc|vat-tu)(\/|$)|^\/(health|live|ready)$/.test(p)) return J(res,{loRa:true});
  if (p==='/auth/login') return J(res,{accessToken:'a',refreshToken:'r',tenant:'livotec',expiresIn:300});
  if (p==='/auth/refresh') return J(res,{accessToken:'a',refreshToken:'r',tenant:'livotec',expiresIn:300});
  if (p==='/tenant/theme') return J(res,{colorPrimary:'#02b6ac',tenantName:'Livotec Home',logoUrl:null});
  if (p==='/i18n') return J(res,{lang:'vi',langs:['en','th','vi'],strings});
  if (p==='/bootstrap') return J(res,bs);
  if (p==='/products') return J(res,pr);
  if (p==='/devices') return J(res,bs.devices);
  if (p==='/categories') return J(res,bs.categories);
  // Kho icon của sadmin: `gtIco: "@wind"` → `/v1/icons/wind`. Máy thật trả SVG hoặc PNG
  // tuỳ icon, KHÔNG cần đăng nhập (thẻ <img> không gửi được token).
  if (p.startsWith('/icons/')) {
    const ten = p.slice(7);
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(ten) || ten.startsWith('khong-co')) {
      return J(res,{message:'không có icon này',error:'Not Found',statusCode:404},404);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><title>${ten}</title><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
    res.writeHead(200,{'Content-Type':'image/svg+xml','Access-Control-Allow-Origin':'*'});
    return res.end(svg);
  }
  if (p==='/notifications') return J(res,{unread:0,items:[]});
  if (p==='/shares') return J(res,{granted:[],receivedFromOthers:[]});
  if (p==='/rules') return J(res,{rules:[],tuThietBi:[]});
  if (p==='/me') return J(res,bs.me);
  // Mạch "câm": nhận lệnh nhưng không bao giờ báo lại giá trị mới. Mặc định TẮT, vì máy
  // thật có nhận có báo; bật lên để dựng cảnh xấu nhất trong bài nhip-hoi.
  if (p==='/__lam_ngo') { lamNgo = u.searchParams.get('bat')==='1'; return J(res,{lamNgo}); }
  if (p.endsWith('/rpc')) {
    let raw=''; req.on('data',c=>raw+=c);
    return req.on('end',()=>{
      const id=p.split('/')[2];
      fs.appendFileSync(NHAT_KY, JSON.stringify({id, idem:req.headers['idempotency-key']||null, than:raw})+'\n');
      // Máy chủ thật ghi nhận lệnh rồi trả giá trị mới ở lần hỏi sau. Máy giả không làm
      // vậy thì app sẽ thấy giá trị hỏi về luôn mâu thuẫn với nút vừa bấm, và mọi bài đo
      // quanh chuyện đó đều phập phù theo nhịp hỏi lại chứ không theo lỗi thật.
      if (!lamNgo) {
        try {
          const d = bs.devices.find(x=>x.id===id);
          const than = JSON.parse(raw||'{}');
          if (d && than.params) for (const [k,v] of Object.entries(than.params)) d.lastValues[k] = String(v);
        } catch { /* thân hỏng thì cứ ghi nhật ký rồi thôi */ }
      }
      J(res,{ok:true});
    });
  }
  // ── hẹn giờ theo thiết bị (D4) ─────────────────────────────────────────────────────
  // Cài thật trong bộ nhớ chứ không trả cứng: bộ kiểm cần đi hết luồng và cần CẢ những
  // nhánh chối (403/404/409/400) mà một stub không bao giờ dựng ra được.
  // Hai cửa nhận thiết bị. Ghi nhật ký kèm `cua` + `id` thiết bị tạo ra để bài kiểm nối với
  // PATCH /devices đi sau. Thiết bị nhận được thêm vào bs.devices để các cửa sau tìm thấy.
  if ((p === '/claim' || p === '/claim-mach-that') && req.method === 'POST') {
    let raw = ''; req.on('data', c => raw += c);
    return req.on('end', () => {
      let than; try { than = JSON.parse(raw || '{}'); } catch { than = {}; }
      const them = (name, type, active) => {
        const d = { id: `claim-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, name, type, label: name, house: '', room: '', grp: '',
          fav: false, hidden: false, active, createdTime: Date.now(), lastValues: {}, shared: false, perms: { control: true, create: true, delete: true } };
        bs.devices.push(d);
        return d;
      };
      if (p === '/claim') {
        // Tem hợp lệ duy nhất: fan81029 / 12345. Sai tên, sai mã, đã có chủ: 404 đồng nhất.
        const dung = than.name === 'fan81029' && than.secret === '12345' && !bs.devices.some(d => d.name === 'fan81029');
        const d = dung ? them('fan81029', 'fan_sbi314', true) : null;
        fs.appendFileSync(NHAT_KY, JSON.stringify({ cua: 'POST /claim', id: d?.id ?? null, than }) + '\n');
        return d ? J(res, { ok: true, id: d.id, name: d.name, type: d.type }, 201) : J(res, { message: 'not_found' }, 404);
      }
      // Serial: 40A… → online; OFF… → nhận được nhưng mạch chưa online; còn lại 400 câu tiếng Việt.
      const serial = String(than.serial ?? '');
      const hopLe = /^(40A|OFF)/.test(serial);
      const d = hopLe ? them(serial, 'fan', serial.startsWith('40A')) : null;
      fs.appendFileSync(NHAT_KY, JSON.stringify({ cua: 'POST /claim-mach-that', id: d?.id ?? null, than }) + '\n');
      if (!d) return J(res, { message: 'Không nhận được mạch này. Kiểm lại serial in trên vỏ; nếu đúng rồi thì mạch có thể đã thuộc tài khoản khác.' }, 400);
      return J(res, { ok: true, id: d.id, name: d.name, type: d.type, dangNoi: d.active }, 201);
    });
  }
  // PATCH /devices/{id} — đổi tên, gán chỗ, ghim. Ghi nhật ký kèm `cua` để bài kiểm lọc ra.
  if (/^\/devices\/[^/]+$/.test(p) && req.method === 'PATCH') {
    let raw = ''; req.on('data', c => raw += c);
    return req.on('end', () => {
      let than; try { than = JSON.parse(raw || '{}'); } catch { than = null; }
      if (!than) return J(res, { message: 'bad_request' }, 400);
      const id = decodeURIComponent(p.split('/')[2]);
      const tb = bs.devices.find(d => d.id === id);
      if (!tb) return J(res, { message: 'not_found' }, 404);
      Object.assign(tb, than);
      fs.appendFileSync(NHAT_KY, JSON.stringify({ cua: 'PATCH /devices', id, patch: than }) + '\n');
      J(res, { ok: true });
    });
  }
  if (p.includes("/hen-gio")) return henGio(req, res, p);
  if (p==='/stream') {
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
    khach.add(res); req.on('close',()=>khach.delete(res));
    res.write(': mo\n\n');
    return;
  }
  // Giả cảnh sadmin vừa lưu lưới mới: đổi `ui.boCuc` của một sản phẩm RỒI đổi nhãn
  // `phienBan.products`. Dữ liệu thiết bị không đổi một chữ nào — đúng như ngoài đời.
  if (p==='/__doi_catalog') {
    const sp = pr[u.searchParams.get('sp')];
    if (!sp) return J(res,{message:'not_found'},404);
    sp.ui = sp.ui || {};
    sp.ui.boCuc = JSON.parse(u.searchParams.get('boCuc'));
    bs.phienBan = { ...bs.phienBan, products: 'W/"' + Date.now() + '"' };
    return J(res,{ok:true, nhanMoi: bs.phienBan.products});
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
