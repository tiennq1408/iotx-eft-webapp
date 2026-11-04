# Việc: nối BLE và điều khiển thiết bị ngay trong webapp

*28/10/2026 · thực thi ở tab Code*
*Hợp đồng GATT: `yeu-cau-firmware-ble.md` (bản gửi firmware) · Nền: `dac-ta-ble-webapp.md`*

---

## 0. Phạm vi và điều kiện

Webapp đã cài dạng PWA trên Android, nối thẳng BLE với mạch, điều khiển **không qua Internet**.

| | |
|---|---|
| Chạy trên | **Chrome / Edge Android** (và Chrome máy tính) |
| **Không chạy trên** | **iPhone, iPad** — Safari không có Web Bluetooth, mọi trình duyệt iOS đều dùng lõi WebKit. Không có đường vòng |
| Điều kiện | Web Bluetooth **bắt buộc secure context** → PWA chạy HTTPS, đã đạt |

---

## 1. Tin tốt: chỗ nối chỉ là một dòng

`components/LivotecApp.tsx:196` đã làm sẵn gần hết:

```ts
async function guiLenh(id: string, capability: IotxCapability, value: unknown) {
  if (!capability.rpc) return;
  const truoc = data.devices.find(device => device.id === id);
  suaThietBi(id, device => apGiaTri(device, { [capability.key]: value }));   // đổi giao diện ngay
  if (!isIotxMode) return;
  ghiNhanLenh(id, capability.key, value);                                     // ghi sổ lệnh chờ
  try { await iotxClient.rpc(id, capability.rpc, { [capability.key]: value }); }   // ← CHỈ DÒNG NÀY
  catch (error) {
    boGhiNhanLenh(id, capability.key);
    if (truoc) suaThietBi(id, () => truoc);                                   // trả lại trạng thái cũ
    throw error;
  }
}
```

Thay **đúng dòng được đánh dấu** bằng một lớp chọn đường:

```ts
const duong = bleDangNoi(id) ? bleClient : iotxClient;
await duong.rpc(id, capability.rpc, { [capability.key]: value });
```

Được **miễn phí**: cập nhật lạc quan, sổ lệnh chờ (`SoLenhCho`, 6 giây), trả lại trạng thái cũ khi hỏng, và **toàn bộ giao diện** — `BoCucGrid`, `VeO`, catalog, nhãn, `khongDung` đều không phải sửa một dòng.

Điều kiện: `lib/iotx/ble.ts` phải có **cùng chữ ký** với `client.ts:354`:

```ts
rpc(id: string, method: string, params: Record<string, unknown>, idempotencyKey?: string)
   : Promise<{ ok: boolean }>
```

---

## 2. Việc 1 — phần B của `viec-pwa.md` ⟵ **chặn cứng, làm trước**

Không có Internet thì `/bootstrap` hỏng → `docProducts` trả `null` → **app không dựng nổi giao diện** dù catalog nằm nguyên trong localStorage. BLE có chạy cũng không có gì để vẽ.

Bốn việc, đã đặc tả ở `viec-pwa.md` phần B — không chép lại ở đây:

- `lib/iotx/cache.ts:48`
- Service worker cache ảnh từ `media.dev.happibot.net` (20 ảnh, 33.502 B)
- Chế độ cục bộ: dừng SSE và nhịp hỏi 2,5 giây
- Sửa câu báo lỗi sai khi `navigator.onLine === true` mà vẫn hỏng

**Làm xong bốn việc này trước khi động vào BLE.** Chúng đằng nào cũng phải có.

---

## 3. Việc 2 — `lib/iotx/ble.ts`

### 3.1 Bề mặt API

```ts
export const bleClient = {
  coHoTro(): boolean,                       // "bluetooth" in navigator
  async noi(serial: string, biMat: Uint8Array): Promise<ThongTinMach>,
  async rpc(id, method, params, idempotencyKey?): Promise<{ ok: boolean }>,
  async xinTrangThai(): Promise<Record<string, unknown>>,
  ngat(): void,
  khiTrangThaiDoi(cb: (key: string, gt: unknown, seq: number) => void): () => void,
  khiNgat(cb: () => void): () => void,
};
```

### 3.2 Chọn thiết bị

```ts
await navigator.bluetooth.requestDevice({
  filters: [{ manufacturerData: [{ companyIdentifier: 0xFFFF, dataPrefix: enc(serial) }] }],
  optionalServices: [SERVICE_UUID],
});
```

Lọc theo serial trong Manufacturer Data để hộp thoại của Chrome **chỉ hiện đúng một máy**. `requestDevice` **bắt buộc gọi từ một cú bấm** — không tự nối khi mở màn được.

Lọc không ăn (firmware chưa kịp làm) thì lùi về `filters: [{ namePrefix: "LIVOTEC-" }]`, rồi đọc `info` để đối chiếu.

### 3.3 Bắt tay

```
nối GATT
  → đăng ký nghe `resp`
  → mạch đẩy {"op":"nonce","giaTri":"<base64 16 byte>"}
  → crypto.subtle.importKey("raw", biMat, {name:"HMAC",hash:"SHA-256"}, false, ["sign"])
  → crypto.subtle.sign("HMAC", khoa, nonce)
  → ghi vào `cmd`: {"op":"auth","chuKy":"<base64>"}
  → chờ {"ok":true}; quá 10 giây hoặc sai → ngắt, báo "Mã trên tem không đúng"
```

`crypto.subtle` **có** vì PWA chạy HTTPS. (Trang nhúng chạy trên `http://192.168.4.1` thì không có — `viec-loi-khong-ket-noi.md`.)

### 3.4 Ghép cặp hỏi–đáp

BLE **không có khái niệm trả lời**. Mỗi `op` gửi kèm một `id` tăng dần; giữ một `Map<id, resolve>`; `resp` về thì tra `id` và giải lời hứa. Quá **5 giây** không thấy thì từ chối.

`khoa` trong thân JSON là `Idempotency-Key` — dùng lại `khoaMotLan()` ở `client.ts:113` (đã viết trên `getRandomValues`, không dùng `crypto.randomUUID`).

### 3.5 Ghép mảnh

`{"op":"state"}` của `ac_1` về **2 mảnh** (~700 byte, mỗi characteristic tối đa 512). Nối `payload` theo `manh` tăng dần tới khi `cuoi: true` rồi mới `JSON.parse`. Thiếu mảnh quá 5 giây → bỏ cả khối, xin lại.

Thông báo `state` thường chỉ chở **thứ vừa đổi** (`{"seq":1834,"v":{"speed":6}}`) nên lọt một gói, không phải ghép.

---

## 4. Việc 3 — cất bí mật theo serial

Thêm vào `lib/iotx/cache.ts`, đúng khuôn `docProducts` / `ghiProducts`:

```ts
type NoiDungCache = {
  …
  /** Bí mật BLE in trên tem, theo serial. KHÔNG phải token phiên — không xoá khi đăng xuất. */
  bleBiMat?: Record<string, string>;      // serial → base64 16 byte
};

export function docBleBiMat(serial: string): string | null
export function ghiBleBiMat(serial: string, biMat: string): void
```

Dùng chung khóa `livotec-iotx-cache-v2` đang có. **Không xoá khi đăng xuất** — bí mật thuộc về cái máy trong nhà, không thuộc về phiên đăng nhập.

---

## 5. Việc 4 — nhập bí mật lần đầu

Đã có sẵn bộ quét: `components/manage/QuetQR.tsx:18`

```ts
export function QuetQR({ tieuDe, onDoc }: { tieuDe: string; onDoc: (text: string) => void })
```

Dùng lại nguyên vẹn. Luồng: chưa có bí mật cho serial này → mở `QuetQR` → khách quét QR trên tem → `ghiBleBiMat` → nối. Kèm ô nhập tay phòng khi tem mờ.

Bắt tay sai → **xoá bí mật đã cất** cho serial đó và hỏi lại, đừng để khách kẹt với một mã sai vĩnh viễn.

---

## 6. Việc 5 — đường về của trạng thái

Thông báo `state` phải đổ vào **đúng chỗ** đường SSE đang đổ, là `nhanSuKien` ở `hooks/useDuLieuIotx.ts:165`:

```ts
const nhanSuKien = useCallback((event: IotxStreamEvent) => {
  soLenhCho.current.bo(event.deviceId, event.key);          // ← nhả sổ lệnh chờ
  setData(current => ({ …, devices: current.devices.map(d =>
      d.id === event.deviceId ? apGiaTri(d, { [event.key]: event.value }) : d) }));
}, []);
```

BLE gọi **đúng hàm này**, với `deviceId` tra từ serial. Hai câu bắt buộc:

- **Phải gọi `soLenhCho.bo(...)`** — không thì sổ lệnh chờ giữ giá trị cũ 6 giây và đè lên tin mới của mạch.
- **Phải đi qua `apGiaTri`** (`mappers.ts:29`), đừng tự so tên khóa — khóa nguồn của catalog thật là `ac_power_status`, `fan_power`…, so với `"power"` là sai.

**Luật khi cả hai đường cùng sống:** thiết bị nào đang nối BLE thì **BLE thắng** cho thiết bị đó. Dùng `seq` phân xử.

---

## 7. Việc 6 — giao diện

| Chỗ | Việc |
|---|---|
| `DeviceDetail.tsx` | Nút **"Kết nối trực tiếp"**, cùng hàng với nút thông tin thiết bị |
| Khi đã nối | Băng mỏng trên lưới: *"Đang điều khiển trực tiếp qua Bluetooth"* + nút Ngắt |
| Mất kết nối giữa chừng | Băng **vàng**: *"Mất kết nối Bluetooth, đang dùng lại đường máy chủ"*, lệnh tự quay về `/v1` |
| `navigator.bluetooth` không có | **Ẩn hẳn nút.** iPhone, Firefox. Hiện nút bấm vào thất vọng tệ hơn không hiện |
| Chưa có bí mật cho serial này | Nút vẫn hiện, bấm thì mở màn quét QR trước |

Không được để người dùng **bấm vào khoảng không**: mất BLE là phải đổi đường hoặc khóa control, có báo rõ.

---

## 8. Thứ tự, và cái gì thử được ngay

```
Hôm nay ──► Việc 1 (phần B của viec-pwa.md)  ⟵ chặn cứng, không cần firmware
            │
            ├──► Việc 2 + 3 + 4 + 7   ⟵ thử bằng GATT GIẢ, không chờ firmware
            │
            └──► Việc 5 (đường về trạng thái)  ⟵ cần firmware thật để nghiệm
```

**Dựng GATT giả để thử:** cài **nRF Connect** trên một máy Android thứ hai, dùng chức năng *GATT Server*, khai service `0000b77b-8b45-4e98-8517-ab86cddd0995` và 5 characteristic theo `yeu-cau-firmware-ble.md` mục 2. Gõ tay JSON vào `resp` là thử được trọn luồng bắt tay, ghép cặp `id`, ghép mảnh và cập nhật giao diện — **trước khi firmware viết dòng nào**.

---

## 9. Nghiệm thu

| # | Việc | Đạt khi |
|---|---|---|
| 1 | **iPhone**, mở màn chi tiết | Nút "Kết nối trực tiếp" **không hiện**, không lỗi |
| 2 | Android, bấm nút lần đầu | Mở màn quét QR; quét tem xong thì nối |
| 3 | Bấm nút lần hai (cùng máy) | **Không** hỏi lại mã, nối thẳng |
| 4 | Quét nhầm mã của máy khác | Báo *"Mã trên tem không đúng"*, **xoá mã đã cất**, hỏi lại |
| 5 | Nối xong, bấm tăng tốc | Thiết bị đổi **dưới 100 ms**, nút không nhấp nháy về giá trị cũ |
| 6 | Bấm nút trên thân máy | Giao diện tự đổi theo *(việc 5)* |
| 7 | Đi xa ~15 m giữa lúc đang bấm | Băng chuyển vàng, lệnh quay về `/v1`, không ai bấm vào khoảng không |
| 8 | Tắt máy bay rồi bật lại BLE | Nối lại được, không phải quét QR |
| 9 | Chế độ máy bay hoàn toàn, mở app đã cài | Hiện thiết bị ở trạng thái cuối, nối BLE và điều khiển được *(cần việc 1)* |
| 10 | Đăng xuất rồi đăng nhập lại | Bí mật BLE **vẫn còn** |

Bước 1, 4, 7 và 10 hay bị bỏ nhất.

---

## 10. Chưa chắc

1. **`companyIdentifier` nào** dùng cho Manufacturer Data — chưa thống nhất với firmware. `0xFFFF` là mã dành cho thử nghiệm, dùng tạm được nhưng không nên xuất xưởng với nó.
2. **MTU thật** Chrome Android thương lượng với ESP — chưa đo. Ước thông lượng ~12 kB/s.
3. **`getDevices()` còn sau cờ** nên mỗi lần mở lại app phải chọn thiết bị một lần. App là SPA nên một lần mỗi phiên, không phải mỗi màn — nhưng nên thử lại trên Chrome Android hiện tại, biết đâu đã mặc định.
4. **Quyền "Nearby devices"** của Android 12+ trong PWA đã cài — chưa thử. Có thể hỏi quyền hệ điều hành lần đầu.
5. **Tầm sóng thật** với vỏ sản phẩm, qua tường — chưa đo.
