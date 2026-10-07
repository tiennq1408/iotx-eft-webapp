import type { IotxCapability, IotxHenGioTongQuan, IotxThanChuongTrinh } from "@/lib/iotx/contracts";

/**
 * Luật nghiệp vụ của hẹn giờ theo thiết bị — tách khỏi màn để đọc và kiểm được mà không
 * phải lội qua JSX. Màn chỉ đổi kết quả ở đây thành chữ bằng `t`.
 */

/** Trần cứng của hợp đồng — chặn ngay ở client, máy chủ vẫn kiểm lại. */
export const TRAN = { chuongTrinh: 10, buoc: 8, hanhDong: 5, ten: 40, phut: { min: 1, max: 720 } };

/**
 * Giờ bắt đầu gieo sẵn khi chu kỳ chuyển sang cần nó.
 *
 * Trước đây ô nhập lấy `soan.batDau ?? "06:00"` làm GIÁ TRỊ HIỂN THỊ trong khi state vẫn
 * null. Người dùng nhìn thấy "06:00" nằm đó mà màn vẫn báo "cần giờ bắt đầu", và gõ lại
 * đúng 06:00 thì trình duyệt không bắn onChange nên không thoát ra được. Gieo vào state
 * thì cái nhìn thấy và cái gửi đi là một.
 */
const MAC_DINH_BAT_DAU = "06:00";

export const thanRong = (): IotxThanChuongTrinh => ({
  ten: "", kieu: "gio", chay: "lap", ngay: [0, 1, 2, 3, 4, 5, 6],
  buoc: [{ moc: "06:00", hd: [] }],
});

/** Giá trị gieo sẵn khi chọn một capability cho hành động. */
export function giaTriMacDinh(cap: IotxCapability | undefined): unknown {
  if (!cap) return "";
  if (cap.kind === "onoff") return true;
  if (cap.kind === "enum") return cap.values?.[0] ?? "";
  return cap.min ?? 0;
}

/** Đổi kiểu mốc: giờ trong ngày ↔ phút tính từ lúc bắt đầu. Mốc cũ không còn nghĩa nên đặt lại. */
export function doiKieu(soan: IotxThanChuongTrinh, kieu: IotxThanChuongTrinh["kieu"]): IotxThanChuongTrinh {
  if (kieu === "gio") return { ...soan, kieu, buoc: soan.buoc.map(b => ({ ...b, moc: "06:00" })) };
  return {
    ...soan,
    kieu,
    batDau: soan.chay === "lap" ? (soan.batDau ?? MAC_DINH_BAT_DAU) : soan.batDau,
    buoc: soan.buoc.map((b, i) => ({ ...b, moc: (i + 1) * 30 })),
  };
}

export function doiChay(soan: IotxThanChuongTrinh, chay: IotxThanChuongTrinh["chay"]): IotxThanChuongTrinh {
  if (chay === "motlan") return { ...soan, chay };
  return { ...soan, chay, batDau: soan.kieu === "khoang" ? (soan.batDau ?? MAC_DINH_BAT_DAU) : soan.batDau };
}

/** Lỗi soạn: khóa chữ kèm tham số, để màn dịch. `null` nghĩa là hợp lệ. */
export type LoiSoan = { khoa: string; thamSo?: Record<string, number> };

/**
 * Soát đúng những ràng buộc hợp đồng nêu, và trả về lỗi NÓI RÕ sai ở đâu.
 *
 * Máy chủ vẫn kiểm lại — nhưng để nó từ chối thì người dùng mất một vòng mạng mới biết
 * mình gõ sai bước nào. Hai luật dễ vi phạm nhất mà bản cũ bỏ qua hẳn: mốc `khoang` phải
 * TĂNG DẦN, và mốc `gio` không được trùng nhau.
 */
export function kiemChuongTrinh(soan: IotxThanChuongTrinh, capChoPhep: IotxCapability[]): LoiSoan | null {
  if (!soan.ten.trim() || soan.ten.length > TRAN.ten) return { khoa: "hg_loi_ten" };
  if (soan.buoc.length < 1 || soan.buoc.length > TRAN.buoc) return { khoa: "hg_invalid" };

  const daGap = new Set<string>();
  let truoc = -1;
  for (let i = 0; i < soan.buoc.length; i++) {
    const b = soan.buoc[i], n = i + 1;
    if (b.hd.length < 1 || b.hd.length > TRAN.hanhDong) return { khoa: "hg_loi_hd", thamSo: { n } };
    // Cap có thể đã bị thu hồi SAU khi lưu (`capThuHoi`) — lúc đó nó không còn trong
    // `capChoPhep`, máy chủ sẽ chối, nên bắt ngay tại đây.
    if (b.hd.some(h => !h.cap || !capChoPhep.some(c => c.key === h.cap))) return { khoa: "hg_loi_cap", thamSo: { n } };

    if (soan.kieu === "gio") {
      const moc = String(b.moc);
      if (daGap.has(moc)) return { khoa: "hg_loi_trung", thamSo: { n } };
      daGap.add(moc);
    } else {
      const moc = Number(b.moc);
      if (!Number.isInteger(moc) || moc < 1 || moc > 1440) return { khoa: "hg_loi_moc", thamSo: { n } };
      if (moc <= truoc) return { khoa: "hg_loi_tang", thamSo: { n } };
      truoc = moc;
    }
  }

  if (soan.chay === "lap" && (soan.ngay?.length ?? 0) < 1) return { khoa: "hg_loi_ngay" };
  if (soan.kieu === "khoang" && soan.chay === "lap" && !soan.batDau) return { khoa: "hg_loi_batdau" };
  return null;
}

/** Thân gửi lên máy chủ: bỏ những trường không có nghĩa với kiểu chạy đang chọn. */
export function chuanHoaThan(soan: IotxThanChuongTrinh): IotxThanChuongTrinh {
  return {
    ...soan,
    ten: soan.ten.trim(),
    ngay: soan.chay === "lap" ? soan.ngay : undefined,
    batDau: soan.kieu === "khoang" && soan.chay === "lap" ? soan.batDau : undefined,
  };
}

/** Các capability sản phẩm cho phép hẹn giờ, theo đúng thứ tự máy chủ trả. */
export function capChoPhepCua(tq: IotxHenGioTongQuan | null, capabilities: IotxCapability[]): IotxCapability[] {
  return (tq?.capChoPhep ?? [])
    .map(key => capabilities.find(cap => cap.key === key))
    .filter((cap): cap is IotxCapability => Boolean(cap));
}

export function tenChuongTrinhDangDung(tq: IotxHenGioTongQuan): string {
  return tq.chuongTrinh.find(c => c.id === tq.dangDung)?.ten ?? "";
}
