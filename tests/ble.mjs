import { GOC, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';

/**
 * Điều khiển quạt, điều hoà qua Bluetooth (lib/ble/dieuKhienBle.ts, đặc tả docs/viec-ble.md).
 *
 * Hộp chọn thiết bị của Chromium không tự động được, nên thay `navigator.bluetooth` bằng một
 * MÁY GIẢ chạy đúng đặc tả: bốn characteristic, kiểm HMAC-SHA256(mã tem, NONCE), trả lời
 * `{id, ok}` và đẩy trạng thái `{t:{…}}` qua EVT. Đo phía app: khối chỉ hiện với quạt, điều
 * hoà và khi có API, sai mã thì báo, đúng mã thì nối; lệnh trên màn đi qua Bluetooth với đúng
 * `method`/`params` của catalog; máy tự báo trạng thái thì màn đổi theo; ngắt được; lần sau
 * khỏi gõ lại mã; chọn nhầm máy (serial khác) thì từ chối. Chọn kênh: có Wi-Fi thì "Ưu tiên
 * Wi-Fi" đưa lệnh về Wi-Fi, "Dùng Bluetooth" đưa lại; máy mất Wi-Fi thì nhắc chạm, lần sau tự
 * nối lại không cần hộp chọn.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const cho = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: CHROMIUM });

/**
 * Máy giả theo đặc tả — chạy trong trang. `MA` là mã 5 số trên tem, `SN` serial in trên tem;
 * đổi máy giữa chừng bằng `window.__bleMay({ MA, SN })`.
 */
function mayGia({ MA, SN }) {
  const SVC = '19800001-eb16-4e87-a18d-16008870c454';
  const U = { info: '19800002-eb16-4e87-a18d-16008870c454', nonce: '19800003-eb16-4e87-a18d-16008870c454', cmd: '19800004-eb16-4e87-a18d-16008870c454', evt: '19800005-eb16-4e87-a18d-16008870c454' };
  const enc = new TextEncoder(); const dec = new TextDecoder();
  const nhatKy = []; window.__bleNhatKy = nhatKy;
  let daXacThuc = false; let nonce = new Uint8Array(16);
  const evt = new EventTarget();
  evt.startNotifications = async () => evt;
  const day = obj => { evt.value = new DataView(enc.encode(JSON.stringify(obj)).buffer); evt.dispatchEvent(new Event('characteristicvaluechanged')); };
  window.__bleDay = t => day({ t });
  const hex = u8 => Array.from(u8, x => x.toString(16).padStart(2, '0')).join('');
  async function hmac(khoa, msg) {
    const k = await crypto.subtle.importKey('raw', enc.encode(khoa), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(new Uint8Array(await crypto.subtle.sign('HMAC', k, msg)));
  }
  const thietBi = new EventTarget();
  window.__bleMay = may => { ({ MA, SN } = may); thietBi.name = 'LVT-' + SN.slice(-4); };
  window.__bleMay({ MA, SN });
  const gatt = {
    connected: false,
    async connect() { gatt.connected = true; daXacThuc = false; nonce = crypto.getRandomValues(new Uint8Array(16)); return gatt; },
    disconnect() { if (!gatt.connected) return; gatt.connected = false; thietBi.dispatchEvent(new Event('gattserverdisconnected')); },
    async getPrimaryService(uuid) {
      if (uuid !== SVC) throw new DOMException('no service', 'NotFoundError');
      return {
        async getCharacteristic(u) {
          if (u === U.info) return { readValue: async () => new DataView(enc.encode(JSON.stringify({ v: 1, sn: SN, model: 'GIA', fw: '1.0.0' })).buffer) };
          if (u === U.nonce) return { readValue: async () => new DataView(nonce.slice().buffer) };
          if (u === U.evt) return evt;
          if (u === U.cmd) return {
            async writeValueWithResponse(buf) {
              const lenh = JSON.parse(dec.decode(buf));
              nhatKy.push({ lenh, tho: dec.decode(buf) });
              setTimeout(async () => {
                if (lenh.method === 'auth') {
                  daXacThuc = lenh.params?.mac === await hmac(MA, nonce);
                  day({ id: lenh.id, ok: daXacThuc, ...(daXacThuc ? {} : { err: 'auth' }) });
                  if (daXacThuc) day({ t: { power: true, speed: 2, mode: 'normal' } });
                  return;
                }
                if (!daXacThuc) return day({ id: lenh.id, ok: false, err: 'auth' });
                // Lệnh nào của catalog cũng nhận: `set…` với đúng một key trong params.
                const keys = Object.keys(lenh.params || {});
                if (!/^set/.test(lenh.method) || keys.length !== 1) return day({ id: lenh.id, ok: false, err: 'bad_method' });
                const key = keys[0];
                day({ id: lenh.id, ok: true });
                day({ t: { [key]: lenh.params[key] } });
              }, 30);
            },
          };
          throw new DOMException('no char', 'NotFoundError');
        },
      };
    },
  };
  thietBi.gatt = gatt;
  const bluetooth = {
    async requestDevice(opt) {
      window.__bleLoc = opt;
      window.__bleSoLanChon = (window.__bleSoLanChon || 0) + 1;
      if (!opt.filters?.some(f => f.services?.includes(SVC))) throw new DOMException('User cancelled', 'NotFoundError');
      return thietBi;
    },
  };
  Object.defineProperty(Navigator.prototype, 'bluetooth', { get: () => bluetooth, configurable: true });
}

async function vao(ctx) {
  const p = await ctx.newPage();
  const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 140)));
  await p.goto(GOC, { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('x');
  await p.locator('button.login-btn').click(); await cho(2000);
  return { p, loi };
}
const moThietBi = async (p, ten) => { await p.locator(`.device-card .card-hit[aria-label*="${ten}"]`).first().click(); await cho(700); };
const dongMan = async p => { await p.locator('.devpage .devback').click(); await cho(400); };

try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(mayGia, { MA: '12345', SN: 'fan72185' });
  const { p, loi } = await vao(ctx);
  const khoi = p.locator('.devpage .ble-dk');

  /* ---------- thẻ trong danh sách: icon kênh, có tên đọc được ---------- */
  const icThe = ten => p.locator('.device-card', { has: p.locator(`.card-hit[aria-label*="${ten}"]`) }).locator('.kenh-ic');
  ok('thẻ máy online có icon Wi-Fi kèm nhãn', await icThe('Quạt treo phòng ngủ').first().getAttribute('class').then(c => /wifi/.test(c))
    && /Wi-Fi/.test(await icThe('Quạt treo phòng ngủ').first().getAttribute('aria-label')));
  // Dữ liệu mock cho mọi máy online: đặt một quạt ngoại tuyến trong localStorage rồi tải lại.
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('livotec-home-v5'));
    d.devices.find(x => x.id === 'fb1').online = false;
    localStorage.setItem('livotec-home-v5', JSON.stringify(d));
  });
  await p.reload({ waitUntil: 'networkidle' }); await cho(1200);
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  ok('thẻ máy ngoại tuyến có icon mất Wi-Fi', await icThe('Quạt cây phòng khách').first().getAttribute('class').then(c => /mat/.test(c)));

  /* ---------- khối chỉ có ở quạt ---------- */
  await moThietBi(p, 'Quạt treo phòng ngủ');
  ok('màn quạt có khối "Điều khiển gần qua Bluetooth"', await khoi.count() === 1 && /Điều khiển gần qua Bluetooth/.test(await khoi.innerText()));
  const hop = await khoi.locator('button').first().boundingBox();
  ok(`nút mở ≥44px (${Math.round(hop.height)})`, hop.height >= 44);

  /* ---------- lần đầu: hỏi mã tem; sai mã thì báo ---------- */
  await khoi.locator('button', { hasText: 'Điều khiển gần qua Bluetooth' }).click(); await cho(200);
  const oMa = khoi.locator('input');
  ok('lần đầu hỏi 5 số trên tem', await oMa.count() === 1);
  const nutNoi = khoi.locator('button', { hasText: 'Kết nối' });
  await oMa.fill('123'); ok('chưa đủ 5 số → nút Kết nối khoá', await nutNoi.isDisabled());
  await oMa.fill('11111'); await nutNoi.click(); await cho(500);
  ok('sai mã → báo "Sai mã trên tem", vẫn hỏi lại mã', /Sai mã trên tem/.test(await khoi.innerText()) && await oMa.count() === 1);
  ok('lọc hộp chọn theo service UUID của quạt', await p.evaluate(() => JSON.stringify(window.__bleLoc.filters)).then(s => s.includes('19800001-eb16-4e87-a18d-16008870c454')));

  /* ---------- đúng mã → nối; mã không đi qua sóng ---------- */
  await oMa.fill('12345'); await nutNoi.click(); await cho(500);
  ok('đúng mã → "Đang điều khiển qua Bluetooth"', /Đang điều khiển qua Bluetooth/.test(await khoi.innerText()));
  const chipBle = p.locator('.devpage .dev-st .kenh-chip.ble');
  ok('đầu màn có chip Bluetooth (icon + chữ) cạnh chip Wi-Fi', await chipBle.count() === 1 && /Bluetooth/.test(await chipBle.innerText())
    && await chipBle.locator('svg').count() === 1 && await p.locator('.devpage .dev-st .kenh-chip.wifi').count() === 1);
  const nk = await p.evaluate(() => window.__bleNhatKy);
  const auth = nk.filter(x => x.lenh.method === 'auth');
  ok('xác thực bằng HMAC 64 ký tự hex', auth.length === 2 && /^[0-9a-f]{64}$/.test(auth[1].lenh.params.mac));
  ok('mã tem KHÔNG nằm trong gói nào gửi đi', nk.every(x => !x.tho.includes('12345') && !x.tho.includes('11111')));

  /* ---------- lệnh trên màn đi qua Bluetooth, đúng method/params của catalog ---------- */
  const truoc = (await p.evaluate(() => window.__bleNhatKy.length));
  await p.locator('.devpage .mchips [role=button]', { hasText: 'Gió tự nhiên' }).first().click(); await cho(400);
  const lenhMoi = (await p.evaluate(() => window.__bleNhatKy)).slice(truoc).map(x => x.lenh);
  ok(`chọn "Gió tự nhiên" → gửi setMode {mode:"nature"} qua Bluetooth (${JSON.stringify(lenhMoi.map(l => l.method))})`,
    lenhMoi.length === 1 && lenhMoi[0].method === 'setMode' && lenhMoi[0].params.mode === 'nature' && typeof lenhMoi[0].id === 'number');
  ok('không hiện lỗi sau lệnh', await p.locator('.devpage > .devbody > .form-message').count() === 0);

  /* ---------- quạt tự báo trạng thái (bấm nút trên thân, remote) → màn đổi theo ---------- */
  const chipNgu = p.locator('.devpage .mchips [role=button]', { hasText: /^Ngủ$/ }).first();
  const dangChon = async () => (await chipNgu.getAttribute('aria-pressed')) === 'true';
  ok('trước khi quạt báo: "Ngủ" chưa chọn', !(await dangChon()));
  await p.evaluate(() => window.__bleDay({ mode: 'sleep' })); await cho(300);
  ok('quạt báo mode=sleep → chip "Ngủ" sáng lên', await dangChon());

  /* ---------- chọn kênh khi máy có Wi-Fi: nối tay = chọn Bluetooth; "Ưu tiên Wi-Fi" đưa lệnh về Wi-Fi ---------- */
  const chipWifi = p.locator('.devpage .dev-st .kenh-chip.wifi');
  ok('nối tay khi có Wi-Fi → chip Bluetooth tô đặc, chip Wi-Fi chỉ viền',
    !/(^| )cho( |$)/.test(await chipBle.getAttribute('class')) && /(^| )cho( |$)/.test(await chipWifi.getAttribute('class')));
  await khoi.locator('button', { hasText: 'Ưu tiên Wi-Fi' }).click(); await cho(300);
  ok('"Ưu tiên Wi-Fi" → khối báo "Bluetooth chờ sẵn", chip đổi vai',
    /Bluetooth chờ sẵn/.test(await khoi.innerText()) && /(^| )cho( |$)/.test(await chipBle.getAttribute('class')) && !/(^| )cho( |$)/.test(await chipWifi.getAttribute('class')));
  const truocWifi = await p.evaluate(() => window.__bleNhatKy.length);
  await p.locator('.devpage .mchips [role=button]', { hasText: 'Gió tự nhiên' }).first().click(); await cho(400);
  ok('ưu tiên Wi-Fi → lệnh KHÔNG đi Bluetooth', await p.evaluate(() => window.__bleNhatKy.length) === truocWifi);
  await khoi.locator('button', { hasText: 'Dùng Bluetooth' }).click(); await cho(300);
  await p.locator('.devpage .mchips [role=button]', { hasText: 'Thường' }).first().click(); await cho(400);
  const lenhChon = (await p.evaluate(() => window.__bleNhatKy)).slice(truocWifi).map(x => x.lenh.method);
  ok(`"Dùng Bluetooth" → lệnh lại đi Bluetooth (${JSON.stringify(lenhChon)})`, lenhChon.length === 1 && lenhChon[0] === 'setMode');
  const nutKenh = await khoi.locator('button', { hasText: 'Ưu tiên Wi-Fi' }).boundingBox();
  ok(`nút chọn kênh ≥44px (${Math.round(nutKenh.height)})`, nutKenh.height >= 44);

  /* ---------- ngắt ---------- */
  await khoi.locator('button', { hasText: 'Ngắt Bluetooth' }).click(); await cho(300);
  ok('ngắt → trở lại nút "Điều khiển gần qua Bluetooth"', /Điều khiển gần qua Bluetooth/.test(await khoi.innerText()) && !/Đang điều khiển/.test(await khoi.innerText()));
  ok('ngắt → chip Bluetooth biến mất, còn chip Wi-Fi', await chipBle.count() === 0 && await p.locator('.devpage .dev-st .kenh-chip.wifi').count() === 1);
  const sauNgat = await p.evaluate(() => window.__bleNhatKy.length);
  await p.locator('.devpage .mchips [role=button]', { hasText: 'Thường' }).first().click(); await cho(300);
  ok('sau khi ngắt, lệnh không còn đi qua Bluetooth', await p.evaluate(() => window.__bleNhatKy.length) === sauNgat);

  /* ---------- lần sau khỏi gõ mã; rời màn là ngắt ---------- */
  await khoi.locator('button', { hasText: 'Điều khiển gần qua Bluetooth' }).click(); await cho(500);
  ok('lần sau nối thẳng, không hỏi lại mã', await oMa.count() === 0 && /Đang điều khiển qua Bluetooth/.test(await khoi.innerText()));
  await dongMan(p);
  await moThietBi(p, 'Quạt treo phòng ngủ');
  ok('rời màn chi tiết → phiên đã ngắt', !/Đang điều khiển/.test(await khoi.innerText()));
  await dongMan(p);

  /* ---------- máy mất Wi-Fi: nhắc chạm; nối rồi thì lệnh đi Bluetooth; lần sau tự nối ---------- */
  await p.evaluate(() => window.__bleMay({ MA: '24680', SN: 'fan90233' }));
  await moThietBi(p, 'Quạt cây phòng khách');
  ok('máy ngoại tuyến, chưa nhớ mã → nhắc "mất Wi-Fi. Chạm để điều khiển qua Bluetooth"',
    /mất Wi-Fi. Chạm để điều khiển qua Bluetooth/.test(await khoi.innerText()) && await khoi.locator('button.btn:not(.gh)').count() === 1);
  await khoi.locator('button', { hasText: 'Điều khiển gần qua Bluetooth' }).click(); await cho(200);
  await oMa.fill('24680'); await nutNoi.click(); await cho(500);
  ok('nối lúc mất Wi-Fi → "lệnh đang đi thẳng qua Bluetooth", không có nút chọn kênh',
    /mất Wi-Fi nên lệnh đang đi thẳng qua Bluetooth/.test(await khoi.innerText()) && await khoi.locator('button', { hasText: /Ưu tiên Wi-Fi|Dùng Bluetooth/ }).count() === 0);
  ok('chip Bluetooth tô đặc cạnh chip "Ngoại tuyến"', !/(^| )cho( |$)/.test(await chipBle.getAttribute('class')) && await p.locator('.devpage .dev-st .kenh-chip.mat').count() === 1);
  const truocMat = await p.evaluate(() => window.__bleNhatKy.length);
  await p.locator('.devpage .mchips [role=button][aria-pressed=false]').first().click(); await cho(400);
  ok('máy mất Wi-Fi → lệnh đi Bluetooth', (await p.evaluate(() => window.__bleNhatKy)).slice(truocMat).some(x => /^set/.test(x.lenh.method)));
  await dongMan(p);
  const soLanChon = await p.evaluate(() => window.__bleSoLanChon);
  await moThietBi(p, 'Quạt cây phòng khách'); await cho(500);
  ok('mở lại máy mất Wi-Fi → tự nối Bluetooth, không mở lại hộp chọn',
    /mất Wi-Fi nên lệnh đang đi thẳng qua Bluetooth/.test(await khoi.innerText()) && await p.evaluate(() => window.__bleSoLanChon) === soLanChon);
  await dongMan(p);
  await p.evaluate(() => window.__bleMay({ MA: '12345', SN: 'fan72185' }));

  /* ---------- điều hoà: cùng giao thức, lệnh lấy từ catalog điều hoà ---------- */
  await moThietBi(p, 'Điều hòa phòng khách');
  ok('màn điều hoà có khối "Điều khiển gần qua Bluetooth"', await khoi.count() === 1);
  // Hộp chọn trả về quạt (serial khác) → app từ chối, không điều khiển nhầm máy.
  await khoi.locator('button', { hasText: 'Điều khiển gần qua Bluetooth' }).click(); await cho(200);
  await oMa.fill('12345'); await nutNoi.click(); await cho(500);
  ok('chọn nhầm máy (serial khác) → báo "không phải thiết bị này"', /không phải thiết bị này/.test(await khoi.innerText()) && !/Đang điều khiển/.test(await khoi.innerText()));
  await p.evaluate(() => window.__bleMay({ MA: '54321', SN: 'ac30412' }));
  await oMa.fill('54321'); await nutNoi.click(); await cho(500);
  ok('đúng điều hoà, đúng mã → "Đang điều khiển qua Bluetooth"', /Đang điều khiển qua Bluetooth/.test(await khoi.innerText()));
  const truocAc = (await p.evaluate(() => window.__bleNhatKy.length));
  await p.locator('.devpage .mchips [role=button]', { hasText: 'Hút ẩm' }).first().click(); await cho(400);
  const lenhAc = (await p.evaluate(() => window.__bleNhatKy)).slice(truocAc).map(x => x.lenh);
  ok(`chọn "Hút ẩm" → gửi setMode {mode:"dry"} qua Bluetooth (${JSON.stringify(lenhAc.map(l => l.method))})`,
    lenhAc.length === 1 && lenhAc[0].method === 'setMode' && lenhAc[0].params.mode === 'dry');
  await dongMan(p);

  /* ---------- thiết bị không có đường Bluetooth → không có khối ---------- */
  await moThietBi(p, 'Bếp từ đôi');
  ok('màn bếp từ không có khối Bluetooth', await khoi.count() === 0);
  await dongMan(p);
  ok(`không lỗi JS (${loi.join(' | ')})`, loi.length === 0);
  await ctx.close();

  /* ---------- trình duyệt không có Web Bluetooth (iPhone) → không có khối ---------- */
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx2.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'bluetooth', { get: () => undefined, configurable: true }); });
  const { p: p2 } = await vao(ctx2);
  await moThietBi(p2, 'Quạt treo phòng ngủ');
  ok('không có Web Bluetooth → ẩn hẳn khối', await p2.locator('.devpage .ble-dk').count() === 0);
  await ctx2.close();
} finally {
  await b.close();
}

console.log(R.join('\n'));
console.log(`\n${R.filter(x => x.startsWith('PASS')).length}/${R.length} PASS`);
if (R.some(x => x.startsWith('FAIL'))) process.exit(1);
