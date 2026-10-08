/**
 * Bộ chạy kiểm thử: tự dựng máy chủ cần thiết, chạy các bài, rồi dọn sạch.
 *
 *   node tests/chay.mjs            — chạy tất cả
 *   node tests/chay.mjs giao-dien  — chỉ nhóm giao diện
 *   node tests/chay.mjs api        — chỉ nhóm nối API
 *
 * Hai nhóm cần hai cấu hình khác nhau, và `NEXT_PUBLIC_*` được nhúng lúc biên dịch nên
 * không đổi được khi máy chủ đã chạy — vì vậy mỗi nhóm khởi động lại `next dev` một lần.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

import { CONG_APP, GOC, GOC_GIA, THU_MUC } from './chung.mjs';

const GOC_DA = path.resolve(THU_MUC, '..');
const conCai = [];

function chay(lenh, dsThamSo, moiTruong) {
  const c = spawn(lenh, dsThamSo, { cwd: GOC_DA, env: { ...process.env, ...moiTruong }, stdio: 'ignore', detached: true });
  conCai.push(c);
  return c;
}

const cho = ms => new Promise(r => setTimeout(r, ms));

/**
 * Cổng đang có người khác giữ là cái bẫy tệ nhất: bộ chạy tưởng máy chủ của mình đã lên,
 * rồi kiểm thử chạy trên một app cấu hình khác hẳn và hỏng với thông báo vô nghĩa.
 */
async function congTrong(dia, ten) {
  try { await fetch(dia); } catch { return; }
  throw new Error(`${ten} (${dia}) đã có tiến trình khác giữ — dừng nó rồi chạy lại, hoặc đổi cổng bằng CONG_APP/CONG_GIA.`);
}

async function doiSong(dia, giay = 60) {
  for (let i = 0; i < giay * 2; i++) {
    try { const r = await fetch(dia); if (r.status) return true; } catch { /* chưa lên */ }
    await cho(500);
  }
  return false;
}

function bai(ten) {
  return new Promise(giaiQuyet => {
    const c = spawn(process.execPath, [path.join(THU_MUC, ten)], { cwd: GOC_DA, stdio: ['ignore', 'pipe', 'pipe'] });
    let ra = '';
    c.stdout.on('data', d => { ra += d; process.stdout.write(d); });
    c.stderr.on('data', d => { ra += d; });   // in ra ở cuối nếu bài hỏng
    c.on('close', ma => {
      // Bài chết giữa chừng thì stderr mới là thứ nói được lý do — đừng nuốt nó.
      if (ma !== 0) process.stderr.write(`\n--- ${ten} thoát với mã ${ma} ---\n${ra.slice(-2000)}\n`);
      giaiQuyet({ ten, ma, ra });
    });
  });
}

function dungHet() {
  for (const c of conCai) { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* đã chết */ } }
}

const NHOM = {
  'giao-dien': { moiTruong: { NEXT_PUBLIC_IOTX_MODE: 'mock' }, canMayGia: false, bai: ['e2e.mjs', 'a11y.mjs', 'vat-tu.mjs', 'thanh-loc.mjs', 'khoa-chu.mjs', 'khung.mjs', 'goc-ngoai.mjs', 'dang-nhap.mjs'] },
  'api':       { moiTruong: { IOTX_API_UPSTREAM: GOC_GIA },    canMayGia: true,  bai: ['rpc.mjs', 'dong-bo.mjs', 'anh-dai-dien.mjs', 'bo-cuc.mjs', 'nhip-hoi.mjs', 'hen-gio.mjs', 'catalog-song.mjs', 'phien.mjs', 'bao-ve.mjs', 'sua-loi.mjs', 'quyet-dinh.mjs', 'dau-man.mjs', 'them-thiet-bi.mjs', 'quet-ma.mjs', 'dang-nhap-api.mjs'] },
};

const muon = process.argv[2] ? [process.argv[2]] : Object.keys(NHOM);
const ketQua = [];

try {
  for (const ten of muon) {
    const n = NHOM[ten];
    if (!n) { console.error(`Không có nhóm "${ten}". Có: ${Object.keys(NHOM).join(', ')}`); process.exit(2); }
    console.log(`\n======== nhóm ${ten} ========`);

    if (n.canMayGia) {
      await congTrong(`${GOC_GIA}/v1/products`, 'cổng máy chủ giả');
      chay(process.execPath, [path.join(THU_MUC, 'may-chu-gia.mjs')], {});
      if (!await doiSong(`${GOC_GIA}/v1/products`, 20)) throw new Error('máy chủ giả không lên');
    }
    await congTrong(GOC, 'cổng app');
    chay('node', ['node_modules/next/dist/bin/next', 'dev', '-p', String(CONG_APP)], n.moiTruong);
    if (!await doiSong(GOC, 90)) throw new Error('next dev không lên');
    await cho(1500);

    for (const b of n.bai) ketQua.push(await bai(b));
    dungHet();
    conCai.length = 0;
    await cho(1500);
  }
} finally {
  dungHet();
}

console.log('\n======== tổng kết ========');
let hong = 0;
for (const k of ketQua) {
  const m = k.ra.match(/(\d+)\/(\d+)\s*(?:kịch bản\s*)?đạt/);
  const con = (k.ra.match(/FAIL/g) || []).length;
  const xau = k.ma !== 0 || con > 0 || /CẦN SỬA|LỌT/.test(k.ra);
  if (xau) hong++;
  console.log(`${xau ? '✗' : '✓'} ${k.ten.padEnd(14)} ${m ? m[0] : (xau ? 'có lỗi' : 'đạt')}`);
}
console.log(hong === 0 ? '\nTẤT CẢ ĐẠT' : `\n${hong} bài có vấn đề`);
process.exit(hong === 0 ? 0 : 1);
