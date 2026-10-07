import { GOC } from './chung.mjs';

/**
 * `next dev` chặn mọi origin lạ xin bó mã `/_next/*` và trả 403. Trang chủ vẫn dựng được
 * từ máy chủ nên người dùng THẤY màn "Đang khởi động Livotec Home…" rồi đứng ở đó mãi —
 * React không có JS để hydrate. Đó là lý do mở bằng IP LAN trên điện thoại hoặc qua tunnel
 * Cloudflare đều treo, trong khi mở bằng localhost thì chạy ngon.
 *
 * Bài này không cần trình duyệt: cứ xin đúng tệp JS đầu tiên của trang chủ với từng
 * `Origin` rồi xem mã trả về. Nó cũng canh luôn chiều ngược lại — origin lạ hoắc VẪN phải
 * bị chặn, đừng sửa lỗi này bằng cách mở toang cửa.
 */
const R = []; const ok = (t, c) => R.push(`${c ? 'PASS' : 'FAIL'}  ${t}`);

const trang = await (await fetch(GOC)).text();
const chunk = trang.match(/\/_next\/static\/chunks\/[^"']+?\.js/)?.[0];
if (!chunk) { console.error('Không tìm thấy tệp JS nào trong trang chủ — app hỏng nặng hơn bài này đo.'); process.exit(1); }

const ma = async origin => (await fetch(GOC + chunk, { headers: { Origin: origin } })).status;

const PHAI_QUA = [
  ['localhost', `${GOC}`],
  ['điện thoại cùng LAN 192.168.x.x', 'http://192.168.20.174:3001'],
  ['máy cùng LAN 10.x.x.x', 'http://10.0.0.42:3001'],
  ['tunnel Cloudflare', 'https://supporters-nails-tumor-promises.trycloudflare.com'],
  ['tunnel Cloudflare tên khác', 'https://mot-ten-hoan-toan-khac.trycloudflare.com'],
];
for (const [ten, o] of PHAI_QUA) {
  const m = await ma(o);
  ok(`${ten} tải được bó mã (${m})`, m === 200);
}

const PHAI_CHAN = [
  ['trang lạ bất kỳ', 'https://ke-gian.example.com'],
  ['tên miền nhái trycloudflare', 'https://trycloudflare.com.ke-gian.net'],
];
for (const [ten, o] of PHAI_CHAN) {
  const m = await ma(o);
  ok(`${ten} VẪN bị chặn (${m})`, m === 403);
}

console.log(R.join('\n'));
console.log(`${R.filter(r => r.startsWith('PASS')).length}/${R.length} đạt`);
