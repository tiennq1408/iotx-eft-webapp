/**
 * Màu MÉP TRÊN của màn đang hiện — tô cho vùng tai thỏ / thanh trạng thái.
 *
 * Trên iPhone (Safari) và Android (Chrome), vùng đó do trình duyệt tô theo `<meta name="theme-color">`.
 * Để màu cố định thì nền app (dải màu) không "tràn" lên tai thỏ: màn đăng nhập màu đào mà dải trên
 * cùng lại xám xanh. Nên đổi theo màn, và đặt luôn nền `html` (biến `--mau-dinh`) cho vùng lộ ra khi
 * kéo quá đầu trang hay hai bên tai thỏ lúc xoay ngang.
 *
 * Số đo bằng cách chụp đúng mép trên từng màn ở 390px (23/10/2026). Dải màu nền là hằng trong CSS
 * (`--nen-anh`, nền màn đăng nhập, `.devpage`), không đổi theo theme của hãng — sửa CSS thì đo lại.
 */
export const MAU_DINH = {
  dangNhap: "#fadcbe",
  app: "#f2ece0",
  appToi: "#1f2420",
  chiTiet: "#f4f9f8",
  chiTietToi: "#0e1614",
} as const;

export function datMauDinh(mau: string) {
  if (typeof document === "undefined") return;
  let the = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!the) {
    the = document.createElement("meta");
    the.name = "theme-color";
    document.head.appendChild(the);
  }
  if (the.content !== mau) the.content = mau;
  document.documentElement.style.setProperty("--mau-dinh", mau);
}
