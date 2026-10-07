import type { ReactNode } from "react";

/**
 * Bộ icon một nét của prototype. Giữ nguyên hình để giao diện khớp bản thiết kế, nhưng
 * dựng bằng JSX thay vì nối chuỗi HTML nên không có `dangerouslySetInnerHTML` nào.
 */
const D = {
  home: ["M3 11l9-7 9 7", "M5 10v10h14V10"],
  grid: [],
  heart: ["M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"],
  loop: ["M3 12a9 9 0 0115-6.7L21 8", "M21 3v5h-5", "M21 12a9 9 0 01-15 6.7L3 16", "M3 21v-5h5"],
  plus: ["M12 5v14M5 12h14"],
  bell: ["M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z", "M10 20a2 2 0 004 0"],
  menu: ["M4 7h16M4 12h16M4 17h16"],
  close: ["M18 6L6 18M6 6l12 12"],
  star: ["M12 2l3.1 6.6 7.2.8-5.4 5 1.5 7.2-6.4-3.6-6.4 3.6 1.5-7.2-5.4-5 7.2-.8z"],
  eye: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"],
  chevDown: ["M6 9l6 6 6-6"],
  chevUp: ["M18 15l-6-6-6 6"],
  chevRight: ["M9 6l6 6-6 6"],
  chevLeft: ["M15 6l-6 6 6 6"],
  minus: ["M5 12h14"],
  check: ["M5 12l5 5L20 7"],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"],
  wrench: ["M14.7 6.3a4 4 0 01-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 015.4-5.4l-3-3z"],
  shield: ["M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z"],
  checkCircle: ["M8 12l3 3 5-6"],
  cart: ["M2 3h2l2.4 12.4a2 2 0 002 1.6h8.6a2 2 0 002-1.6L21 7H6"],
  users: ["M2 20c0-3.5 3-6 7-6s7 2.5 7 6", "M15 14c2.8.3 5 2.3 5 5"],
  wifi: ["M2 8.5a16 16 0 0120 0", "M5.5 12a11 11 0 0113 0", "M9 15.5a6 6 0 016 0"],
  sun: ["M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"],
  snow: ["M12 2v20M4.5 6l15 12M19.5 6l-15 12"],
  wind: ["M3 8h11a2.5 2.5 0 100-5", "M3 16h15a2.5 2.5 0 110 5", "M3 12h8"],
  drop: ["M12 3s6 6.5 6 10.5A6 6 0 016 13.5C6 9.5 12 3 12 3z"],
  flame: ["M12 2c1 4-3 4-3 8a3 3 0 006 0c0-2-1-2-1-4 2 1 4 4 4 7a6 6 0 11-12 0c0-5 3-6 6-11z"],
  house: ["M4 11.5L12 4l8 7.5", "M6 10v10h12V10"],
  box: ["M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"],
  clock: ["M12 7v5l3 3"],
  bolt: ["M13 2L4 14h6l-1 8 9-12h-6l1-8z"],
  faceScan: ["M4 8V6a2 2 0 012-2h2", "M20 8V6a2 2 0 00-2-2h-2", "M4 16v2a2 2 0 002 2h2", "M20 16v2a2 2 0 01-2 2h-2", "M9 15c1 1 5 1 6 0"],
  home2: ["M4 11l8-6.5L20 11", "M6 10v9a1 1 0 001 1h3v-5h4v5h3a1 1 0 001-1v-9"],
  devices2: ["M12 2.3v2.2M12 19.5v2.2M2.3 12h2.2M19.5 12h2.2"],
  lifebuoy: ["M6.4 6.4l2.7 2.7M17.6 6.4l-2.7 2.7M6.4 17.6l2.7-2.7M17.6 17.6l-2.7-2.7"],
  compass: ["M15.3 8.7l-2 5-5 2 2-5z"],
  externalLink: ["M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6", "M15 3h6v6", "M10 14L21 3"],
  leaf: ["M5 19c8 1 14-5 14-14-9 0-14 6-14 14z", "M5 19c2-4 5-7 9-9"],
  acUnit: ["M6 15v2M10 15v2M14 15v2M18 15v2", "M17 5.5l1.6-1.6"],
  noBug: ["M12 8v8M8 12h8", "M6 6l3 3M18 6l-3 3M6 18l3-3M18 18l-3-3"],
  moon: ["M20 14.5A8.5 8.5 0 1110 4a6.8 6.8 0 0010 10.5z", "M17 3l.6 1.4L19 5l-1.4.6L17 7l-.6-1.4L15 5l1.4-.6z"],
  muteIcn: ["M4 9v6h4l5 4V5L8 9H4z", "M17 9l4 6M21 9l-4 6"],
  swingV: ["M12 3v18", "M7 7l5-4 5 4", "M7 17l5 4 5-4"],
  swingH: ["M3 12h18", "M7 7L3 12l4 5", "M17 7l4 5-4 5"],
  power: ["M12 3v8", "M6 6.3a8 8 0 1012 0"],
  qr: ["M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z", "M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"],
  settings: ["M12 15a3 3 0 100-6 3 3 0 000 6z", "M4 12H2M22 12h-2M12 4V2M12 22v-2M6 6L4.5 4.5M19.5 19.5L18 18M18 6l1.5-1.5M4.5 19.5L6 18"],
  play: ["M8 5l11 7-11 7z"],
  sparkle: ["M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"],
  arrowLeft: ["M19 12H5", "M11 6l-6 6 6 6"],
  share: ["M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7", "M12 16V3", "M8 7l4-4 4 4"],
  search: ["M20 20l-4.2-4.2"],
  lock: ["M8 10V7a4 4 0 118 0v3", "M12 14v2.5"],
  lockOpen: ["M8 10V7a4 4 0 017.6-1.8", "M12 14v2.5"],
  fanIcn: ["M12 11.2c0-3.6 1.3-5.4 3.4-5.4 2 0 2.6 3.4.3 4.5", "M12.8 12.8c3.2 1.6 4 3.5 3 5.3-1 1.8-4.1.5-4-2", "M11.2 12.8c-3.2 1.6-4 3.5-3 5.3 1 1.8 4.1.5 4-2"],
  heat: ["M8 21c-1.6-2.2 0-4 1-5.6S10 12 8 9.8", "M14 21c-1.6-2.2 0-4 1-5.6S16 12 14 9.8", "M3 5.5h18"],
  pot: ["M4 9h16v5.5a4.5 4.5 0 01-4.5 4.5h-7A4.5 4.5 0 014 14.5z", "M12 3v2.5", "M3 9h18"],
  hoodIcn: ["M3 5.5h18l-2.4 5H5.4z", "M6.5 10.5v3.2a4.3 4.3 0 004.3 4.3h2.4a4.3 4.3 0 004.3-4.3v-3.2"],
  filterIcn: ["M3 5h18l-7 8.2V20l-4 1.6v-8.4z"],
  gauge: ["M12 13.2l3.8-3", "M4.6 18.4a9 9 0 1114.8 0"],
  tds: ["M7 18.5a4.2 4.2 0 004.2-4.2c0-2.6-4.2-7.3-4.2-7.3s-4.2 4.7-4.2 7.3A4.2 4.2 0 007 18.5z", "M16.6 12.6a3 3 0 002.9-4.2c-.6-1.7-2.9-4.5-2.9-4.5s-2.3 2.8-2.9 4.5a3 3 0 002.9 4.2z"],
  battery: ["M3.5 8.5h13.6a1 1 0 011 1v5a1 1 0 01-1 1H3.5a1 1 0 01-1-1v-5a1 1 0 011-1z", "M21 11v2"],
  duct: ["M5 20.5V9.5a4.5 4.5 0 014.5-4.5h5A4.5 4.5 0 0119 9.5v11", "M9.5 20.5V14h5v6.5"],
} as const satisfies Record<string, readonly string[]>;

/** Vòng / hình cơ bản đi kèm một số icon (không vẽ được bằng path đơn). */
const SHAPES: Partial<Record<keyof typeof D, ReactNode>> = {
  lock: <rect x="5" y="10" width="14" height="10" rx="2.5" />,
  lockOpen: <rect x="5" y="10" width="14" height="10" rx="2.5" />,
  fanIcn: <circle cx="12" cy="12" r="1.6" />,
  gauge: <circle cx="12" cy="18.4" r="1" />,
  grid: <>
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </>,
  eye: <circle cx="12" cy="12" r="3" />,
  checkCircle: <circle cx="12" cy="12" r="9" />,
  cart: <><circle cx="9" cy="20" r="1.3" /><circle cx="18" cy="20" r="1.3" /></>,
  users: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.3" /></>,
  wifi: <circle cx="12" cy="19" r="1" />,
  sun: <circle cx="12" cy="12" r="4" />,
  box: <rect x="3" y="7" width="18" height="13" rx="1.5" />,
  clock: <circle cx="12" cy="12" r="9" />,
  faceScan: <><circle cx="9" cy="10" r="0.8" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="0.8" fill="currentColor" stroke="none" /></>,
  devices2: <><rect x="5" y="5" width="14" height="14" rx="4.5" /><circle cx="12" cy="12" r="2.3" /></>,
  lifebuoy: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.3" /></>,
  compass: <circle cx="12" cy="12" r="9" />,
  acUnit: <rect x="3" y="8" width="18" height="7" rx="2" />,
  noBug: <circle cx="12" cy="12" r="8.5" />,
  search: <circle cx="11" cy="11" r="6" />,
};

/**
 * Tên trong bộ thì gõ sai là lỗi biên dịch. Vẫn nhận chuỗi bất kỳ vì tên icon của thông báo
 * và băng quảng cáo đến từ máy chủ lúc chạy; tên lạ rơi về ô lưới.
 */
export type TenIcon = keyof typeof D | (string & {});

const coTen = (name: string): name is keyof typeof D => Object.prototype.hasOwnProperty.call(D, name);

export default function Icon({ name, className, filled = false }: { name: TenIcon; className?: string; filled?: boolean }) {
  const ten = coTen(name) ? name : "grid";
  const paths: readonly string[] = D[ten];
  const shape = SHAPES[ten] ?? null;
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" focusable="false">
      {shape}
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
