/**
 * Sadmin có thêm trường nào local chưa biết không?
 *
 * Khác mọi bài khác trong tests/: bài này gọi API DEV THẬT, không gọi máy chủ giả. Vì câu hỏi
 * nó trả lời là "ngoài kia vừa đổi gì", mà máy chủ giả thì chỉ biết những gì mình tự nhét vào.
 *
 * Không cần đăng nhập: `/v1/products` mở, và nó trả CẢ catalog (12 sản phẩm hôm 16/10/2026)
 * chứ không chỉ sản phẩm của thiết bị mình có như `/bootstrap` (3).
 */
const GOC = process.env.IOTX_API_UPSTREAM || 'https://api.dev.happibot.net';
const TENANT = process.env.IOTX_TENANT || 'livotec';

// Giữ ĐỒNG BỘ với KHOA_BIET trong lib/ui/boCuc.ts. Lệch là bài này nói dối.
const BIET = {
  'ui':         ['renderer','archetype','skin','controls','gauges','image','uuTien','slots','boCuc'],
  'boCuc':      ['cot','caoHang','donHang','skin','nenAnh','alarm','o'],
  'boCuc.o':    ['key','col','row','w','h','variant','canN','canD','caoHang','moiHang','coNut',
                 'rongNut','nhan','gtIco','ico','vtIco','gtVt','mauCtl','vien','hlChon','nenAnh','mauChu'],
  'o.nhan':     ['can','co','dam','nghieng','mau'],
  'capability': ['key','kind','label','rpc','min','max','step','unit','unitSpace','values','labels'],
};
for (const k of Object.keys(BIET)) BIET[k] = new Set(BIET[k]);

// Giá trị `variant` local vẽ được — giữ ĐỒNG BỘ với VARIANT_THEO_KIND trong lib/ui/khuon.ts. Kiểu
// lạ thì local lặng lẽ vẽ bằng kiểu mặc định (22/10/2026: DEV đổi nút nguồn ac_1 sang `power02`
// mà bài này không bắt được vì chỉ soát TÊN khoá).
const KIEU_VE = new Set(['switch01', 'power01', 'power02', 'slider01', 'dial01', 'step01', 'chips01',
  'readout01', 'gauge01', 'state01', 'alarm01', 'filterlist01']);

const url = `${GOC}/v1/products?lang=vi&tenant=${encodeURIComponent(TENANT)}`;
let sp;
try {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  sp = await r.json();
} catch (e) {
  // Không với tới DEV thì KHÔNG báo đỏ: đỏ vì mất mạng rồi ai cũng quen, hết tác dụng báo động.
  console.log(`BỎ QUA  không gọi được ${url}: ${e.message}`);
  process.exit(0);
}

const la = new Map();                       // "noi.khoa" -> Set(mã sản phẩm)
const soat = (noi, obj, ma) => {
  for (const k of Object.keys(obj || {})) {
    if (BIET[noi].has(k)) continue;
    const d = `${noi}.${k}`;
    if (!la.has(d)) la.set(d, new Set());
    la.get(d).add(ma);
  }
};

let coBoCuc = 0;
for (const [ma, p] of Object.entries(sp)) {
  soat('ui', p.ui, ma);
  for (const c of p.capabilities || []) soat('capability', c, ma);
  const bc = p.ui?.boCuc;
  if (!bc) continue;
  coBoCuc++;
  soat('boCuc', bc, ma);
  for (const o of bc.o || []) {
    soat('boCuc.o', o, ma); soat('o.nhan', o.nhan, ma);
    // `vien` chỉ nhận "skin" hoặc mã màu (22/10/2026 sadmin chuyển sang "#ffffff") — giá trị khác
    // local bỏ viền lặng lẽ.
    if (o.vien !== undefined && o.vien !== 'skin' && !/^#[0-9a-f]{3,8}$/i.test(String(o.vien))) {
      const d = `vien=${o.vien}`;
      if (!la.has(d)) la.set(d, new Set());
      la.get(d).add(`${ma}.${o.key}`);
    }
    if (o.variant && !KIEU_VE.has(o.variant)) {
      const d = `variant=${o.variant}`;
      if (!la.has(d)) la.set(d, new Set());
      la.get(d).add(`${ma}.${o.key}`);
    }
  }
}

console.log(`Quét ${Object.keys(sp).length} sản phẩm, ${coBoCuc} sản phẩm có ui.boCuc`);
if (la.size === 0) { console.log('PASS  không có trường lạ'); process.exit(0); }
for (const [d, ds] of la) console.log(`FAIL  trường LẠ ${d} — ở: ${[...ds].join(', ')}`);
console.log('\nSadmin vừa thêm trường mới. Đọc giá trị thật rồi bổ sung vào lib/ui/boCuc.ts,');
console.log('và cập nhật cả BIET trong chính file này. Xem docs/viec-bao-khoa-la.md');
process.exit(1);
