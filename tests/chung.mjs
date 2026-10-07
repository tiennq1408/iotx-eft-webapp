/** Hằng số dùng chung cho mọi bài kiểm. Đổi cổng bằng biến môi trường, không sửa mã. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONG_APP = Number(process.env.CONG_APP || 3111);
export const CONG_GIA = Number(process.env.CONG_GIA || 3200);
export const GOC = `http://localhost:${CONG_APP}`;
export const GOC_GIA = `http://localhost:${CONG_GIA}`;

/**
 * Chromium cho Playwright. Container CI có sẵn bản ở `/opt/pw-browsers/chromium`; máy dev
 * không có thì để Playwright tự dùng bản của nó (`npx playwright install chromium`).
 * Ghi đè bằng `PW_CHROMIUM` khi cần.
 */
const CHROMIUM_CI = '/opt/pw-browsers/chromium';
export const CHROMIUM = process.env.PW_CHROMIUM || (fs.existsSync(CHROMIUM_CI) ? CHROMIUM_CI : undefined);

export const THU_MUC = path.dirname(fileURLToPath(import.meta.url));
export const TAM = path.join(THU_MUC, '.tam');
fs.mkdirSync(TAM, { recursive: true });

/** Máy chủ giả ghi từng lệnh RPC vào đây để bài kiểm đọc lại. */
export const NHAT_KY = path.join(TAM, 'rpc-log.jsonl');
export const anh = ten => path.join(TAM, `${ten}.png`);
