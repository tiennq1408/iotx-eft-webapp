import type { KeyboardEvent } from "react";

/** Enter/Space trên phần tử `role="button"` không phải <button>: kích hoạt như bấm chuột. */
export function phimKichHoat(e: KeyboardEvent, hanhDong: () => void) {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  hanhDong();
}
