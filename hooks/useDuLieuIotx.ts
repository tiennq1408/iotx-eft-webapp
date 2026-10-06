"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppData, defaultData, loadData, saveData } from "@/lib/storage";
import {
  boChuRong, browserTokenStore, docI18n, docNgonNguDaChon, docProducts, docTheme, ghiI18n, ghiNgonNguDaChon,
  ghiProducts, ghiTheme, iotxClient, IotxApiError, isIotxMode, iotxConfig, mapIotxDevice, mergeBootstrap, suyDanXuat,
} from "@/lib/iotx";
import type { BoChu } from "@/lib/iotx";
import type { IotxNotification, IotxProduct, IotxProfile, IotxRule, IotxRules, IotxTheme } from "@/lib/iotx/contracts";
import { mapShareDaCap, mapShareNhanDuoc, type ChiaSeNhan } from "@/components/manage/panels";
import { type UiNotification } from "@/components/newui/modals";
import { apDungTheme } from "@/lib/newui/theme";

/**
 * Toàn bộ lớp dữ liệu của app: phiên đăng nhập, `/bootstrap`, bảng chữ, theme, luồng SSE
 * và các lần đồng bộ lại.
 *
 * Tách khỏi component vì đây là chỗ khó nhất và cũng là chỗ từng sai nhiều nhất — bốn lỗi
 * đồng bộ đều nằm trong này. Gom lại một nơi thì đọc được cả vòng đời dữ liệu mà không
 * phải lội qua bảy trăm dòng JSX.
 */
function iconThongBao(type: string) {
  if (type === "error" || type === "alarm") return "flame";
  if (type === "success") return "checkCircle";
  if (type === "water") return "drop";
  return "bell";
}

function mapNotification(item: IotxNotification): UiNotification {
  return {
    id: String(item.id),
    icon: iconThongBao(item.type),
    title: item.title,
    text: item.body || "",
    time: new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(item.created_at)),
    unread: !item.read,
  };
}

/** Tên hiển thị lấy từ `/me`; chưa có thì để dấu gạch chứ không mượn tên tài khoản demo. */
export function tenHienThi(profile: IotxProfile | null) {
  return profile?.email?.split("@")[0] || (isIotxMode ? "—" : "Ngọc Thủy");
}

const THONG_BAO_MOCK: UiNotification[] = [
  { id: "n1", icon: "drop", title: "Máy lọc nước 886i", text: "Lõi lọc chức năng còn 15% — nên đặt lịch thay.", time: "2 giờ trước", unread: true },
  { id: "n2", icon: "snow", title: "Điều hòa I30J", text: "Đã được bật ở 26°C, chế độ Làm mát.", time: "Hôm nay 14:32", unread: true },
  { id: "n3", icon: "flame", title: "Bếp từ 888", text: "Đã tắt an toàn sau 90 phút không thao tác.", time: "Hôm qua", unread: false },
];

export function useDuLieuIotx() {
  const [hydrated, setHydrated] = useState(false);
  const [boChu, setBoChu] = useState<BoChu>(boChuRong);
  const [chiaSeNhanDuoc, setChiaSeNhanDuoc] = useState<ChiaSeNhan[]>([]);
  const [chiaSeDaCap, setChiaSeDaCap] = useState<ChiaSeNhan[]>([]);
  const [luat, setLuat] = useState<IotxRule[]>([]);
  const [luatTuThietBi, setLuatTuThietBi] = useState<IotxRules["tuThietBi"]>([]);
  const [lang, setLang] = useState(iotxConfig.lang);
  const langRef = useRef(iotxConfig.lang);
  const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<AppData>(defaultData);
  const [profile, setProfile] = useState<IotxProfile | null>(null);
  const [theme, setTheme] = useState<IotxTheme | null>(null);
  const [notifications, setNotifications] = useState<UiNotification[]>(isIotxMode ? [] : THONG_BAO_MOCK);

  const productsRef = useRef<Record<string, IotxProduct>>({});

  const taiBoChu = useCallback(async (ma: string, nhan?: string) => {
    const dangGiu = docI18n(ma, nhan);
    if (dangGiu) {
      setBoChu(dangGiu);
      if (nhan !== undefined) return;
    }
    // Chế độ mock không có máy chủ nào để hỏi: gọi `/i18n` chỉ tạo một request 403/404 vô
    // nghĩa trong console. Bảng chữ trong mã đã đủ cho cả ba ngôn ngữ.
    if (!isIotxMode) return;
    try {
      const moi = await iotxClient.i18n(ma);
      ghiI18n(ma, nhan, moi);
      setBoChu(moi);
    } catch { /* mất mạng: giữ bản đang có, app vẫn chạy bằng bảng chữ trong mã */ }
  }, []);

  /**
   * Theme của hãng. Cửa này công khai nên gọi được từ trước đăng nhập — màn chào có đúng
   * màu và logo ngay. Sau `/bootstrap` thì so nhãn `phienBan.theme`: khớp thì thôi tải lại.
   */
  const taiTheme = useCallback(async (nhan?: string) => {
    const dangGiu = docTheme(nhan);
    if (dangGiu) {
      setTheme(dangGiu);
      apDungTheme(dangGiu);
      if (nhan !== undefined) return;
    }
    if (!isIotxMode) return;
    try {
      const moi = await iotxClient.theme();
      ghiTheme(nhan, moi);
      setTheme(moi);
      apDungTheme(moi);
    } catch { /* mất mạng: giữ bảng màu trong CSS */ }
  }, []);

  const doiNgonNgu = useCallback((ma: string) => {
    setLang(ma);
    langRef.current = ma;
    ghiNgonNguDaChon(ma);
    void taiBoChu(ma);
  }, [taiBoChu]);

  const syncRemote = useCallback(async () => {
    const bootstrap = await iotxClient.bootstrap();
    void taiBoChu(langRef.current, bootstrap.phienBan?.i18n);
    void taiTheme(bootstrap.phienBan?.theme);
    const nhanProducts = bootstrap.phienBan?.products;
    let products = docProducts(nhanProducts);
    if (!products) {
      products = await iotxClient.products();
      ghiProducts(nhanProducts, products);
    }
    productsRef.current = products;
    const [remoteNotifications, remoteShares, remoteRules] = await Promise.all([
      iotxClient.notifications(), iotxClient.shares(), iotxClient.rules(),
    ]);
    const enriched = { ...bootstrap, devices: bootstrap.devices.map(device => ({ ...device, product: products[device.type] || device.product })) };
    setProfile(bootstrap.me);
    setNotifications(remoteNotifications.items.map(mapNotification));
    setChiaSeNhanDuoc((remoteShares.receivedFromOthers || []).map(mapShareNhanDuoc));
    setChiaSeDaCap((remoteShares.granted || []).map(mapShareDaCap));
    setLuat(remoteRules.rules || []);
    setLuatTuThietBi(remoteRules.tuThietBi || []);
    setData(current => mergeBootstrap(current, enriched));
  }, [taiBoChu, taiTheme]);

  const taiChiaSe = useCallback(async () => {
    if (!isIotxMode) return;
    const remoteShares = await iotxClient.shares();
    setChiaSeDaCap((remoteShares.granted || []).map(mapShareDaCap));
    setChiaSeNhanDuoc((remoteShares.receivedFromOthers || []).map(mapShareNhanDuoc));
  }, []);

  const refreshDevices = useCallback(async () => {
    const devices = await iotxClient.devices();
    setData(current => ({
      ...current,
      devices: devices
        .filter(device => !device.hidden)
        .map(device => mapIotxDevice({ ...device, product: productsRef.current[device.type] || device.product })),
    }));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(loadData());
    const ngonNgu = docNgonNguDaChon();
    setLang(ngonNgu);
    langRef.current = ngonNgu;
    void taiBoChu(ngonNgu);
    void taiTheme();
    const hasSession = isIotxMode ? Boolean(browserTokenStore.get()) : sessionStorage.getItem("livotec-session") === "1";
    setSignedIn(hasSession);
    if (isIotxMode && hasSession) {
      void syncRemote().catch(() => {
        iotxClient.logout();
        setSignedIn(false);
      });
    }
    setHydrated(true);
  }, [syncRemote, taiBoChu, taiTheme]);

  useEffect(() => { if (hydrated) saveData(data); }, [data, hydrated]);

  useEffect(() => {
    if (!isIotxMode || !signedIn) return;
    const controller = new AbortController();
    void iotxClient.subscribe(event => {
      setData(current => ({
        ...current,
        devices: current.devices.map(device => {
          if (device.id !== event.deviceId) return device;
          // Suy lại bằng ĐÚNG hàm dùng cho /bootstrap, thay vì so tên khóa tại chỗ: khóa
          // nguồn của catalog thật là `ac_power_status`, `fan_power`… nên so với "power"
          // thì thiết bị bật ở web khác không bao giờ sáng lên ở đây.
          const lastValues = { ...device.lastValues, [event.key]: event.value };
          return { ...device, lastValues, ...suyDanXuat(lastValues, device.product, device.speed) };
        }),
      }));
    }, {
      signal: controller.signal,
      onReconnect: () => { void refreshDevices().catch(() => undefined); },
    }).catch(error => {
      if (error instanceof IotxApiError && error.status === 401) {
        iotxClient.logout();
        setSignedIn(false);
      }
    });
    return () => controller.abort();
  }, [signedIn, refreshDevices]);

  /**
   * Đồng bộ lại khi người dùng quay lại tab, và khi máy có mạng trở lại.
   *
   * Luồng SSE không phát lại sự kiện đã lỡ (hợp đồng nói rõ: không hỗ trợ Last-Event-ID).
   * Mà trình duyệt thì bóp nghẹt tab chạy nền — đổi trạng thái ở một tab khác, hoặc ở
   * web quản trị, xong quay lại đây thì màn hình vẫn là ảnh cũ cho tới lần tải lại trang.
   * Chặn nhịp 2 giây để chuyển tab qua lại không thành một tràng request.
   */
  useEffect(() => {
    if (!isIotxMode || !signedIn) return;
    let lanCuoi = 0;
    const dongBoLai = () => {
      if (document.visibilityState !== "visible") return;
      const gio = Date.now();
      if (gio - lanCuoi < 2000) return;
      lanCuoi = gio;
      void refreshDevices().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", dongBoLai);
    window.addEventListener("focus", dongBoLai);
    window.addEventListener("online", dongBoLai);
    return () => {
      document.removeEventListener("visibilitychange", dongBoLai);
      window.removeEventListener("focus", dongBoLai);
      window.removeEventListener("online", dongBoLai);
    };
  }, [signedIn, refreshDevices]);

  return {
    hydrated, data, setData, signedIn, setSignedIn, profile, theme, boChu, lang,
    notifications, setNotifications, chiaSeNhanDuoc, chiaSeDaCap,
    luat, setLuat, luatTuThietBi, setLuatTuThietBi,
    doiNgonNgu, syncRemote, taiChiaSe, refreshDevices,
  };
}
