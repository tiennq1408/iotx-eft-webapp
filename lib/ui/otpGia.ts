/**
 * Mã xác thực ở CHẾ ĐỘ MOCK (không có máy chủ): cùng hình dạng với ba cửa thật của
 * `iotxClient` (`guiMaOtp` · `xacNhanMaOtp` · `datLaiMatKhau`) để màn đăng nhập đi chung một
 * đường mã, nhưng không gọi mạng. Tách riêng khỏi lớp IoTX như AGENTS.md đòi.
 *
 * Mock nhận mọi mã đủ 6 chữ số — không có thư nào được gửi, nên không có mã "đúng" để đối chiếu.
 */
import type { ViecOtp } from "@/lib/iotx";

const HAN = { hetHanSau: 300, guiLaiSau: 60 };

export const otpGia = {
  async guiMaOtp() {
    return { ok: true as const, ...HAN };
  },
  async xacNhanMaOtp(...thamSo: [dinhDanh: string, ma: string, viec: ViecOtp]) {
    if (!/^\d{6}$/.test(thamSo[1])) throw new Error("Mã không đúng hoặc đã hết hạn — gửi lại mã mới.");
    return { ok: true as const, veTam: "ve-gia" };
  },
  async datLaiMatKhau() {
    return { ok: true as const };
  },
};
