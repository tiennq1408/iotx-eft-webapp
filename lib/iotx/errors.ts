import { IotxApiError } from "./client";

const CAU_CHUNG = "Không tìm thấy, hoặc bạn không có quyền với mục này.";
const CAU_MANG = "Không kết nối được máy chủ. Kiểm tra đường truyền rồi thử lại.";
const CAU_HET_PHIEN = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";

/**
 * Hợp đồng IoTX cố ý gộp nhiều tình huống vào 404 { message: "not_found" } để chống dò:
 * không tồn tại, không phải của mình, sai tenant, sai mã claim đều nói một câu.
 * App chỉ được hiện câu chung cho đúng chuỗi đó. Mọi message khác là câu tiếng Việt
 * do máy chủ soạn sẵn cho người dùng, phải hiện nguyên văn.
 */
export function moTaLoi(error: unknown): string {
  if (error instanceof IotxApiError) {
    if (error.message === "not_found") return CAU_CHUNG;
    if (error.status === 401) return CAU_HET_PHIEN;
    // 502/503/504 đến từ proxy /v1 hoặc từ cửa ngõ: đường truyền, không phải phiên hỏng.
    if (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504) return CAU_MANG;
    return error.message;
  }
  if (error instanceof TypeError) return CAU_MANG;
  if (error instanceof Error && error.message) return error.message;
  return CAU_MANG;
}

/** Phiên đã chết hẳn: client chỉ ném 401 ra ngoài sau khi đã thử làm mới token mà vẫn hỏng. */
export function laHetPhien(error: unknown): boolean {
  return error instanceof IotxApiError && error.status === 401;
}

/** Đúng hai mã mà màn đăng nhập phải nói chung một câu (xem moTaLoiDangNhap). */
export function laLoiDangNhap(error: unknown): boolean {
  return error instanceof IotxApiError && (error.status === 401 || error.status === 404);
}
