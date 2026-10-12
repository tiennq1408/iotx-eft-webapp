// B7 — Cao điểm hỗn hợp: giữ NỀN, rồi bơm cao điểm DINH req/s trong 60 giây, ba lần,
// cách nhau 5 phút. Đo: hệ có phục hồi sau mỗi lần bơm không, độ trễ về mức nền sau bao lâu
// (ngưỡng đề xuất ≤ 2 phút — đọc ở bảng cửa sổ trượt của tong_hop.py).
//
// Dòng thời gian mặc định (giây):
//   0 ──── nền ────────────────────────────────────────────────────────────── 1380
//          300 bơm 1 (60 s)   660 bơm 2 (60 s)   1020 bơm 3 (60 s)   1080..1380 quan sát hồi phục
//
// Nền ở đây là req/s. Tài liệu muốn nền = "bậc cao nhất B6 còn đạt" (tính bằng PHIÊN) —
// đổi sang req/s theo mục 1.2 (≈ số phiên × 0,1–0,4), hoặc đặt NEN_RPS=0 và để
// `chay.sh b7` chạy do_phien.py làm nền bằng phiên thật song song (đo được cả "mất phiên nền").
//
// Chạy (CHƯA chạy thật lần nào — máy viết script không có k6):
//   export IOTX_BASE=http://127.0.0.1:4020/v1 IOTX_EMAIL=... IOTX_PASSWORD=...
//   NEN_RPS=1000 DINH=15000 k6 run --out json=loadtest/ketqua/b7.json.gz loadtest/k6/b7_cao_diem.js
//   python3 loadtest/tong_hop.py loadtest/ketqua/b7.json.gz --buoc 10
//
// Biến riêng: NEN_RPS (mặc định 1000; 0 = không có nền k6), DINH (mặc định 15000),
//   KHOI_DONG (giây nền trước lần bơm đầu, mặc định 300), CACH (giây giữa hai lần bơm,
//   mặc định 300), SO_LAN (mặc định 3), BOM (giây mỗi lần bơm, mặc định 60),
//   QUAN_SAT (giây quan sát sau lần bơm cuối, mặc định 300), VU_MOI_REQ (mặc định 0.5).

import { dungPool, motLoiGoi, docTron, nguong, MAX_VU } from './chung.js';

const NEN_RPS = parseInt(__ENV.NEN_RPS || '1000', 10);
const DINH = parseInt(__ENV.DINH || '15000', 10);
const KHOI_DONG = parseInt(__ENV.KHOI_DONG || '300', 10);
const CACH = parseInt(__ENV.CACH || '300', 10);
const SO_LAN = parseInt(__ENV.SO_LAN || '3', 10);
const BOM = parseInt(__ENV.BOM || '60', 10);
const QUAN_SAT = parseInt(__ENV.QUAN_SAT || '300', 10);
const VU_MOI_REQ = parseFloat(__ENV.VU_MOI_REQ || '0.5');

const TONG = KHOI_DONG + SO_LAN * BOM + (SO_LAN - 1) * CACH + QUAN_SAT;
const scenarios = {};
let thresholds = nguong('');

if (NEN_RPS > 0) {
  scenarios.nen = {
    executor: 'constant-arrival-rate',
    rate: NEN_RPS, timeUnit: '1s', duration: `${TONG}s`,
    preAllocatedVUs: Math.min(MAX_VU, Math.max(50, Math.ceil(NEN_RPS * VU_MOI_REQ))),
    maxVUs: MAX_VU, tags: { bac: 'nen' }, exec: 'tron',
  };
  // Nền phải giữ SLA suốt bài, kể cả lúc đang bơm — đó là câu hỏi chính của B7.
  thresholds = Object.assign(thresholds, nguong('bac:nen'));
}
for (let i = 0; i < SO_LAN; i++) {
  scenarios[`bom_${i + 1}`] = {
    executor: 'constant-arrival-rate',
    rate: DINH, timeUnit: '1s', duration: `${BOM}s`,
    startTime: `${KHOI_DONG + i * (BOM + CACH)}s`,
    preAllocatedVUs: Math.min(MAX_VU, Math.max(50, Math.ceil(DINH * VU_MOI_REQ))),
    maxVUs: MAX_VU, gracefulStop: '10s', tags: { bac: `bom${i + 1}` }, exec: 'tron',
  };
}

export const options = {
  scenarios,
  // Không abort ở B7: muốn thấy hệ có hồi lại sau lần bơm hay không, kể cả khi lúc bơm trượt.
  thresholds: Object.fromEntries(Object.entries(thresholds).map(([k, v]) =>
    [k, v.map(x => (typeof x === 'string' ? x : { threshold: x.threshold }))])),
  setupTimeout: '15m',
  discardResponseBodies: true,
  summaryTrendStats: ['p(50)', 'p(95)', 'p(99)', 'max', 'count'],
  systemTags: ['status', 'error_code', 'scenario', 'name', 'method'],
};

const TRON = docTron();

export function setup() {
  return dungPool();
}

export function tron(data) {
  motLoiGoi(data, TRON);
}
