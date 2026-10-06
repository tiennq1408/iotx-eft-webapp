import type { IotxCapability } from "@/lib/iotx/contracts";
import type { HamChu } from "@/components/newui/chu";

/**
 * Nhãn hiển thị của một capability — nguồn duy nhất cho cả app.
 *
 * Đo trên DEV: catalog trả nhãn là CHÍNH KHÓA i18n (`"label": "cap.power"`), và bảng
 * `/i18n` của máy chủ lại ánh xạ `cap.power → "cap.power"`. Nếu cứ tin nhãn hoặc tin bảng
 * dịch thì màn hình hiện chữ `cap.power` hoặc `power` — người dùng thấy khóa kỹ thuật.
 * Vì vậy phải rơi bậc bốn tầng, và tầng cuối không bao giờ trả về khóa thô.
 *
 * Trước đây đoạn logic này nằm ở hai file cho hai hệ i18n khác nhau, và sửa một bên là
 * bên kia lệch ngay.
 */
const KHOA_THO = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/;

/** Trả về chữ đã dịch, hoặc `undefined` khi bảng chữ không có khóa đó. */
type TraCuu = (khoa: string) => string | undefined;

/** Chữ của app cho những khóa mà catalog lẫn máy chủ đều bỏ trống. Đo thật trên DEV. */
const NHAN_SAN: Record<string, string> = {
  power: "Nguồn",
  mode: "Chế độ",
  speed: "Tốc độ",
  fanSpeed: "Tốc độ gió",
  brightness: "Độ sáng",
  oscillate: "Xoay trái–phải",
  light: "Đèn",
  buzzer: "Âm thanh",
  timerOff: "Hẹn giờ tắt",
  curSpeed: "Tốc độ đang quay",
  sleepSpeed: "Tốc độ khi ngủ",
  autoMode: "Tự chạy theo môi trường",
  tempTarget: "Nhiệt độ mong muốn",
  humidTarget: "Độ ẩm mong muốn",
  roomTemp: "Nhiệt độ phòng",
  roomHumid: "Độ ẩm phòng",
  temperature: "Nhiệt độ",
  temp: "Nhiệt độ",
};

/** `ac_temp_setting` → "Ac temp setting". Thà chữ vụng còn hơn khóa kỹ thuật trên màn. */
function deDoc(khoa: string) {
  const chu = khoa
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return chu ? chu[0].toUpperCase() + chu.slice(1) : khoa;
}

function lay(nhanCatalog: string | undefined, khoa: string, duPhong: string, tra: TraCuu) {
  if (nhanCatalog && !KHOA_THO.test(nhanCatalog)) return nhanCatalog;
  const dich = tra(khoa);
  if (dich && dich !== khoa && !KHOA_THO.test(dich)) return dich;
  return duPhong;
}

const traCuuChu = (t: HamChu): TraCuu => khoa => {
  const ra = t(khoa);
  return ra === khoa ? undefined : ra;
};

export function nhanCap(cap: IotxCapability, t: HamChu): string {
  return lay(cap.label, `cap.${cap.key}`, NHAN_SAN[cap.key] ?? deDoc(cap.key), traCuuChu(t));
}

export function nhanGiaTriCap(cap: IotxCapability, giaTri: string, t: HamChu): string {
  const l = cap.labels?.[giaTri];
  if (l && l === giaTri) return giaTri;
  return lay(l, `cap.${cap.key}.${giaTri}`, giaTri, traCuuChu(t));
}
