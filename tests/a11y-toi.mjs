/**
 * Cùng bộ đo vùng chạm + tương phản của a11y.mjs, chạy lại trên mọi màn ở GIAO DIỆN TỐI
 * (menu → Tài khoản → Giao diện → Tối). Màn đăng nhập không theo giao diện tối nên ba màn
 * đầu đo ra giống bản sáng.
 */
process.env.GIAO_DIEN = 'toi';
await import('./a11y.mjs');
