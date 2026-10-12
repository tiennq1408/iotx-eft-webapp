/**
 * Gộp kết quả các nhóm A1–A10 thành `tests/kich-ban/KET-QUA.md` — đúng khung "Bảng ghi kết
 * quả" của `kich-ban-test.md`, nhưng chi tiết tới từng mã ca. Mã nào có trong tài liệu mà
 * chưa có kết quả thì ghi "Chưa chạy" — để không ca nào lặng lẽ rơi mất.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TAM } from '../chung.mjs';
import { TT } from './chung.mjs';

const THU_MUC = path.dirname(fileURLToPath(import.meta.url));

/** Danh mục ca theo tài liệu (bản 3, 09/10/2026): mã → việc kiểm. */
const DANH_MUC = {
  'A1 — Đăng nhập và phiên': {
    'A1-01': 'Đăng nhập đúng', 'A1-02': 'Đăng nhập sai mật khẩu', 'A1-03': 'Đứng yên 6 phút rồi bấm thiết bị', 'A1-04': 'Mở app khi vé đã hết hạn',
    'A1-05': 'Xoá refresh token rồi thao tác', 'A1-06': 'Đăng xuất', 'A1-07': 'Đổi ngôn ngữ trên màn đăng nhập', 'A1-08': 'Nút con mắt ở ô mật khẩu',
    'A1-09': 'Bỏ trống từng ô', 'A1-10': 'Quên mật khẩu → Gửi mã', 'A1-11': 'Tiếp tục với Google', 'A1-12': 'Gõ số điện thoại vào ô Tài khoản',
    'A1-13': 'Đăng ký: mật khẩu 7 ký tự', 'A1-14': 'Đăng ký: hai mật khẩu khác nhau',
  },
  'A2 — Danh sách thiết bị': {
    'A2-01': 'Thẻ có tên, trạng thái, online/offline', 'A2-02': 'Trạng thái dựng theo capability', 'A2-03': 'Chưa có giá trị → "—"',
    'A2-04': 'Tên dài ở 360 px', 'A2-05': 'Nút xoá/ẩn', 'A2-06': 'Ẩn rồi đăng nhập lại', 'A2-07': 'Kéo làm mới',
  },
  'A3 — Điều khiển thiết bị': {
    'A3-01': 'Bật/tắt', 'A3-02': 'Thanh mức chỉ gửi khi thả tay', 'A3-03': 'Chọn chế độ', 'A3-04': 'Cảm biến chỉ đọc', 'A3-05': 'Bấm đúp nhanh',
    'A3-06': 'Điều khiển máy offline', 'A3-07': 'Cánh quạt xoay', 'A3-08': 'Không hiện khoá kỹ thuật', 'A3-09': 'Lưới ui.boCuc 4 cột', 'A3-10': 'Đổi tên / ghim / gán chỗ',
  },
  'A4 — Cập nhật thời gian thực': {
    'A4-01': 'Hai trình duyệt', 'A4-02': 'Nhịp 2,5 s / 10 s', 'A4-03': 'Mất Wi-Fi 60 s', 'A4-04': 'Tab chạy nền', 'A4-05': 'Vé hết hạn giữa lúc hỏi vòng', 'A4-06': 'Nút vừa bấm không bị lật',
  },
  'A5 — Chia sẻ': {
    'A5-01': 'Chưa có nhà', 'A5-02': 'Mời ở phạm vi nhà', 'A5-03': 'Phạm vi phòng / thiết bị', 'A5-04': 'Đổi quyền', 'A5-05': 'Thu hồi', 'A5-06': 'Mời email không tồn tại', 'A5-07': 'Máy được chia sẻ',
  },
  'A6 — Luật, hẹn giờ, thông báo': {
    'A6-01': 'Luật mới mặc định shadow', 'A6-02': 'Mô phỏng luật', 'A6-03': 'Luật thật kích điều kiện', 'A6-04': 'Hẹn giờ trên máy sở hữu',
    'A6-05': 'Sửa motlan đang chạy → 409', 'A6-06': 'Đủ hạn mức luật', 'A6-07': 'Thông báo',
  },
  'A7 — Thêm thiết bị': {
    'A7-01': 'Mã ① bằng camera iPhone', 'A7-02': 'Mã ① bằng Android', 'A7-03': 'Mã ① bằng Zalo', 'A7-04': 'Portal tự bật', 'A7-05': 'Danh sách Wi-Fi',
    'A7-06': 'Sai mật khẩu Wi-Fi', 'A7-07': 'Mật khẩu Wi-Fi < 8', 'A7-08': 'Mật khẩu Wi-Fi đúng', 'A7-09': 'Tự quay về Wi-Fi nhà', 'A7-10': 'Mạng ẩn', 'A7-11': 'Mạng không mật khẩu',
    'A7-12': 'Tem QR: POST /claim', 'A7-13': 'Mạch thật: /claim-mach-that', 'A7-14': 'Deep-link khi đã đăng nhập', 'A7-15': 'Deep-link khi chưa đăng nhập',
    'A7-16': 'Mã claim không lọt request', 'A7-17': 'Nhận hợp lệ', 'A7-18': 'Mã sai / đã có chủ', 'A7-19': 'Sai quá 10 lần', 'A7-20': 'Nhận lại máy vừa nhận',
    'A7-21': 'Serial sai', 'A7-22': 'dangNoi: false',
  },
  'A8 — Giao diện chung': {
    'A8-01': '360 / 375 / 430 px', 'A8-02': 'Vùng bấm ≥ 44 px', 'A8-03': 'Mạng chậm', 'A8-04': 'Lỗi máy chủ', 'A8-05': 'Nền tối',
  },
  'A9 — Bảo mật và hợp đồng': {
    'A9-01': 'Chỉ gọi /v1/*', 'A9-02': 'URL và lịch sử', 'A9-03': 'Mã nguồn và bản build', 'A9-04': 'Sửa id thiết bị', 'A9-05': 'Console', 'A9-06': 'Lách proxy bằng ..',
  },
  'A10 — Popup tài khoản': {
    'A10-01': 'Bấm avatar', 'A10-02': 'Đổi tên', 'A10-03': 'Đổi ảnh đại diện', 'A10-04': 'Đổi mật khẩu', 'A10-05': 'Ngôn ngữ / Cỡ chữ / Giao diện',
    'A10-06': 'Công tắc Thông báo', 'A10-07': 'Đăng xuất xoá dữ liệu tài khoản',
  },
};

const ketQua = {};
const thuMucKq = path.join(TAM, 'kich-ban');
if (fs.existsSync(thuMucKq)) {
  for (const f of fs.readdirSync(thuMucKq).filter(x => x.endsWith('.json'))) {
    for (const x of JSON.parse(fs.readFileSync(path.join(thuMucKq, f), 'utf8'))) (ketQua[x.ma] ||= []).push(x);
  }
}

/** Một mã có thể ghi nhiều lần (nhiều phép con): có lần nào Hỏng thì cả mã Hỏng. */
function gop(ma) {
  const ds = ketQua[ma];
  if (!ds?.length) return { tt: null, ghiChu: '' };
  const hong = ds.find(x => x.tt === 'HONG');
  return { tt: hong ? 'HONG' : ds[0].tt, ghiChu: ds.map(x => x.ghiChu).filter(Boolean).join(' · ') };
}

const NHAN = { ...TT, null: 'Chưa chạy' };
const dem = Object.fromEntries([...Object.keys(TT), 'null'].map(k => [k, 0]));
const khoiBang = [];
const hongDs = [];
const tayDs = [];
for (const [nhom, cac] of Object.entries(DANH_MUC)) {
  const dong = Object.entries(cac).map(([ma, viec]) => {
    const { tt, ghiChu } = gop(ma);
    dem[tt ?? 'null']++;
    if (tt === 'HONG') hongDs.push(`- **${ma} — ${viec}:** ${ghiChu}`);
    if (tt === 'TAY') tayDs.push(`- [ ] **${ma} — ${viec}:** ${ghiChu}`);
    return `| ${ma} | ${viec} | ${NHAN[tt ?? 'null']} | ${ghiChu.replace(/\|/g, '/')} |`;
  });
  khoiBang.push(`### ${nhom}\n\n| Mã | Việc | Kết quả | Ghi chú |\n|---|---|---|---|\n${dong.join('\n')}`);
}

let commit = '?';
try { commit = execSync('git rev-parse --short HEAD', { cwd: THU_MUC }).toString().trim(); } catch { /* không có git */ }
const tong = Object.values(DANH_MUC).reduce((s, x) => s + Object.keys(x).length, 0);
const ngay = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

const md = `# Kết quả Phần A — test chức năng tự động

Ngày chạy: ${ngay} · Bản webapp (commit): \`${commit}\` · Môi trường: **máy chủ giả** (\`tests/may-chu-gia.mjs\`) qua proxy \`/v1\` thật của app, bản production (\`next build\` + \`next start\`)

Theo \`kich-ban-test.md\` bản 3 (09/10/2026). Bộ này đo **hành vi của webapp**, không đo IBS thật: ca nào cần
phần cứng, Safari, tài khoản thứ hai hay DEV thì ghi **Test tay** kèm việc cần làm.

## Tổng

| Trạng thái | Số ca |
|---|---|
${Object.entries(dem).map(([k, n]) => `| ${NHAN[k]} | ${n} |`).join('\n')}
| **Tổng** | **${tong}** |

## Hỏng — cần xem

${hongDs.join('\n') || '_Không có._'}

## Còn phải test tay

${tayDs.join('\n') || '_Không có._'}

## Chi tiết từng ca

${khoiBang.join('\n\n')}
`;

const dich = path.join(THU_MUC, 'KET-QUA.md');
fs.writeFileSync(dich, md);
console.log(`Đã ghi ${path.relative(path.resolve(THU_MUC, '../..'), dich)}`);
for (const [k, n] of Object.entries(dem)) if (n) console.log(`  ${NHAN[k].padEnd(18)} ${n}`);
if (dem.null) console.log(`CẢNH BÁO: ${dem.null} ca chưa có kết quả — nhóm nào đó chưa chạy hoặc dừng sớm.`);
