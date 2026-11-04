import fs from 'node:fs';
import ts from 'typescript';

/**
 * Tầng hỏi–đáp BLE (lib/iotx/bleKenh.ts) — không cần app, không cần mạch.
 * Tệp đó cố ý không import gì, nên dịch thẳng bằng TypeScript rồi nạp như một module.
 *
 * Kiểm: ghép cặp theo `id` (trả lời về lệch thứ tự), quá 5 giây thì từ chối, `ok:false` thành
 * lỗi, ghép mảnh `op:"state"` (ac_1 về 2 mảnh), thiếu mảnh thì bỏ cả khối, đứt kết nối thì mọi
 * lời hứa hỏng ngay, và đọc mã bí mật trên tem.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);
const goc = fs.readFileSync(new URL('../lib/iotx/bleKenh.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(goc, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { KenhBle, LoiKenh, HOI_DAP_MS, docBiMatTem } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const cho = ms => new Promise(r => setTimeout(r, ms));

const daGui = [];
const kenh = new KenhBle(async thu => { daGui.push(thu); });

/* ghép cặp theo id, trả lời về lệch thứ tự */
const a = kenh.hoi({ op: 'rpc', method: 'setSpeed', params: { speed: 5 }, khoa: 'k1' });
const b = kenh.hoi({ op: 'rpc', method: 'setPower', params: { power: 'on' }, khoa: 'k2' });
await cho(5);
ok(`mỗi yêu cầu một id tăng dần (${daGui.map(x => x.id).join(',')}), khoá nằm trong thân`, daGui[0].id === 1 && daGui[1].id === 2 && daGui[0].khoa === 'k1');
kenh.nhan(JSON.stringify({ id: 2, ok: true, seq: 11, v: { power: 'on' } }));
kenh.nhan(JSON.stringify({ id: 1, ok: true, seq: 12, v: { speed: 5 } }));
const [ra, rb] = await Promise.all([a, b]);
ok('trả lời về lệch thứ tự vẫn giải đúng lời hứa', ra.v.speed === 5 && rb.v.power === 'on');

/* ok:false → lỗi */
const c = kenh.hoi({ op: 'rpc', method: 'x', params: {} });
await cho(5);
kenh.nhan(JSON.stringify({ id: 3, ok: false, loi: 'unauthorized' }));
const lc = await c.catch(e => e);
ok(`ok:false → LoiKenh tu_choi (${lc.chiTiet})`, lc instanceof LoiKenh && lc.ma === 'tu_choi' && lc.chiTiet === 'unauthorized');

/* quá giờ */
const d = await kenh.hoi({ op: 'rpc' }, 80).catch(e => e);
ok(`không trả lời → từ chối sau hạn (mặc định ${HOI_DAP_MS} ms)`, d instanceof LoiKenh && d.ma === 'het_gio' && HOI_DAP_MS === 5000);
let nem = null;
try { kenh.nhan(JSON.stringify({ id: 4, ok: true })); kenh.nhan('{hỏng'); } catch (x) { nem = x; }
ok('trả lời về muộn sau khi đã quá giờ, và gói JSON hỏng: bỏ qua, không ném', nem === null);

/* ghép mảnh: ac_1 ~700 byte, 2 mảnh */
const day = JSON.stringify({ v: { ac_power_status: 'on', ac_temp_setting: 24, ac_ope_mode: 'Cool', ghiChu: 'x'.repeat(600) } });
const e = kenh.hoi({ op: 'state', offset: 0 }, 200);
await cho(5);
const id = daGui.at(-1).id;
kenh.nhan(JSON.stringify({ id, ok: true, manh: 0, cuoi: false, payload: day.slice(0, 400) }));
await cho(120);   // giữa hai mảnh lâu hơn nửa hạn: hạn tính lại từ mảnh gần nhất
kenh.nhan(JSON.stringify({ id, ok: true, manh: 1, cuoi: true, payload: day.slice(400) }));
const re = await e.catch(x => x);
ok(`2 mảnh ghép lại ra JSON hợp lệ (${day.length} byte)`, re?.v?.ac_temp_setting === 24 && re.v.ghiChu.length === 600);

const f = kenh.hoi({ op: 'state', offset: 0 }, 100);
await cho(5);
kenh.nhan(JSON.stringify({ id: daGui.at(-1).id, ok: true, manh: 0, cuoi: false, payload: day.slice(0, 400) }));
const rf = await f.catch(x => x);
ok('thiếu mảnh quá hạn → bỏ cả khối (thieu_manh)', rf instanceof LoiKenh && rf.ma === 'thieu_manh');

const g = kenh.hoi({ op: 'state', offset: 0 }, 200);
await cho(5);
kenh.nhan(JSON.stringify({ id: daGui.at(-1).id, ok: true, manh: 1, cuoi: true, payload: day.slice(400) }));
const rg = await g.catch(x => x);
ok('mảnh cuối về mà thiếu mảnh đầu → thieu_manh, không parse rác', rg instanceof LoiKenh && rg.ma === 'thieu_manh');

/* đứt kết nối */
const h = kenh.hoi({ op: 'rpc' });
const nonce = kenh.choThu(t => t.op === 'nonce', 10000);
await cho(5);
const t0 = Date.now();
kenh.dut();
const [rh, rn] = await Promise.all([h.catch(x => x), nonce.catch(x => x)]);
ok(`đứt kết nối → lệnh đang treo và lượt chờ bắt tay hỏng NGAY (${Date.now() - t0} ms)`, rh.ma === 'ngat' && rn.ma === 'ngat' && Date.now() - t0 < 50);

/* thư không có id */
const n2 = kenh.choThu(t => t.op === 'nonce', 1000);
kenh.nhan(JSON.stringify({ op: 'nonce', giaTri: 'AAAAAAAAAAAAAAAAAAAAAA==' }));
ok('nonce (không có id) đến đúng người chờ', (await n2).giaTri === 'AAAAAAAAAAAAAAAAAAAAAA==');

/* mã trên tem */
const hex = '00112233445566778899aabbccddeeff';
const b64 = Buffer.from(hex, 'hex').toString('base64');
ok('mã tem: hex 32 ký tự', docBiMatTem(hex)?.length === 16);
ok('mã tem: base64 16 byte', Buffer.from(docBiMatTem(b64)).toString('hex') === hex);
ok('mã tem: base64url không đệm', Buffer.from(docBiMatTem(b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'))).toString('hex') === hex);
ok('mã tem: JSON {serial, biMat}', docBiMatTem(JSON.stringify({ serial: 'LV-1', biMat: hex }))?.length === 16);
ok('mã tem: chuỗi rác / sai độ dài → null', docBiMatTem('xin chào') === null && docBiMatTem('0011') === null);

console.log(R.join('\n'));
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
