import type { IotxCapability, IotxProduct } from "@/lib/iotx/contracts";
import type { Device } from "@/lib/types";

/**
 * Catalog giả cho chế độ `NEXT_PUBLIC_IOTX_MODE=mock`.
 *
 * Quan trọng: các màn điều khiển KHÔNG đọc dữ liệu cứng ở đây — chúng dựng từ
 * `product.capabilities` y như với thiết bị thật. Nhờ vậy bản mock và bản nối IBS đi cùng
 * một đường mã; nếu một capability bị thiếu, cả hai chế độ đều ẩn đúng khối đó.
 *
 * Mọi enum đều khai đủ `values` + `labels`: giao diện không bao giờ tự nghĩ ra mã lệnh,
 * nên thiếu `values` là khối đó biến mất — ở đây khai đủ để thấy bản dựng đầy đủ.
 */

/** `icon` là trường mở rộng của capability — app chỉ vẽ icon khi catalog khai nó. */
const onoff = (key: string, label: string, rpc: string, icon?: string): IotxCapability =>
  ({ key, kind: "onoff", label, rpc, ...(icon ? { icon } : {}) });
const muc = (
  key: string, label: string, rpc: string, min: number, max: number, unit?: string, step = 1, icon?: string,
): IotxCapability => ({ key, kind: "level", label, rpc, min, max, step, unit, unitSpace: false, ...(icon ? { icon } : {}) });
const chon = (key: string, label: string, rpc: string, values: string[], labels: Record<string, string>): IotxCapability =>
  ({ key, kind: "enum", label, rpc, values, labels });
const doDuoc = (key: string, label: string, unit?: string): IotxCapability => ({ key, kind: "sensor", label, unit, unitSpace: false });
const danhSach = (key: string, label: string): IotxCapability => ({ key, kind: "list", label });

type KhuonUi = NonNullable<IotxProduct["ui"]>;

/**
 * Mock khai `ui` đầy đủ y như catalog thật sẽ gửi: `skin`, `controls`, `gauges` và `slots`.
 * Nhờ vậy bản mock đi đúng đường mã với bản nối IBS — nếu bố cục hỏng ở đây thì nó cũng
 * hỏng khi chạy thật, chứ không phải "chỉ mock mới thế".
 */
function sanPham(
  nameVi: string, category: string, renderer: string, caps: IotxCapability[], icon: string,
  ui: Partial<KhuonUi> = {}, them: Partial<IotxProduct> = {},
): IotxProduct {
  return {
    nameVi, category, icon,
    ui: { renderer, ...ui },
    capabilities: caps,
    telemetry: caps.filter(cap => cap.kind === "sensor").map(cap => cap.key),
    version: 1,
    ...them,
  };
}

/**
 * Danh mục tính năng nâng cao mà catalog đính kèm sản phẩm. Ở đây để vài mục tiêu biểu —
 * mock đóng vai máy chủ, nên khai gì thì màn hiện nấy. Sản phẩm không khai thì nút "Tính
 * năng nâng cao" biến mất hẳn, đúng như khi catalog thật chưa có danh mục.
 */
const TINH_NANG_AC = {
  vi: [
    { g: "Làm mát", f: "i-Boost", d: "Đẩy công suất máy nén lên 110% trong 30 phút đầu.", v: "110% · 30 phút", c: "Chế độ Làm mát" },
    { g: "Làm mát", f: "Cảm biến nhiệt kép", d: "Đo cả nhiệt độ dàn lạnh và nhiệt độ phòng để bù trừ sai lệch.", v: "±0,5°C" },
    { g: "Tiết kiệm điện", f: "Eco Inverter", d: "Giảm tần số máy nén khi phòng đã đạt nhiệt độ đặt.", v: "tới 32%" },
    { g: "Tiết kiệm điện", f: "Sleep Curve", d: "Tự nâng 1°C sau mỗi giờ trong 2 giờ đầu khi ngủ.", v: "+1°C/giờ, tối đa +2°C" },
    { g: "Vệ sinh", f: "Tự làm khô dàn lạnh", d: "Chạy quạt 3 phút sau khi tắt để dàn lạnh không đọng nước.", v: "3 phút", n: "Có thể nghe tiếng quạt sau khi tắt máy." },
    { g: "Vệ sinh", f: "Lưới lọc kháng khuẩn", d: "Lớp phủ ion bạc trên lưới lọc bụi.", v: "thay sau 12 tháng" },
  ],
  en: [
    { g: "Cooling", f: "i-Boost", d: "Pushes the compressor to 110% for the first 30 minutes.", v: "110% · 30 min", c: "Cool mode" },
    { g: "Cooling", f: "Dual temperature sensor", d: "Reads both coil and room temperature to correct drift.", v: "±0.5°C" },
    { g: "Energy saving", f: "Eco Inverter", d: "Drops compressor frequency once the room reaches the target.", v: "up to 32%" },
    { g: "Energy saving", f: "Sleep Curve", d: "Raises the target by 1°C each hour for the first two hours.", v: "+1°C/h, max +2°C" },
    { g: "Hygiene", f: "Coil auto-dry", d: "Runs the fan for 3 minutes after shutdown so the coil stays dry.", v: "3 min", n: "You may hear the fan after switching off." },
    { g: "Hygiene", f: "Antibacterial filter", d: "Silver-ion coating on the dust filter.", v: "replace after 12 months" },
  ],
  fil: [
    { g: "Paglamig", f: "i-Boost", d: "Itinutulak ang compressor sa 110% sa unang 30 minuto.", v: "110% · 30 min", c: "Cool mode" },
    { g: "Paglamig", f: "Dalawang sensor ng temperatura", d: "Sinusukat ang coil at ang kwarto para itama ang pagkakaiba.", v: "±0.5°C" },
    { g: "Pagtitipid", f: "Eco Inverter", d: "Binabawasan ang bilis ng compressor kapag naabot na ang target.", v: "hanggang 32%" },
    { g: "Pagtitipid", f: "Sleep Curve", d: "Tumataas ng 1°C kada oras sa unang dalawang oras.", v: "+1°C/oras, max +2°C" },
    { g: "Kalinisan", f: "Auto-dry ng coil", d: "Tumatakbo ang fan ng 3 minuto pagkatapos patayin.", v: "3 min", n: "Maaaring marinig ang fan pagkatapos patayin." },
    { g: "Kalinisan", f: "Antibacterial filter", d: "May silver-ion coating ang dust filter.", v: "palitan pagkatapos ng 12 buwan" },
  ],
};

const TINH_NANG_BEP = {
  vi: [
    { g: "An toàn", f: "Ngắt khi nhấc nồi", d: "Dừng cấp điện sau 60 giây nếu không phát hiện đáy nồi nhiễm từ.", v: "60 giây" },
    { g: "An toàn", f: "Cảm biến quá nhiệt mặt kính", d: "Hạ công suất khi mặt kính vượt 270°C.", v: "270°C" },
    { g: "Nấu", f: "Giữ sôi lăn tăn", d: "Giữ mức công suất vừa đủ để nước sôi nhẹ mà không trào.", v: "mức 4–5" },
  ],
  en: [
    { g: "Safety", f: "Pan-lift cut-off", d: "Cuts power after 60 seconds with no ferrous pan detected.", v: "60 s" },
    { g: "Safety", f: "Glass over-temperature sensor", d: "Lowers power when the glass passes 270°C.", v: "270°C" },
    { g: "Cooking", f: "Gentle simmer", d: "Holds just enough power to keep a light boil without spilling.", v: "level 4–5" },
  ],
  fil: [
    { g: "Kaligtasan", f: "Cut-off kapag inangat ang kaldero", d: "Pinuputol ang kuryente pagkatapos ng 60 segundo.", v: "60 s" },
    { g: "Kaligtasan", f: "Sensor ng sobrang init sa salamin", d: "Binababaan ang lakas kapag lumagpas sa 270°C.", v: "270°C" },
    { g: "Pagluluto", f: "Banayad na pagkulo", d: "Sapat na lakas para kumulo nang bahagya nang hindi umaapaw.", v: "level 4–5" },
  ],
};


export const MOCK_PRODUCTS: Record<string, IotxProduct> = {
  "livotec-aircon-i30j": sanPham("Điều hòa I30J", "Làm mát", "aircon", [
    onoff("power", "Nguồn", "setPower", "power"),
    muc("temp", "Nhiệt độ", "setTemp", 16, 30, "°C"),
    doDuoc("roomTemp", "Nhiệt độ phòng", "°C"),
    doDuoc("humidity", "Độ ẩm", "%"),
    chon("mode", "Chế độ", "setMode", ["auto", "cool", "dry", "fan"], {
      auto: "Tự động", cool: "Làm mát", dry: "Hút ẩm", fan: "Quạt gió",
    }),
    chon("fanSpeed", "Tốc độ gió", "setFanSpeed", ["auto", "low", "medium", "high"], {
      auto: "Tự động", low: "Nhẹ", medium: "Vừa", high: "Mạnh",
    }),
    onoff("swingV", "Đảo gió dọc", "setSwingV"),
    onoff("swingH", "Đảo gió ngang", "setSwingH"),
    onoff("eco", "Eco", "setEco"),
    onoff("clean", "Clean", "setClean"),
    onoff("antimildew", "Anti mildew", "setAntiMildew"),
    onoff("sleep", "Sleep", "setSleep"),
    onoff("mute", "Mute", "setMute"),
    onoff("timer", "Hẹn giờ", "setTimer"),
  ], "❄️", {
    archetype: "ac", skin: "sunset",
    image: "/images/livotec/aircon-room.jpg",
    uuTien: ["temp", "mode", "fanSpeed", "swingV", "swingH", "eco", "sleep"],
    slots: {
      temp: { nhom: "hero", variant: "dial01", co: 3 },
      roomTemp: { nhom: "status", variant: "readout01", co: 1 },
      humidity: { nhom: "status", variant: "readout01", co: 1 },
      mode: { nhom: "secondary", variant: "chips01", co: 2 },
      fanSpeed: { nhom: "secondary", variant: "chips01", co: 2 },
      power: { nhom: "secondary", variant: "power01", co: 1 },
    },
  }, { tinhNang: TINH_NANG_AC }),

  "livotec-purifier-886i": sanPham("Máy lọc nước 886i", "Nước", "purifier", [
    onoff("power", "Nguồn", "setPower", "power"),
    doDuoc("inletTds", "TDS đầu vào", "ppm"),
    doDuoc("outletTds", "TDS đầu ra", "ppm"),
    chon("waterMode", "Chế độ nước", "setWaterMode", ["cold", "room", "hot"], {
      cold: "Nước lạnh", room: "Nước thường", hot: "Nước nóng",
    }),
    // Catalog thật mô tả lõi lọc bằng capability kiểu `list` (vật tư), không phải cảm biến.
    danhSach("loiLoc", "Lõi lọc"),
  ], "💧", {
    archetype: "waterfilter", skin: "ocean",
    image: "/images/livotec/purifier.jpg",
    uuTien: ["loiLoc", "waterMode"],
    slots: {
      loiLoc: { nhom: "hero", variant: "filterlist01", co: 3 },
      outletTds: { nhom: "status", variant: "readout01", co: 1 },
      inletTds: { nhom: "status", variant: "readout01", co: 1 },
      waterMode: { nhom: "secondary", variant: "chips01", co: 2 },
      power: { nhom: "secondary", variant: "power01", co: 1 },
    },
  }, { henGio: { bat: false } }),

  "livotec-cooktop-lio666v": sanPham("Bếp từ đôi LIO-666V", "Nhà bếp", "cooktop", [
    onoff("power", "Nguồn", "setPower", "power"),
    muc("zone1", "Vùng trái", "setZone1", 0, 9),
    muc("zone2", "Vùng phải", "setZone2", 0, 9),
    onoff("booster1", "Booster trái", "setBooster1", "bolt"),
    onoff("booster2", "Booster phải", "setBooster2", "bolt"),
    chon("cookPreset", "Chế độ nấu", "setPreset", ["boil", "fry", "steam", "soup", "hotpot", "warm"], {
      boil: "Luộc", fry: "Chiên xào", steam: "Hấp", soup: "Nấu canh", hotpot: "Lẩu", warm: "Giữ ấm",
    }),
    muc("timer", "Hẹn tắt", "setTimer", 0, 99, "phút", 5, "clock"),
    onoff("childLock", "Khóa trẻ em", "setChildLock", "lock"),
  ], "🍳", {
    archetype: "heater", skin: "sunset",
    image: "/images/livotec/ck-hero.jpg",
    uuTien: ["zone1", "zone2", "cookPreset", "timer", "childLock"],
    slots: {
      zone1: { nhom: "hero", variant: "dial01", co: 3 },
      zone2: { nhom: "secondary", variant: "step01", co: 2 },
      cookPreset: { nhom: "secondary", variant: "chips01", co: 2 },
      power: { nhom: "secondary", variant: "power01", co: 1 },
    },
  }, { tinhNang: TINH_NANG_BEP }),

  "livotec-hood-h700": sanPham("Máy hút mùi H-700", "Nhà bếp", "hood", [
    onoff("power", "Nguồn", "setPower", "power"),
    muc("hoodSpeed", "Tốc độ hút", "setSpeed", 0, 5),
    onoff("autoSensor", "Cảm biến tự động", "setAutoSensor", "faceScan"),
    onoff("light", "Đèn bếp", "setLight", "sun"),
    muc("delayOff", "Tắt trễ", "setDelayOff", 0, 60, "phút", 5, "clock"),
    chon("ductMode", "Kiểu thoát khí", "setDuctMode", ["duct", "recirc"], {
      duct: "Thoát ra ngoài", recirc: "Lọc tuần hoàn",
    }),
    doDuoc("filterHealth", "Lưới lọc mỡ", "%"),
  ], "🌬️", {
    archetype: "fan", skin: "graphite",
    image: "/images/livotec/hood-hero.png",
    uuTien: ["hoodSpeed", "ductMode", "autoSensor", "light"],
    slots: {
      hoodSpeed: { nhom: "hero", variant: "dial01", co: 3 },
      filterHealth: { nhom: "status", variant: "gauge01", co: 2 },
      ductMode: { nhom: "secondary", variant: "chips01", co: 2 },
      autoSensor: { nhom: "secondary", variant: "switch01", co: 1 },
      power: { nhom: "secondary", variant: "power01", co: 1 },
    },
  }),

  "livotec-ricecooker-lio668": sanPham("Nồi cơm điện tử LIO-668", "Nhà bếp", "ricecooker", [
    onoff("power", "Nguồn", "setPower", "power"),
    chon("cookMode", "Chương trình", "setCookMode", ["rice", "quick", "porridge", "stew", "steam"], {
      rice: "Nấu cơm", quick: "Nấu nhanh", porridge: "Cháo", stew: "Hầm", steam: "Hấp",
    }),
    chon("cookState", "Trạng thái", "", ["idle", "cooking", "warming"], {
      idle: "Đang chờ", cooking: "Đang nấu", warming: "Đang giữ ấm",
    }),
    muc("delayStart", "Hẹn nấu", "setDelayStart", 0, 24, "giờ", 1, "clock"),
    onoff("keepWarm", "Giữ ấm", "setKeepWarm", "sun"),
    muc("keepWarmMax", "Giữ ấm tối đa", "setKeepWarmMax", 1, 24, "giờ", 1, "sun"),
    onoff("temp3D", "Mầm nhiệt 3D", "setHeat3D", "heat"),
    doDuoc("roomTemp", "Nhiệt độ lòng nồi", "°C"),
  ], "🍚", {
    archetype: "heater", skin: "sunset",
    image: "/images/livotec/ricecooker.jpg",
    uuTien: ["cookMode", "delayStart", "keepWarm", "temp3D"],
    slots: {
      cookState: { nhom: "status", variant: "state01", co: 1 },
      roomTemp: { nhom: "status", variant: "readout01", co: 1 },
      cookMode: { nhom: "hero", variant: "chips01", co: 3 },
      delayStart: { nhom: "secondary", variant: "step01", co: 2 },
      keepWarm: { nhom: "secondary", variant: "switch01", co: 1 },
      power: { nhom: "secondary", variant: "power01", co: 1 },
    },
  }),

  "livotec-wh-indirect-3200": sanPham("Bình nóng lạnh gián tiếp 32L", "Nước", "waterheater_indirect", [
    onoff("power", "Nguồn", "setPower", "power"),
    muc("temp", "Nhiệt độ đặt", "setTemp", 40, 75, "°C"),
    doDuoc("roomTemp", "Nhiệt độ nước", "°C"),
    doDuoc("waterLevel", "Nước nóng còn lại", "%"),
    doDuoc("anode", "Thanh magie", "%"),
    doDuoc("heating", "Đang đun"),
    onoff("boost", "Đun nhanh", "setBoost", "bolt"),
    muc("timer", "Hẹn giờ", "setTimer", 0, 720, "phút", 15, "clock"),
    onoff("childLock", "Khóa trẻ em", "setChildLock", "lock"),
  ], "♨️", {
    archetype: "heater", skin: "ocean",
    image: "/images/livotec/wh-indirect-hero.jpg",
    uuTien: ["temp", "boost", "timer", "childLock"],
    slots: {
      temp: { nhom: "hero", variant: "dial01", co: 3 },
      waterLevel: { nhom: "status", variant: "gauge01", co: 2 },
      roomTemp: { nhom: "status", variant: "readout01", co: 1 },
      boost: { nhom: "secondary", variant: "switch01", co: 1 },
      timer: { nhom: "secondary", variant: "slider01", co: 2 },
      power: { nhom: "secondary", variant: "power01", co: 1 },
    },
  }),

  "livotec-wh-direct-4500": sanPham("Bình nóng lạnh trực tiếp 4500W", "Nước", "waterheater_direct", [
    onoff("power", "Nguồn", "setPower", "power"),
    muc("temp", "Nhiệt độ nước ra", "setTemp", 35, 48, "°C"),
    doDuoc("heating", "Đang đun"),
    doDuoc("elcb", "Chống giật ELCB"),
    onoff("boost", "Boost", "setBoost", "bolt"),
    onoff("childLock", "Khóa trẻ em", "setChildLock", "lock"),
  ], "🚿", {
    archetype: "heater", skin: "ocean",
    image: "/images/livotec/wh-direct-hero.png",
    uuTien: ["temp", "boost", "childLock"],
    slots: {
      elcb: { nhom: "status", variant: "state01", co: 1 },
      heating: { nhom: "status", variant: "state01", co: 1 },
      temp: { nhom: "hero", variant: "dial01", co: 3 },
      boost: { nhom: "secondary", variant: "switch01", co: 1 },
      power: { nhom: "secondary", variant: "power01", co: 1 },
    },
  }),

  "livotec-fan-w450": sanPham("Quạt treo tường W-450", "Làm mát", "fan_ac", [
    onoff("power", "Nguồn", "setPower", "power"),
    muc("speed", "Tốc độ gió", "setSpeed", 0, 5),
    chon("mode", "Chế độ", "setMode", ["normal", "nature", "sleep", "turbo"], {
      normal: "Thường", nature: "Gió tự nhiên", sleep: "Ngủ", turbo: "Mạnh",
    }),
    onoff("swing", "Đảo gió", "setSwing", "swingH"),
    muc("timer", "Hẹn tắt", "setTimer", 0, 8, "giờ", 1, "clock"),
  ], "🌀", {
    archetype: "fan", skin: "graphite",
    image: "/images/livotec/wallfan.jpg",
    uuTien: ["speed", "mode", "swing", "timer"],
    slots: {
      speed: { nhom: "hero", variant: "dial01", co: 3 },
      mode: { nhom: "secondary", variant: "chips01", co: 2 },
      swing: { nhom: "secondary", variant: "switch01", co: 1 },
      power: { nhom: "secondary", variant: "power01", co: 1 },
    },
  }),

  "livotec-fan-s400dc": sanPham("Quạt cây BLDC S-400DC", "Làm mát", "fan_bldc", [
    onoff("power", "Nguồn", "setPower", "power"),
    muc("speed", "Tốc độ gió", "setSpeed", 0, 100, "%", 5),
    chon("mode", "Chế độ", "setMode", ["normal", "nature", "sleep", "baby", "eco"], {
      normal: "Thường", nature: "Tự nhiên", sleep: "Ngủ", baby: "Trẻ em", eco: "Tiết kiệm",
    }),
    onoff("swing", "Đảo gió", "setSwing", "swingH"),
    onoff("coolSense", "CoolSense", "setCoolSense"),
    onoff("freshCare", "FreshCare", "setFreshCare"),
    onoff("humanSense", "HumanSense", "setHumanSense"),
    muc("timer", "Hẹn tắt", "setTimer", 0, 9, "giờ", 1, "clock"),
  ], "🍃", {
    archetype: "fan", skin: "ocean",
    image: "/images/livotec/standfan.jpg",
    uuTien: ["speed", "mode", "coolSense", "freshCare", "humanSense", "swing", "timer"],
    slots: {
      speed: { nhom: "hero", variant: "dial01", co: 3 },
      mode: { nhom: "secondary", variant: "chips01", co: 2 },
      coolSense: { nhom: "secondary", variant: "switch01", co: 1 },
      power: { nhom: "secondary", variant: "power01", co: 1 },
    },
  }),
};

const NHA_1 = "Nhà Phố Linh Đàm";
const NHA_2 = "Căn hộ Vinhomes";

function thietBi(
  id: string, code: string, name: string, model: string, house: string, room: string,
  maSanPham: string, on: boolean, fav: boolean, lastValues: Record<string, unknown>,
): Device {
  const product = MOCK_PRODUCTS[maSanPham];
  return {
    id, name, model, code, house, room,
    // Nhóm lấy thẳng từ `category` của catalog — trang chủ lọc theo nhóm nào là nhóm ấy.
    group: product?.category ?? "Khác",
    online: true, on, fav, speed: Number(lastValues.speed ?? 0),
    product,
    lastValues: { power: on, ...lastValues },
  };
}

/** Chín thiết bị, đủ chín loại màn, trải trên hai nhà để thấy bộ lọc hoạt động. */
export const MOCK_DEVICES: Device[] = [
  thietBi("ac1", "ac30412", "Điều hòa phòng khách", "I30J", NHA_1, "Phòng khách", "livotec-aircon-i30j", true, true, {
    temp: 25, roomTemp: 29, humidity: 68, mode: "cool", fanSpeed: "auto",
    swingV: true, swingH: false, eco: false, clean: false, antimildew: false, sleep: false, mute: false, timer: false,
  }),
  thietBi("fa1", "fan72185", "Quạt treo phòng ngủ", "W-450", NHA_1, "Phòng ngủ", "livotec-fan-w450", true, true, {
    speed: 3, mode: "nature", swing: true, timer: 2,
  }),
  thietBi("fb1", "fan90233", "Quạt cây phòng khách", "S-400DC", NHA_1, "Phòng khách", "livotec-fan-s400dc", false, false, {
    speed: 45, mode: "eco", swing: false, coolSense: true, freshCare: false, humanSense: true, timer: 0,
  }),
  thietBi("ck1", "cook88123", "Bếp từ đôi", "LIO-666V", NHA_1, "Bếp", "livotec-cooktop-lio666v", true, false, {
    zone1: 6, zone2: 0, booster1: false, booster2: false, cookPreset: "fry", timer: 15, childLock: false,
  }),
  thietBi("hm1", "hood70441", "Máy hút mùi", "H-700", NHA_1, "Bếp", "livotec-hood-h700", true, false, {
    hoodSpeed: 2, autoSensor: true, light: true, delayOff: 5, ductMode: "duct", filterHealth: 62,
  }),
  thietBi("rc1", "rc50124", "Nồi cơm điện tử", "LIO-668", NHA_1, "Bếp", "livotec-ricecooker-lio668", true, false, {
    cookMode: "rice", cookState: "cooking", delayStart: 0, keepWarm: true, keepWarmMax: 12, temp3D: true, roomTemp: 98,
  }),
  thietBi("pu1", "aio46330", "Máy lọc nước", "886i", NHA_1, "Bếp", "livotec-purifier-886i", true, true, {
    inletTds: 180, outletTds: 28, waterMode: "room",
    loiLoc: [
      { id: "l1", ten: "Lõi thô Max Performance", tuoiTho: 180, phanTram: 78, xacThuc: true },
      { id: "l2", ten: "Màng RO 100 GPD", tuoiTho: 730, phanTram: 64, xacThuc: true },
      { id: "l3", ten: "Lõi chức năng Hydrogen", tuoiTho: 365, phanTram: 5, xacThuc: false },
    ],
  }),
  thietBi("wh1", "wh32078", "Bình nóng lạnh phòng tắm", "IND-32L", NHA_1, "Phòng tắm", "livotec-wh-indirect-3200", true, false, {
    temp: 65, roomTemp: 52, waterLevel: 74, anode: 18, heating: true, boost: false, timer: 120, childLock: true,
  }),
  thietBi("wh2", "wh45091", "Bình nóng lạnh trực tiếp", "DIR-4500", NHA_2, "Phòng tắm", "livotec-wh-direct-4500", false, false, {
    temp: 42, heating: false, elcb: true, boost: false, childLock: false,
  }),
];

export const MOCK_SPACES = {
  houses: [NHA_1, NHA_2],
  rooms: ["Phòng khách", "Bếp", "Phòng ngủ", "Phòng tắm"],
  groups: ["Làm mát", "Nhà bếp", "Nước"],
};
