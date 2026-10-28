"use client";

import { useEffect, useState } from "react";
import { Bluetooth, Wifi, WifiOff } from "lucide-react";
import { useChu } from "../chu";
import { kenhDung, ngheBle, phienBle } from "@/lib/ble/dieuKhienBle";
import type { Device } from "@/lib/types";

/**
 * Phiên Bluetooth của thiết bị và kênh lệnh đang dùng — vẽ lại khi phiên mở/đóng, khi người
 * dùng đổi giữa "Dùng Bluetooth" và "Ưu tiên Wi-Fi", và khi `device.online` đổi.
 */
export function useKenhBle(device: Pick<Device, "id" | "online">) {
  const [, setNhip] = useState(0);
  useEffect(() => ngheBle(id => { if (id === device.id) setNhip(n => n + 1); }), [device.id]);
  return { phien: phienBle(device.id), kenh: kenhDung(device) };
}

/**
 * Thiết bị đang nói chuyện với app qua kênh nào: Bluetooth (đang nối gần — lệnh đi thẳng tới
 * máy), Wi-Fi (máy chủ thấy máy trực tuyến — lệnh đi qua `/v1`), hay không kênh nào.
 *
 * Hai kênh có thể cùng sáng (đang nối Bluetooth mà máy vẫn có Wi-Fi). Chip của kênh lệnh đang
 * dùng tô đặc; chip của kênh còn lại chỉ viền (`cho`) — Wi-Fi được ưu tiên, trừ khi người dùng
 * tự chọn Bluetooth (xem `kenhDung`).
 *
 * `gon`: chỉ icon, cho thẻ trong danh sách; chữ đầy đủ nằm ở `aria-label` và `title`.
 */
export default function KenhKetNoi({ device, gon = false }: { device: Device; gon?: boolean }) {
  const { t } = useChu();
  const { phien, kenh: dung } = useKenhBle(device);
  const wifi = device.online;

  const kenh = [
    ...(phien ? [dung === "ble"
      ? { loai: "ble", Icon: Bluetooth, chu: t("kenh_ble"), moTa: t("kenh_ble_mo_ta"), cho: false }
      : { loai: "ble", Icon: Bluetooth, chu: t("kenh_ble"), moTa: t("kenh_ble_cho_mo_ta"), cho: true }] : []),
    wifi
      ? dung === "wifi"
        ? { loai: "wifi", Icon: Wifi, chu: t("kenh_wifi"), moTa: t("kenh_wifi_mo_ta"), cho: false }
        : { loai: "wifi", Icon: Wifi, chu: t("kenh_wifi"), moTa: t("kenh_wifi_cho_mo_ta"), cho: true }
      : { loai: "mat", Icon: WifiOff, chu: t("offline"), moTa: t("kenh_mat_mo_ta"), cho: false },
  ];

  return (
    <span className={`kenh${gon ? " gon" : ""}`}>
      {kenh.map(({ loai, Icon, chu, moTa, cho }) => gon ? (
        <span key={loai} className={`kenh-ic ${loai}`} role="img" aria-label={moTa} title={moTa}>
          <Icon aria-hidden="true" />
        </span>
      ) : (
        <span key={loai} className={`kenh-chip ${loai}${cho ? " cho" : ""}`} title={moTa}>
          <Icon aria-hidden="true" />{chu}
        </span>
      ))}
    </span>
  );
}
