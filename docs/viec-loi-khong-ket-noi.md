# Việc: Sửa lỗi "Không kết nối được máy chủ" khi mở bằng IP LAN / trên máy khác

- Trạng thái: **chưa làm**
- Phạm vi: `IOT App - New UI`
- Làm ở đâu: **tab Code**
- Viết: 15/10/2026 — đọc mã trực tiếp, không đoán

## Triệu chứng

Mở `http://localhost:3000` trên máy phát triển thì chạy. Mở cùng app bằng **IP LAN trên điện
thoại**, hoặc clone sang **máy khác** rồi dựng và chạy, thì báo *"Không kết nối được máy chủ.
Kiểm tra đường truyền rồi thử lại."*

## Chẩn đoán gốc: một câu báo lỗi đang gánh bốn nguyên nhân

`lib/iotx/errors.ts` dòng 20–29 trả **cùng một câu** cho bốn tình huống khác hẳn nhau:

| Nguồn | Request có rời trình duyệt không | Nguyên nhân thật |
|---|---|---|
| `error instanceof TypeError` | **KHÔNG** | mã client ném lỗi trước khi gọi mạng |
| HTTP **502** | Có | proxy `/v1` không với tới IBS |
| HTTP 503 / 504 | Có | cửa ngõ hoặc IBS quá tải |
| `status === 0` | Không | request bị chặn |

Hàng 1 và hàng 2 là hai thế giới khác nhau — một bên lỗi trình duyệt, một bên lỗi mạng máy chủ —
mà người dùng và cả người phát triển đều thấy y hệt. Đây là lý do lỗi này không bao giờ chẩn
đoán được. **Sửa chỗ này là việc quan trọng nhất trong doc, không phải việc phụ.**

---

## Lỗi 1 — `crypto.randomUUID()` không tồn tại ngoài secure context

**File:** `lib/iotx/client.ts` dòng 275

```ts
rpc(id: string, method: string, params: Record<string, unknown>, idempotencyKey = crypto.randomUUID()) {
```

`crypto.randomUUID()` là API **chỉ có trong secure context**: `https://`, `localhost`,
`127.0.0.1`. Mở bằng `http://192.168.x.x:3000` trên điện thoại thì `crypto.randomUUID` là
`undefined`, gọi vào ném `TypeError` → rơi đúng hàng 1 của bảng trên → hiện
*"Không kết nối được máy chủ"*. Mạng hoàn toàn bình thường, request chưa hề được gửi.

Lưu ý `crypto.getRandomValues()` thì **có** ở mọi ngữ cảnh — chỉ `randomUUID` và `crypto.subtle`
mới đòi secure context.

**Dấu nhận biết:** trên điện thoại đăng nhập được, danh sách thiết bị hiện bình thường, nhưng
**bấm bật/tắt là lỗi**. Vì `randomUUID` chỉ nằm ở `rpc()`, tức chỉ hai chỗ gọi:
`components/LivotecApp.tsx:130` và `components/LivotecApp.tsx:194`.

Dự án đã xử lý secure context cho camera (`QuetQR.tsx`) và Web Bluetooth (`AddDevice.tsx`);
chỗ này bị sót.

### Sửa

Thêm hàm sinh UUID có đường lui vào `lib/iotx/client.ts`, đặt trên lớp client:

```ts
/**
 * UUID v4 dùng được cả ngoài secure context.
 *
 * `crypto.randomUUID()` chỉ tồn tại trên https/localhost. Mở app bằng IP LAN (http://192.168.x.x)
 * trên điện thoại thì nó là `undefined`, ném TypeError, và `moTaLoi` dịch TypeError thành
 * "Không kết nối được máy chủ" — báo sai hoàn toàn, mạng không hề hỏng.
 * `crypto.getRandomValues` thì có ở mọi ngữ cảnh, nên dựng tay v4 từ nó.
 */
function khoaMotLan(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;  // phiên bản 4
  b[8] = (b[8] & 0x3f) | 0x80;  // biến thể RFC 4122
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
```

rồi đổi dòng 275:

```ts
rpc(id: string, method: string, params: Record<string, unknown>, idempotencyKey = khoaMotLan()) {
```

Tính duy nhất giữ nguyên: 122 bit ngẫu nhiên, đúng như `randomUUID`. Luật
"mỗi lệnh RPC thật một `Idempotency-Key` riêng" trong `AGENTS.md` không bị vi phạm.

---

## Lỗi 2 — thiếu dải IP riêng `172.16–31.*.*`

**File:** `next.config.ts`, mảng `allowedDevOrigins`

Đang khai `192.168.*.*` và `10.*.*.*`, **thiếu dải 172.16–31** mà nhiều router và điểm phát
sóng từ điện thoại dùng. Rơi vào dải đó thì ở `next dev`, bó mã `/_next/*` bị trả 403, React
không hydrate, app đứng ở màn "Đang khởi động" mãi (chính cái bẫy đã ghi trong chú thích ngay
trên mảng đó).

### Sửa

Thêm vào mảng. `*` chỉ ăn **một đoạn** nên phải liệt kê đủ 16 dải con — không viết tắt được:

```ts
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    // Dải riêng 172.16.0.0/12. Mẫu khớp theo từng đoạn nên `172.*.*.*` sẽ mở nhầm cả
    // 172.0–15 và 172.32–255 vốn là địa chỉ công cộng; liệt kê đủ 16 dải con.
    "172.16.*.*", "172.17.*.*", "172.18.*.*", "172.19.*.*",
    "172.20.*.*", "172.21.*.*", "172.22.*.*", "172.23.*.*",
    "172.24.*.*", "172.25.*.*", "172.26.*.*", "172.27.*.*",
    "172.28.*.*", "172.29.*.*", "172.30.*.*", "172.31.*.*",
    "*.trycloudflare.com",
    "*.ngrok-free.app",
  ],
```

Chỉ có tác dụng với `next dev`. Bản dựng không kiểm tra mục này.

---

## Lỗi 3 — câu báo lỗi phải phân biệt được bốn nguyên nhân

Đây là việc làm cho mọi lần sau tự chẩn đoán được, kể cả lỗi chưa gặp.

### 3a. Tách `TypeError` khỏi 502 trong `lib/iotx/errors.ts`

Thêm một câu nữa và đổi thứ tự xét:

```ts
const CAU_MANG = "Không kết nối được máy chủ. Kiểm tra đường truyền rồi thử lại.";
const CAU_TRINH_DUYET = "Trình duyệt không gửi được yêu cầu. Nếu đang mở bằng http:// trên máy khác, hãy thử https:// hoặc localhost.";
```

Trong `moTaLoi`, nhánh `TypeError` hiện trả `CAU_MANG`; đổi thành `CAU_TRINH_DUYET`.
Giữ nguyên `CAU_MANG` cho 0 / 502 / 503 / 504.

Lý do: hai câu này dẫn người dùng đi hai hướng khác nhau. Gộp làm một là dẫn sai hướng
trong đúng một nửa số lần.

### 3b. Ghi nguyên nhân thật ra console

Trong `moTaLoi`, trước khi trả `CAU_TRINH_DUYET`, thêm:

```ts
if (error instanceof TypeError) {
  // Câu hiện ra cho người dùng cố tình chung chung; người phát triển cần biết lỗi thật.
  console.error("[iotx] yêu cầu không rời được trình duyệt:", error);
  return CAU_TRINH_DUYET;
}
```

### 3c. Mở `chiTiet` của proxy cho bản dựng không phải production

**File:** `app/v1/[...path]/route.ts` dòng 69

Hiện tại:

```ts
const chiTiet = process.env.NODE_ENV === "production" ? undefined : (loi instanceof Error ? loi.message : String(loi));
```

`next build` đặt `NODE_ENV=production`, nên **mọi bản dựng đều giấu nguyên nhân thật**. Đó là
lý do chạy trên máy khác không bao giờ biết được vì sao 502. Đổi sang cờ môi trường riêng,
mặc định tắt:

```ts
// `NODE_ENV` không dùng được làm điều kiện ở đây: `next build` luôn đặt nó là "production",
// kể cả bản dựng để thử trên máy nội bộ — thành ra đúng lúc cần chẩn đoán nhất thì nguyên
// nhân thật bị giấu. Cờ riêng, mặc định TẮT: bật tay khi cần soi, không bao giờ bật ở thật.
const chiTiet = process.env.IOTX_HIEN_LOI_PROXY === "1"
  ? (loi instanceof Error ? loi.message : String(loi))
  : undefined;
```

Thêm vào `.env.example`:

```
# Hiện nguyên nhân thật khi proxy /v1 không với tới IBS (tên máy, cổng, lỗi DNS/TLS).
# Chỉ bật khi đang chẩn đoán trên máy nội bộ. KHÔNG bật ở môi trường thật.
IOTX_HIEN_LOI_PROXY=0
```

---

## Phần KHÔNG sửa bằng mã: trường hợp "clone sang máy khác"

Đã loại trừ được cấu hình: `.env.local` **không tồn tại** trên máy phát triển và cũng không
nằm trong git (`git ls-files` chỉ có `.env.example`). Máy phát triển đang chạy bằng **giá trị
mặc định cắm trong mã** — `apiBase = "/v1"` (`lib/iotx/config.ts:3`), upstream
`https://api.dev.happibot.net` (`route.ts:17`). Máy clone về nhận y hệt. Cấu hình không phải
thủ phạm.

Còn lại là môi trường của máy đó. Sau khi làm xong mục 3c, chạy **trên máy đó**:

```bash
node -v                                           # Next 16 đòi >= 20.9
curl -sS -o /dev/null -w '%{http_code}\n' https://api.dev.happibot.net/v1/tenant/theme
IOTX_HIEN_LOI_PROXY=1 npm run dev
curl -sS http://localhost:3000/v1/tenant/theme    # đọc trường "chiTiet"
```

| Kết quả | Kết luận |
|---|---|
| `node -v` < 20.9 | nâng Node, Next 16 không chạy đúng |
| `curl` tới `api.dev.happibot.net` hỏng | máy đó không ra được IBS (DNS, tường lửa, proxy công ty) |
| `curl` ngoài được, `chiTiet` có `ENOTFOUND` / `ETIMEDOUT` | tiến trình Node bị chặn riêng, hoặc thiếu biến proxy `HTTPS_PROXY` |
| cả hai đều chạy, app vẫn lỗi | lỗi phía trình duyệt — xem console, mục 3b vừa ghi ra |

---

## Kiểm sau khi làm

```bash
cd "/Users/tienquang/Documents/Homichi/IOT/IOT App - New UI"
npm run lint
npm run build
npm test
```

Rồi thử tay:

1. `npm run dev`, mở `http://localhost:3000` — đăng nhập, bật/tắt một thiết bị: vẫn chạy như cũ.
2. Mở `http://<IP LAN>:3000` trên **điện thoại** — đăng nhập, bật/tắt một thiết bị:
   **phải chạy**, không còn câu "Không kết nối được máy chủ". Đây là phép thử chính.
3. Vẫn trên điện thoại, mở console từ xa (Safari → Develop, hoặc `chrome://inspect`): không
   có dòng `[iotx] yêu cầu không rời được trình duyệt`.
4. Tắt wifi máy chủ rồi gọi một API: phải hiện **"Không kết nối được máy chủ"** (câu của 502),
   không phải câu trình duyệt — chứng minh hai nhánh đã tách đúng.

## Nhắc

Việc này thực thi ở **tab Code**, không làm ở đây.
