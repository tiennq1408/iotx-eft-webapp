#!/usr/bin/env python3
"""
Tổng hợp JSONL do do_phien.py sinh ra.

Hai quy ước cố ý khác báo cáo của GSH:

1. Tỉ lệ thành công tính THEO GIAO DỊCH, không lấy trung bình cộng các bài. Báo cáo
   GSH ra 89,39% theo trung bình và 99,86% theo giao dịch — chênh mười điểm phần trăm
   chỉ vì một bài có đúng một mẫu.
2. Luôn in p50/p95/p99/max KÈM n. Bảng tiêu chí của GSH chỉ có mức 95% cho App→Backend
   nên một cái đuôi 8 giây lọt lưới.

Ngoài ra tách riêng ma=0 (không tới được máy chủ) khỏi lỗi HTTP thật — ma=0 thường là
máy phát tải gãy chứ không phải máy chủ gãy.

    python3 loadtest/tong_hop.py ketqua.jsonl [--csv bang.csv]
"""
from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from collections import Counter, defaultdict

# Những dòng này là GHI NHẬN SỰ CỐ, không phải một request có mã HTTP riêng.
# Gộp chúng vào biểu đồ lỗi sẽ đếm trùng: refresh hỏng đã tính 401 rồi, bi_dang_xuat
# là hệ quả của chính lần đó.
GHI_NHAN = {"bi_dang_xuat", "luong_im_lang", "luong_dut", "stream_401", "su_kien"}

# Thứ tự in — theo dòng chảy của một phiên, không theo bảng chữ cái.
THU_TU = ["login", "bootstrap", "stream_mo", "nhip_giu_ket_noi", "refresh",
          "rpc", "devices_sau_noi_lai", "noi_lai_xong", "luong_im_lang",
          "luong_dut", "stream_401", "bi_dang_xuat", "su_kien"]

GIAI_THICH = {
    "login": "Đăng nhập",
    "bootstrap": "Mở app (/bootstrap)",
    "stream_mo": "Mở luồng tới byte đầu",
    "nhip_giu_ket_noi": "Khoảng cách nhịp giữ kết nối",
    "refresh": "Làm mới vé",
    "rpc": "Gửi lệnh điều khiển",
    "devices_sau_noi_lai": "Gọi /devices sau khi nối lại",
    "noi_lai_xong": "Thời gian hồi phục sau khi đứt",
    "luong_im_lang": "Luồng chết âm thầm (không báo lỗi)",
    "luong_dut": "Luồng đứt có lỗi",
    "stream_401": "Luồng bị 401, phải làm mới vé",
    "bi_dang_xuat": "Người dùng bị văng khỏi app",
    "su_kien": "Sự kiện trạng thái nhận được",
}


def phan_vi(xs, p):
    if not xs:
        return None
    xs = sorted(xs)
    if len(xs) == 1:
        return xs[0]
    i = (len(xs) - 1) * p
    lo, hi = int(i), min(int(i) + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (i - lo)


def fmt(v):
    return "-" if v is None else ("%.1f" % v)


def dem_o(s, rong):
    """Căn cột theo số ký tự HIỂN THỊ. Chuỗi tiếng Việt có thể ở dạng tổ hợp
    (chữ + dấu rời), lúc đó len() đếm nhiều hơn số ô thật và cột bị lệch."""
    s = unicodedata.normalize("NFC", s)[:rong]
    return s + " " * (rong - len(s))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--csv", default="")
    a = ap.parse_args()

    do_theo_viec = defaultdict(list)
    dem = defaultdict(lambda: {"n": 0, "ok": 0, "loi_http": 0, "khong_toi_duoc": 0})
    ma_loi = Counter()
    dinh_luong = 0
    bootstrap_byte = []
    bootstrap_thiet_bi = []
    cat_luc = None
    phien = set()

    with open(a.file, encoding="utf-8") as f:
        for dong in f:
            dong = dong.strip()
            if not dong:
                continue
            try:
                r = json.loads(dong)
            except json.JSONDecodeError:
                continue
            viec = r.get("viec")
            if viec == "dem_luong_dang_mo":
                dinh_luong = max(dinh_luong, r.get("so", 0))
                continue
            if viec == "CAT_KET_NOI":
                cat_luc = r.get("luc")
                continue
            if viec in ("BAT_DAU", "KET_THUC"):
                continue
            if viec == "bootstrap_kich_thuoc":
                bootstrap_byte.append(r.get("byte", 0))
                bootstrap_thiet_bi.append(r.get("so_thiet_bi", 0))
                continue
            if r.get("phien"):
                phien.add(r["phien"])

            d = dem[viec]
            d["n"] += 1
            if r.get("ok"):
                d["ok"] += 1
            elif viec in GHI_NHAN:
                d["loi_http"] += 1
            elif r.get("ma") == 0:
                # Không tới được máy chủ: DNS, TLS, hết cổng, quá hạn chờ kết nối.
                d["khong_toi_duoc"] += 1
                ma_loi["khong_toi_duoc"] += 1
            else:
                d["loi_http"] += 1
                ma_loi["HTTP %s" % r.get("ma")] += 1
            if r.get("ms") is not None:
                do_theo_viec[viec].append(r["ms"])

    print()
    print("=" * 96)
    print("TỔNG HỢP  %s" % a.file)
    print("=" * 96)
    print("Số phiên quan sát được: %d      Đỉnh luồng giữ mở đồng thời: %d" % (len(phien), dinh_luong))
    if cat_luc:
        print("Đã cắt sạch kết nối lúc: %s" % cat_luc)
    if bootstrap_byte:
        tb = sum(bootstrap_byte) / len(bootstrap_byte)
        print("Kích thước /bootstrap: trung bình %.0f byte, lớn nhất %d byte, với %d thiết bị mỗi tài khoản"
              % (tb, max(bootstrap_byte), max(bootstrap_thiet_bi or [0])))
    print()

    dau = "%s %7s %7s %7s %7s %9s %9s %9s %9s" % (
        dem_o("Việc", 34), "n", "OK", "lỗi", "kh.tới", "p50 ms", "p95 ms", "p99 ms", "max ms")
    print(dau)
    print("-" * len(dau))

    hang_csv = []
    ten_viec = [v for v in THU_TU if v in dem] + sorted(v for v in dem if v not in THU_TU)
    for v in ten_viec:
        d = dem[v]
        xs = do_theo_viec.get(v, [])
        p50, p95, p99 = phan_vi(xs, .50), phan_vi(xs, .95), phan_vi(xs, .99)
        mx = max(xs) if xs else None
        print("%s %7d %7d %7d %7d %9s %9s %9s %9s" % (
            dem_o(GIAI_THICH.get(v, v), 34), d["n"], d["ok"], d["loi_http"], d["khong_toi_duoc"],
            fmt(p50), fmt(p95), fmt(p99), fmt(mx)))
        hang_csv.append([v, GIAI_THICH.get(v, v), d["n"], d["ok"], d["loi_http"],
                         d["khong_toi_duoc"], p50, p95, p99, mx])

    # Chỉ tính các việc là GIAO DỊCH thật. Nhịp giữ kết nối và sự kiện không phải
    # giao dịch do app chủ động gửi, đưa vào sẽ thổi phồng mẫu số.
    giao_dich = ["login", "bootstrap", "stream_mo", "refresh", "rpc", "devices_sau_noi_lai"]
    tong = sum(dem[v]["n"] for v in giao_dich if v in dem)
    tong_ok = sum(dem[v]["ok"] for v in giao_dich if v in dem)
    print()
    print("-" * len(dau))
    if tong:
        print("Tỉ lệ thành công THEO GIAO DỊCH: %.3f%%  (%d/%d)  — tiêu chí ≥ 99%%"
              % (100.0 * tong_ok / tong, tong_ok, tong))
        rates = [100.0 * dem[v]["ok"] / dem[v]["n"] for v in giao_dich if v in dem and dem[v]["n"]]
        if rates:
            print("Trung bình cộng các loại việc:   %.3f%%  — KHÔNG dùng con số này để báo cáo"
                  % (sum(rates) / len(rates)))
    if dem.get("bi_dang_xuat", {}).get("n"):
        print("NGƯỜI DÙNG BỊ VĂNG KHỎI APP: %d lần" % dem["bi_dang_xuat"]["n"])
    if dem.get("luong_im_lang", {}).get("n"):
        print("Luồng chết âm thầm: %d lần — không có đồng hồ canh lặng thì app treo im"
              % dem["luong_im_lang"]["n"])
    if ma_loi:
        print()
        print("Phân loại lỗi:")
        for k, n in ma_loi.most_common():
            ghi_chu = "  ← máy phát tải, không phải máy chủ" if k == "khong_toi_duoc" else ""
            print("   %-22s %6d%s" % (k, n, ghi_chu))
    print()

    if a.csv:
        import csv
        with open(a.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["viec", "mo_ta", "n", "ok", "loi_http", "khong_toi_duoc",
                        "p50_ms", "p95_ms", "p99_ms", "max_ms"])
            w.writerows(hang_csv)
        print("Đã ghi CSV:", a.csv)
    return 0


if __name__ == "__main__":
    sys.exit(main())
