"use client";

import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import { Home } from "lucide-react";
import type { AppData } from "@/lib/storage";
import type { Device } from "@/lib/types";
import { iotxClient, iotxConfig, isIotxMode, moTaLoi, suyDanXuat } from "@/lib/iotx";
import type { IotxCapability, IotxLenhVatTu, IotxMucVatTu, IotxRule, IotxRules } from "@/lib/iotx/contracts";
import IfThenEditor from "@/components/automation/IfThenEditor";
import VirtualPanel from "@/components/virtual/VirtualPanel";
import { AddDevice, Members, Spaces } from "@/components/manage/panels";
import Icon from "@/components/newui/Icon";
import RuleCard from "@/components/newui/RuleCard";
import { ChuProvider, useChu } from "@/components/newui/chu";
import { BottomNav, TopBar, type ManChinh } from "@/components/newui/shell";
import { BannerCarousel, DeviceCard, FilterRow } from "@/components/newui/home";
import { nhomCuaThietBi } from "@/lib/newui/uiType";
import { capNguonCua } from "@/lib/newui/khuon";
import {
  DevicePickerModal, LocPickerModal, MenuDrawer, NotifModal, PlaceholderModal, ProfileModal, ToastModal,
  type MucMenu,
} from "@/components/newui/modals";
import DeviceDetail from "@/components/newui/device/DeviceDetail";
import HenGioPanel from "@/components/newui/device/HenGioPanel";
import LoginScreen from "@/components/newui/LoginScreen";
import { IMG } from "@/lib/newui/assets";
import { useDuLieuIotx, tenHienThi } from "@/hooks/useDuLieuIotx";

type Panel =
  | null | "drawer" | "profile" | "notif" | "housePicker" | "roomPicker" | "groupPicker" | "placeholder" | "toast"
  | "device" | "spaces" | "members" | "add" | "hengio" | "chonThietBi" | "virtual" | "if-editor";

export default function LivotecApp() {
  // Khai trước lời gọi hook: nhịp hỏi lại trạng thái nhanh hơn khi màn chi tiết đang mở.
  const [panel, setPanel] = useState<Panel>(null);

  const {
    hydrated, data, setData, signedIn, setSignedIn, profile, theme, boChu, lang,
    notifications, setNotifications, chiaSeNhanDuoc, chiaSeDaCap,
    luat, setLuat, luatTuThietBi, setLuatTuThietBi,
    doiNgonNgu, syncRemote, taiChiaSe, refreshDevices, ghiNhanLenh, boGhiNhanLenh,
  } = useDuLieuIotx({ xemKy: panel === "device" });

  const [thongBaoLoi, setThongBaoLoi] = useState("");
  const [man, setMan] = useState<ManChinh>("home");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [nha, setNha] = useState("all");
  const [phong, setPhong] = useState("all");
  const [nhom, setNhom] = useState("all");
  const [gonGang, setGonGang] = useState(false);
  const [cauPhu, setCauPhu] = useState("");

  /* ----------------------------- dữ liệu dẫn xuất ----------------------------- */

  const thietBiDangMo = data.devices.find(device => device.id === deviceId) || null;
  /**
   * Ba bộ lọc cộng dồn. Nhóm lấy từ `product.category` của catalog chứ không suy ra từ loại
   * giao diện, nên hãng đổi cách xếp nhóm là danh sách đổi theo mà không phải sửa mã.
   */
  const thietBiTheoPhong = useMemo(
    () => data.devices.filter(device =>
      (nha === "all" || device.house === nha) &&
      (phong === "all" || device.room === phong) &&
      (nhom === "all" || nhomCuaThietBi(device) === nhom)),
    [data.devices, nha, phong, nhom],
  );

  /** Danh sách nhóm dựng từ chính thiết bị đang có, hợp với danh sách khai trong spaces. */
  const cacNhom = useMemo(() => {
    const bo = new Set<string>(data.spaces.groups ?? []);
    data.devices.forEach(device => bo.add(nhomCuaThietBi(device)));
    return [...bo].filter(Boolean).sort((a, b) => a.localeCompare(b, "vi"));
  }, [data.devices, data.spaces.groups]);
  const chuaDoc = notifications.filter(item => item.unread).length;

  /* ----------------------------- hành động ----------------------------- */

  async function doiNguon(id: string) {
    const truoc = data.devices.find(device => device.id === id);
    if (!truoc) return;
    // Khóa nguồn thật của catalog là `ac_power_status`, `fan_power`… chứ không phải `power`.
    // Dò theo `slots[...].variant === "power01"` như bản tham chiếu, không dò theo tên.
    const capNguon = capNguonCua(truoc.product);
    // Sản phẩm không khai nguồn điện thì không có lệnh nào để gửi; đoán "setPower" chỉ để
    // máy chủ từ chối. Thẻ thiết bị cũng không vẽ công tắc trong trường hợp này.
    if (isIotxMode && !capNguon?.rpc) return;
    setData(current => ({ ...current, devices: current.devices.map(device => device.id === id ? { ...device, on: !device.on, lastValues: { ...device.lastValues, [capNguon?.key || "power"]: !device.on } } : device) }));
    if (!isIotxMode) return;
    try { await iotxClient.rpc(id, capNguon!.rpc!, { [capNguon!.key]: !truoc.on }); }
    catch (error) {
      setData(current => ({ ...current, devices: current.devices.map(device => device.id === id ? truoc : device) }));
      setThongBaoLoi(moTaLoi(error));
    }
  }

  async function doiGhim(id: string) {
    const truoc = data.devices.find(device => device.id === id);
    if (!truoc) return;
    setData(current => ({ ...current, devices: current.devices.map(device => device.id === id ? { ...device, fav: !device.fav } : device) }));
    if (!isIotxMode) return;
    try { await iotxClient.updateDevice(id, { fav: !truoc.fav }); }
    catch (error) {
      setData(current => ({ ...current, devices: current.devices.map(device => device.id === id ? truoc : device) }));
      setThongBaoLoi(moTaLoi(error));
    }
  }

  /**
   * Gửi một lệnh theo capability. Đổi giao diện trước cho nút phản hồi tức thì; hỏng thì
   * trả lại đúng trạng thái cũ và ném lỗi ra để panel hiện ngay cạnh control vừa bấm.
   */
  async function guiLenh(id: string, capability: IotxCapability, value: unknown) {
    if (!capability.rpc) return;
    const truoc = data.devices.find(device => device.id === id);
    setData(current => ({
      ...current,
      devices: current.devices.map(device => {
        if (device.id !== id) return device;
        // Cùng một hàm suy với /bootstrap và với SSE — không so tên khóa tại chỗ nữa.
        const lastValues = { ...device.lastValues, [capability.key]: value };
        return { ...device, lastValues, ...suyDanXuat(lastValues, device.product, device.speed) };
      }),
    }));
    if (!isIotxMode) return;
    // Ghi sổ để nhịp hỏi lại không đè giá trị cũ của máy chủ lên nút vừa bấm.
    ghiNhanLenh(id, capability.key, value);
    try { await iotxClient.rpc(id, capability.rpc, { [capability.key]: value }); }
    catch (error) {
      boGhiNhanLenh(id, capability.key);
      if (truoc) setData(current => ({ ...current, devices: current.devices.map(device => device.id === id ? truoc : device) }));
      throw error;
    }
  }

  const taiLuat = useCallback(async () => {
    const ketQua = await iotxClient.rules();
    setLuat(ketQua.rules || []);
    setLuatTuThietBi(ketQua.tuThietBi || []);
  }, [setLuat, setLuatTuThietBi]);

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
    catch (error) { setThongBaoLoi(moTaLoi(error)); void taiLuat().catch(() => undefined); }
  }

  async function chayLuat(rule: IotxRule) {
    try { await iotxClient.chayLuatNgay(rule.id); void taiLuat().catch(() => undefined); }
    catch (error) { setThongBaoLoi(moTaLoi(error)); }
  }

  /** Dừng chương trình nhiều giai đoạn đang chạy (`POST /rules/{id}/stop`). */
  async function dungLuat(rule: IotxRule) {
    try { await iotxClient.dungLuat(rule.id); void taiLuat().catch(() => undefined); }
    catch (error) { setThongBaoLoi(moTaLoi(error)); }
  }

  function moThongBao() {
    setNotifications(items => items.map(item => ({ ...item, unread: false })));
    if (isIotxMode) void iotxClient.readNotifications().catch(() => undefined);
    setPanel("notif");
  }

  async function xoaThongBao(id: string) {
    setNotifications(items => items.filter(item => item.id !== id));
    if (isIotxMode) await iotxClient.deleteNotification(id).catch(() => undefined);
  }

  /**
   * Lệnh trên một mục của capability kiểu `list`. Máy chủ giữ danh sách (gộp mạch + máy
   * chủ) nên sau khi gửi phải lấy lại thiết bị chứ không tự sửa tại chỗ.
   */
  async function guiVatTu(id: string, capability: IotxCapability, lenh: IotxLenhVatTu) {
    if (!isIotxMode) {
      // Mock không có máy chủ: tự dựng lại danh sách để thao tác vẫn thấy được kết quả.
      setData(current => ({
        ...current,
        devices: current.devices.map(device => {
          if (device.id !== id) return device;
          const cu = Array.isArray(device.lastValues?.[capability.key]) ? [...(device.lastValues![capability.key] as IotxMucVatTu[])] : [];
          let moi = cu;
          if (lenh.kieu === "thay") moi = cu.map(m => String(m.id) === lenh.id ? { ...m, phanTram: 100, conLai: m.tuoiTho } : m);
          if (lenh.kieu === "tuoi") moi = cu.map(m => String(m.id) === lenh.id ? { ...m, tuoiTho: lenh.tuoiTho } : m);
          if (lenh.kieu === "bo") moi = cu.filter(m => String(m.id) !== lenh.id);
          if (lenh.kieu === "them") moi = [...cu, { id: `vt${Date.now()}`, ten: lenh.ten || lenh.serial || "Vật tư mới", tuoiTho: 365, phanTram: 100, xacThuc: Boolean(lenh.serial) }];
          return { ...device, lastValues: { ...device.lastValues, [capability.key]: moi } };
        }),
      }));
      return;
    }
    try {
      await iotxClient.lenhMucVatTu(id, capability.key, lenh);
      await refreshDevices();
    } catch (error) { setThongBaoLoi(moTaLoi(error)); }
  }

  /**
   * Ẩn thiết bị khỏi danh sách. Hợp đồng chỉ có `hidden` — thiết bị vẫn ghép nối, không
   * có cửa nào "xoá" hẳn ở phía người dùng cuối.
   */
  async function anThietBi(id: string) {
    const truoc = data.devices;
    setData(current => ({ ...current, devices: current.devices.filter(device => device.id !== id) }));
    setPanel(null);
    setDeviceId(null);
    if (!isIotxMode) return;
    try { await iotxClient.updateDevice(id, { hidden: true }); }
    catch (error) {
      setData(current => ({ ...current, devices: truoc }));
      setThongBaoLoi(moTaLoi(error));
    }
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
    if (muc === "devices") { setMan("devices"); setPanel(null); return; }
    // Hẹn giờ là chuyện của TỪNG thiết bị (`/devices/{id}/hen-gio`), nên phải chọn máy trước.
    if (muc === "timers") { setPanel("chonThietBi"); return; }
    setPanel(muc);
  }

  /* ----------------------------- render ----------------------------- */

  if (!hydrated) {
    return <div className="splash"><div className="brand-mark"><Home /></div><span>Đang khởi động Livotec Home…</span></div>;
  }

  return (
    <ChuProvider lang={lang} boChu={boChu}>
        {!signedIn ? (
          <div className="app-shell"><div className="phone">
            <LoginScreen onDone={xongDangNhap} logoUrl={theme?.logoUrl ?? null} />
          </div></div>
        ) : (
          <div className="app-shell"><div className="phone">
            <TopBar
              ten={tenHienThi(profile)}
              chuaDoc={chuaDoc}
              onProfile={() => setPanel("profile")}
              onNotif={moThongBao}
              onMenu={() => setPanel("drawer")}
            />

            <ManHinh
              man={man}
              data={data}
              thietBiTheoPhong={thietBiTheoPhong}
              nha={nha}
              phong={phong}
              nhom={nhom}
              lang={lang}
              gonGang={gonGang}
              luat={luat}
              luatTuThietBi={luatTuThietBi}
              tranLuat={theme?.quotas?.rules ?? profile?.theme?.quotas?.rules ?? 20}
              onLang={doiNgonNgu}
              onChonNha={() => setPanel("housePicker")}
              onChonPhong={() => setPanel("roomPicker")}
              onChonNhom={() => setPanel("groupPicker")}
              onGonGang={() => setGonGang(!gonGang)}
              onToast={cau => { setCauPhu(cau); setPanel("toast"); }}
              onMoThietBi={id => { setDeviceId(id); setPanel("device"); }}
              onNguon={id => { void doiNguon(id); }}
              onGhim={id => { void doiGhim(id); }}
              onThemThietBi={() => setPanel("add")}
              onTaoNeuThi={() => setPanel("if-editor")}
              onTaoTheoGio={() => setPanel("chonThietBi")}
              onBatTatLuat={rule => { void batTatLuat(rule); }}
              onXoaLuat={rule => { void xoaLuat(rule); }}
              onChayLuat={rule => { void chayLuat(rule); }}
              onDungLuat={rule => { void dungLuat(rule); }}
              onPlaceholder={tieuDe => { setCauPhu(tieuDe); setPanel("placeholder"); }}
              logoUrl={theme?.logoUrl ?? null}
            />

            <BottomNav active={man} onChon={next => { setMan(next); setPanel(null); }} />

            {thongBaoLoi && (
              <div className="toast-loi" role="status">
                <span>{thongBaoLoi}</span>
                <button aria-label="Đóng thông báo" onClick={() => setThongBaoLoi("")}>×</button>
              </div>
            )}

            {panel === "drawer" && (
              <MenuDrawer
                lang={lang}
                phienBan={`v1.0 · ${iotxConfig.tenant}`}
                onLang={doiNgonNgu}
                onClose={() => setPanel(null)}
                onChon={chonMenu}
              />
            )}
            {panel === "profile" && (
              <ProfileModal
                ten={tenHienThi(profile)}
                email={profile?.email || ""}
                vaiTro={profile?.tenantName || ""}
                onClose={() => setPanel(null)}
                onLogout={dangXuat}
              />
            )}
            {panel === "notif" && (
              <NotifModal
                items={notifications}
                onClose={() => setPanel(null)}
                onXoa={id => { void xoaThongBao(id); }}
                onXoaHet={() => { void xoaHetThongBao(); }}
              />
            )}
            {panel === "housePicker" && (
              <LocPickerModal
                khoaTieuDe="pick_house" khoaTatCa="all_houses"
                dangChon={nha} danhSach={data.spaces.houses}
                onClose={() => setPanel(null)}
                onChon={ten => { setNha(ten); setPanel(null); setMan("devices"); }}
              />
            )}
            {panel === "roomPicker" && (
              <LocPickerModal
                khoaTieuDe="pick_room" khoaTatCa="all_rooms"
                dangChon={phong} danhSach={data.spaces.rooms}
                onClose={() => setPanel(null)}
                onChon={ten => { setPhong(ten); setPanel(null); setMan("devices"); }}
              />
            )}
            {panel === "groupPicker" && (
              <LocPickerModal
                khoaTieuDe="pick_group" khoaTatCa="all_groups"
                dangChon={nhom} danhSach={cacNhom}
                onClose={() => setPanel(null)}
                onChon={ten => { setNhom(ten); setPanel(null); setMan("devices"); }}
              />
            )}
            {panel === "placeholder" && <PlaceholderModal title={cauPhu} onClose={() => setPanel(null)} />}
            {panel === "toast" && <ToastModal cau={cauPhu} onClose={() => setPanel(null)} />}

            {panel === "device" && thietBiDangMo && (
              <DeviceDetail
                device={thietBiDangMo}
                lang={lang}
                onLang={doiNgonNgu}
                onClose={() => { setPanel(null); setDeviceId(null); }}
                onCommand={(capability, value) => guiLenh(thietBiDangMo.id, capability, value)}
                onAn={() => { void anThietBi(thietBiDangMo.id); }}
                onVatTu={(capability, lenh) => guiVatTu(thietBiDangMo.id, capability, lenh)}
                onHenGio={() => setPanel("hengio")}
              />
            )}

            {panel === "spaces" && <Spaces data={data} setData={setData} onClose={() => setPanel(null)} />}
            {panel === "members" && <Members data={data} daCap={chiaSeDaCap} nhanDuoc={chiaSeNhanDuoc} onReload={taiChiaSe} onClose={() => setPanel(null)} />}
            {panel === "add" && <AddDevice data={data} setData={setData} onSynced={syncRemote} onClose={() => setPanel(null)} />}
            {panel === "chonThietBi" && (
              <DevicePickerModal
                danhSach={data.devices.map(device => ({ id: device.id, name: device.name, room: device.room }))}
                onClose={() => setPanel(null)}
                onChon={id => { setDeviceId(id); setPanel("hengio"); }}
              />
            )}
            {/* Đóng màn hẹn giờ thì QUAY VỀ màn chi tiết, không văng ra danh sách: người dùng
                mở nó TỪ màn chi tiết, nên nút trở lại phải trả họ về đúng chỗ vừa rời. */}
            {panel === "hengio" && thietBiDangMo && <HenGioPanel device={thietBiDangMo} onClose={() => setPanel("device")} />}
            {panel === "virtual" && <VirtualPanel onClose={() => setPanel(null)} onThayDoi={syncRemote} />}
            {panel === "if-editor" && <IfThenEditor devices={data.devices} onSaved={taiLuat} onClose={() => setPanel(null)} />}
          </div></div>
        )}
    </ChuProvider>
  );
}

/* ------------------------------------------------------------------ */
/* Năm màn chính                                                      */
/* ------------------------------------------------------------------ */

function ManHinh(props: {
  man: ManChinh;
  data: AppData;
  thietBiTheoPhong: Device[];
  nha: string;
  phong: string;
  nhom: string;
  lang: string;
  gonGang: boolean;
  luat: IotxRule[];
  luatTuThietBi: IotxRules["tuThietBi"];
  /** Trần luật của hãng — `theme.quotas.rules`, không cắm cứng 20. */
  tranLuat: number;
  onLang: (ma: string) => void;
  onChonNha: () => void;
  onChonPhong: () => void;
  onChonNhom: () => void;
  onGonGang: () => void;
  onToast: (cau: string) => void;
  onMoThietBi: (id: string) => void;
  onNguon: (id: string) => void;
  onGhim: (id: string) => void;
  onThemThietBi: () => void;
  onTaoNeuThi: () => void;
  onTaoTheoGio: () => void;
  onBatTatLuat: (rule: IotxRule) => void;
  onXoaLuat: (rule: IotxRule) => void;
  onChayLuat: (rule: IotxRule) => void;
  onDungLuat: (rule: IotxRule) => void;
  onPlaceholder: (tieuDe: string) => void;
  logoUrl: string | null;
}) {
  const { t } = useChu();
  const { man, data } = props;

  const hangLoc = (
    <FilterRow
      nha={props.nha}
      phong={props.phong}
      nhom={props.nhom}
      gonGang={props.gonGang}
      onChonNha={props.onChonNha}
      onChonPhong={props.onChonPhong}
      onChonNhom={props.onChonNhom}
      onGonGang={props.onGonGang}
    />
  );

  const luoi = (danhSach: Device[]) => danhSach.length === 0
    ? <div className="empty-state"><Icon name="search" /><strong>{t("no_device")}</strong><span>{t("no_device_hint")}</span></div>
    : (
      <div className={`device-grid${props.gonGang ? " compact" : ""}`}>
        {danhSach.map(device => (
          <DeviceCard
            key={device.id}
            device={device}
            onOpen={() => props.onMoThietBi(device.id)}
            onToggle={() => props.onNguon(device.id)}
            onFav={() => props.onGhim(device.id)}
          />
        ))}
      </div>
    );

  if (man === "devices") {
    return (
      <div className="app-scroll">
        <button className="add-device-btn" onClick={props.onThemThietBi}><Icon name="plus" /> {t("add_device")}</button>
        {hangLoc}
        {luoi(props.thietBiTheoPhong)}
      </div>
    );
  }

  if (man === "automation") {
    return (
      <div className="app-scroll">
        <div className="auto-btn-row">
          <button className="auto-btn primary" onClick={props.onTaoNeuThi}><Icon name="plus" /> {t("auto_if")}</button>
          <button className="auto-btn secondary" onClick={props.onTaoTheoGio}><Icon name="clock" /> {t("auto_time")}</button>
        </div>
        {props.luat.length === 0 && props.luatTuThietBi.length === 0 && (
          <div className="empty-card">
            {t("auto_empty").split("<br>").map((dong, i) => <span key={i} className="empty-line">{dong}</span>)}
          </div>
        )}
        {props.luat.map(rule => (
          <RuleCard
            key={rule.id}
            rule={rule}
            onBatTat={() => props.onBatTatLuat(rule)}
            onChay={() => props.onChayLuat(rule)}
            onXoa={() => props.onXoaLuat(rule)}
            onDung={() => props.onDungLuat(rule)}
          />
        ))}
        {props.luatTuThietBi.length > 0 && (
          <>
            <div className="section-title"><h2>{t("auto_from_device")}</h2><span>{props.luatTuThietBi.length}</span></div>
            {props.luatTuThietBi.map(muc => (
              <div className="auto-card" key={`${muc.deviceId}-${muc.tenCT}`}>
                <div className="auto-card-top"><span className="an">{muc.tenCT}</span></div>
                <p className="auto-line">{muc.tenThietBi}</p>
              </div>
            ))}
            <p className="hint">{t("auto_from_device_hint")}</p>
          </>
        )}
      </div>
    );
  }

  if (man === "services") {
    const items = [
      { icon: "wrench", nhan: "svc_maintenance" },
      { icon: "shield", nhan: "svc_warranty" },
      { icon: "checkCircle", nhan: "svc_activate" },
      { icon: "cart", nhan: "svc_shop" },
    ];
    // Lưới thứ hai của bản thiết kế: các hội nhóm người dùng, viền và chữ theo màu hãng.
    const hoi = ["club_kitchen", "club_aircon", "club_water", "club_fan"];
    return (
      <div className="app-scroll">
        <div className="service-grid">
          {items.map(muc => (
            <button className="service-card" key={muc.nhan} onClick={() => props.onPlaceholder(t(muc.nhan))}>
              <span className="sicn"><Icon name={muc.icon} /></span>
              <span className="slabel">{t(muc.nhan)}</span>
            </button>
          ))}
        </div>
        <div className="service-grid club-grid">
          {hoi.map(nhan => (
            <button className="service-card club-card" key={nhan} onClick={() => props.onPlaceholder(t(nhan))}>
              <span className="sicn club-icn"><Icon name="heart" /></span>
              <span className="slabel club-label">{t(nhan)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (man === "discover") {
    return (
      <div className="app-scroll">
        <a className="discover-hero" href="https://livotec.com/" target="_blank" rel="noreferrer noopener">
          {/* Hãng có logo riêng thì dùng logo đó; chưa khai thì vẽ giọt nước trắng của
              bản thiết kế, đặt thẳng trên nền chứ không bọc trong ô sáng. */}
          {props.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img className="dh-logo" src={props.logoUrl} alt="" width={60} height={60} />
            : <span className="dh-swirl-icon" aria-hidden="true">
                <svg viewBox="0 0 100 100" fill="none">
                  <path d="M50 8 A42 42 0 0 1 92 50" stroke="#fff" strokeWidth={9} strokeLinecap="round" />
                  <path d="M50 92 A42 42 0 0 1 8 50" stroke="#fff" strokeWidth={9} strokeLinecap="round" />
                  <path d="M50 30 C 38 46, 34 56, 42 66 C 48 73, 58 71, 61 63 C 64 55, 58 48, 50 30 Z" fill="#fff" />
                </svg>
              </span>}
          <span className="dh-title">{t("dh_title")}</span>
          <span className="dh-sub">{t("dh_sub")}</span>
          <span className="dh-btn">{t("dh_btn")} <Icon name="externalLink" /></span>
        </a>
        {/* Bản thiết kế xếp hai ảnh khuyến mãi chồng nhau, KHÔNG phải băng chạy: đây là
            trang để đọc, ảnh tự đổi làm người dùng mất chỗ đang xem. */}
        <div className="discover-promo-stack">
          <Image unoptimized className="discover-promo-img" src={IMG.promoAircon} alt={t("promo_aircon")} width={360} height={150} />
          <Image unoptimized className="discover-promo-img" src={IMG.promoWaterHeater} alt={t("promo_wh")} width={360} height={150} />
        </div>
      </div>
    );
  }

  return (
    <div className="app-scroll">
      <BannerCarousel />
      {hangLoc}
      {luoi(data.devices)}
    </div>
  );
}
