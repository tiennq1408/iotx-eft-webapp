/**
 * Tra serial ở CHẾ ĐỘ MOCK (không có máy chủ): cùng hình dạng với `iotxClient.traSerial` để bảng
 * thông tin thiết bị đi chung một đường mã, nhưng không gọi mạng. Tách khỏi lớp IoTX như
 * AGENTS.md đòi. Mock không có S-Factory nên mọi serial đều "chưa có dữ liệu".
 */
import type { BaoHanhSerial } from "@/lib/iotx";

export async function traSerialGia(serial: string): Promise<BaoHanhSerial> {
  return {
    found: false, serial: serial.trim().toUpperCase(), product: null,
    manufactureDate: null, purchaseDate: null, warranty: null, source: "mock",
  };
}
