import { GOC, GOC_GIA, NHAT_KY, CHROMIUM } from './chung.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';

/**
 * Một cú bấm khi mạch mất Wi-Fi (components/LivotecApp.tsx `guiQuaKenh`).
 *
 * Máy chủ thật chậm vài phút mới biết mạch mất Wi-Fi, nên trong khoảng đó nó vẫn nói "trực
 * tuyến". Dựng đúng cảnh ấy bằng máy chủ giả: `/__lam_ngo` làm mạch "câm" — nhận lệnh, trả
 * `ok`, nhưng không bao giờ báo giá trị mới. Bluetooth là một máy giả trong trang (chấp nhận
 * mọi mã, trả `ok`). Đo: Wi-Fi tốt thì không đụng Bluetooth; mạch im lặng thì sau ~3 giây lệnh
 * tự sang Bluetooth, icon thành "Mất Wi-Fi" + Bluetooth; bấm tiếp đi thẳng Bluetooth; mạch báo
 * lại thì về Wi-Fi; tải lại trang thì mở hộp chọn đúng một lần; chưa ghép thì nhắc nhập mã.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const cho = ms => new Promise(r => setTimeout(r, ms));
const rpc = () => { try { return fs.readFileSync(NHAT_KY, 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } };
const QUAT = '9bed9f20-a6c7-11f1-b79e-ad8fe8623469';   // fan63903
const lamNgo = bat => fetch(`${GOC_GIA}/v1/__lam_ngo?bat=${bat ? 1 : 0}`);

function mayGia() {
  const enc = new TextEncoder(); const dec = new TextDecoder();
  const evt = new EventTarget(); evt.startNotifications = async () => evt;
  const day = o => { evt.value = new DataView(enc.encode(JSON.stringify(o)).buffer); evt.dispatchEvent(new Event('characteristicvaluechanged')); };
  window.__bleLenh = []; window.__bleChon = 0;
  const dev = new EventTarget(); dev.name = 'LVT-3903';
  const gatt = {
    connected: false,
    async connect() { gatt.connected = true; return gatt; },
    disconnect() { if (!gatt.connected) return; gatt.connected = false; dev.dispatchEvent(new Event('gattserverdisconnected')); },
    async getPrimaryService() {
      return { async getCharacteristic(u) {
        if (u.startsWith('19800002')) return { readValue: async () => new DataView(enc.encode('{"v":1}').buffer) };
        if (u.startsWith('19800003')) return { readValue: async () => new DataView(new Uint8Array(16).buffer) };
        if (u.startsWith('19800005')) return evt;
        return { async writeValueWithResponse(b) {
          const l = JSON.parse(dec.decode(b));
          if (l.method !== 'auth') window.__bleLenh.push(l);
          setTimeout(() => day({ id: l.id, ok: true }), 20);
        } };
      } };
    },
  };
  dev.gatt = gatt;
  Object.defineProperty(Navigator.prototype, 'bluetooth', { get: () => ({ requestDevice: async () => { window.__bleChon++; return dev; } }), configurable: true });
}

const b = await chromium.launch({ executablePath: CHROMIUM });
try {
  try { fs.unlinkSync(NHAT_KY); } catch { /* chưa có */ }
  await lamNgo(false);
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(mayGia);
  const p = await ctx.newPage();
  const loi = []; p.on('pageerror', e => loi.push(String(e).slice(0, 140)));
  const vao = async () => {
    // Đã đăng nhập thì luồng SSE giữ kết nối mở — 'networkidle' không bao giờ tới.
    await p.goto(GOC, { waitUntil: 'load' }); await cho(1500);
    await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    if (await p.locator('#dn-id').count()) {
      await p.locator('#dn-id').fill('p@p.vn'); await p.locator('#dn-pw').fill('x');
      await p.locator('button.login-btn').click(); await cho(2500);
    }
    await p.locator('.bn-item', { hasText: 'Thiết bị' }).click(); await cho(700);
    await p.locator('.device-card').filter({ has: p.locator('.dname', { hasText: 'fan63903' }) }).first().locator('.card-hit').click(); await cho(900);
  };
  const khoi = p.locator('.devpage .ble-dk');
  const cong = p.locator('.ctl-steprow .ctl-step').last();
  const tru = p.locator('.ctl-steprow .ctl-step').first();
  const ble = () => p.evaluate(() => window.__bleLenh.length);
  const chip = loai => p.locator(`.devpage .dev-st .kenh-chip.${loai}`);

  await vao();
  /* ---------- ghép một lần (nhập mã tem), rồi ngắt ---------- */
  await khoi.locator('button', { hasText: 'Điều khiển gần qua Bluetooth' }).click(); await cho(200);
  await khoi.locator('input').fill('12345'); await khoi.locator('button', { hasText: 'Kết nối' }).click(); await cho(500);
  await khoi.locator('button', { hasText: 'Ngắt Bluetooth' }).click(); await cho(300);
  ok('ghép xong rồi ngắt: còn chip Wi-Fi, không chip Bluetooth', await chip('wifi').count() === 1 && await chip('ble').count() === 0);

  // Tốc độ về giữa thang, để "+" luôn đổi được giá trị (đặt lại đúng giá trị thì mạch chẳng có gì để báo).
  const datTocDo = async v => {
    await fetch(`${GOC_GIA}/v1/__doi?id=${QUAT}&key=speed&value=${v}`);
    await fetch(`${GOC_GIA}/v1/__phat?id=${QUAT}&key=speed&value=${v}`);
    await cho(800);
  };
  await datTocDo(5);
  /* ---------- mạch CHƯA TỪNG báo lại (mạch thử chưa nối điều hoà): im lặng không phải mất Wi-Fi ---------- */
  await p.evaluate(id => localStorage.removeItem(`livotec-bao-lai:${id}`), QUAT);
  await lamNgo(true);
  let r0 = rpc(); let b0 = await ble();
  await cong.click(); await cho(4200);
  ok('mạch chưa từng báo lại, im lặng → vẫn Wi-Fi, không sang Bluetooth, không mở hộp chọn',
    rpc() === r0 + 1 && await ble() === b0 && await chip('wifi').count() === 1 && await chip('mat').count() === 0
    && await p.evaluate(() => window.__bleChon) === 1);
  await lamNgo(false);
  await datTocDo(5);

  /* ---------- Wi-Fi tốt: mạch báo lại → không đụng Bluetooth, và app nhớ "mạch này biết báo lại" ---------- */
  r0 = rpc(); b0 = await ble();
  await cong.click(); await cho(3600);
  ok('Wi-Fi tốt: lệnh đi Wi-Fi, mạch xác nhận, Bluetooth không bị đụng', rpc() === r0 + 1 && await ble() === b0 && await chip('wifi').count() === 1);
  ok('app nhớ mạch đã biết báo lại', await p.evaluate(id => localStorage.getItem(`livotec-bao-lai:${id}`), QUAT) === '1');

  /* ---------- mạch mất Wi-Fi (máy chủ vẫn nói trực tuyến): một cú bấm là sang Bluetooth ---------- */
  await lamNgo(true);
  r0 = rpc(); b0 = await ble();
  const t0 = Date.now();
  await cong.click();
  await p.waitForFunction(n => window.__bleLenh.length > n, b0, { timeout: 8000 }).catch(() => undefined);
  const mat = Date.now() - t0;
  ok(`mạch im lặng → tự chuyển Bluetooth sau ${mat} ms (≈3 s), không mở hộp chọn`,
    await ble() === b0 + 1 && rpc() === r0 + 1 && mat >= 2500 && mat < 6000 && await p.evaluate(() => window.__bleChon) === 1);
  await cho(300);
  ok('icon: "Mất Wi-Fi" + Bluetooth tô đặc', /Mất Wi-Fi/.test(await chip('mat').innerText().catch(() => '')) && await chip('ble').count() === 1);
  ok('không hiện lỗi nào', await p.locator('.devpage .form-message').count() === 0);
  r0 = rpc(); b0 = await ble();
  await cong.click(); await cho(600);
  ok('bấm tiếp → đi thẳng Bluetooth ngay, không thử Wi-Fi', await ble() === b0 + 1 && rpc() === r0);

  /* ---------- mạch có Wi-Fi lại (máy chủ nhận tin từ mạch) → về Wi-Fi ---------- */
  await lamNgo(false);
  await fetch(`${GOC_GIA}/v1/__phat?id=${QUAT}&key=speed&value=5`); await cho(800);
  ok('mạch báo lại qua máy chủ → icon Wi-Fi tô đặc, Bluetooth chờ', await chip('wifi').count() === 1 && /(^| )cho( |$)/.test(await chip('ble').count() ? await chip('ble').getAttribute('class') : 'khong-co'));
  r0 = rpc(); b0 = await ble();
  await tru.click(); await cho(3600);
  ok('Wi-Fi về → lệnh lại đi Wi-Fi', rpc() === r0 + 1 && await ble() === b0);

  /* ---------- tải lại trang (trình duyệt quên máy đã chọn): chỉ NGHI mất Wi-Fi → không tự bật hộp chọn ---------- */
  await datTocDo(5);
  await lamNgo(true);
  await vao();
  const chon0 = await p.evaluate(() => window.__bleChon);
  b0 = await ble();
  const truocNghi = await p.locator('.ctl-dial').innerText();
  await cong.click(); await cho(4200);
  ok('sau tải lại, mạch im lặng → KHÔNG tự bật hộp chọn; khối Bluetooth nhắc "không phản hồi qua Wi-Fi. Chạm…"',
    await p.evaluate(() => window.__bleChon) === chon0 && await ble() === b0
    && /không phản hồi qua Wi-Fi. Chạm để điều khiển qua Bluetooth/.test(await khoi.innerText()));
  ok('giá trị vừa bấm vẫn giữ, không báo lỗi', (await p.locator('.ctl-dial').innerText()) !== truocNghi
    && await p.locator('.devpage .form-message').count() === 0);
  await khoi.locator('button', { hasText: 'Điều khiển gần qua Bluetooth' }).click(); await cho(600);
  ok('chạm lời nhắc → hộp chọn mở một lần, nối được', await p.evaluate(() => window.__bleChon) === chon0 + 1 && await chip('ble').count() === 1);
  b0 = await ble();
  await cong.click(); await cho(600);
  ok('bấm tiếp → đi Bluetooth ngay, không mở lại hộp chọn', await p.evaluate(() => window.__bleChon) === chon0 + 1 && await ble() === b0 + 1);

  /* ---------- CHẮC mất Wi-Fi (máy chủ báo ngoại tuyến), tải lại trang: một cú bấm là mở hộp chọn ---------- */
  await fetch(`${GOC_GIA}/v1/__truc_tuyen?id=${QUAT}&bat=0`);
  await vao(); await cho(800);
  const chon2 = await p.evaluate(() => window.__bleChon);
  b0 = await ble();
  await tru.click();
  await p.waitForFunction(n => window.__bleLenh.length > n, b0, { timeout: 4000 }).catch(() => undefined);
  ok('máy chủ báo ngoại tuyến → bấm nút là mở hộp chọn ngay, lệnh đi Bluetooth',
    await p.evaluate(() => window.__bleChon) === chon2 + 1 && await ble() === b0 + 1);
  await fetch(`${GOC_GIA}/v1/__truc_tuyen?id=${QUAT}&bat=1`);

  /* ---------- nhịp tim: mạch gửi "hb" đều rồi im (mất Wi-Fi) → ~20 s sau app CHẮC mất Wi-Fi ---------- */
  await lamNgo(false);
  let hb = 1; let dap = true;
  const nhip = setInterval(() => { if (dap) void fetch(`${GOC_GIA}/v1/__doi?id=${QUAT}&key=hb&value=${hb++}`); }, 2000);
  try {
    await vao(); await cho(5000);
    ok('mạch đang có nhịp tim → icon Wi-Fi', await chip('wifi').count() === 1 && await chip('mat').count() === 0);
    dap = false;   // mạch mất Wi-Fi: thôi gửi nhịp tim; máy chủ vẫn báo trực tuyến
    const t1 = Date.now();
    await p.waitForFunction(() => /Mất Wi-Fi/.test(document.querySelector('.devpage .dev-st')?.textContent ?? ''), null, { timeout: 35000, polling: 500 }).catch(() => undefined);
    const sau = Math.round((Date.now() - t1) / 1000);
    ok(`mất nhịp tim → icon "Mất Wi-Fi" sau ${sau} s, không cần bấm gì`, /Mất Wi-Fi/.test(await chip('mat').innerText().catch(() => '')) && sau <= 30);
    const chon3 = await p.evaluate(() => window.__bleChon);
    b0 = await ble();
    await cong.click();
    await p.waitForFunction(n => window.__bleLenh.length > n, b0, { timeout: 4000 }).catch(() => undefined);
    ok('bấm nút → mở hộp chọn ngay (chắc mất Wi-Fi), lệnh đi Bluetooth',
      await p.evaluate(() => window.__bleChon) === chon3 + 1 && await ble() === b0 + 1);
  } finally { clearInterval(nhip); }

  /* ---------- tắt router: máy tính CŨNG mất mạng → bấm nút là mở hộp chọn, lệnh đi Bluetooth ---------- */
  await lamNgo(false);
  await vao(); await cho(800);
  await ctx.setOffline(true);
  await cho(300);
  ok('máy tính mất mạng → icon không còn Wi-Fi', await chip('wifi').count() === 0);
  const chon4 = await p.evaluate(() => window.__bleChon);
  b0 = await ble();
  await tru.click();
  await p.waitForFunction(n => window.__bleLenh.length > n, b0, { timeout: 4000 }).catch(() => undefined);
  ok('máy tính mất mạng → bấm nút là mở hộp chọn, lệnh đi Bluetooth',
    await p.evaluate(() => window.__bleChon) === chon4 + 1 && await ble() === b0 + 1);
  await ctx.setOffline(false);
  await cho(500);

  /* ---------- chưa ghép (chưa nhớ mã tem): khối Bluetooth nhắc ghép, nút không bị lật về ---------- */
  await datTocDo(5);
  await lamNgo(true);
  await p.evaluate(id => localStorage.removeItem(`livotec-ble-ma:${id}`), QUAT);
  await vao();
  const chon1 = await p.evaluate(() => window.__bleChon);
  const truocBam = await p.locator('.ctl-dial').innerText();
  await cong.click(); await cho(4200);
  ok('chưa ghép: khối Bluetooth nhắc "Chạm để điều khiển qua Bluetooth", icon "Mất Wi-Fi", không mở hộp chọn',
    /Chạm để điều khiển qua Bluetooth/.test(await khoi.innerText()) && /Mất Wi-Fi/.test(await chip('mat').innerText().catch(() => ''))
    && await p.evaluate(() => window.__bleChon) === chon1);
  ok('chưa ghép: giá trị vừa bấm vẫn giữ, không báo lỗi', (await p.locator('.ctl-dial').innerText()) !== truocBam
    && await p.locator('.devpage .form-message').count() === 0);
  ok(`không lỗi JS (${loi.join(' | ')})`, loi.length === 0);
  await ctx.close();
} finally {
  await lamNgo(false).catch(() => undefined);
  await b.close();
}

console.log(R.join('\n'));
console.log(`\n${R.filter(x => x.startsWith('PASS')).length}/${R.length} PASS`);
if (R.some(x => x.startsWith('FAIL'))) process.exit(1);
