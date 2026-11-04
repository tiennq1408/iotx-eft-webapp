"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Home } from "lucide-react";
import type { Device } from "@/lib/types";
import { IotxApiError, apGiaTri, iotxClient, iotxConfig, isIotxMode, moTaLoi } from "@/lib/iotx";
import type { IotxCapability, IotxLenhVatTu, IotxMucVatTu, IotxRule } from "@/lib/iotx/contracts";
import IfThenEditor from "@/components/automation/IfThenEditor";
import VirtualPanel from "@/components/virtual/VirtualPanel";
import { AddDevice } from "@/components/manage/AddDevice";
import { Members } from "@/components/manage/Members";
import { Spaces } from "@/components/manage/Spaces";
import { ChuProvider } from "@/components/ui/chu";
import { BottomNav, TopBar, type ManChinh } from "@/components/ui/shell";
import { FilterRow } from "@/components/ui/home";
import {
  ManDichVu, ManKhamPha, ManThietBi, ManTrangChu, ManTuDong, type HanhDongLuat, type HanhDongThietBi,
} from "@/components/ui/ManChinh";
import { BO_LOC_DAU, cacNhomCua, locThietBi, type BoLoc, type LoaiLoc } from "@/lib/ui/boLoc";
import { capNguonCua } from "@/lib/ui/khuon";
import {
  CHO_WIFI_MS, LoiBle, coDuongBle, coWebBluetooth, coWifi, daBietBaoLai, danhDauMatWifi, laLoiDuongBle, loiBle, matWifiChac, nhoBaoLai,
  noiTuDong, phienBle, phienDung,
} from "@/lib/ble/dieuKhienBle";
import { CHU, laMaNgonNgu } from "@/lib/ui/strings";
import {
  ChonModal, DevicePickerModal, XemTruocCoChu, DoiAnhModal, DoiMatKhauModal, DoiTenModal, LocPickerModal, MenuDrawer, NotifModal, PlaceholderModal, TaiKhoanPopup,
  NHAN_CO_CHU, NHAN_GIAO_DIEN, type MucChon, type MucMenu,
} from "@/components/ui/modals";
import DeviceDetail from "@/components/ui/device/DeviceDetail";
import { BangBle, NutKetNoiBle } from "@/components/ble/KetNoiBle";
import { bleDangNoi, rpcTheoDuong } from "@/lib/iotx/ble";
import HenGioPanel from "@/components/ui/device/HenGioPanel";
import LoginScreen from "@/components/ui/LoginScreen";
import { useDuLieuIotx, tenHienThi } from "@/hooks/useDuLieuIotx";
import { DS_CO_CHU, DS_GIAO_DIEN, laToi, useCaiDat, type CoChu, type GiaoDien } from "@/lib/ui/caiDat";
import { MAU_DINH, datMauDinh } from "@/lib/ui/mauDinh";
import { anhCoNgonNgu, dsNgonNgu, tenNgonNgu } from "@/lib/ui/ngonNgu";

/**
 * Tấm đang mở. Thứ chỉ có nghĩa với một loại tấm nằm ngay trong nó — id thiết bị của màn
 * chi tiết/hẹn giờ, tiêu đề của tấm "sắp ra mắt" — nên không có state nào phải dọn tay.
 */
type Panel =
  | null
  | { loai: "drawer" | "profile" | "notif" | "spaces" | "members" | "add" | "chonThietBi" | "virtual" | "if-editor" | "doiMatKhau" | "doiTen" | "doiAnh" }
  /** Popup chọn của popup tài khoản (ngôn ngữ / cỡ chữ / giao diện) — đóng là quay về popup đó. */
  | { loai: "chon"; muc: MucChon }
  | { loai: "loc"; boLoc: LoaiLoc }
  | { loai: "placeholder"; tieuDe: string }
  | { loai: "device"; id: string }
  /** `tuChiTiet`: mở từ màn chi tiết thì đóng là quay về đó; mở từ menu/bộ chọn thì đóng hẳn. */
  | { loai: "hengio"; id: string; tuChiTiet?: boolean };

/** Hộp chọn của từng bộ lọc: khóa chữ tiêu đề và hàng "tất cả". */
const HOP_LOC: Record<LoaiLoc, { khoaTieuDe: string; khoaTatCa: string }> = {
  nha: { khoaTieuDe: "pick_house", khoaTatCa: "all_houses" },
  phong: { khoaTieuDe: "pick_room", khoaTatCa: "all_rooms" },
  nhom: { khoaTieuDe: "pick_group", khoaTatCa: "all_groups" },
};

export default function LivotecApp() {
  // Khai trước lời gọi hook: nhịp hỏi lại trạng thái nhanh hơn khi màn chi tiết đang mở.
  const [panel, setPanel] = useState<Panel>(null);

  const {
    hydrated, data, setData, signedIn, setSignedIn, profile, theme, boChu, lang, loiDongBo, setLoiDongBo,
    matMayChu, thuKetNoiLai,
    notifications, setNotifications, chiaSeNhanDuoc, chiaSeDaCap,
    luat, setLuat, luatTuThietBi, taiLuat,
    doiNgonNgu, syncRemote, taiChiaSe, refreshDevices, ghiNhanLenh, boGhiNhanLenh, choXacNhan,
  } = useDuLieuIotx({ xemKy: panel?.loai === "device" });

  // Giao diện tối, cỡ/kiểu chữ chỉ áp sau đăng nhập — màn đăng nhập có bảng màu riêng.
  const [caiDat, suaCaiDat] = useCaiDat(hydrated && signedIn);
  // Vùng tai thỏ / thanh trạng thái theo màu mép trên của màn đang hiện (xem lib/ui/mauDinh.ts).
  const dangXemChiTiet = panel?.loai === "device";
  useEffect(() => {
    if (!hydrated) return;
    const toi = signedIn && laToi(caiDat.giaoDien);
    datMauDinh(!signedIn ? MAU_DINH.dangNhap
      : dangXemChiTiet ? (toi ? MAU_DINH.chiTietToi : MAU_DINH.chiTiet)
        : (toi ? MAU_DINH.appToi : MAU_DINH.app));
  }, [hydrated, signedIn, dangXemChiTiet, caiDat.giaoDien]);
  const [thongBaoLoi, setThongBaoLoi] = useState("");
  const [man, setMan] = useState<ManChinh>("home");
  const [boLoc, setBoLoc] = useState<BoLoc>(BO_LOC_DAU);
  /** Nút mắt trên hàng lọc: đang xem các thiết bị ĐÃ ẨN thay cho danh sách thường. */
  const [xemDaAn, setXemDaAn] = useState(false);

  const dongPanel = () => setPanel(null);
  // Thành phần này đứng NGOÀI `ChuProvider` nó dựng, nên tra bảng chữ trực tiếp theo ngôn ngữ.
  const chu = CHU[laMaNgonNgu(lang) ? lang : "vi"];

  /* ----------------------------- dữ liệu dẫn xuất ----------------------------- */

  const idDangMo = panel?.loai === "device" || panel?.loai === "hengio" ? panel.id : null;
  const thietBiDangMo = data.devices.find(device => device.id === idDangMo) || null;
  // Máy đã ẩn vẫn nằm trong `data.devices` (để tìm và hiện lại được) nhưng mọi danh sách,
  // bộ chọn thường đều chỉ thấy máy đang hiện — đúng như trước khi giữ lại máy ẩn.
  const thietBiHien = useMemo(() => data.devices.filter(device => !device.hidden), [data.devices]);
  const thietBiDaAn = useMemo(() => data.devices.filter(device => device.hidden), [data.devices]);
  /** Bản `data` chỉ có máy đang hiện — cho màn chia sẻ, nơi trước đây máy ẩn không có mặt. */
  const duLieuHien = useMemo(() => ({ ...data, devices: thietBiHien }), [data, thietBiHien]);
  const thietBiDaLoc = useMemo(() => locThietBi(xemDaAn ? thietBiDaAn : thietBiHien, boLoc), [xemDaAn, thietBiDaAn, thietBiHien, boLoc]);
  const cacNhom = useMemo(() => cacNhomCua(thietBiHien, data.spaces.groups), [thietBiHien, data.spaces.groups]);
  const danhSachLoc: Record<LoaiLoc, string[]> = { nha: data.spaces.houses, phong: data.spaces.rooms, nhom: cacNhom };
  const chuaDoc = notifications.filter(item => item.unread).length;

  /* ----------------------------- hành động ----------------------------- */

  function suaThietBi(id: string, sua: (device: Device) => Device) {
    setData(current => ({ ...current, devices: current.devices.map(device => device.id === id ? sua(device) : device) }));
  }

  /** Lỗi do đường truyền (mạng, 408, 5xx) — khác lỗi nghiệp vụ (quyền, giá trị sai) mà Bluetooth cũng từ chối y vậy. */
  const laLoiDuongWifi = (error: unknown) => error instanceof TypeError
    || (error instanceof IotxApiError && (error.status === 0 || error.status === 408 || error.status >= 500));

  /**
   * Gửi MỘT lệnh tới thiết bị qua kênh hợp lý — một cú bấm là đủ, người dùng không phải tự đổi kênh:
   *
   *   1. Lệnh đang phải đi Bluetooth (`phienDung`: mất Wi-Fi, hoặc người dùng chọn Bluetooth) →
   *      Bluetooth. Bluetooth rớt/im lặng mà máy còn Wi-Fi → xuống bước 3.
   *   2. Máy mất Wi-Fi, chưa có phiên → tự nối Bluetooth ngay trong cú bấm (`noiTuDong`) rồi gửi.
   *      Hộp chọn Bluetooth chỉ tự bật khi CHẮC mất Wi-Fi: máy chủ báo ngoại tuyến, mạch mất nhịp
   *      tim (`soatNhipTim`), hoặc chính điện thoại không gửi được yêu cầu. Chỉ nghi (bước 3) thì nối ngầm nếu được, không thì khối
   *      Bluetooth nhắc chạm — và lần bấm sau vẫn thử Wi-Fi lại, đúng thì tự gỡ nghi.
   *   3. Wi-Fi. Máy chủ chậm vài phút mới biết mạch mất Wi-Fi, nên với máy có đường Bluetooth app
   *      đợi mạch báo lại đúng giá trị vừa đặt (`CHO_WIFI_MS`, hỏi lại sớm cho nhanh). Không thấy,
   *      hoặc lỗi đường truyền → coi như mạch mất Wi-Fi: đánh dấu (`danhDauMatWifi`), nối Bluetooth
   *      — vẫn trong cú bấm nên được mở hộp chọn — rồi gửi lại lệnh qua đó. Chưa ghép (chưa có mã
   *      tem) thì báo để người dùng ghép một lần ở khối Bluetooth.
   *
   *      Im lặng chỉ được tính là mất Wi-Fi với mạch ĐÃ TỪNG báo lại lệnh qua Wi-Fi (`daBietBaoLai`).
   *      Mạch chưa báo lại lần nào — mạch thử chưa nối điều hoà, mạch chưa có telemetry — thì im lặng
   *      là chuyện thường của nó; coi là mất Wi-Fi thì lần bấm nào cũng bật hộp chọn Bluetooth. Lần
   *      đầu mạch báo lại, app ghi nhớ (`nhoBaoLai`).
   *
   * Ném lỗi khi không kênh nào nhận lệnh; người gọi hoàn tác giao diện.
   */
  async function guiQuaKenh(id: string, truoc: Device | undefined, method: string, key: string, value: unknown) {
    const params = { [key]: value };
    // Đang "Kết nối trực tiếp" (components/ble/KetNoiBle.tsx, GATT theo docs/yeu-cau-firmware-ble.md):
    // lệnh đi kênh đó; đứt giữa chừng thì `rpcTheoDuong` tự gửi lại qua /v1 với cùng khoá.
    if (isIotxMode && bleDangNoi(id)) {
      ghiNhanLenh(id, key, value);
      try { await rpcTheoDuong(id, method, params); }
      catch (error) { boGhiNhanLenh(id, key); throw error; }
      return;
    }
    let daQuaBle = false;
    // Nhật ký từng quyết định — để soát trên máy thật khi kênh chọn sai (F12 → Console, lọc "[kenh]").
    if (truoc) console.info("[kenh]", id, "bấm", method, {
      mayChuNoiTrucTuyen: truoc.online, coWifi: coWifi(truoc), chacMatWifi: matWifiChac(id),
      phienBle: Boolean(phienBle(id)), phienDung: Boolean(phienDung(truoc)),
    });
    const ble = !truoc ? phienBle(id)
      : phienDung(truoc) ?? (coWifi(truoc) ? undefined : await noiTuDong(truoc, !truoc.online || matWifiChac(id)).catch(error => {
        console.info("[kenh]", id, "tự nối Bluetooth hỏng:", error instanceof Error ? `${error.name}: ${error.message}` : error);
        return undefined;
      }));
    if (truoc && !coWifi(truoc)) console.info("[kenh]", id, ble ? "gửi qua Bluetooth" : "chưa có Bluetooth — thử Wi-Fi");
    if (ble) {
      try { await ble.gui(method, params); return; }
      catch (error) {
        if (!(truoc && coWifi(truoc) && laLoiDuongBle(error))) throw error;
        daQuaBle = true;
      }
    }
    if (!isIotxMode) return;

    const coDuongLui = !daQuaBle && truoc !== undefined && coWebBluetooth() && coDuongBle(truoc);
    // Đặt lại đúng giá trị máy đang có thì mạch chẳng có gì mới để báo — đợi là báo nhầm.
    const doiXacNhan = coDuongLui && String(truoc.lastValues?.[key] ?? "") !== String(value ?? "")
      ? choXacNhan(id, key, value, CHO_WIFI_MS) : undefined;
    if (doiXacNhan) void doiXacNhan.then(ok => { if (ok) nhoBaoLai(id); });
    // Chỉ chờ (và coi im lặng là mất Wi-Fi) khi mạch đã từng báo lại; chưa thì vẫn đợi ngầm để học.
    const xacNhan = doiXacNhan && daBietBaoLai(id) ? doiXacNhan : undefined;
    // Ghi sổ để nhịp hỏi lại không đè giá trị cũ của máy chủ lên nút vừa bấm.
    ghiNhanLenh(id, key, value);
    const ketQuaRpc = iotxClient.rpc(id, method, params).then(() => undefined, (error: unknown) => error ?? new Error("rpc"));
    if (doiXacNhan) for (const sau of [1_200, 2_400]) setTimeout(() => { void refreshDevices().catch(() => undefined); }, sau);
    const ketQua = await new Promise<{ ok: boolean; loi?: unknown }>(xong => {
      void ketQuaRpc.then(loi => { if (loi) xong({ ok: false, loi }); else if (!xacNhan) xong({ ok: true }); });
      void xacNhan?.then(ok => xong({ ok }));
    });
    if (ketQua.ok) return;
    if (ketQua.loi !== undefined && !(coDuongLui && laLoiDuongWifi(ketQua.loi))) {
      boGhiNhanLenh(id, key);
      throw ketQua.loi;
    }
    if (!coDuongLui) return;

    // Điện thoại không gửi nổi yêu cầu (TypeError) là CHẮC; máy chủ trả 5xx/hết giờ hay mạch không
    // báo lại chỉ là NGHI — mạch có thể vẫn còn Wi-Fi mà không báo trạng thái.
    // `iotxClient` gói "máy mất mạng" thành IotxApiError(0, "offline") — cũng là CHẮC.
    const chacChan = ketQua.loi instanceof TypeError
      || (ketQua.loi instanceof IotxApiError && ketQua.loi.status === 0) || matWifiChac(id);
    console.info("[kenh]", id, chacChan ? "điện thoại mất mạng" : "nghi mạch mất Wi-Fi:",
      ketQua.loi !== undefined ? moTaLoi(ketQua.loi) : `không thấy mạch báo lại ${key}=${String(value)} trong ${CHO_WIFI_MS} ms`);

    // Mạch im lặng qua Wi-Fi → Bluetooth. Khối Bluetooth đổi theo dấu này: chưa ghép thì nó nhắc
    // nhập mã tem một lần; lệnh qua Wi-Fi khi đó vẫn được giữ như thường (`SoLenhCho`).
    danhDauMatWifi(id);
    let phien = phienBle(id);
    if (!phien) {
      try { phien = await noiTuDong(truoc, chacChan); }
      catch (error) {
        console.info("[kenh]", id, "nối Bluetooth hỏng:", error instanceof Error ? `${error.name}: ${error.message}` : error);
        boGhiNhanLenh(id, key);
        // Sai mã, bị khoá… thì nói đúng lỗi đó; hộp chọn bị đóng hay hết hạn cú bấm thì nhắc chạm.
        throw error instanceof LoiBle && error.ma !== "can_cham" ? error : loiBle("khong_phan_hoi");
      }
    }
    console.info("[kenh]", id, phien ? "gửi lại qua Bluetooth" : "không nối được Bluetooth (chưa có mã tem, hoặc cần chạm)");
    if (!phien) return;
    // Giá trị giờ đến từ Bluetooth (`apTrangThaiBle`), không đợi máy chủ nữa.
    boGhiNhanLenh(id, key);
    await phien.gui(method, params);
  }

  /**
   * Cập nhật lạc quan: đổi giao diện trước cho nút phản hồi tức thì, rồi mới gọi máy chủ.
   * Chế độ mock không có máy chủ nên dừng sau bước đổi giao diện. Hỏng thì hoàn tác về
   * đúng ảnh chụp trước khi bấm và báo lỗi.
   */
  async function lacQuan(apDung: () => void, goiMayChu: () => Promise<unknown>, hoanTac: () => void) {
    apDung();
    if (!isIotxMode) return;
    try { await goiMayChu(); }
    catch (error) {
      hoanTac();
      setThongBaoLoi(moTaLoi(error));
    }
  }

  async function doiNguon(id: string) {
    const truoc = data.devices.find(device => device.id === id);
    if (!truoc) return;
    // Khóa nguồn thật của catalog là `ac_power_status`, `fan_power`… chứ không phải `power`.
    // Dò theo `slots[...].variant === "power01"` như bản tham chiếu, không dò theo tên.
    const capNguon = capNguonCua(truoc.product);
    // Sản phẩm không khai nguồn điện thì không có lệnh nào để gửi; đoán "setPower" chỉ để
    // máy chủ từ chối. Thẻ thiết bị cũng không vẽ công tắc trong trường hợp này.
    if (isIotxMode && !capNguon?.rpc) return;
    // Đổi giao diện trước cho nút phản hồi tức thì; kênh gửi do `guiQuaKenh` chọn.
    suaThietBi(id, device => ({ ...device, on: !device.on, lastValues: { ...device.lastValues, [capNguon?.key || "power"]: !device.on } }));
    if (!capNguon?.rpc) return;
    // Ghi sổ như `guiLenh` (trong `guiQuaKenh`): không thì nhịp hỏi lại về trước phản hồi của
    // mạch sẽ lật công tắc trên thẻ về trạng thái cũ, rồi một giây sau lại bật — đúng bệnh nháy.
    try { await guiQuaKenh(id, truoc, capNguon.rpc, capNguon.key, !truoc.on); }
    catch (error) {
      suaThietBi(id, () => truoc);
      setThongBaoLoi(moTaLoi(error));
    }
  }

  async function doiGhim(id: string) {
    const truoc = data.devices.find(device => device.id === id);
    if (!truoc) return;
    await lacQuan(
      () => suaThietBi(id, device => ({ ...device, fav: !device.fav })),
      () => iotxClient.updateDevice(id, { fav: !truoc.fav }),
      () => suaThietBi(id, () => truoc),
    );
  }

  /**
   * Đổi tên / gán chỗ / ghim — cùng một cửa `PATCH /devices/{id}`.
   *
   * Vẽ ngay rồi mới gửi, vì ba thao tác này người dùng kỳ vọng thấy liền tay. Hỏng thì trả
   * về nguyên trạng và ném lỗi ra cho màn chi tiết hiện câu của máy chủ.
   *
   * Tên chỗ mới gõ ra được nhét luôn vào `spaces`, nếu không thì nó biến mất khỏi ô chọn
   * ngay sau khi lưu và người dùng tưởng là hỏng.
   */
  async function suaThongTinThietBi(id: string, patch: { label?: string; house?: string; room?: string; grp?: string; fav?: boolean }) {
    const truoc = data.devices.find(device => device.id === id);
    setData(current => ({
      ...current,
      spaces: {
        houses: patch.house ? [...new Set([...current.spaces.houses, patch.house])] : current.spaces.houses,
        rooms: patch.room ? [...new Set([...current.spaces.rooms, patch.room])] : current.spaces.rooms,
        groups: patch.grp ? [...new Set([...current.spaces.groups, patch.grp])] : current.spaces.groups,
      },
      devices: current.devices.map(device => device.id !== id ? device : {
        ...device,
        name: patch.label ?? device.name,
        house: patch.house ?? device.house,
        room: patch.room ?? device.room,
        group: patch.grp ?? device.group,
        fav: patch.fav ?? device.fav,
      }),
    }));
    if (!isIotxMode) return;
    try { await iotxClient.updateDevice(id, patch); }
    catch (error) {
      if (truoc) setData(current => ({ ...current, devices: current.devices.map(d => d.id === id ? truoc : d) }));
      throw error;
    }
  }

  /**
   * Gửi một lệnh theo capability. Đổi giao diện trước cho nút phản hồi tức thì; hỏng thì
   * trả lại đúng trạng thái cũ và ném lỗi ra để panel hiện ngay cạnh control vừa bấm.
   */
  async function guiLenh(id: string, capability: IotxCapability, value: unknown) {
    if (!capability.rpc) return;
    const truoc = data.devices.find(device => device.id === id);
    // Cùng một hàm suy với /bootstrap và với SSE — không so tên khóa tại chỗ nữa.
    suaThietBi(id, device => apGiaTri(device, { [capability.key]: value }));
    // Kênh do `guiQuaKenh` chọn: Wi-Fi ưu tiên, Bluetooth khi mạch mất Wi-Fi hoặc người dùng chọn.
    // Bluetooth dùng cùng `method`/`params` như RPC qua `/v1` (xem lib/ble/dieuKhienBle.ts).
    try { await guiQuaKenh(id, truoc, capability.rpc, capability.key, value); }
    catch (error) {
      if (truoc) suaThietBi(id, () => truoc);
      throw error;
    }
  }

  /** Tải lại danh sách luật sau một thao tác; hỏng thì thôi, lần đồng bộ sau sẽ bù. */
  const taiLuatNgam = () => { void taiLuat().catch(() => undefined); };

  async function batTatLuat(rule: IotxRule) {
    const moi = !rule.enabled;
    setLuat(cu => cu.map(r => r.id === rule.id ? { ...r, enabled: moi } : r));
    try {
      await iotxClient.updateRule(rule.id, { enabled: moi });
      await taiLuat();
    } catch (error) {
      setLuat(cu => cu.map(r => r.id === rule.id ? rule : r));
      setThongBaoLoi(moTaLoi(error));
    }
  }

  async function xoaLuat(rule: IotxRule) {
    setLuat(cu => cu.filter(r => r.id !== rule.id));
    try { await iotxClient.deleteRule(rule.id); }
    catch (error) { setThongBaoLoi(moTaLoi(error)); taiLuatNgam(); }
  }

  async function chayLuat(rule: IotxRule) {
    try { await iotxClient.chayLuatNgay(rule.id); taiLuatNgam(); }
    catch (error) { setThongBaoLoi(moTaLoi(error)); }
  }

  /** Dừng chương trình nhiều giai đoạn đang chạy (`POST /rules/{id}/stop`). */
  async function dungLuat(rule: IotxRule) {
    try { await iotxClient.dungLuat(rule.id); taiLuatNgam(); }
    catch (error) { setThongBaoLoi(moTaLoi(error)); }
  }

  function moThongBao() {
    setNotifications(items => items.map(item => ({ ...item, unread: false })));
    if (isIotxMode) void iotxClient.readNotifications().catch(() => undefined);
    setPanel({ loai: "notif" });
  }

  async function xoaThongBao(id: string) {
    setNotifications(items => items.filter(item => item.id !== id));
    if (isIotxMode) await iotxClient.deleteNotification(id).catch(() => undefined);
  }

  /**
   * Lệnh trên một mục của capability kiểu `list`. Máy chủ giữ danh sách (gộp mạch + máy
   * chủ) nên sau khi gửi phải lấy lại thiết bị chứ không tự sửa tại chỗ. Lỗi ném ra để màn
   * chi tiết hiện cạnh khối vật tư và giữ ô đang sửa mở.
   */
  async function guiVatTu(id: string, capability: IotxCapability, lenh: IotxLenhVatTu) {
    if (!isIotxMode) {
      // Mock không có máy chủ: tự dựng lại danh sách để thao tác vẫn thấy được kết quả.
      suaThietBi(id, device => {
        const cu = Array.isArray(device.lastValues?.[capability.key]) ? [...(device.lastValues![capability.key] as IotxMucVatTu[])] : [];
        let moi = cu;
        if (lenh.kieu === "thay") moi = cu.map(m => String(m.id) === lenh.id ? { ...m, phanTram: 100, conLai: m.tuoiTho } : m);
        if (lenh.kieu === "tuoi") moi = cu.map(m => String(m.id) === lenh.id ? { ...m, tuoiTho: lenh.tuoiTho } : m);
        if (lenh.kieu === "bo") moi = cu.filter(m => String(m.id) !== lenh.id);
        if (lenh.kieu === "them") moi = [...cu, { id: `vt${Date.now()}`, ten: lenh.ten || lenh.serial || chu.supplies_new, tuoiTho: 365, phanTram: 100, xacThuc: Boolean(lenh.serial) }];
        return { ...device, lastValues: { ...device.lastValues, [capability.key]: moi } };
      });
      return;
    }
    await iotxClient.lenhMucVatTu(id, capability.key, lenh);
    // Lệnh đã tới máy chủ; lấy lại danh sách hỏng thì nhịp đồng bộ sau sẽ bù.
    await refreshDevices().catch(() => undefined);
  }

  /**
   * Ẩn thiết bị khỏi danh sách. Hợp đồng chỉ có `hidden` — thiết bị vẫn ghép nối, không
   * có cửa nào "xoá" hẳn ở phía người dùng cuối.
   */
  async function datAn(id: string, hidden: boolean) {
    const truoc = data.devices;
    await lacQuan(
      () => {
        setData(current => ({ ...current, devices: current.devices.map(device => device.id === id ? { ...device, hidden } : device) }));
        dongPanel();
      },
      () => iotxClient.updateDevice(id, { hidden }),
      () => setData(current => ({ ...current, devices: truoc })),
    );
  }

  async function xoaHetThongBao() {
    const cu = notifications;
    setNotifications([]);
    if (isIotxMode) await Promise.all(cu.map(item => iotxClient.deleteNotification(item.id).catch(() => undefined)));
  }

  function dangXuat() {
    sessionStorage.removeItem("livotec-session");
    iotxClient.logout();
    setSignedIn(false);
    setPanel(null);
    setMan("home");
  }

  async function xongDangNhap() {
    if (isIotxMode) await syncRemote();
    setSignedIn(true);
  }

  function chonMenu(muc: MucMenu) {
    if (muc === "devices") { setMan("devices"); dongPanel(); return; }
    // Hẹn giờ là chuyện của TỪNG thiết bị (`/devices/{id}/hen-gio`), nên phải chọn máy trước.
    if (muc === "timers") { setPanel({ loai: "chonThietBi" }); return; }
    setPanel({ loai: muc });
  }

  /** Bật nút mắt thì sang màn Thiết bị, như chọn một mục lọc — trang chủ luôn là máy đang hiện. */
  function doiXemDaAn() {
    const moi = !xemDaAn;
    setXemDaAn(moi);
    if (moi) setMan("devices");
  }

  /** Chọn một mục lọc thì sang màn Thiết bị — trang chủ luôn hiện đủ thiết bị. */
  function chonLoc(loai: LoaiLoc, ten: string) {
    setBoLoc(cu => ({ ...cu, [loai]: ten }));
    dongPanel();
    setMan("devices");
  }

  /**
   * Bộ hành động trên thẻ thiết bị phải GIỮ NGUYÊN tham chiếu qua các lần vẽ, nếu không thẻ
   * `memo` vẽ lại hết ở mỗi nhịp đồng bộ. Hàm thật đọc `data` mới nhất, nên đi qua ref được
   * cập nhật sau mỗi lần vẽ; bộ đưa xuống thẻ chỉ chuyển tiếp vào đó.
   */
  const hanhDongMoiNhat = useRef<HanhDongThietBi | null>(null);
  useEffect(() => {
    hanhDongMoiNhat.current = {
      onMo: id => setPanel({ loai: "device", id }),
      onNguon: id => { void doiNguon(id); },
      onGhim: id => { void doiGhim(id); },
    };
  });
  const hanhDongThietBi = useMemo<HanhDongThietBi>(() => ({
    onMo: id => hanhDongMoiNhat.current?.onMo(id),
    onNguon: id => hanhDongMoiNhat.current?.onNguon(id),
    onGhim: id => hanhDongMoiNhat.current?.onGhim(id),
  }), []);
  const hanhDongLuat: HanhDongLuat = {
    batTat: rule => { void batTatLuat(rule); },
    xoa: rule => { void xoaLuat(rule); },
    chay: rule => { void chayLuat(rule); },
    dung: rule => { void dungLuat(rule); },
  };
  const hangLoc = (
    <FilterRow boLoc={boLoc} xemDaAn={xemDaAn} onChon={loai => setPanel({ loai: "loc", boLoc: loai })} onXemDaAn={doiXemDaAn} />
  );

  function manChinh() {
    switch (man) {
      case "devices":
        return <ManThietBi devices={thietBiDaLoc} hangLoc={hangLoc} xemDaAn={xemDaAn} hanhDong={hanhDongThietBi} onThem={() => setPanel({ loai: "add" })} />;
      case "automation":
        return (
          <ManTuDong
            luat={luat}
            luatTuThietBi={luatTuThietBi}
            tranLuat={theme?.quotas?.rules ?? profile?.theme?.quotas?.rules ?? 20}
            hanhDong={hanhDongLuat}
            onTaoNeuThi={() => setPanel({ loai: "if-editor" })}
            onTaoTheoGio={() => setPanel({ loai: "chonThietBi" })}
          />
        );
      case "services":
        return <ManDichVu onPlaceholder={tieuDe => setPanel({ loai: "placeholder", tieuDe })} />;
      case "discover":
        return <ManKhamPha logoUrl={theme?.logoUrl ?? null} />;
      default:
        return <ManTrangChu devices={thietBiHien} hangLoc={hangLoc} hanhDong={hanhDongThietBi} />;
    }
  }

  /** Popup chọn của popup tài khoản. Chọn xong là áp ngay và quay về popup tài khoản. */
  function popupChon(muc: MucChon) {
    const veMenu = () => setPanel({ loai: "profile" });
    if (muc === "ngonNgu") {
      return (
        <ChonModal khoaTieuDe="menu_ngon_ngu" dangChon={lang} onClose={veMenu}
          luaChon={dsNgonNgu(lang, boChu.langs).map(ma => ({ giaTri: ma, nhan: tenNgonNgu(ma), anh: anhCoNgonNgu(ma) }))}
          onChon={ma => { doiNgonNgu(ma); veMenu(); }} />
      );
    }
    if (muc === "coChu") {
      return (
        <ChonModal khoaTieuDe="chu_co" dangChon={caiDat.coChu} onClose={veMenu}
          luaChon={DS_CO_CHU.map(co => ({ giaTri: co, khoa: NHAN_CO_CHU[co] }))}
          onChon={co => { suaCaiDat({ coChu: co as CoChu }); veMenu(); }}
          phuLuc={<XemTruocCoChu />} />
      );
    }
    return (
      <ChonModal khoaTieuDe="menu_giao_dien" dangChon={caiDat.giaoDien} onClose={veMenu}
        luaChon={DS_GIAO_DIEN.map(gd => ({ giaTri: gd, khoa: NHAN_GIAO_DIEN[gd] }))}
        onChon={gd => { suaCaiDat({ giaoDien: gd as GiaoDien }); veMenu(); }} />
    );
  }

  /* ----------------------------- render ----------------------------- */

  if (!hydrated) {
    return <div className="splash"><div className="brand-mark"><Home /></div><span>{chu.splash_loading}</span></div>;
  }

  return (
    <ChuProvider lang={lang} boChu={boChu}>
        {!signedIn ? (
          <div className="stage"><div className="app-shell">
            <LoginScreen
              onDone={xongDangNhap}
              logoUrl={theme?.logoUrl ?? null}
              lang={lang}
              langs={boChu.langs}
              onLang={doiNgonNgu}
            />
          </div></div>
        ) : (
          <div className="stage"><div className="app-shell">
            <TopBar
              ten={tenHienThi(profile)}
              chuaDoc={caiDat.thongBao ? chuaDoc : 0}
              onProfile={() => setPanel({ loai: "profile" })}
              onNotif={moThongBao}
              onMenu={() => setPanel({ loai: "drawer" })}
            />

            {manChinh()}

            <BottomNav active={man} onChon={next => { setMan(next); dongPanel(); }} />

            {/* Mất máy chủ (docs/viec-pwa.md 3.3): dải cố định thay cho toast lỗi đồng bộ — câu đó
                giờ thừa, dải đã nói rồi. Lỗi lệnh (`thongBaoLoi`) vẫn hiện, xếp phía trên dải. */}
            {matMayChu && (
              <div className="mat-ket-noi" role="status">
                <span><strong>{chu.mat_ket_noi}</strong>{chu.mat_ket_noi_mo_ta}</span>
                <button onClick={() => void thuKetNoiLai()}>{chu.bh_thu_lai}</button>
              </div>
            )}
            {(thongBaoLoi || (loiDongBo && !matMayChu)) && (
              <div className={matMayChu ? "toast-loi tren-dai" : "toast-loi"} role="status">
                <span>{thongBaoLoi || loiDongBo}</span>
                <button aria-label={chu.toast_close} onClick={() => { setThongBaoLoi(""); setLoiDongBo(""); }}>×</button>
              </div>
            )}

            {panel?.loai === "drawer" && (
              <MenuDrawer phienBan={`v1.0 · ${iotxConfig.tenant}`} onClose={dongPanel} onChon={chonMenu} />
            )}
            {panel?.loai === "profile" && (
              <TaiKhoanPopup
                ten={tenHienThi(profile)}
                email={profile?.email || ""}
                lang={lang}
                caiDat={caiDat}
                onCaiDat={suaCaiDat}
                onClose={dongPanel}
                onDoiTen={() => setPanel({ loai: "doiTen" })}
                onDoiAnh={() => setPanel({ loai: "doiAnh" })}
                onDoiMatKhau={() => setPanel({ loai: "doiMatKhau" })}
                onMoChon={muc => setPanel({ loai: "chon", muc })}
                onDangXuat={dangXuat}
              />
            )}
            {/* Hai hộp mở từ popup tài khoản: đóng là quay lại popup, như đi một bước vào trong rồi lùi ra. */}
            {panel?.loai === "doiMatKhau" && <DoiMatKhauModal onClose={() => setPanel({ loai: "profile" })} />}
            {panel?.loai === "doiTen" && <DoiTenModal tenHienTai={tenHienThi(profile)} onClose={() => setPanel({ loai: "profile" })} />}
            {panel?.loai === "doiAnh" && <DoiAnhModal onClose={() => setPanel({ loai: "profile" })} />}
            {panel?.loai === "chon" && popupChon(panel.muc)}
            {panel?.loai === "notif" && (
              <NotifModal
                items={notifications}
                onClose={dongPanel}
                onXoa={id => { void xoaThongBao(id); }}
                onXoaHet={() => { void xoaHetThongBao(); }}
              />
            )}
            {panel?.loai === "loc" && (
              <LocPickerModal
                {...HOP_LOC[panel.boLoc]}
                dangChon={boLoc[panel.boLoc]}
                danhSach={danhSachLoc[panel.boLoc]}
                onClose={dongPanel}
                onChon={ten => chonLoc(panel.boLoc, ten)}
              />
            )}
            {panel?.loai === "placeholder" && <PlaceholderModal title={panel.tieuDe} onClose={dongPanel} />}

            {panel?.loai === "device" && thietBiDangMo && (
              <DeviceDetail
                device={thietBiDangMo}
                onClose={dongPanel}
                onCommand={(capability, value) => guiLenh(thietBiDangMo.id, capability, value)}
                onAn={() => { void datAn(thietBiDangMo.id, true); }}
                onHienLai={() => { void datAn(thietBiDangMo.id, false); }}
                onVatTu={(capability, lenh) => guiVatTu(thietBiDangMo.id, capability, lenh)}
                onHenGio={() => setPanel({ loai: "hengio", id: thietBiDangMo.id, tuChiTiet: true })}
                spaces={data.spaces}
                onSua={patch => suaThongTinThietBi(thietBiDangMo.id, patch)}
                nutBle={<NutKetNoiBle device={thietBiDangMo} />}
                bangBle={<BangBle device={thietBiDangMo} />}
              />
            )}

            {panel?.loai === "spaces" && <Spaces data={data} setData={setData} onClose={dongPanel} />}
            {panel?.loai === "members" && <Members data={duLieuHien} daCap={chiaSeDaCap} nhanDuoc={chiaSeNhanDuoc} onReload={taiChiaSe} onClose={dongPanel} />}
            {panel?.loai === "add" && <AddDevice data={data} setData={setData} onSynced={syncRemote} onClose={dongPanel} />}
            {panel?.loai === "chonThietBi" && (
              <DevicePickerModal
                danhSach={thietBiHien.map(device => ({ id: device.id, name: device.name, room: device.room }))}
                onClose={dongPanel}
                onChon={id => setPanel({ loai: "hengio", id })}
              />
            )}
            {/* Nút trở lại trả người dùng về đúng chỗ vừa rời: màn chi tiết nếu mở từ đó, còn mở
                từ menu "Hẹn giờ" hay nút "Theo thời gian" thì đóng hẳn. */}
            {panel?.loai === "hengio" && thietBiDangMo && (
              <HenGioPanel
                device={thietBiDangMo}
                onClose={() => setPanel(panel.tuChiTiet ? { loai: "device", id: thietBiDangMo.id } : null)}
              />
            )}
            {panel?.loai === "virtual" && <VirtualPanel onClose={dongPanel} onThayDoi={syncRemote} />}
            {panel?.loai === "if-editor" && <IfThenEditor devices={thietBiHien} onSaved={taiLuat} onClose={dongPanel} />}
          </div></div>
        )}
    </ChuProvider>
  );
}
