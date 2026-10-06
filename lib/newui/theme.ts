import type { IotxTheme } from "@/lib/iotx/contracts";

/**
 * Áp theme của hãng (`GET /tenant/theme`) lên bảng màu.
 *
 * Hãng chỉ khai một màu chính. Dùng thẳng màu đó cho nút có chữ trắng là đánh cược với
 * tương phản: `#02b6ac` của Livotec chỉ đạt 2,6:1 với chữ trắng. Vì vậy màu chính chỉ dùng
 * cho mảng đặc không chữ (công tắc, thanh tiến trình), còn nền nút và chữ dùng một biến thể
 * đã làm đậm tới khi đạt 4,5:1.
 */

function rgb(hex: string): [number, number, number] | null {
  const ma = hex.trim().replace("#", "");
  const day = ma.length === 3 ? ma.split("").map(c => c + c).join("") : ma;
  if (!/^[0-9a-fA-F]{6}$/.test(day)) return null;
  return [parseInt(day.slice(0, 2), 16), parseInt(day.slice(2, 4), 16), parseInt(day.slice(4, 6), 16)];
}

const hex = ([r, g, b]: [number, number, number]) =>
  "#" + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

function doSang([r, g, b]: [number, number, number]) {
  const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

const tuongPhanVoiTrang = (c: [number, number, number]) => 1.05 / (doSang(c) + 0.05);

/** Làm đậm dần cho tới khi chữ trắng trên nền này đạt ngưỡng WCAG cho chữ thường. */
function damDuChoChuTrang(mau: [number, number, number], nguong = 4.5): [number, number, number] {
  let c = mau;
  for (let i = 0; i < 40 && tuongPhanVoiTrang(c) < nguong; i++) {
    c = [c[0] * 0.94, c[1] * 0.94, c[2] * 0.94];
  }
  return c;
}

/** Trộn với trắng để ra nền nhạt cùng tông. */
const nhat = (c: [number, number, number], ty: number): [number, number, number] =>
  [c[0] + (255 - c[0]) * ty, c[1] + (255 - c[1]) * ty, c[2] + (255 - c[2]) * ty];

export function apDungTheme(theme: IotxTheme | null | undefined) {
  if (typeof document === "undefined") return;
  const goc = theme?.colorPrimary ? rgb(theme.colorPrimary) : null;
  const root = document.documentElement.style;
  if (!goc) {
    // Hãng không khai màu: trả về bảng màu trong CSS.
    root.removeProperty("--teal");
    root.removeProperty("--teal-dark");
    root.removeProperty("--teal-soft");
    return;
  }
  root.setProperty("--teal", hex(goc));
  root.setProperty("--teal-dark", hex(damDuChoChuTrang(goc)));
  root.setProperty("--teal-soft", hex(nhat(goc, 0.88)));
}
