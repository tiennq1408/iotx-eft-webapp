"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { defaultData, loadData, saveData } from "@/lib/storage";
import {
  apGiaTri, browserTokenStore, docAnhChup, docProducts, ghiAnhChup, ghiProducts, iotxClient, isIotxMode, laHetPhien, mapIotxDevice, mapNotification,
  giuThietBiCu, mapShareDaCap, mapShareNhanDuoc, mergeBootstrap, moTaLoi,
} from "@/lib/iotx";
import { SoLenhCho } from "@/lib/iotx/soLenhCho";
import type { AppData, ChiaSeNhan, UiNotification } from "@/lib/types";
import type { IotxDevice, IotxProduct, IotxProfile, IotxRule, IotxRules, IotxStreamEvent } from "@/lib/iotx/contracts";
import { useBoChuVaTheme } from "./useBoChuVaTheme";
import { useDongBoNen } from "./useDongBoNen";

/**
 * Toàn bộ lớp dữ liệu của app: phiên đăng nhập, `/bootstrap`, thông báo, chia sẻ, luật và
 * các lần đồng bộ lại. Bảng chữ/theme nằm ở `useBoChuVaTheme`, ba đường giữ dữ liệu tươi
 * (SSE, quay lại tab, hỏi định kỳ) ở `useDongBoNen`, sổ lệnh chờ ở `lib/iotx/soLenhCho`.
 *
 * Tách khỏi component vì đây là chỗ khó nhất và cũng là chỗ từng sai nhiều nhất — bốn lỗi
 * đồng bộ đều nằm trong này. Gom lại một nơi thì đọc được cả vòng đời dữ liệu mà không
 * phải lội qua bảy trăm dòng JSX.
 */

/** Tên hiển thị lấy từ `/me`; chưa có thì để dấu gạch chứ không mượn tên tài khoản demo. */
export function tenHienThi(profile: IotxProfile | null) {
  return profile?.email?.split("@")[0] || (isIotxMode ? "—" : "Ngọc Thủy");
}

const THONG_BAO_MOCK: UiNotification[] = [
  { id: "n1", icon: "drop", title: "Máy lọc nước 886i", text: "Lõi lọc chức năng còn 15% — nên đặt lịch thay.", time: "2 giờ trước", unread: true },
  { id: "n2", icon: "snow", title: "Điều hòa I30J", text: "Đã được bật ở 26°C, chế độ Làm mát.", time: "Hôm nay 14:32", unread: true },
  { id: "n3", icon: "flame", title: "Bếp từ 888", text: "Đã tắt an toàn sau 90 phút không thao tác.", time: "Hôm qua", unread: false },
];

/**
 * Chế độ IoTX bắt đầu TRỐNG: dữ liệu mock (`lib/storage.ts`) chỉ dành cho chế độ mock, nếu
 * không người dùng thật sẽ thấy thiết bị mẫu nháy lên trước khi `/bootstrap` về.
 */
const DU_LIEU_RONG: AppData = { devices: [], spaces: { houses: [], rooms: [], groups: [] } };

export function useDuLieuIotx({ xemKy = false }: { xemKy?: boolean } = {}) {
  const { boChu, theme, lang, doiNgonNgu: datNgonNgu, khoiDong, theoPhienBan, langHienTai } = useBoChuVaTheme();
  const [hydrated, setHydrated] = useState(false);
  const [chiaSeNhanDuoc, setChiaSeNhanDuoc] = useState<ChiaSeNhan[]>([]);
  const [chiaSeDaCap, setChiaSeDaCap] = useState<ChiaSeNhan[]>([]);
  const [luat, setLuat] = useState<IotxRule[]>([]);
  const [luatTuThietBi, setLuatTuThietBi] = useState<IotxRules["tuThietBi"]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<AppData>(isIotxMode ? DU_LIEU_RONG : defaultData);
  const [profile, setProfile] = useState<IotxProfile | null>(null);
  const [notifications, setNotifications] = useState<UiNotification[]>(isIotxMode ? [] : THONG_BAO_MOCK);
  /** Lỗi của lần đồng bộ đầy đủ gần nhất (mất mạng, 5xx…) — không phải lý do để đăng xuất. */
  const [loiDongBo, setLoiDongBo] = useState("");
  /** Đã có một lần `syncRemote` trọn vẹn chưa; chưa thì nhịp đồng bộ phải làm lại cả lần đó. */
  const daDongBoDu = useRef(false);

  const productsRef = useRef<Record<string, IotxProduct>>({});
  /** Nhãn phiên bản catalog đang giữ (`phienBan.products`) — đổi nghĩa là sadmin vừa lưu. */
  const nhanProductsRef = useRef<string | undefined>(undefined);
  /** Ngôn ngữ của catalog đang giữ — nhãn capability là chữ đã dịch, đổi lang là tải lại. */
  const langProductsRef = useRef<string | undefined>(undefined);
  const soLenhCho = useRef(new SoLenhCho());

  /** Catalog theo nhãn phiên bản: bản đã lưu cho đúng nhãn đó, không có thì tải và lưu lại. */
  const napCatalog = useCallback(async (nhan: string | undefined) => {
    const lang = langHienTai();
    let products = docProducts(lang, nhan);
    if (!products) {
      products = await iotxClient.products(lang);
      ghiProducts(lang, nhan, products);
    }
    productsRef.current = products;
    nhanProductsRef.current = nhan;
    langProductsRef.current = lang;
  }, [langHienTai]);

  /** Thiết bị từ máy chủ → thiết bị của app: bỏ máy ẩn, gắn catalog, giữ lệnh đang chờ. */
  const mapThietBi = useCallback((devices: IotxDevice[]) => devices
    .filter(device => !device.hidden)
    .map(device => soLenhCho.current.apLen(mapIotxDevice({ ...device, product: productsRef.current[device.type] || device.product }))), []);

  const syncRemote = useCallback(async () => {
    const bootstrap = await iotxClient.bootstrap(langHienTai());
    theoPhienBan(bootstrap.phienBan);
    await napCatalog(bootstrap.phienBan?.products);
    const [remoteNotifications, remoteShares, remoteRules] = await Promise.all([
      iotxClient.notifications(), iotxClient.shares(), iotxClient.rules(),
    ]);
    setProfile(bootstrap.me);
    setNotifications(remoteNotifications.items.map(mapNotification));
    setChiaSeNhanDuoc((remoteShares.receivedFromOthers || []).map(mapShareNhanDuoc));
    setChiaSeDaCap((remoteShares.granted || []).map(mapShareDaCap));
    setLuat(remoteRules.rules || []);
    setLuatTuThietBi(remoteRules.tuThietBi || []);
    const devices = mapThietBi(bootstrap.devices);
    setData(current => ({ ...mergeBootstrap(current, bootstrap), devices: giuThietBiCu(current.devices, devices) }));
    daDongBoDu.current = true;
    setLoiDongBo("");
  }, [theoPhienBan, napCatalog, mapThietBi, langHienTai]);

  const taiLuat = useCallback(async () => {
    const ketQua = await iotxClient.rules();
    setLuat(ketQua.rules || []);
    setLuatTuThietBi(ketQua.tuThietBi || []);
  }, []);

  const taiChiaSe = useCallback(async () => {
    if (!isIotxMode) return;
    const remoteShares = await iotxClient.shares();
    setChiaSeDaCap((remoteShares.granted || []).map(mapShareDaCap));
    setChiaSeNhanDuoc((remoteShares.receivedFromOthers || []).map(mapShareNhanDuoc));
  }, []);

  const ghiNhanLenh = useCallback((id: string, key: string, gt: unknown) => soLenhCho.current.ghi(id, key, gt), []);
  const boGhiNhanLenh = useCallback((id: string, key: string) => soLenhCho.current.bo(id, key), []);

  /**
   * Một nhịp đồng bộ: trạng thái thiết bị VÀ phiên bản catalog, bằng một lời gọi.
   *
   * Hỏi `/bootstrap` chứ không phải `/devices`, vì chỉ `/bootstrap` mang theo
   * `phienBan.products`. Sửa lưới `ui.boCuc` trên sadmin thì dữ liệu thiết bị không đổi
   * một chữ nào — thứ đổi là CATALOG. Chỉ hỏi `/devices` thì app giữ catalog cũ tới khi
   * tải lại trang, và màn chi tiết vẫn vẽ bố cục cũ dù máy chủ đã có bố cục mới.
   *
   * Bản tham chiếu web.dev làm đúng vậy: hỏi `/bootstrap` mỗi 2,5 giây, thấy nhãn đổi thì
   * kéo lại `/products`. Nhờ ETag nên phần lớn các lần hỏi trả 304, rẻ như không.
   */
  const refreshDevices = useCallback(async () => {
    const bootstrap = await iotxClient.bootstrap(langHienTai());
    const nhan = bootstrap.phienBan?.products;
    if (nhan !== nhanProductsRef.current || langHienTai() !== langProductsRef.current) await napCatalog(nhan);
    // Tính ngoài updater: `mapThietBi` nhả sổ lệnh chờ, không được chạy hai lần trong StrictMode.
    const devices = mapThietBi(bootstrap.devices);
    setData(current => {
      const giu = giuThietBiCu(current.devices, devices);
      return giu === current.devices ? current : { ...current, devices: giu };
    });
  }, [napCatalog, mapThietBi, langHienTai]);

  /**
   * Nhịp đồng bộ dùng chung cho SSE nối lại, quay lại tab và hỏi định kỳ. Lần đồng bộ đầy
   * đủ lúc mở app mà hỏng (mất mạng) thì hồ sơ, thông báo, luật vẫn trống — nhịp sau phải
   * làm lại cả lần đó, chứ chỉ lấy thiết bị thì những phần kia trống tới lúc tải lại trang.
   */
  const dangDongBo = useRef<Promise<void> | null>(null);
  const dongBoNhip = useCallback(() => {
    // Một luồng thôi: hỏi định kỳ, quay lại tab và SSE nối lại có thể rơi cùng lúc, nhất là
    // khi lần đồng bộ đầy đủ (5 request) còn chưa xong.
    dangDongBo.current ??= (daDongBoDu.current ? refreshDevices() : syncRemote())
      .finally(() => { dangDongBo.current = null; });
    return dangDongBo.current;
  }, [refreshDevices, syncRemote]);

  // `logout` báo qua `onHetPhien` — phần dọn state nằm ở người nghe bên dưới.
  const hetPhien = useCallback(() => iotxClient.logout(), []);

  /**
   * Một sự kiện `trang-thai` từ SSE. Suy lại bằng ĐÚNG hàm dùng cho /bootstrap, thay vì so
   * tên khóa tại chỗ: khóa nguồn của catalog thật là `ac_power_status`, `fan_power`… nên so
   * với "power" thì thiết bị bật ở web khác không bao giờ sáng lên ở đây.
   */
  const nhanSuKien = useCallback((event: IotxStreamEvent) => {
    // Máy chủ đã lên tiếng về đúng khóa này: nhả nó khỏi sổ giữ, đừng đè lên tin mới.
    soLenhCho.current.bo(event.deviceId, event.key);
    setData(current => ({
      ...current,
      devices: current.devices.map(device => device.id === event.deviceId ? apGiaTri(device, { [event.key]: event.value }) : device),
    }));
  }, []);

  /**
   * Phiên kết thúc (đăng xuất, hoặc refresh cũng hỏng): về màn đăng nhập và bỏ hết dữ liệu
   * của tài khoản vừa rời đi, để người đăng nhập kế tiếp trên cùng trình duyệt không thấy nó.
   */
  useEffect(() => iotxClient.onHetPhien(() => {
    daDongBoDu.current = false;
    setSignedIn(false);
    if (!isIotxMode) return;
    setData(DU_LIEU_RONG);
    setProfile(null);
    setNotifications([]);
    setChiaSeNhanDuoc([]);
    setChiaSeDaCap([]);
    setLuat([]);
    setLuatTuThietBi([]);
  }), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(isIotxMode ? (docAnhChup(langHienTai()) ?? DU_LIEU_RONG) : loadData());
    khoiDong();
    const hasSession = isIotxMode ? Boolean(browserTokenStore.get()) : sessionStorage.getItem("livotec-session") === "1";
    setSignedIn(hasSession);
    if (isIotxMode && hasSession) {
      // Chỉ 401 (refresh cũng đã hỏng) mới là phiên chết. Mất mạng, 502/503 hay lỗi
      // `/products` thì giữ phiên: báo lỗi, và nhịp đồng bộ sẽ thử lại.
      void syncRemote().catch(error => {
        if (laHetPhien(error)) hetPhien();
        else setLoiDongBo(moTaLoi(error));
      });
    }
    setHydrated(true);
  }, [syncRemote, khoiDong, hetPhien, langHienTai]);

  useEffect(() => {
    if (!hydrated) return;
    if (!isIotxMode) { saveData(data); return; }
    // Chỉ chụp khi còn phiên: request về muộn sau khi đăng xuất không được ghi lại dữ liệu cũ.
    if (!signedIn) return;
    // Ảnh chụp chỉ để xem lúc mất mạng — ghi khi dữ liệu đã yên một nhịp, không phải ở mỗi
    // sự kiện SSE. Đăng xuất thì cleanup huỷ lần ghi đang chờ.
    const hen = setTimeout(() => ghiAnhChup(data), 1500);
    return () => clearTimeout(hen);
  }, [data, hydrated, signedIn]);

  useDongBoNen({ signedIn, xemKy, dongBoNhip, onSuKien: nhanSuKien, onHetPhien: hetPhien });

  /**
   * Đổi ngôn ngữ: bảng chữ đổi ngay (trong `datNgonNgu`), còn tên thiết bị, nhãn capability
   * và thông báo đều do máy chủ dịch theo `?lang` — phải đồng bộ lại đầy đủ mới đổi theo.
   */
  const doiNgonNgu = useCallback((ma: string) => {
    datNgonNgu(ma);
    if (!isIotxMode || !signedIn) return;
    daDongBoDu.current = false;
    void dongBoNhip().catch(() => undefined);
  }, [datNgonNgu, dongBoNhip, signedIn]);

  return {
    hydrated, data, setData, signedIn, setSignedIn, profile, theme, boChu, lang, loiDongBo, setLoiDongBo,
    notifications, setNotifications, chiaSeNhanDuoc, chiaSeDaCap,
    luat, setLuat, luatTuThietBi, taiLuat,
    doiNgonNgu, syncRemote, taiChiaSe, refreshDevices, ghiNhanLenh, boGhiNhanLenh,
  };
}
