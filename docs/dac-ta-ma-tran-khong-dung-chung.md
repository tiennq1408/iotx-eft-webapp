# Đặc tả: Ma trận "khối không dùng chung"

- Gửi: **đội sadmin**
- Người yêu cầu: TienQuang — IoTX / Livotec Home
- Ngày: 21/10/2026
- Phạm vi tài liệu này: **chỉ phần sadmin** (khai báo + lưu + phát ra `/v1/products`).
  Phần webapp vẽ ra sao viết riêng.

## Mục tiêu

Cho phép quản trị khai: **khi thuộc tính A đang ở giá trị B thì các khối nào không dùng được.**

Ví dụ thật của máy lạnh:

> Chế độ vận hành = **Hút ẩm (Dry)** → không dùng được **Im lặng** và **Tiết kiệm điện**

---

## 0. ĐIỀU KIỆN TIÊN QUYẾT — đọc trước khi lập kế hoạch

Ma trận này tra theo **giá trị thô** mà thiết bị báo về. Đo trên DEV ngày 15/10/2026:

| capability | sadmin khai `values` | thiết bị thật báo về |
|---|---|---|
| `ac_ope_mode` | `["Heat","Cool","Dry","Fan","Auto"]` | **`"1"`** |
| `ac_fan_speed` | `["Low","Mid","High","Turbo","Auto"]` | **`"3"`** |
| `ac_swing_mode` | `["r20","r35","r55","r70","r80"]` | **`"0"`** |

Thêm nữa: quét 107 capability kiểu `enum` trên toàn tài khoản → **86 cái trả về `null`** (80%).

**Hệ quả:** quản trị khai luật `Dry → tắt Im lặng`, nhưng thiết bị báo `"1"` chứ không bao giờ
báo `"Dry"`. Luật **không bao giờ khớp**. Tính năng chạy đúng về mặt kỹ thuật mà **vô dụng trên
thực tế**, và sẽ rất khó truy vì không có lỗi nào hiện ra.

> **Phải chốt trước:** `values` của catalog và giá trị firmware gửi lên sẽ thống nhất theo bên
> nào? Hoặc sadmin khai `values: ["0","1","2","3","4"]` kèm `labels`, hoặc firmware đổi sang gửi
> tên. **Không có bảng ánh xạ chính thức từ bên firmware thì đừng đoán** — `values` hiện xếp lộn
> xộn (`C3, C5, E3, E2, E4, U0…`), "mã thứ hai trong danh sách" không nói lên điều gì.

Làm tính năng này trước khi xử lý chuyện trên cũng được, nhưng **phải biết là nó chưa dùng được
cho tới lúc đó**.

---

## 1. Khối nào được làm NGUỒN, khối nào chỉ làm ĐÍCH

| `kind` | Làm nguồn (có B) | Giá trị B | Làm đích |
|---|---|---|---|
| `enum` | ✅ | từng giá trị trong `values` | ✅ |
| `onoff` | ✅ | `"on"` · `"off"` | ✅ |
| `level` | ❌ **không có B** | — | ✅ |
| `sensor` | ❌ | — | ✅ |
| `list` | ❌ | — | ✅ |

`level` và `sensor` không có trạng thái rời rạc nên không làm nguồn được. Muốn luật kiểu
*"nhiệt độ > 30 thì khoá X"* thì đó là **tính năng khác** (luật theo ngưỡng), không nhét vào đây.

**Giao diện sadmin: khối `level`/`sensor`/`list` thì KHÔNG hiện mục 6.** Hiện ra rồi để trống là
quản trị sẽ loay hoay không hiểu vì sao không khai được.

---

## 2. Cấu trúc dữ liệu

Đặt ở **`product.ui.khongDung`**, ngang hàng `boCuc`:

```json
"ui": {
  "boCuc": { "...": "giữ nguyên" },
  "khongDung": {
    "ac_ope_mode": {
      "Dry": ["ac_mute_mode", "ac_eco_mode"],
      "Fan": ["ac_temp_setting"]
    },
    "ac_power_status": {
      "off": ["*"]
    }
  }
}
```

**Vì sao lồng hai tầng chứ không phải một khoá ghép `"ac_ope_mode:Dry"`:**

- Không phải chọn ký tự ngăn cách, không lo giá trị B có chứa ký tự đó
- Lấy toàn bộ luật của **một** capability chỉ bằng một phép tra — đúng bằng thứ màn sửa khối cần
- Kiểm tra hợp lệ dễ: duyệt khoá tầng 1 so với `capabilities`, tầng 2 so với `values`

**Vì sao đặt ở `ui` chứ không nhét vào từng ô `boCuc.o[]`:** luật nói về **capability**, không
nói về ô trên lưới. Một capability có thể không có ô nào trong `boCuc` mà vẫn cần luật. Giữ
`boCuc` thuần về bố cục.

### Ký tự đại diện `"*"`

`"*"` = **mọi khối điều khiển khác** của sản phẩm (không tính `sensor`, vì cảm biến chỉ đọc).

Không có nó thì luật "tắt nguồn → khoá hết" phải liệt kê tay từng khối, và **hỏng ngay lần sau
thêm capability mới** — ai cũng quên cập nhật. `"*"` phải **đứng một mình**, không trộn với danh
sách.

---

## 3. Luật áp dụng

| | Luật |
|---|---|
| **Một chiều** | A=B khoá các đích. **Không** tự suy ngược lại |
| **Cộng dồn** | Nhiều nguồn cùng khớp → tập khoá là **hợp** của các danh sách |
| **Không khớp thì không khoá** | Giá trị hiện tại là `null`, hoặc không có trong bảng → không khoá gì |
| **Khoá ≠ tắt** | Khối bị khoá **giữ nguyên giá trị thật** của nó. Không tự gửi lệnh tắt |

Điểm cuối quan trọng: đang bật Im lặng rồi chuyển sang Hút ẩm thì khối Im lặng **hiện vẫn là
Bật** nhưng không bấm được. **Tuyệt đối không để webapp tự gửi lệnh tắt** — người dùng không ra
lệnh đó, và việc tắt là của thiết bị.

---

## 4. Màn khai báo trên sadmin — "mục 6"

Khi quản trị bấm vào một khối trong trình sửa bố cục, nếu khối đó **làm nguồn được** thì hiện
thêm mục 6:

```
┌─ 6. Khối không dùng chung ────────────────────────────────┐
│                                                            │
│  Khi "Chế độ vận hành" ở giá trị nào thì khoá khối nào?    │
│                                                            │
│  ┌──────────┬───────────────────────────────────────────┐ │
│  │ Giá trị  │ Khoá các khối                             │ │
│  ├──────────┼───────────────────────────────────────────┤ │
│  │ Heat     │ [ chọn…                                 ▾] │ │
│  │ Cool     │ [ chọn…                                 ▾] │ │
│  │ Dry      │ [ ✕ Im lặng  ✕ Tiết kiệm điện           ▾] │ │
│  │ Fan      │ [ ✕ Nhiệt độ đặt                        ▾] │ │
│  │ Auto     │ [ chọn…                                 ▾] │ │
│  └──────────┴───────────────────────────────────────────┘ │
│                                                            │
│  ☐ Khoá tất cả khối khác  (tương đương "*")                │
└────────────────────────────────────────────────────────────┘
```

**Yêu cầu giao diện:**

1. **Cột Giá trị sinh tự động** từ `values` của chính capability đó (`onoff` thì hai dòng
   `on`/`off`). Quản trị **không được gõ tay** — gõ sai một ký tự là luật chết câm.
2. **Hiện kèm nhãn người đọc**: `Dry — Hút ẩm`, lấy từ `labels`. Chỉ hiện mã thô thì quản trị
   không biết mình đang khai cái gì.
3. **Ô chọn khối là multi-select**, danh sách là các capability **khác** trong cùng sản phẩm,
   hiện theo `label`, lưu theo `key`.
4. **Ô tích "Khoá tất cả khối khác"** khi bật thì **vô hiệu hoá ô multi-select** của dòng đó và
   lưu `["*"]`.
5. **Dòng không chọn gì thì không lưu khoá đó** — đừng lưu `"Heat": []`, để JSON gọn.

---

## 5. Kiểm tra hợp lệ — phần quan trọng nhất

Sáu luật, xếp theo mức độ nghiêm trọng.

### 5.1 ❌ CHẶN — không cho lưu

| | Luật | Vì sao |
|---|---|---|
| a | Đích **không được là chính nó** | `Dry` khoá `ac_ope_mode` → người dùng kẹt vĩnh viễn ở Dry, không thoát ra được |
| b | Đích **không được là khối nguồn điện** | khoá nút nguồn = người dùng **không tắt được máy**. Đây là vấn đề an toàn, không phải tiện dụng |
| c | Đích phải **có trong `capabilities`** của sản phẩm | trỏ vào khối không tồn tại thì luật im lặng không chạy |
| d | Giá trị B phải **có trong `values`** (với `enum`) | như trên |
| e | `"*"` phải **đứng một mình** | `["*", "ac_eco_mode"]` là thừa và gây hiểu nhầm |

Luật (b): khối nguồn là cái có `kind: "onoff"` và được `boCuc` khai `variant: "power01"`, hoặc
được suy ra theo luật nguồn chung của sản phẩm. **Ngoại lệ duy nhất:** chính khối nguồn làm
nguồn luật (`ac_power_status: { "off": ["*"] }`) — cái đó hợp lệ và rất cần.

### 5.2 ⚠️ CẢNH BÁO — vẫn cho lưu nhưng phải hỏi lại

| | Tình huống | Câu cảnh báo |
|---|---|---|
| f | **Khoá vòng**: A=x khoá B **và** B=y khoá A | "Hai khối này khoá lẫn nhau. Nếu cả hai cùng ở giá trị đó, người dùng không đổi được khối nào. Vẫn lưu?" |
| g | Một giá trị khoá **từ 80% số khối trở lên** mà không dùng `"*"` | "Gần như khoá hết — cân nhắc dùng 'Khoá tất cả khối khác'" |

Luật (f) là bẫy thật: một chiều thì người dùng luôn thoát được bằng cách đổi khối nguồn. Khoá
vòng thì **không còn đường ra** ngoài việc tắt nguồn.

### 5.3 🧹 Dọn dữ liệu cũ

Khi quản trị **xoá một capability** khỏi sản phẩm, mọi luật trỏ tới nó thành rác. sadmin phải:

- Lúc lưu sản phẩm: **tự lọc bỏ** các đích không còn tồn tại
- Màn danh sách: hiện huy hiệu *"có N luật trỏ vào khối đã xoá"* nếu còn sót

---

## 6. Phát ra `/v1/products`

Giữ nguyên cách hiện tại, chỉ thêm khoá `ui.khongDung`. Hai việc đi kèm:

1. **Tăng `product.version`** khi luật đổi — webapp dựa vào `phienBan.products` trong
   `/bootstrap` để biết phải tải lại catalog.
2. **Không khai thì không gửi khoá** — đừng gửi `"khongDung": {}`, để sản phẩm cũ giữ nguyên
   kích thước.

> **Báo trước cho đội webapp:** webapp có bộ dò **trường lạ trong catalog** — gặp khoá chưa biết
> là ghi cảnh báo ra console ở bản phát triển và một bài kiểm sẽ báo đỏ. Cần thêm `khongDung`
> vào danh sách khoá đã biết **cùng lúc** với lúc sadmin phát hành. Không phải lỗi, chỉ là bộ
> dò đang làm đúng việc của nó.

---

## 7. Ví dụ đầy đủ — máy lạnh `ac_1`

```json
"khongDung": {
  "ac_power_status": {
    "off": ["*"]
  },
  "ac_ope_mode": {
    "Dry":  ["ac_mute_mode", "ac_eco_mode"],
    "Fan":  ["ac_temp_setting", "ac_eco_mode"],
    "Auto": ["ac_fan_speed"]
  }
}
```

Đọc ra tiếng Việt:

- Tắt máy → khoá mọi khối điều khiển
- Hút ẩm → khoá Im lặng và Tiết kiệm điện
- Quạt gió → khoá Nhiệt độ đặt và Tiết kiệm điện
- Tự động → khoá Tốc độ quạt

Máy đang **tắt** và ở chế độ **Hút ẩm** thì tập khoá là hợp của hai luật — tức mọi khối, vì
`"*"` đã bao trùm.

---

## 8. Nghiệm thu phía sadmin

- [ ] Khối `enum` và `onoff` hiện mục 6; `level`/`sensor`/`list` **không** hiện
- [ ] Cột giá trị sinh từ `values`, kèm nhãn người đọc, **không gõ tay được**
- [ ] Multi-select chỉ liệt kê capability **khác** trong cùng sản phẩm
- [ ] Ô tích "Khoá tất cả khối khác" lưu thành `["*"]` và khoá ô multi-select
- [ ] Chặn: tự trỏ vào mình · trỏ vào khối nguồn điện · đích không tồn tại · B không có trong `values` · `"*"` lẫn danh sách
- [ ] Cảnh báo: khoá vòng · khoá gần hết mà không dùng `"*"`
- [ ] Xoá một capability → luật trỏ vào nó bị dọn khi lưu
- [ ] Lưu xong, `GET /v1/products` trả đúng `ui.khongDung`, `version` đã tăng
- [ ] Dòng không chọn gì **không** xuất hiện trong JSON

---

## 9. Ba câu cần trả lời trước khi bắt tay

1. **Giá trị thô sẽ thống nhất theo bên nào** — catalog hay firmware? (mục 0, chặn toàn bộ)
2. **Luật này có theo tenant không**, hay một sản phẩm dùng chung một bộ luật cho mọi tenant?
3. **Có cần lịch sử thay đổi** (ai sửa luật, lúc nào)? Luật này đổi hành vi điều khiển thiết bị
   thật, nên nếu sau có tranh cãi "vì sao máy không bấm được" thì cần truy ra được.
