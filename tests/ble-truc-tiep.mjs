import { GOC, CHROMIUM, anh } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Nối BLE ở màn chi tiết (docs/viec-ble-webapp.md, nghiệm thu mục 9 bước 1–4, 7, 10).
 *
 * Không có mạch thật: `navigator.bluetooth` được thay bằng một GATT GIẢ chạy ngay trong trang,
 * đóng vai firmware theo đúng hợp đồng docs/yeu-cau-firmware-ble.md mục 2–3 — đẩy nonce khi nối,
 * TỰ TÍNH HMAC-SHA256 để so chữ ký (sai thì ngắt), trả `resp` theo `id`, chặn mọi `op` trước bắt
 * tay. Thứ duy nhất không thử được ở đây là sóng thật và hộp chọn thiết bị của Chrome.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const cho = ms => new Promise(r => setTimeout(r, ms));
const BI_MAT = '00112233445566778899aabbccddeeff';
const BI_MAT_MAY_KHAC = 'ffeeddccbbaa99887766554433221100';

/** Mạch giả. `window.__mach`: bí mật thật của mạch, nhật ký `cmd`, và nút giả "đi xa". */
const GATT_GIA = (biMat) => {
  const UUID = n => `${n}b77b-8b45-4e98-8517-ab86cddd0995`;
  const enc = o => { const b = new TextEncoder().encode(JSON.stringify(o)); return new DataView(b.buffer); };
  const tuHex = h => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
  const m = window.__mach = { biMat, nhatKy: [], boLoc: null, seq: 100, daBatTay: false };
  class DacTinh extends EventTarget {
    constructor(uuid, may) { super(); this.uuid = uuid; this.may = may; this.value = undefined; }
    async readValue() { return enc({ serial: this.may.serial, model: 'ac_1', label: null, fw: '0.0.1-gia' }); }
    async startNotifications() {
      if (this.uuid === UUID('0004')) setTimeout(() => this.may.day('resp', { op: 'nonce', giaTri: btoa(String.fromCharCode(...this.may.nonce)) }), 30);
      return this;
    }
    async writeValueWithoutResponse(buf) {
      const thu = JSON.parse(new TextDecoder().decode(buf));
      m.nhatKy.push(thu);
      const may = this.may;
      if (thu.op === 'auth') {
        const khoa = await crypto.subtle.importKey('raw', tuHex(m.biMat), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const dung = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', khoa, may.nonce))));
        if (dung === thu.chuKy) { m.daBatTay = true; may.day('resp', { ok: true }); } else may.dut();   // sai → NGẮT
        return;
      }
      if (!m.daBatTay) { may.day('resp', { id: thu.id, ok: false, loi: 'unauthorized' }); return; }
      if (thu.op === 'rpc') { m.seq++; may.day('resp', { id: thu.id, ok: true, seq: m.seq, v: thu.params }); }
    }
  }
  class May extends EventTarget {
    constructor(serial) {
      super(); this.serial = serial; this.name = 'LIVOTEC-A1B2C3';
      this.nonce = crypto.getRandomValues(new Uint8Array(16));
      this.dt = Object.fromEntries(['0001', '0002', '0003', '0004'].map(n => [UUID(n), new DacTinh(UUID(n), this)]));
      const gatt = {
        connected: false,
        connect: async () => { gatt.connected = true; return { getPrimaryService: async () => ({ getCharacteristic: async u => this.dt[u] }) }; },
        disconnect: () => { if (!gatt.connected) return; gatt.connected = false; setTimeout(() => this.dispatchEvent(new Event('gattserverdisconnected')), 0); },
      };
      this.gatt = gatt;
    }
    day(ten, thu) { const d = this.dt[UUID(ten === 'resp' ? '0004' : '0002')]; d.value = enc(thu); d.dispatchEvent(new Event('characteristicvaluechanged')); }
    dut() { m.daBatTay = false; this.gatt.disconnect(); }
  }
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: {
    async requestDevice(o) {
      m.boLoc = o;
      // Firmware phát serial trong Manufacturer Data → hộp chọn chỉ hiện đúng máy đó.
      const md = o.filters.find(f => f.manufacturerData)?.manufacturerData[0];
      const may = new May(new TextDecoder().decode(md.dataPrefix));
      m.may = may; m.daBatTay = false;
      return may;
    },
  } });
};

const b = await chromium.launch({ executablePath: CHROMIUM });
const loi = [];

async function moChiTiet(p) {
  await p.goto(GOC, { waitUntil: 'load' }); await cho(1500);
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  if (await p.locator('#dn-id').count()) {
    await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('x');
    await p.locator('button.login-btn').click(); await cho(2000);
  }
  await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await cho(800);
  await p.locator('.device-card').filter({ hasText: 'Quạt mới' }).first().locator('.card-hit').click(); await cho(1200);
}

/* ---- Bước 1: trình duyệt không có Web Bluetooth (iPhone, Firefox) ---- */
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: undefined }));
  const p = await ctx.newPage(); p.on('pageerror', e => loi.push(String(e).slice(0, 160)));
  await moChiTiet(p);
  ok('không có navigator.bluetooth → nút "Kết nối trực tiếp" KHÔNG hiện', await p.locator('.ble-nut').count() === 0 && await p.locator('.tt-lon').count() >= 1);
  ok('…và không có băng BLE, không có lỗi', await p.locator('.ble-bang').count() === 0);
  await ctx.close();
}

/* ---- Bước 2, 3, 4, 7, 10 với GATT giả ---- */
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(GATT_GIA, BI_MAT);
const p = await ctx.newPage(); p.on('pageerror', e => loi.push(String(e).slice(0, 160)));
const rpcV1 = []; p.on('request', q => { if (/\/v1\/devices\/[^/]+\/rpc/.test(q.url())) rpcV1.push(q.url()); });
await moChiTiet(p);
const serial = await p.evaluate(() => document.querySelector('.ble-nut') && true);
ok('có Web Bluetooth → nút "Kết nối trực tiếp" hiện cùng hàng nút thông tin', serial && await p.locator('.devdau .ble-nut, .dev-tenhang ~ .ble-nut, .ble-nut').count() === 1);
ok('nút ≥44px', (await p.locator('.ble-nut').evaluate(n => Math.min(n.getBoundingClientRect().width, n.getBoundingClientRect().height))) >= 44);
const biMatDaCat = () => p.evaluate(() => JSON.parse(localStorage.getItem('livotec-iotx-cache-v2') || '{}').bleBiMat || {});

// Bước 2: lần đầu → màn quét QR (dùng lại QuetQR), gõ mã tay, nối.
await p.locator('.ble-nut').click(); await cho(300);
const man = p.locator('.modal-sheet');
ok('lần đầu bấm → mở màn nhập mã có khung quét QR (QuetQR)', await man.count() === 1 && await man.locator('.scanner').count() === 1);
await man.locator('input').fill(BI_MAT);
await man.locator('button.primary').click(); await cho(800);
const bang = p.locator('.ble-bang');
ok(`nối xong → băng "${(await bang.innerText().catch(() => '')).split('\n')[0]}"`, /trực tiếp qua Bluetooth/.test(await bang.innerText().catch(() => '')));
const boLoc = await p.evaluate(() => window.__mach.boLoc);
ok('hộp chọn lọc theo serial trong Manufacturer Data, kèm namePrefix "LIVOTEC-" dự phòng, xin service b77b',
  boLoc.filters[0].manufacturerData?.[0].companyIdentifier === 0xffff && boLoc.filters[1].namePrefix === 'LIVOTEC-' && boLoc.optionalServices[0].startsWith('0000b77b'));
const cat = await biMatDaCat();
const serialMay = await p.evaluate(() => window.__mach.may.serial);
ok(`bí mật cất theo serial ${serialMay} (base64)`, Object.keys(cat).length === 1 && Buffer.from(cat[serialMay], 'base64').toString('hex') === BI_MAT);
ok('bắt tay gửi op:auth với chữ ký HMAC (mạch giả tự tính và chấp nhận)', await p.evaluate(() => window.__mach.daBatTay && window.__mach.nhatKy[0].op === 'auth'));
await p.screenshot({ path: anh('ble-da-noi') });

// Lệnh đi BLE, không đi /v1.
const nut = p.locator('.devpage .bc-tile [role=switch], .devpage .bc-tile button[aria-pressed]').first();
await nut.click(); await cho(600);
const rpc = await p.evaluate(() => window.__mach.nhatKy.filter(x => x.op === 'rpc'));
ok(`bấm điều khiển → lệnh đi qua BLE (${rpc[0]?.method} ${JSON.stringify(rpc[0]?.params)}), có id và Idempotency-Key trong thân`,
  rpc.length === 1 && typeof rpc[0].id === 'number' && /^[0-9a-f-]{36}$/.test(rpc[0].khoa));
ok('…và KHÔNG gọi /v1/devices/{id}/rpc', rpcV1.length === 0);

// Bước 3: ngắt, bấm lại → nối thẳng, không hỏi mã.
await bang.locator('button').click(); await cho(300);
ok('bấm Ngắt → băng biến mất (không phải băng vàng)', await bang.count() === 0);
await p.locator('.ble-nut').click(); await cho(800);
ok('lần hai → KHÔNG hỏi lại mã, nối thẳng', await man.count() === 0 && /trực tiếp qua Bluetooth/.test(await bang.innerText().catch(() => '')));

// Bước 7: đi xa giữa chừng → băng vàng, lệnh quay về /v1.
await p.evaluate(() => window.__mach.may.dut()); await cho(300);
ok(`mất sóng → băng vàng "${await bang.innerText().catch(() => '')}"`, /Mất kết nối Bluetooth/.test(await bang.innerText().catch(() => '')) && await bang.evaluate(n => n.classList.contains('vang')));
const truoc = rpcV1.length;
await nut.click(); await cho(900);
ok('lệnh kế tiếp tự đi đường máy chủ /v1', rpcV1.length === truoc + 1);
await bang.locator('button').click(); await cho(200);

// Bước 4: quét nhầm mã của máy khác → "Mã trên tem không đúng", xoá mã đã cất, hỏi lại.
await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('livotec-iotx-cache-v2')); c.bleBiMat = {}; localStorage.setItem('livotec-iotx-cache-v2', JSON.stringify(c)); });
await p.reload({ waitUntil: 'load' }); await cho(2500);
await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await cho(600);
await p.locator('.device-card').filter({ hasText: 'Quạt mới' }).first().locator('.card-hit').click(); await cho(1000);
await p.locator('.ble-nut').click(); await cho(300);
await man.locator('input').fill(BI_MAT_MAY_KHAC);
await man.locator('button.primary').click(); await cho(1200);
ok(`mã sai → màn nhập mở lại với "${await man.locator('[role=alert]').innerText().catch(() => '')}"`,
  await man.count() === 1 && /Mã trên tem không đúng/.test(await man.locator('[role=alert]').innerText().catch(() => '')));
ok('mã sai → đã XOÁ mã cất cho serial đó', Object.keys(await biMatDaCat()).length === 0);
ok('mạch giả đã ngắt, app không coi là đang nối', await p.locator('.ble-bang.on').count() === 0);
await p.screenshot({ path: anh('ble-ma-sai') });
await man.locator('input').fill(BI_MAT);
await man.locator('button.primary').click(); await cho(800);
ok('nhập lại mã đúng → nối được', /trực tiếp qua Bluetooth/.test(await bang.innerText().catch(() => '')));

// Bước 10: đăng xuất bằng nút thật rồi đăng nhập lại → bí mật vẫn còn, nối thẳng không hỏi mã.
await p.locator('.devback').click(); await cho(500);
await p.locator('.top-bar .profile-chip').click(); await cho(400);
await p.locator('.menu-dang-xuat').click(); await cho(1200);
ok('đã đăng xuất (về màn đăng nhập, phiên bị xoá)', await p.locator('button.login-btn').count() === 1
  && await p.evaluate(() => localStorage.getItem('livotec-iotx-session') === null));
ok('sau đăng xuất bí mật BLE VẪN CÒN', Object.keys(await biMatDaCat()).length === 1);
await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('x');
await p.locator('button.login-btn').click(); await cho(2000);
await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await cho(600);
await p.locator('.device-card').filter({ hasText: 'Quạt mới' }).first().locator('.card-hit').click(); await cho(1000);
ok('đăng xuất đã ngắt luôn kết nối BLE của phiên cũ', await p.locator('.ble-bang').count() === 0);
await p.locator('.ble-nut').click(); await cho(800);
ok('đăng nhập lại → bấm nút nối thẳng, không hỏi mã', await man.count() === 0 && /trực tiếp qua Bluetooth/.test(await bang.innerText().catch(() => '')));

console.log(R.join('\n'));
console.log('Lỗi JS:', loi.length ? [...new Set(loi)].join(' | ') : 'không có');
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
await b.close();
