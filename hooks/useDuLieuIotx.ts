"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppData, defaultData, loadData, saveData } from "@/lib/storage";
import {
  boChuRong, browserTokenStore, docI18n, docNgonNguDaChon, docProducts, docTheme, ghiI18n, ghiNgonNguDaChon,
  ghiProducts, ghiTheme, iotxClient, IotxApiError, isIotxMode, iotxConfig, mapIotxDevice, mergeBootstrap, suyDanXuat,
} from "@/lib/iotx";
import type { BoChu } from "@/lib/iotx";
import type { Device } from "@/lib/types";
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
/**
 * Nhịp hỏi lại trạng thái.
 *
 * SSE là đường nhanh nhưng KHÔNG đủ làm nguồn sự thật. Hợp đồng nói rõ luồng không phát
 * lại sự kiện đã lỡ, nên mỗi lần nối lại — token hết hạn, mạng chớp, máy ngủ — là một
 * khoảng trống không ai bù. Nặng hơn nữa: nếu mạch không nhả telemetry thì chẳng có sự
 * kiện nào để mà lỡ, và màn chi tiết đang mở sẽ đứng ở ảnh cũ vô thời hạn.
 *
 * Đo trên bản tham chiếu web.dev (07/10/2026): nó KHÔNG mở EventSource lần nào, không gọi
 * `/stream` lần nào, mà hỏi lại `/bootstrap` đúng mỗi 2,5 giây. Đó là toàn bộ lý do nó
 * luôn trông đúng. Ở đây giữ cả hai đường: SSE cho phản hồi tức thì, nhịp hỏi lại làm
 * lưới an toàn — hơn hẳn việc chỉ có một trong hai.
 */
const NHIP_XEM_KY_MS = 2_500;    // đang mở màn chi tiết: người dùng nhìn chằm chằm vào một máy
const NHIP_THUONG_MS = 10_000;   // đang ở danh sách: thưa hơn cho đỡ tốn

/**
 * Giá trị vừa bấm được giữ tạm cho tới khi máy chủ báo lại đúng nó.
 *
 * Nhịp hỏi lại có thể về TRƯỚC khi mạch kịp báo giá trị mới. Cứ thế ghi đè thì người dùng
 * bấm công tắc, thấy nó bật, rồi một giây sau tự tắt — tệ hơn hẳn bệnh đang chữa. Trong
 * cửa sổ này giá trị vừa bấm thắng; quá hạn thì nhường, vì khi đó máy chủ mới là bên nói
 * đúng (lệnh có thể đã trượt mà không ai báo).
 */
const CHO_PHAN_HOI_MS = 6_000;

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

export function useDuLieuIotx({ xemKy = false }: { xemKy?: boolean } = {}) {
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
  /** Nhãn phiên bản catalog đang giữ (`phienBan.products`) — đổi nghĩa là sadmin vừa lưu. */
  const nhanProductsRef = useRef<string | undefined>(undefined);

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
    nhanProductsRef.current = nhanProducts;
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

  /** Khóa `<id>\0<capability>` → giá trị người dùng vừa đặt và hạn giữ nó. */
  const soLenhCho = useRef(new Map<string, { gt: unknown; hetHan: number }>());

  const ghiNhanLenh = useCallback((id: string, key: string, gt: unknown) => {
    soLenhCho.current.set(`${id}\u0000${key}`, { gt, hetHan: Date.now() + CHO_PHAN_HOI_MS });
  }, []);

  /** Lệnh trượt, hoặc máy chủ đã nói — thôi giữ, để dữ liệu hỏi về được quyền sửa lại. */
  const boGhiNhanLenh = useCallback((id: string, key: string) => {
    soLenhCho.current.delete(`${id}\u0000${key}`);
  }, []);

  /** Dán lại những giá trị vừa bấm mà máy chủ chưa kịp xác nhận, lên dữ liệu vừa hỏi về. */
  const giuLenhDangCho = useCallback((device: Device): Device => {
    const bay = Date.now();
    const goc = device.lastValues ?? {};
    let lastValues = goc;
    for (const [khoa, muc] of soLenhCho.current) {
      const ngan = khoa.indexOf("\u0000");
      if (khoa.slice(0, ngan) !== device.id) continue;
      const key = khoa.slice(ngan + 1);
      // Hết hạn, hoặc máy chủ đã trả về đúng giá trị đó — không cần giữ nữa.
      if (muc.hetHan <= bay || String(goc[key] ?? "") === String(muc.gt ?? "")) {
        soLenhCho.current.delete(khoa);
        continue;
      }
      if (lastValues === goc) lastValues = { ...goc };
      lastValues[key] = muc.gt;
    }
    return lastValues === goc
      ? device
      : { ...device, lastValues, ...suyDanXuat(lastValues, device.product, device.speed) };
  }, []);

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
    const bootstrap = await iotxClient.bootstrap();

    const nhan = bootstrap.phienBan?.products;
    if (nhan !== nhanProductsRef.current) {
      const products = await iotxClient.products();
      ghiProducts(nhan, products);
      productsRef.current = products;
      nhanProductsRef.current = nhan;
    }

    setData(current => ({
      ...current,
      devices: bootstrap.devices
        .filter(device => !device.hidden)
        .map(device => giuLenhDangCho(mapIotxDevice({ ...device, product: productsRef.current[device.type] || device.product }))),
    }));
  }, [giuLenhDangCho]);

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
          // Máy chủ đã lên tiếng về đúng khóa này: nhả nó khỏi sổ giữ, đừng đè lên tin mới.
          soLenhCho.current.delete(`${event.deviceId}\u0000${event.key}`);
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

  /**
   * Nhịp hỏi lại — lưới an toàn cho SSE (xem chú thích ở đầu tệp).
   *
   * Hẹn giờ nối đuôi chứ không dùng setInterval: máy chủ trả chậm thì các request sẽ chồng
   * lên nhau thành một tràng, và càng chậm càng chồng dày.
   */
  useEffect(() => {
    if (!isIotxMode || !signedIn) return;
    let dungLai = false;
    let hen: ReturnType<typeof setTimeout>;
    const nhip = () => (xemKy ? NHIP_XEM_KY_MS : NHIP_THUONG_MS);
    const vong = async () => {
      if (dungLai) return;
      // Tab chạy nền thì không hỏi: trình duyệt bóp nghẹt hẹn giờ, và đã có lần đồng bộ
      // ngay khi người dùng quay lại (effect ở trên) lo phần đó rồi.
      if (document.visibilityState === "visible") await refreshDevices().catch(() => undefined);
      if (dungLai) return;
      hen = setTimeout(vong, nhip());
    };
    hen = setTimeout(vong, nhip());
    return () => { dungLai = true; clearTimeout(hen); };
  }, [signedIn, refreshDevices, xemKy]);

  return {
    hydrated, data, setData, signedIn, setSignedIn, profile, theme, boChu, lang,
    notifications, setNotifications, chiaSeNhanDuoc, chiaSeDaCap,
    luat, setLuat, luatTuThietBi, setLuatTuThietBi,
    doiNgonNgu, syncRemote, taiChiaSe, refreshDevices, ghiNhanLenh, boGhiNhanLenh,
  };
}
