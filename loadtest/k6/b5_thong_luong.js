// B5 — Thông lượng API: tìm trần req/s. VÒNG MỞ, thang bậc, trộn lời gọi theo tỉ lệ thật.
//
// Mỗi bậc là một kịch bản `constant-arrival-rate` riêng, chạy nối tiếp nhau: k6 bắn đúng R
// lời gọi/giây theo đồng hồ, không đợi lời gọi trước về (không mắc coordinated omission).
// Bắn không kịp (hết VU) thì k6 ghi `dropped_iterations` — đó là MÁY PHÁT thiếu sức, không
// phải máy chủ; tong_hop.py đánh dấu bậc đó "KHÔNG DÙNG ĐƯỢC".
//
// Chạy (CHƯA chạy thật lần nào — máy viết script không có k6):
//   export IOTX_BASE=http://127.0.0.1:4020/v1 IOTX_EMAIL=... IOTX_PASSWORD=...
//   k6 run --out json=loadtest/ketqua/b5.json.gz loadtest/k6/b5_thong_luong.js
//   python3 loadtest/tong_hop.py loadtest/ketqua/b5.json.gz
//
// Biến riêng của bài này (xem thêm chung.js):
//   BAC     các bậc req/s, mặc định "500,1000,3000,6000,10000,15000,20000"
//   GIU     giây giữ mỗi bậc, mặc định 300 (tài liệu: ≥ 5 phút)
//   NGHI    giây nghỉ giữa hai bậc cho lời gọi cuối về hết, mặc định 15
//   VU_MOI_REQ  số VU dựng sẵn cho mỗi req/s (≈ độ trễ dự kiến tính bằng giây), mặc định 0.5
//
// Ngưỡng theo từng bậc (tag `bac`) có abortOnFail khi ABORT=1: bậc đầu tiên trượt SLA thì
// dừng thang — đúng nguyên tắc B0. Ngưỡng k6 tính trên cả bậc; p95 cửa sổ trượt 1 phút
// (B-SLA) lấy từ tong_hop.py.

import { dungPool, motLoiGoi, docTron, nguong, MAX_VU } from './chung.js';

const BAC = (__ENV.BAC || '500,1000,3000,6000,10000,15000,20000').split(',').map(x => parseInt(x, 10));
const GIU = parseInt(__ENV.GIU || '300', 10);
const NGHI = parseInt(__ENV.NGHI || '15', 10);
const VU_MOI_REQ = parseFloat(__ENV.VU_MOI_REQ || '0.5');

const scenarios = {};
let thresholds = nguong('');
BAC.forEach((rate, i) => {
  scenarios[`bac_${String(i + 1).padStart(2, '0')}_${rate}`] = {
    executor: 'constant-arrival-rate',
    rate,
    timeUnit: '1s',
    duration: `${GIU}s`,
    startTime: `${i * (GIU + NGHI)}s`,
    preAllocatedVUs: Math.min(MAX_VU, Math.max(50, Math.ceil(rate * VU_MOI_REQ))),
    maxVUs: MAX_VU,
    gracefulStop: `${NGHI}s`,
    tags: { bac: String(rate) },
    exec: 'tron',
  };
  thresholds = Object.assign(thresholds, nguong(`bac:${rate}`));
});

export const options = {
  scenarios,
  thresholds,
  setupTimeout: '15m',
  discardResponseBodies: true,      // đỡ RAM máy phát; lời gọi cần thân (login/refresh) tự xin lại
  summaryTrendStats: ['p(50)', 'p(95)', 'p(99)', 'max', 'count'],
  // Bớt tag hệ thống để tệp --out json nhỏ lại (ở 15.000 req/s mỗi giờ là hàng chục triệu dòng).
  systemTags: ['status', 'error_code', 'scenario', 'name', 'method'],
};

const TRON = docTron();

export function setup() {
  return dungPool();
}

export function tron(data) {
  motLoiGoi(data, TRON);
}
