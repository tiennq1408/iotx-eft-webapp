# Việc: Nối luồng đăng ký và quên mật khẩu bằng mã email vào webapp

- Trạng thái: **chưa làm**
- Phạm vi: `IOT App - New UI`
- Làm ở đâu: **tab Code**
- Viết: 19/10/2026 — IBS đã mở đủ 5 cửa, đo trực tiếp trên `api.dev.happibot.net`

## Bối cảnh

IBS **đã mở xong** ba cửa cần cho hai luồng này, và đã đo đạt cả ba ràng buộc bảo mật (xem
`docs/viec-otp-google.md` mục 0b). Webapp hiện mới dựng **vỏ**: màn "Đã gửi mã" có nút *Nhập mã
xác nhận* nhưng bấm vào chỉ hiện *"tính năng đang chờ bật"*.

Việc của doc này là **thay vỏ bằng ruột thật**.

## Hợp đồng đã có thật (đo 19/10)

```
POST /v1/auth/otp/gui
  { tenant, kenh:"email", dinhDanh, viec:"dangKy"|"quenMatKhau" }
  → 200 { ok:true, hetHanSau:300, guiLaiSau:60 }
  → 400 { message } · 429 { message }

POST /v1/auth/otp/xac-nhan
  { tenant, dinhDanh, ma, viec }
  → 200 { ok:true, veTam }
  → 400 { message:"Mã không đúng hoặc đã hết hạn — gửi lại mã mới." }

POST /v1/auth/dat-lai-mat-khau
  { tenant, veTam, matKhauMoi }
  → 200 { ok:true }
  → 400 { message:"Vé xác nhận không hợp lệ hoặc đã hết hạn — xác nhận mã lại." }
```

**Câu `message` của máy chủ đã là tiếng Việt viết cho người dùng đọc — hiện NGUYÊN VĂN, đừng
dịch lại, đừng thay bằng câu của mình.** `moTaLoi()` đã làm đúng việc đó cho 400 và 429.

---

## Việc 1 — `lib/iotx/client.ts`: ba phương thức thật

Xoá hằng `CUA_QUEN_MAT_KHAU` và `QUEN_MAT_KHAU_CHUA_BAT` (dòng 14–20), xoá phương thức
`guiMaQuenMatKhau` (dòng ~257). Thay bằng:

```ts
/** Việc mà mã xác thực phục vụ — đúng hai giá trị hợp đồng nhận. */
export type ViecOtp = "dangKy" | "quenMatKhau";

/**
 * Gửi mã 6 số tới email.
 *
 * LUÔN trả 200 kể cả email không tồn tại — cố ý, để không ai dùng cửa này dò xem địa chỉ nào
 * có tài khoản. Nghĩa là màn hình KHÔNG được suy ra điều gì từ việc gọi thành công.
 */
guiMaOtp(dinhDanh: string, viec: ViecOtp) {
  return this.request<Ok<{ hetHanSau: number; guiLaiSau: number }>>("/auth/otp/gui", {
    method: "POST", auth: false,
    body: { tenant: iotxConfig.tenant, kenh: "email", dinhDanh, viec },
  });
}

/** Đổi mã lấy vé tạm. Vé dùng cho đúng bước kế tiếp, sống ngắn, dùng một lần. */
xacNhanMaOtp(dinhDanh: string, ma: string, viec: ViecOtp) {
  return this.request<Ok<{ veTam: string }>>("/auth/otp/xac-nhan", {
    method: "POST", auth: false,
    body: { tenant: iotxConfig.tenant, dinhDanh, ma, viec },
  });
}

/** Đặt mật khẩu mới sau khi đã xác nhận mã. KHÔNG trả vé đăng nhập — xong phải quay về màn đăng nhập. */
datLaiMatKhau(veTam: string, matKhauMoi: string) {
  return this.request<Ok>("/auth/dat-lai-mat-khau", {
    method: "POST", auth: false,
    body: { tenant: iotxConfig.tenant, veTam, matKhauMoi },
  });
}
```

Và sửa `register` để mang thêm `veTam`:

```ts
async register(email: string, password: string, fullName?: string, veTam?: string) {
  const result = await this.request<IotxTokenSet>("/auth/register", {
    method: "POST", auth: false,
    body: { tenant: iotxConfig.tenant, email, password, fullName, ...(veTam ? { veTam } : {}) },
  });
  this.theHe++;
  this.tokens.set(result);
  return result;
}
```

> **Biết trước để khỏi hoang mang:** đo ngày 19/10, `/auth/register` **chưa đọc `veTam`** — câu
> kiểm tra đầu vào của nó đi thẳng từ *"Thiếu email/số điện thoại"* sang *"Mật khẩu phải có tối
> thiểu 8 ký tự"*, không nhắc tới vé. Gửi thêm trường thừa thì máy chủ bỏ qua, không lỗi. Nghĩa
> là **hôm nay bước xác thực mã chỉ được ép ở phía webapp**, chưa được máy chủ ép. Ngày IBS ghép
> xong thì webapp **không phải sửa gì**. Việc này đã báo IBS.

---

## Việc 2 — Một màn nhập mã dùng chung

**File mới:** `components/ui/NhapMaOtp.tsx`

Cả hai luồng đều cần đúng màn này, nên viết một lần.

```tsx
export default function NhapMaOtp({ dich, hetHanSau, guiLaiSau, dangGui, onXacNhan, onGuiLai }: {
  /** Địa chỉ đã gửi tới — chỉ để hiện cho người dùng nhìn. */
  dich: string;
  hetHanSau: number;   // giây, máy chủ trả
  guiLaiSau: number;   // giây, máy chủ trả
  dangGui: boolean;
  onXacNhan: (ma: string) => void | Promise<void>;
  onGuiLai: () => void | Promise<void>;
})
```

**Yêu cầu bắt buộc:**

| | Yêu cầu | Vì sao |
|---|---|---|
| a | **Một ô nhập duy nhất**, không phải 6 ô rời | 6 ô rời hỏng khi dán mã, và trình đọc màn hình đọc thành sáu trường vô nghĩa |
| b | `inputMode="numeric"` · `autoComplete="one-time-code"` · `maxLength={6}` · `pattern="\d{6}"` | iOS và Android tự điền mã từ thư nhờ `one-time-code` |
| c | Dán vào thì **lọc bỏ mọi ký tự không phải số** rồi cắt còn 6 | người ta hay dán kèm khoảng trắng |
| d | Đủ 6 số thì **tự gửi**, không cần bấm nút | bớt một thao tác, và tránh cảnh gõ xong ngồi nhìn |
| e | Đếm ngược **hết hạn** theo `hetHanSau`, hiện `m:ss` | người dùng biết còn bao lâu |
| f | Nút **Gửi lại** khoá cho tới khi hết `guiLaiSau`, hiện số giây còn lại | hợp đồng chặn 60 giây, khoá nút thì khỏi ăn 429 oan |
| g | Hết hạn → khoá ô nhập, chỉ còn nút Gửi lại | gõ vào ô đã hết hạn chỉ tốn công |
| h | Vùng chạm nút ≥ 44px, ô nhập cỡ chữ ≥ 16px | ≥16px thì Safari iOS không tự phóng to trang |

Màn này **không tự gọi API** — nhận `onXacNhan` / `onGuiLai` từ ngoài, để hai luồng dùng chung
mà mỗi luồng tự lo phần việc của mình.

---

## Việc 3 — Quên mật khẩu: ba bước

**File:** `components/ui/LoginScreen.tsx`

Đổi kiểu bước (dòng 83):

```ts
const [qmBuoc, setQmBuoc] = useState<"nhap" | "nhapMa" | "datLai">("nhap");
const [qmVe, setQmVe] = useState("");          // veTam sau khi xác nhận mã
const [qmHan, setQmHan] = useState({ hetHanSau: 300, guiLaiSau: 60 });
const [qmPw, setQmPw] = useState("");
const [qmPw2, setQmPw2] = useState("");
```

**Bước 1 → 2.** Sửa `guiMa()`: gọi `iotxClient.guiMaOtp(id, "quenMatKhau")`, lấy
`hetHanSau`/`guiLaiSau` từ kết quả vào `qmHan`, rồi `setQmBuoc("nhapMa")`. Bỏ nhánh
`QUEN_MAT_KHAU_CHUA_BAT` — hằng đó không còn.

**Bước 2 → 3.** Dựng `<NhapMaOtp>`; `onXacNhan` gọi `xacNhanMaOtp(qmId, ma, "quenMatKhau")`,
lưu `veTam` vào `qmVe`, sang `"datLai"`. Mã sai thì **ở nguyên bước 2** và hiện câu máy chủ trả.

**Bước 3.** Form hai ô mật khẩu mới, kiểm tại chỗ y như màn đăng ký (`MAT_KHAU_TOI_THIEU`, hai ô
phải khớp), rồi gọi `datLaiMatKhau(qmVe, qmPw)`.

**Xong thì — quan trọng:**

```
→ về màn "dangNhap"
→ hiện một dòng báo thành công
→ TUYỆT ĐỐI KHÔNG tự đăng nhập
```

Cửa `/dat-lai-mat-khau` chỉ trả `{ok:true}`, **không có vé đăng nhập**. Bắt người dùng đăng nhập
lại bằng mật khẩu mới là đúng — họ vừa đổi, cần biết nó chạy; và nếu luồng này bị kẻ khác chạy
thì tự đăng nhập là trao tài khoản cho họ.

---

## Việc 4 — Đăng ký: chèn bước mã vào giữa

Thứ tự đúng là **gửi mã trước, tạo tài khoản sau** — để không sinh ra tài khoản chưa xác minh
nằm rác trong hệ thống.

```
Bước 1  điền form (tên · email · mật khẩu · nhập lại)
        kiểm tại chỗ y như hiện nay — KHÔNG đổi phần này
        → guiMaOtp(id, "dangKy")
        → sang bước 2

Bước 2  <NhapMaOtp>
        → xacNhanMaOtp(id, ma, "dangKy")  → veTam
        → register(id, pw, ten, veTam)
        → onDone()   (register đã trả vé, vào thẳng app)
```

Thêm state:

```ts
const [dkBuoc, setDkBuoc] = useState<"nhap" | "nhapMa">("nhap");
const [dkHan, setDkHan] = useState({ hetHanSau: 300, guiLaiSau: 60 });
```

**Giữ nguyên mật khẩu trong state giữa hai bước.** Đừng bắt gõ lại sau khi nhập mã.

**Một chỗ chưa biết, phải thử rồi mới chốt:** gọi `/otp/gui` với `viec:"dangKy"` cho một email
**đã có tài khoản** thì máy chủ làm gì? Chưa đo. Thử trước khi viết nhánh xử lý; nếu nó vẫn trả
200 như mọi khi thì lỗi "email đã đăng ký" sẽ chỉ lộ ra ở bước `register` — lúc đó phải **quay
người dùng về bước 1** kèm câu máy chủ trả, đừng để họ kẹt ở màn nhập mã.

---

## Việc 5 — Chữ

**Sửa hai khoá đang SAI** (`lib/ui/strings.ts` dòng 109 và 286):

```
qm_da_gui_lead  "…Mã có hiệu lực trong 10 phút."   →  máy chủ trả hetHanSau = 300 giây = 5 phút
```

Đừng cắm cứng con số nữa — **đọc từ `hetHanSau`** máy chủ trả, vì IBS đổi là câu chữ sai ngay.

Thêm các khoá mới, **đủ cả ba ngôn ngữ vi / en / fil**:

```
ma_nhan            "Mã xác nhận"
ma_ph              "6 chữ số"
ma_con_lai         "Mã hết hạn sau {t}"
ma_het_han         "Mã đã hết hạn — bấm Gửi lại để nhận mã mới."
ma_gui_lai_sau     "Gửi lại sau {n}s"
ma_dang_kiem       "Đang kiểm mã…"
qm_dat_lai_title   "Đặt mật khẩu mới"
qm_dat_lai_lead    "Mật khẩu mới phải khác mật khẩu cũ."
qm_xong            "Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới."
dk_ma_lead         "Nhập mã chúng tôi vừa gửi tới {dich} để hoàn tất đăng ký."
```

Thiếu một ngôn ngữ thì màn rơi về tiếng Việt mà không ai hay — `strings.ts` đã ghi cái bẫy này.

---

## Việc 6 — Bài kiểm

**File mới:** `tests/otp.mjs`, đăng ký vào nhóm `api` trong `tests/chay.mjs`.

Chạy trên máy chủ giả. Thêm vào `tests/may-chu-gia.mjs` ba cửa `/v1/auth/otp/gui`,
`/v1/auth/otp/xac-nhan`, `/v1/auth/dat-lai-mat-khau` với mã cố định `123456` để bài kiểm đoán được.

| Ca | Mong đợi |
|---|---|
| Quên mật khẩu: email → mã đúng → mật khẩu mới | về màn đăng nhập, **không tự đăng nhập** |
| Mã sai | ở nguyên bước 2, hiện **nguyên văn** câu máy chủ |
| Dán `" 1 2 3 4 5 6 "` | ô nhận đúng `123456` |
| Đủ 6 số | **tự gửi**, không cần bấm nút |
| Nút Gửi lại | khoá lúc đầu, mở sau `guiLaiSau` giây |
| Hết `hetHanSau` | ô nhập khoá, chỉ còn Gửi lại |
| Máy chủ trả 429 | hiện nguyên văn câu máy chủ, không nhảy bước |
| Đăng ký: form → mã → vào app | vào thẳng, không phải gõ lại mật khẩu |
| Đăng ký, mã đúng nhưng `register` lỗi | **quay về bước 1** kèm câu lỗi, không kẹt ở màn mã |

---

## Kiểm sau khi làm

```bash
cd "/Users/tienquang/Documents/Homichi/IOT/IOT App - New UI"
npm run lint
npm run build
npm test
```

Rồi chạy thật với API DEV, bằng một email có hộp thư thật:

- [ ] Quên mật khẩu → **nhận được thư** → mã 6 số → đặt mật khẩu mới → đăng nhập lại được
- [ ] Mật khẩu **cũ** không còn dùng được
- [ ] Dùng lại **chính mã đó** lần hai → bị từ chối
- [ ] Đăng ký email mới → nhận mã → vào thẳng app
- [ ] Bấm Gửi lại liên tục → bị chặn, câu báo nói rõ chờ bao lâu
- [ ] Nhập email **không tồn tại** → màn hình nói y hệt email có thật (không lộ)

## Chưa nằm trong doc này

- **Đăng nhập Google** — chờ Client ID/Secret và chờ biết lỗi 503 có chặn không
- **Đọc `loginMethods`** (việc 4.6 của `viec-otp-google.md`) — nên làm cùng đợt, nhưng là việc riêng
- **Mã qua SMS** — hợp đồng đã chừa `kenh`, nhưng cổng SMS chưa có

## Nhắc

Việc này thực thi ở **tab Code**, không làm ở đây.
