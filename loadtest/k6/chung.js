// Phần dùng chung cho b5_thong_luong.js và b7_cao_diem.js.
//
// Mọi thông tin nhạy cảm đọc từ BIẾN MÔI TRƯỜNG, không bao giờ ghi vào tệp:
//   IOTX_BASE      bắt buộc, vd. http://127.0.0.1:4020/v1 (IBS giả) — KHÔNG có mặc định, để
//                  không ai lỡ tay bắn vào DEV
//   IOTX_TENANT    mặc định livotec
//   IOTX_EMAIL / IOTX_PASSWORD
//   IOTX_LANG      mặc định vi
//   SO_VE          số phiên đăng nhập sẵn trong setup() (mặc định 200)
//   DANG_NHAP_SONG_SONG  số lượt đăng nhập cùng lúc khi dựng pool (mặc định 5)
//   TRON           tỉ lệ trộn, mặc định "bootstrap=85,rpc=8,products=3,refresh=3,khac=1"
//   RPC_DEVICE     id thiết bị nhận lệnh; bỏ trống = phần rpc dồn sang bootstrap
//   RPC_METHOD     mặc định setPower
//   HET_GIO        quá hạn chờ mỗi lời gọi, mặc định 10s
//   ABORT          =1 thì ngưỡng SLA có abortOnFail (dừng thang khi bậc đầu tiên trượt)
//   MAX_VU         trần VU mỗi kịch bản (mặc định 20000)
//
// Tag `loai` trên mọi lời gọi (bootstrap, rpc, products, refresh, notifications, rules,
// hen_gio, login, login_lai) — tong_hop.py đọc tag này từ `k6 run --out json=...`.

import http from 'k6/http';
import crypto from 'k6/crypto';
import exec from 'k6/execution';
import { Counter, Rate } from 'k6/metrics';

export const BASE = (__ENV.IOTX_BASE || '').replace(/\/+$/, '');
export const TENANT = __ENV.IOTX_TENANT || 'livotec';
export const LANG = __ENV.IOTX_LANG || 'vi';
export const HET_GIO = __ENV.HET_GIO || '10s';
export const ABORT = __ENV.ABORT === '1';
export const MAX_VU = parseInt(__ENV.MAX_VU || '20000', 10);
const RPC_DEVICE = __ENV.RPC_DEVICE || '';
const RPC_METHOD = __ENV.RPC_METHOD || 'setPower';

if (!BASE) {
  throw new Error('Thiếu IOTX_BASE. Đặt rõ ràng, vd. IOTX_BASE=http://127.0.0.1:4020/v1 cho IBS giả.');
}

// Bộ đếm riêng — B5 yêu cầu tách 429 khỏi 4xx khác, và tỉ lệ theo GIAO DỊCH.
export const so429 = new Counter('so_429');
export const so4xx = new Counter('so_4xx_khac');
export const tiLe5xx = new Rate('ti_le_5xx');
export const thanhCong = new Rate('thanh_cong');
export const quaHan = new Counter('qua_han_cho');
export const khongToi = new Counter('khong_toi_duoc');

// 304 là thành công: app gửi If-None-Match và dùng lại bản đang giữ.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 304));

export function docTron() {
  const chuoi = __ENV.TRON || 'bootstrap=85,rpc=8,products=3,refresh=3,khac=1';
  const d = {};
  for (const manh of chuoi.split(',')) {
    const [k, v] = manh.split('=');
    d[k.trim()] = parseFloat(v);
  }
  if (!RPC_DEVICE && d.rpc) {
    // Không có thiết bị chỉ định thì KHÔNG tự bắn lệnh vào thiết bị nào.
    d.bootstrap = (d.bootstrap || 0) + d.rpc;
    delete d.rpc;
  }
  const tong = Object.values(d).reduce((a, b) => a + b, 0);
  let cong = 0;
  return Object.entries(d).map(([k, v]) => { cong += v / tong; return [k, cong]; });
}

function uuid4() {
  const b = new Uint8Array(crypto.randomBytes(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function ghiKetQua(res) {
  const ma = res.status;
  const ok = (ma >= 200 && ma < 300) || ma === 304;
  thanhCong.add(ok);
  tiLe5xx.add(ma >= 500);
  if (ma === 429) so429.add(1);
  else if (ma >= 400 && ma < 500) so4xx.add(1);
  else if (ma === 0 && res.error_code === 1050) quaHan.add(1);
  else if (ma === 0) khongToi.add(1);
  return ok;
}

function dangNhap(loai) {
  const res = http.post(`${BASE}/auth/login`,
    JSON.stringify({ tenant: TENANT, email: __ENV.IOTX_EMAIL, password: __ENV.IOTX_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { loai, name: loai }, timeout: HET_GIO,
      responseType: 'text' });
  ghiKetQua(res);
  if (res.status < 200 || res.status >= 300) return null;
  const d = res.json();
  return { a: d.accessToken, r: d.refreshToken, song: d.expiresIn || 300 };
}

// setup(): dựng pool vé. Đăng nhập theo lô nhỏ — đừng tự tạo bão đăng nhập trước khi đo.
export function dungPool() {
  if (!__ENV.IOTX_EMAIL || !__ENV.IOTX_PASSWORD) throw new Error('Thiếu IOTX_EMAIL / IOTX_PASSWORD.');
  const soVe = parseInt(__ENV.SO_VE || '200', 10);
  const songSong = parseInt(__ENV.DANG_NHAP_SONG_SONG || '5', 10);
  const ve = [];
  for (let i = 0; i < soVe; i += songSong) {
    const lo = [];
    for (let j = i; j < Math.min(soVe, i + songSong); j++) {
      lo.push(['POST', `${BASE}/auth/login`,
        JSON.stringify({ tenant: TENANT, email: __ENV.IOTX_EMAIL, password: __ENV.IOTX_PASSWORD }),
        { headers: { 'Content-Type': 'application/json' }, tags: { loai: 'login', name: 'login' },
          timeout: HET_GIO, responseType: 'text' }]);
    }
    for (const res of http.batch(lo)) {
      ghiKetQua(res);
      if (res.status >= 200 && res.status < 300) {
        const d = res.json();
        ve.push({ a: d.accessToken, r: d.refreshToken, song: d.expiresIn || 300 });
      }
    }
  }
  if (!ve.length) throw new Error('Không đăng nhập được vé nào — dừng.');
  console.log(`Pool có ${ve.length}/${soVe} vé.`);
  return { ve, batDau: Date.now() };
}

// Vé của VU này: mỗi VU giữ BẢN SAO riêng của một ô trong pool (VU không ghi được vào dữ
// liệu setup dùng chung). Nếu IBS xoay vòng refresh token, các VU chung một ô sẽ làm hỏng
// vé của nhau → tự đăng nhập lại (tag login_lai). Thấy nhiều login_lai thì tăng SO_VE.
let veCuaVu = null;
let hetHan = 0;
let etag = null;

function layVe(data) {
  if (!veCuaVu) {
    const o = data.ve[(exec.vu.idInTest - 1) % data.ve.length];
    veCuaVu = { a: o.a, r: o.r, song: o.song };
    hetHan = data.batDau + o.song * 1000;
  }
  if (Date.now() > hetHan - 15000) lamMoi('refresh');
  return veCuaVu;
}

function lamMoi(loai) {
  const res = http.post(`${BASE}/auth/refresh`, JSON.stringify({ refreshToken: veCuaVu.r }),
    { headers: { 'Content-Type': 'application/json' }, tags: { loai, name: loai }, timeout: HET_GIO,
      responseType: 'text' });
  ghiKetQua(res);
  if (res.status >= 200 && res.status < 300) {
    const d = res.json();
    veCuaVu = { a: d.accessToken, r: d.refreshToken || veCuaVu.r, song: d.expiresIn || 300 };
    hetHan = Date.now() + veCuaVu.song * 1000;
    return;
  }
  const moi = dangNhap('login_lai');
  if (moi) { veCuaVu = moi; hetHan = Date.now() + moi.song * 1000; }
}

// Một lời gọi theo tỉ lệ trộn. Chỉ ĐỌC ở nhóm "khac" — không tạo/xoá gì trên máy chủ dùng chung.
export function motLoiGoi(data, tron) {
  const x = Math.random();
  const loai = (tron.find(([, c]) => x <= c) || tron[tron.length - 1])[0];
  const ve = layVe(data);
  const h = { Authorization: `Bearer ${ve.a}` };
  let res;
  if (loai === 'bootstrap') {
    if (etag) h['If-None-Match'] = etag;
    res = http.get(`${BASE}/bootstrap?lang=${LANG}`,
      { headers: h, tags: { loai, name: 'bootstrap' }, timeout: HET_GIO });
    if (res.status >= 200 && res.status < 300 && res.headers.Etag) etag = res.headers.Etag;
  } else if (loai === 'rpc') {
    h['Content-Type'] = 'application/json';
    h['Idempotency-Key'] = uuid4();                     // mỗi lệnh một khoá riêng — bắt buộc
    res = http.post(`${BASE}/devices/${RPC_DEVICE}/rpc`,
      JSON.stringify({ method: RPC_METHOD, params: { on: Math.random() < 0.5 } }),
      { headers: h, tags: { loai, name: 'rpc' }, timeout: HET_GIO });
  } else if (loai === 'products') {
    res = http.get(`${BASE}/products?lang=${LANG}&tenant=${TENANT}`,
      { tags: { loai, name: 'products' }, timeout: HET_GIO });
  } else if (loai === 'refresh') {
    lamMoi('refresh');
    return;
  } else {
    const cua = [['/notifications', 'notifications'], ['/rules', 'rules']];
    if (RPC_DEVICE) cua.push([`/devices/${RPC_DEVICE}/hen-gio`, 'hen_gio']);
    const [duong, ten] = cua[Math.floor(Math.random() * cua.length)];
    res = http.get(`${BASE}${duong}`, { headers: h, tags: { loai: ten, name: ten }, timeout: HET_GIO });
  }
  ghiKetQua(res);
  if (res.status === 401) lamMoi('refresh');
}

// Ngưỡng B-SLA (ĐỀ XUẤT, chưa duyệt). Ngưỡng của k6 tính trên CẢ khoảng của tag, không phải
// cửa sổ trượt 1 phút — bảng cửa sổ trượt lấy từ tong_hop.py trên tệp --out json.
export function nguong(boLoc) {
  const t = (s) => ({ threshold: s, abortOnFail: ABORT, delayAbortEval: '1m' });
  const loc = boLoc ? `,${boLoc}` : '';
  const kq = {};
  kq[`http_req_duration{loai:bootstrap${loc}}`] = [t('p(95)<1000')];
  // login chỉ có ở setup() (và login_lai) — không mang tag bậc, nên chỉ xét chung cả bài.
  if (!boLoc) kq['http_req_duration{loai:login}'] = [{ threshold: 'p(95)<2000' }];
  if (RPC_DEVICE) kq[`http_req_duration{loai:rpc${loc}}`] = [t('p(95)<1500')];
  kq[boLoc ? `thanh_cong{${boLoc}}` : 'thanh_cong'] = [t('rate>=0.999')];
  kq[boLoc ? `ti_le_5xx{${boLoc}}` : 'ti_le_5xx'] = [t('rate<=0.001')];
  return kq;
}
