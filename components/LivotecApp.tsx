"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Home } from "lucide-react";
import type { Device } from "@/lib/types";
import { apGiaTri, iotxClient, iotxConfig, isIotxMode, moTaLoi } from "@/lib/iotx";
import type { IotxCapability, IotxLenhVatTu, IotxMucVatTu, IotxRule } from "@/lib/iotx/contracts";
import IfThenEditor from "@/components/automation/IfThenEditor";
import VirtualPanel from "@/components/virtual/VirtualPanel";
import { AddDevice } from "@/components/manage/AddDevice";
import { Members } from "@/components/manage/Members";
import { Spaces } from "@/components/manage/Spaces";
import { ChuProvider } from "@/components/newui/chu";
import { BottomNav, TopBar, type ManChinh } from "@/components/newui/shell";
import { FilterRow } from "@/components/newui/home";
import {
  ManDichVu, ManKhamPha, ManThietBi, ManTrangChu, ManTuDong, type HanhDongLuat, type HanhDongThietBi,
} from "@/components/newui/ManChinh";
import { BO_LOC_DAU, cacNhomCua, locThietBi, type BoLoc, type LoaiLoc } from "@/lib/newui/boLoc";
import { capNguonCua } from "@/lib/newui/khuon";
import { CHU, laMaNgonNgu } from "@/lib/newui/strings";
import {
  ChonModal, DevicePickerModal, XemTruocCoChu, DoiAnhModal, DoiMatKhauModal, DoiTenModal, LocPickerModal, MenuDrawer, NotifModal, PlaceholderModal, TaiKhoanPopup,
  NHAN_CO_CHU, NHAN_GIAO_DIEN, type MucChon, type MucMenu,
} from "@/components/newui/modals";
import DeviceDetail from "@/components/newui/device/DeviceDetail";
import HenGioPanel from "@/components/newui/device/HenGioPanel";
import LoginScreen from "@/components/newui/LoginScreen";
import { useDuLieuIotx, tenHienThi } from "@/hooks/useDuLieuIotx";
import { DS_CO_CHU, DS_GIAO_DIEN, useCaiDat, type CoChu, type GiaoDien } from "@/lib/newui/caiDat";
import { coNgonNgu, dsNgonNgu, tenNgonNgu } from "@/lib/newui/ngonNgu";

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
    notifications, setNotifications, chiaSeNhanDuoc, chiaSeDaCap,
    luat, setLuat, luatTuThietBi, taiLuat,
    doiNgonNgu, syncRemote, taiChiaSe, refreshDevices, ghiNhanLenh, boGhiNhanLenh,
  } = useDuLieuIotx({ xemKy: panel?.loai === "device" });

  // Giao diện tối, cỡ/kiểu chữ chỉ áp sau đăng nhập — màn đăng nhập có bảng màu riêng.
  const [caiDat, suaCaiDat] = useCaiDat(hydrated && signedIn);
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
    await lacQuan(
      () => suaThietBi(id, device => ({ ...device, on: !device.on, lastValues: { ...device.lastValues, [capNguon?.key || "power"]: !device.on } })),
      async () => {
        // Ghi sổ như `guiLenh`: không thì nhịp hỏi lại về trước phản hồi của mạch sẽ lật
        // công tắc trên thẻ về trạng thái cũ, rồi một giây sau lại bật — đúng bệnh nháy.
        const { key, rpc } = capNguon!;
        ghiNhanLenh(id, key, !truoc.on);
        try { await iotxClient.rpc(id, rpc!, { [key]: !truoc.on }); }
        catch (error) { boGhiNhanLenh(id, key); throw error; }
      },
      () => suaThietBi(id, () => truoc),
    );
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
    if (!isIotxMode) return;
    // Ghi sổ để nhịp hỏi lại không đè giá trị cũ của máy chủ lên nút vừa bấm.
    ghiNhanLenh(id, capability.key, value);
    try { await iotxClient.rpc(id, capability.rpc, { [capability.key]: value }); }
    catch (error) {
      boGhiNhanLenh(id, capability.key);
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
          luaChon={dsNgonNgu(lang, boChu.langs).map(ma => ({ giaTri: ma, nhan: `${coNgonNgu(ma)} ${tenNgonNgu(ma)}` }))}
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
          <div className="app-shell"><div className="phone">
            <LoginScreen
              onDone={xongDangNhap}
              logoUrl={theme?.logoUrl ?? null}
              lang={lang}
              langs={boChu.langs}
              onLang={doiNgonNgu}
            />
          </div></div>
        ) : (
          <div className="app-shell"><div className="phone">
            <TopBar
              ten={tenHienThi(profile)}
              chuaDoc={caiDat.thongBao ? chuaDoc : 0}
              onProfile={() => setPanel({ loai: "profile" })}
              onNotif={moThongBao}
              onMenu={() => setPanel({ loai: "drawer" })}
            />

            {manChinh()}

            <BottomNav active={man} onChon={next => { setMan(next); dongPanel(); }} />

            {(thongBaoLoi || loiDongBo) && (
              <div className="toast-loi" role="status">
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
