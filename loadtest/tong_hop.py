#!/usr/bin/env python3
"""
Tổng hợp kết quả do do_phien.py, ban_rps.py (JSONL) hoặc k6 (--out json=...json[.gz]) sinh ra.

Hai quy ước cố ý khác báo cáo của GSH:

1. Tỉ lệ thành công tính THEO GIAO DỊCH, không lấy trung bình cộng các bài. Báo cáo
   GSH ra 89,39% theo trung bình và 99,86% theo giao dịch — chênh mười điểm phần trăm
   chỉ vì một bài có đúng một mẫu.
2. Luôn in p50/p95/p99/max KÈM n. Bảng tiêu chí của GSH chỉ có mức 95% cho App→Backend
   nên một cái đuôi 8 giây lọt lưới.

Tách riêng từng loại hỏng — gộp vào một cột "lỗi" là mất thông tin:
   4xx    lỗi phía yêu cầu (trừ 429)
   429    bị bộ giới hạn tốc độ chặn — con số đo lúc đó là TRẦN CỦA BỘ GIỚI HẠN, không phải IBS
   5xx    máy chủ hỏng
   h.giờ  quá hạn chờ (ma=-1)
   kh.tới không tới được máy chủ (ma=0) — thường là MÁY PHÁT gãy, không tính là lỗi IBS

Theo B-SLA, p95 xét theo CỬA SỔ TRƯỢT 1 PHÚT — p95 cả bài che mất lúc gãy. Bảng theo bậc
in "Đạt SLA?" từng bậc và "bậc cuối còn đạt". Ngưỡng là bản ĐỀ XUẤT, chưa được duyệt:
   thành công theo giao dịch ≥ 99,9% · 5xx ≤ 0,1% · bootstrap p95 ≤ 1 s · rpc p95 ≤ 1,5 s
   · login p95 ≤ 2 s

Phân vị tính trên biểu đồ tần suất chia bậc 2% (đủ cho hàng chục triệu mẫu của k6 mà
không ngốn RAM), nên p50/p95/p99 sai số ≤ 2%; max là số chính xác.

    python3 loadtest/tong_hop.py ketqua.jsonl [--csv bang.csv] [--buoc 30]
    python3 loadtest/tong_hop.py k6_b5.json.gz            # đầu ra k6 --out json=...
"""
from __future__ import annotations

import argparse
import gzip
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime

# Những dòng này là GHI NHẬN SỰ CỐ, không phải một giao dịch có mã HTTP riêng.
# Gộp chúng vào tỉ lệ lỗi sẽ đếm trùng: refresh hỏng đã tính 401 rồi, bi_dang_xuat
# là hệ quả của chính lần đó; het_ve_401 được app làm mới vé rồi gửi lại.
GHI_NHAN = {"bi_dang_xuat", "luong_im_lang", "luong_dut", "stream_401", "su_kien",
            "het_ve_401", "nhip_gop_chung", "refresh_bo_qua", "bo_qua_may_phat",
            "bi_cat_giua_chung"}

# Thứ tự in — theo dòng chảy của một phiên, không theo bảng chữ cái.
THU_TU = ["login", "login_lai", "mo_app", "bootstrap", "products", "notifications", "shares", "rules",
          "stream_mo", "nhip_giu_ket_noi", "bootstrap_hoi_vong", "refresh", "refresh_giu_ve",
          "rpc", "hen_gio", "bootstrap_sau_noi_lai", "devices_sau_noi_lai", "noi_lai_xong"]

GIAI_THICH = {
    "login": "Đăng nhập",
    "login_lai": "Đăng nhập lại (vé trong pool chết)",
    "mo_app": "Mở app (cả cụm syncRemote)",
    "bootstrap": "/bootstrap",
    "products": "/products",
    "notifications": "/notifications",
    "shares": "/shares",
    "rules": "/rules",
    "hen_gio": "/devices/{id}/hen-gio",
    "stream_mo": "Mở luồng tới byte đầu",
    "nhip_giu_ket_noi": "Khoảng cách nhịp giữ kết nối",
    "bootstrap_hoi_vong": "Hỏi vòng /bootstrap",
    "refresh": "Làm mới vé",
    "refresh_giu_ve": "Làm mới vé nền (giữ pool)",
    "rpc": "Gửi lệnh điều khiển",
    "bootstrap_sau_noi_lai": "/bootstrap sau khi nối lại",
    "devices_sau_noi_lai": "Gọi /devices sau khi nối lại (bản cũ)",
    "noi_lai_xong": "Thời gian hồi phục sau khi đứt",
    "luong_im_lang": "Luồng chết âm thầm (không báo lỗi)",
    "luong_dut": "Luồng đứt có lỗi",
    "stream_401": "Luồng bị 401, phải làm mới vé",
    "het_ve_401": "Vé hết hạn → 401 → làm mới rồi gửi lại",
    "bi_dang_xuat": "Người dùng bị văng khỏi app",
    "su_kien": "Sự kiện trạng thái nhận được",
    "nhip_gop_chung": "Nhịp đồng bộ gộp chung (đã có lần đang bay)",
    "refresh_bo_qua": "Refresh bỏ qua (mọi vé đang làm mới)",
    "bo_qua_may_phat": "MÁY PHÁT bỏ lời gọi (chạm trần đang bay)",
    "bi_cat_giua_chung": "Request bị chính bộ đo cắt ngang (--cut-at)",
}

# B-SLA — đường người dùng. ĐỀ XUẤT, chưa được duyệt.
SLA_P95_MS = {"bootstrap": 1000.0, "rpc": 1500.0, "login": 2000.0}
SLA_THANH_CONG = 99.9
SLA_5XX = 0.1
IT_MAU = 20            # cửa sổ có ít hơn chừng này mẫu một loại thì không xét p95 loại đó
O_GIAY = 10            # độ mịn thời gian: ô 10 giây; cửa sổ 1 phút = 6 ô
CUA_SO_O = 6
MAY_PHAT_TRE_MS = 100  # máy phát trễ lịch p95 quá ngưỡng này thì kết quả bậc đó không dùng được
MAY_PHAT_KH_TOI = 0.5  # % lời gọi không tới được máy chủ — quá thì nghi máy phát


class Hist:
    """Biểu đồ tần suất bậc nhân 1,02 từ 0,1 ms."""
    __slots__ = ("dem", "n", "max")
    LOG_R = math.log(1.02)

    def __init__(self):
        self.dem = Counter()
        self.n = 0
        self.max = None

    def them(self, ms):
        ms = float(ms)
        i = 0 if ms <= 0.1 else int(math.log(ms / 0.1) / self.LOG_R) + 1
        self.dem[i] += 1
        self.n += 1
        if self.max is None or ms > self.max:
            self.max = ms

    def gop(self, khac):
        self.dem.update(khac.dem)
        self.n += khac.n
        if khac.max is not None and (self.max is None or khac.max > self.max):
            self.max = khac.max

    def pv(self, p):
        if not self.n:
            return None
        hang = max(1, math.ceil(p * self.n))
        da = 0
        for i in sorted(self.dem):
            da += self.dem[i]
            if da >= hang:
                gt = 0.1 if i == 0 else 0.1 * math.exp(i * self.LOG_R)
                return min(gt, self.max)
        return self.max


class Dem:
    """Đếm một loại việc (hoặc một ô thời gian): n, ok, và từng loại hỏng."""
    __slots__ = ("n", "ok", "c4xx", "c429", "c5xx", "het_gio", "kh_toi", "h")

    def __init__(self):
        self.n = self.ok = self.c4xx = self.c429 = self.c5xx = self.het_gio = self.kh_toi = 0
        self.h = Hist()

    def them(self, ma, ok, ms):
        self.n += 1
        if ok:
            self.ok += 1
        elif ma is None:
            pass
        elif ma == 0:
            self.kh_toi += 1
        elif ma == -1:
            self.het_gio += 1
        elif ma == 429:
            self.c429 += 1
        elif ma >= 500:
            self.c5xx += 1
        else:
            self.c4xx += 1
        if ms is not None:
            self.h.them(ms)

    def gop(self, k):
        for a in ("n", "ok", "c4xx", "c429", "c5xx", "het_gio", "kh_toi"):
            setattr(self, a, getattr(self, a) + getattr(k, a))
        self.h.gop(k.h)


def nhom_sla(viec):
    if viec.startswith("bootstrap"):
        return "bootstrap"
    if viec == "rpc":
        return "rpc"
    if viec in ("login", "login_lai"):
        return "login"
    return None


def fmt(v):
    return "-" if v is None else ("%.1f" % v)


def dem_o(s, rong):
    """Căn cột theo số ký tự HIỂN THỊ. Chuỗi tiếng Việt có thể ở dạng tổ hợp
    (chữ + dấu rời), lúc đó len() đếm nhiều hơn số ô thật và cột bị lệch."""
    s = unicodedata.normalize("NFC", s)[:rong]
    return s + " " * (rong - len(s))


def doc_moc(luc):
    if not luc:
        return None
    # k6 ghi tới nano giây; fromisoformat chỉ nhận tới micro giây.
    luc = re.sub(r"(\.\d{6})\d+", r"\1", luc.replace("Z", "+00:00"))
    try:
        return datetime.fromisoformat(luc).timestamp()
    except ValueError:
        return None


def mo_tep(duong):
    if duong.endswith(".gz"):
        return gzip.open(duong, "rt", encoding="utf-8")
    return open(duong, encoding="utf-8")


def doc_ban_ghi(duong):
    """Sinh ra các bản ghi đã chuẩn hoá về dạng của do_phien/ban_rps, kể cả từ k6."""
    moc0 = None
    with mo_tep(duong) as f:
        for dong in f:
            dong = dong.strip()
            if not dong:
                continue
            try:
                r = json.loads(dong)
            except json.JSONDecodeError:
                continue
            if r.get("type") in ("Metric", "Point"):        # ---- k6 --out json
                if r["type"] != "Point":
                    continue
                d = r.get("data") or {}
                moc = doc_moc(d.get("time"))
                if moc is None:
                    continue
                if moc0 is None:
                    moc0 = moc
                t = moc - moc0
                tags = d.get("tags") or {}
                bac = tags.get("bac")
                bac = int(bac) if bac and str(bac).isdigit() else bac
                m = r.get("metric")
                if m == "http_req_duration":
                    ma = int(tags.get("status") or 0)
                    if ma == 0 and str(tags.get("error_code")) == "1050":
                        ma = -1                                  # k6 1050 = quá hạn chờ
                    yield {"viec": tags.get("loai") or tags.get("name") or "khong_ro", "ma": ma,
                           "ok": (200 <= ma < 300) or ma == 304, "ms": d.get("value"), "t": t, "bac": bac}
                elif m == "vus":
                    yield {"viec": "dang_bay", "so": d.get("value"), "t": t}
                elif m == "dropped_iterations":
                    yield {"viec": "bo_qua_may_phat", "ok": False, "t": t, "bac": bac,
                           "so": d.get("value")}
                continue
            if "t" not in r:                                    # tệp cũ chưa có trường t
                moc = doc_moc(r.get("luc"))
                if moc is not None:
                    if moc0 is None:
                        moc0 = moc
                    r["t"] = moc - moc0
            yield r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--csv", default="", help="ghi bảng theo việc ra CSV (và <tên>_bac.csv nếu có bậc)")
    ap.add_argument("--buoc", type=int, default=30, help="in cửa sổ 1 phút mỗi N giây (bội của 10)")
    ap.add_argument("--khong-cua-so", action="store_true", help="không in bảng cửa sổ trượt")
    a = ap.parse_args()

    theo_viec = defaultdict(Dem)
    ghi_nhan = Counter()
    ma_loi = Counter()
    o_nhom = defaultdict(lambda: defaultdict(Dem))     # ô → nhóm SLA → Dem
    o_tong = defaultdict(Dem)                          # ô → mọi giao dịch
    o_bay = defaultdict(int)                           # ô → đỉnh đang bay
    o_tre = defaultdict(Hist)                          # ô → máy phát trễ lịch
    o_bo_qua = Counter()
    o_hoi_vong = Counter()
    dinh_luong = 0
    bootstrap_byte, bootstrap_thiet_bi = [], []
    cat_luc = None
    phien = set()
    cau_hinh, ly_thuyet, che_do = {}, None, "phien"
    bac_moc = []                                       # (nhãn, t bắt đầu, t kết thúc hoặc None)
    k6_bac = {}                                        # nhãn → [t min, t max]
    bac_tong = defaultdict(Dem)                        # nhãn bậc → mọi giao dịch mang nhãn đó (chính xác)
    bac_nhom = defaultdict(lambda: defaultdict(Dem))   # nhãn bậc → nhóm SLA → Dem
    bac_tre = defaultdict(Hist)
    bac_bo_qua = Counter()
    bac_bay = Counter()
    dung_xong_t = None
    t_max = 0.0

    for r in doc_ban_ghi(a.file):
        viec = r.get("viec")
        t = r.get("t")
        o = int(t // O_GIAY) if t is not None else None
        if t is not None:
            t_max = max(t_max, t)
        if viec == "BAT_DAU":
            cau_hinh = r.get("cau_hinh") or {}
            ly_thuyet = r.get("req_s_ly_thuyet")
            che_do = r.get("che_do", "phien")
            continue
        if viec == "BAC":
            if bac_moc and bac_moc[-1][2] is None:
                bac_moc[-1] = (bac_moc[-1][0], bac_moc[-1][1], r["t"])
            bac_moc.append((r["bac"], r["t"], None))
            continue
        if viec == "HET_BAC":
            if bac_moc and bac_moc[-1][2] is None:
                bac_moc[-1] = (bac_moc[-1][0], bac_moc[-1][1], r["t"])
            continue
        if viec == "DUNG_XONG":
            dung_xong_t = t
            continue
        if viec == "dem_luong_dang_mo":
            dinh_luong = max(dinh_luong, r.get("so", 0))
            continue
        if viec == "dang_bay":
            so = int(r.get("dinh", r.get("so", 0)) or 0)
            if o is not None:
                o_bay[o] = max(o_bay[o], so)
            if r.get("bac") is not None:
                bac_bay[r["bac"]] = max(bac_bay[r["bac"]], so)
            continue
        if viec == "CAT_KET_NOI":
            cat_luc = r.get("luc")
            continue
        if viec in ("KET_THUC",):
            continue
        if viec == "bootstrap_kich_thuoc":
            bootstrap_byte.append(r.get("byte", 0))
            bootstrap_thiet_bi.append(r.get("so_thiet_bi", 0))
            continue
        if r.get("phien"):
            phien.add(r["phien"])
        if viec in GHI_NHAN:
            ghi_nhan[viec] += int(r.get("so") or 1)
            if viec == "bo_qua_may_phat" and o is not None:
                o_bo_qua[o] += int(r.get("so") or 1)
            if viec == "bo_qua_may_phat" and r.get("bac") is not None:
                bac_bo_qua[r["bac"]] += int(r.get("so") or 1)
            continue

        ma = r.get("ma")
        ok = bool(r.get("ok"))
        ms = r.get("ms")
        theo_viec[viec].them(ma, ok, ms)
        if "ma" not in r:
            continue                                   # dòng đo thời gian, không phải giao dịch
        if not ok:
            if ma == 0:
                ma_loi["khong_toi_duoc"] += 1
            elif ma == -1:
                ma_loi["qua_han_cho"] += 1
            else:
                ma_loi["HTTP %s" % ma] += 1
        if o is None:
            continue
        o_tong[o].them(ma, ok, ms)
        g = nhom_sla(viec)
        if g:
            o_nhom[o][g].them(ma, ok, ms)
        if viec == "bootstrap_hoi_vong":
            o_hoi_vong[o] += 1
        if r.get("tre") is not None:
            o_tre[o].them(max(0.0, r["tre"]))
        if r.get("bac") is not None:
            b = r["bac"]
            bac_tong[b].them(ma, ok, ms)
            if g:
                bac_nhom[b][g].them(ma, ok, ms)
            if r.get("tre") is not None:
                bac_tre[b].them(max(0.0, r["tre"]))
            if che_do != "rps":
                k = k6_bac.setdefault(b, [t, t])
                k[0], k[1] = min(k[0], t), max(k[1], t)

    if bac_moc and bac_moc[-1][2] is None:
        bac_moc[-1] = (bac_moc[-1][0], bac_moc[-1][1], t_max)
    if not bac_moc and k6_bac:
        che_do = "k6"
        bac_moc = sorted(((k, v[0], v[1]) for k, v in k6_bac.items()), key=lambda x: x[1])

    # ------------------------------------------------------------------ bảng theo việc
    print()
    print("=" * 112)
    print("TỔNG HỢP  %s   (chế độ: %s)" % (a.file, {"rps": "bắn theo req/s", "k6": "k6",
                                                     "phien": "mô phỏng phiên"}.get(che_do, che_do)))
    print("=" * 112)
    if che_do == "phien":
        print("Số phiên quan sát được: %d      Đỉnh luồng giữ mở đồng thời: %d" % (len(phien), dinh_luong))
    if cat_luc:
        print("Đã cắt sạch kết nối lúc: %s" % cat_luc)
    if bootstrap_byte:
        tb = sum(bootstrap_byte) / len(bootstrap_byte)
        print("Kích thước /bootstrap: trung bình %.0f byte, lớn nhất %d byte, với %d thiết bị mỗi tài khoản"
              % (tb, max(bootstrap_byte), max(bootstrap_thiet_bi or [0])))
    print()

    dau = "%s %7s %7s %5s %5s %5s %6s %6s %9s %9s %9s %9s" % (
        dem_o("Việc", 34), "n", "OK", "4xx", "429", "5xx", "h.giờ", "kh.tới",
        "p50 ms", "p95 ms", "p99 ms", "max ms")
    print(dau)
    print("-" * len(dau))
    hang_csv = []
    ten_viec = [v for v in THU_TU if v in theo_viec] + sorted(v for v in theo_viec if v not in THU_TU)
    for v in ten_viec:
        d = theo_viec[v]
        p50, p95, p99, mx = d.h.pv(.50), d.h.pv(.95), d.h.pv(.99), d.h.max
        print("%s %7d %7d %5d %5d %5d %6d %6d %9s %9s %9s %9s" % (
            dem_o(GIAI_THICH.get(v, v), 34), d.n, d.ok, d.c4xx, d.c429, d.c5xx, d.het_gio, d.kh_toi,
            fmt(p50), fmt(p95), fmt(p99), fmt(mx)))
        hang_csv.append([v, GIAI_THICH.get(v, v), d.n, d.ok, d.c4xx, d.c429, d.c5xx, d.het_gio,
                         d.kh_toi, p50, p95, p99, mx])

    # Chỉ tính GIAO DỊCH thật (có mã HTTP). Nhịp giữ kết nối, mo_app (cụm), noi_lai_xong
    # là số đo thời gian — đưa vào sẽ thổi phồng mẫu số.
    tong = Dem()
    for o in o_tong.values():
        tong.gop(o)
    print("-" * len(dau))
    khong_dung_duoc = []
    if tong.n:
        tl = 100.0 * tong.ok / tong.n
        print("Tỉ lệ thành công THEO GIAO DỊCH: %.3f%%  (%d/%d)  — ngưỡng đề xuất ≥ %.1f%%"
              % (tl, tong.ok, tong.n, SLA_THANH_CONG))
        rates = [100.0 * theo_viec[v].ok / theo_viec[v].n for v in ten_viec
                 if theo_viec[v].n and v not in ("nhip_giu_ket_noi", "noi_lai_xong", "mo_app")]
        if rates:
            print("Trung bình cộng các loại việc:   %.3f%%  — KHÔNG dùng con số này để báo cáo"
                  % (sum(rates) / len(rates)))
        print("429 (bộ giới hạn tốc độ): %d (%.3f%%)   5xx: %d (%.3f%%)   quá hạn chờ: %d   không tới được: %d"
              % (tong.c429, 100.0 * tong.c429 / tong.n, tong.c5xx, 100.0 * tong.c5xx / tong.n,
                 tong.het_gio, tong.kh_toi))
        if tong.c429:
            print("   ⚠️ Có 429: con số đo được là trần của BỘ GIỚI HẠN, không phải của IBS. Xin nới /"
                  " mở danh sách trắng cho IP máy phát rồi đo lại.")
        if 100.0 * tong.kh_toi / tong.n > MAY_PHAT_KH_TOI:
            khong_dung_duoc.append("%.2f%% lời gọi không tới được máy chủ (cột kh.tới) — kiểm ulimit,"
                                   " cổng tạm, CPU máy phát" % (100.0 * tong.kh_toi / tong.n))
    if ghi_nhan.get("bi_dang_xuat"):
        print("NGƯỜI DÙNG BỊ VĂNG KHỎI APP: %d lần" % ghi_nhan["bi_dang_xuat"])
    if ghi_nhan.get("luong_im_lang"):
        print("Luồng chết âm thầm: %d lần — không có đồng hồ canh lặng thì app treo im"
              % ghi_nhan["luong_im_lang"])
    if ghi_nhan.get("bo_qua_may_phat"):
        khong_dung_duoc.append("máy phát bỏ %d lời gọi (chạm trần đang bay / k6 dropped_iterations)"
                               % ghi_nhan["bo_qua_may_phat"])
    tre_tong = Hist()
    for h in o_tre.values():
        tre_tong.gop(h)
    if tre_tong.n:
        p95_tre = tre_tong.pv(.95)
        print("Máy phát trễ lịch: p50 %s ms, p95 %s ms, max %s ms  (≤ %d ms mới tin được số đo)"
              % (fmt(tre_tong.pv(.5)), fmt(p95_tre), fmt(tre_tong.max), MAY_PHAT_TRE_MS))
        if p95_tre is not None and p95_tre > MAY_PHAT_TRE_MS:
            khong_dung_duoc.append("máy phát trễ lịch p95 %.0f ms — máy phát không bắn kịp nhịp đặt" % p95_tre)
    if o_bay:
        print("Đỉnh số yêu cầu đang bay: %d" % max(o_bay.values()))
    ghi_nhan_in = {k: n for k, n in ghi_nhan.items()}
    if ghi_nhan_in:
        print()
        print("Ghi nhận (không phải giao dịch, không tính vào tỉ lệ):")
        for k, n in sorted(ghi_nhan_in.items(), key=lambda x: -x[1]):
            print("   %s %7d" % (dem_o(GIAI_THICH.get(k, k), 48), n))
    if ma_loi:
        print()
        print("Phân loại lỗi:")
        for k, n in ma_loi.most_common():
            ghi_chu = ("  ← máy phát tải, không phải máy chủ" if k == "khong_toi_duoc"
                       else "  ← bộ giới hạn tốc độ" if k == "HTTP 429" else "")
            print("   %-22s %6d%s" % (k, n, ghi_chu))

    # ------------------------------------------------------------------ req/s thực tế (B6)
    if che_do == "phien" and cau_hinh and ly_thuyet is not None and o_tong:
        ramp = float(cau_hinh.get("ramp") or 0)
        dur = float(cau_hinh.get("duration") or t_max)
        tu = max(dung_xong_t or ramp, ramp) + float(cau_hinh.get("nhip_thuong") or 10)
        den = min(dur, t_max)
        if den - tu >= 20:
            o_tu, o_den = math.ceil(tu / O_GIAY), int(den // O_GIAY)
            so_o = max(1, o_den - o_tu)
            hv = sum(o_hoi_vong[o] for o in range(o_tu, o_den)) / (so_o * O_GIAY)
            moi = sum(o_tong[o].n for o in range(o_tu, o_den) if o in o_tong) / (so_o * O_GIAY)
            tre_tb = theo_viec["bootstrap_hoi_vong"].h.pv(.5) if "bootstrap_hoi_vong" in theo_viec else None
            print()
            print("REQ/S THỰC TẾ SINH RA (B6, giai đoạn giữ từ giây %.0f tới %.0f):" % (tu, den))
            print("   Hỏi vòng /bootstrap đo được:   %8.1f req/s" % hv)
            print("   Mọi giao dịch đo được:         %8.1f req/s" % moi)
            print("   Lý thuyết mục 1.2 (N ÷ nhịp):  %8.1f req/s" % ly_thuyet)
            if tre_tb and not cau_hinh.get("khong_hoi_vong"):
                xk = float(cau_hinh.get("xem_ky_ti_le") or 0)
                nen = float(cau_hinh.get("nen_ti_le") or 0)
                L = tre_tb / 1000.0
                chinh = int(cau_hinh.get("sessions") or 0) * (1 - nen) * (
                    xk / (float(cau_hinh.get("nhip_xem_ky") or 2.5) + L)
                    + (1 - xk) / (float(cau_hinh.get("nhip_thuong") or 10) + L))
                print("   Lý thuyết chỉnh nối đuôi:      %8.1f req/s  (nhịp thật = nhịp + độ trễ p50 %.0f ms)"
                      % (chinh, tre_tb))
                if chinh:
                    lech = 100.0 * (hv - chinh) / chinh
                    print("   Lệch so với bản chỉnh:         %+7.1f%%%s" % (
                        lech, "  ← LỆCH NHIỀU: bộ mô phỏng chưa khớp app, hoặc phiên bị rớt"
                        if abs(lech) > 15 else "  (khớp)"))

    # ------------------------------------------------------------------ cửa sổ trượt 1 phút
    def gop_o(o_tu, o_den):
        """Gộp các ô [o_tu, o_den) thành một bản tóm tắt."""
        tg, nh, tre = Dem(), defaultdict(Dem), Hist()
        bay, bo = 0, 0
        for o in range(o_tu, o_den):
            if o in o_tong:
                tg.gop(o_tong[o])
            for g, d in o_nhom.get(o, {}).items():
                nh[g].gop(d)
            if o in o_tre:
                tre.gop(o_tre[o])
            bay = max(bay, o_bay.get(o, 0))
            bo += o_bo_qua.get(o, 0)
        return tg, nh, tre, bay, bo

    def danh_gia(tg, nh, xet_p95=True):
        """Trả về danh sách lý do KHÔNG đạt (rỗng = đạt)."""
        ly_do = []
        if tg.n:
            tl = 100.0 * tg.ok / tg.n
            if tl < SLA_THANH_CONG:
                ly_do.append("thành công %.2f%%" % tl)
            if 100.0 * tg.c5xx / tg.n > SLA_5XX:
                ly_do.append("5xx %.2f%%" % (100.0 * tg.c5xx / tg.n))
        if xet_p95:
            for g, nguong in SLA_P95_MS.items():
                d = nh.get(g)
                if d and d.h.n >= IT_MAU and d.h.pv(.95) > nguong:
                    ly_do.append("%s p95 %.0f ms" % (g, d.h.pv(.95)))
        return ly_do

    def may_phat_hong(tg, tre, bo):
        if bo:
            return "máy phát bỏ %d lời gọi" % bo
        if tg.n and 100.0 * tg.kh_toi / tg.n > MAY_PHAT_KH_TOI:
            return "kh.tới %.1f%%" % (100.0 * tg.kh_toi / tg.n)
        if tre.n and tre.pv(.95) > MAY_PHAT_TRE_MS:
            return "máy phát trễ p95 %.0f ms" % tre.pv(.95)
        return ""

    def nhan_bac(t):
        for nh_, tu_, den_ in bac_moc:
            if tu_ <= t < (den_ if den_ is not None else 1e18):
                return str(nh_)
        return ""

    cac_o = sorted(o_tong)
    if cac_o and not a.khong_cua_so:
        buoc = max(1, a.buoc // O_GIAY)
        print()
        print("CỬA SỔ TRƯỢT 1 PHÚT (p95 theo B-SLA; * = ít hơn %d mẫu, không xét):" % IT_MAU)
        dau2 = "%7s %7s %8s %8s %5s %5s %5s %6s %8s %8s %8s %6s %7s  %s" % (
            "từ giây", "bậc", "req/s", "t.công%", "429", "5xx", "h.giờ", "kh.tới",
            "p95 boot", "p95 rpc", "p95 login", "bay", "trễ mp", "SLA")
        print(dau2)
        print("-" * (len(dau2) + 20))
        o_dau, o_cuoi = cac_o[0], cac_o[-1]
        o = o_dau
        while o + CUA_SO_O <= o_cuoi + 1 or o == o_dau:
            tg, nh, tre, bay, bo = gop_o(o, o + CUA_SO_O)
            if tg.n:
                def p(g):
                    d = nh.get(g)
                    if not d or not d.h.n:
                        return "-"
                    return ("%.0f" % d.h.pv(.95)) + ("*" if d.h.n < IT_MAU else "")
                mp = may_phat_hong(tg, tre, bo)
                ly = danh_gia(tg, nh)
                kq = ("MÁY PHÁT: " + mp) if mp else ("Đạt" if not ly else "KHÔNG: " + ", ".join(ly))
                print("%7d %7s %8.1f %8.3f %5d %5d %5d %6d %8s %8s %8s %6s %7s  %s" % (
                    o * O_GIAY, nhan_bac(o * O_GIAY + 1), tg.n / (CUA_SO_O * O_GIAY),
                    100.0 * tg.ok / tg.n, tg.c429, tg.c5xx, tg.het_gio, tg.kh_toi,
                    p("bootstrap"), p("rpc"), p("login"), bay or "-",
                    fmt(tre.pv(.95)) if tre.n else "-", kq))
            o += buoc
            if o + CUA_SO_O > o_cuoi + 1:
                break

    # ------------------------------------------------------------------ bảng theo bậc
    bac_kq = []
    if not bac_moc and che_do == "phien" and cau_hinh and o_tong:
        # B6: một lượt do_phien = một bậc "N phiên"; chỉ xét giai đoạn giữ (sau khi dựng xong).
        tu = dung_xong_t if dung_xong_t is not None else float(cau_hinh.get("ramp") or 0)
        bac_moc = [("%s phiên" % cau_hinh.get("sessions"), tu, t_max)]
    if bac_moc:
        print()
        print("THEO BẬC (chỉ tính giao dịch trong bậc; p95 cửa sổ = cửa sổ 1 phút XẤU NHẤT nằm trọn trong bậc):")
        dau3 = "%9s %8s %8s %5s %6s %5s %6s %10s %10s %10s %6s  %s" % (
            "bậc", "req/s", "t.công%", "429", "5xx%", "h.giờ", "kh.tới",
            "p95c boot", "p95c rpc", "p95c login", "bay", "Đạt SLA?")
        print(dau3)
        print("-" * (len(dau3) + 30))
        for nhan, tu, den in bac_moc:
            # Ô 10 giây nằm TRỌN trong bậc — để không lẫn lời gọi của bậc bên cạnh.
            o_tu, o_den = int(math.ceil(tu / O_GIAY)), int(den // O_GIAY)
            tg_o, nh_o, tre, bay, bo = gop_o(o_tu, o_den)
            if nhan in bac_tong:
                # Có nhãn bậc trên từng lời gọi (ban_rps, k6): đếm chính xác theo nhãn.
                tg, nh = bac_tong[nhan], bac_nhom[nhan]
                if bac_tre[nhan].n:
                    tre = bac_tre[nhan]
                bo = max(bo, bac_bo_qua.get(nhan, 0))
                bay = max(bay, bac_bay.get(nhan, 0))
                thoi_luong = den - tu
            else:
                tg, nh = tg_o, nh_o
                thoi_luong = max(1, o_den - o_tu) * O_GIAY
            if not tg.n:
                continue
            # p95 của cửa sổ 1 phút XẤU NHẤT nằm trọn trong bậc. Bậc ngắn hơn 1 phút (chỉ để
            # thử) thì không có cửa sổ trọn nào — lấy p95 của cả bậc và ghi chú.
            xau, ngan = {}, o_den - o_tu < CUA_SO_O
            if ngan:
                for g in SLA_P95_MS:
                    d = nh.get(g)
                    if d and d.h.n >= IT_MAU:
                        xau[g] = d.h.pv(.95)
            for o in range(o_tu, o_den - CUA_SO_O + 1):
                _, nh_w, _, _, _ = gop_o(o, o + CUA_SO_O)
                for g in SLA_P95_MS:
                    d = nh_w.get(g)
                    if d and d.h.n >= IT_MAU:
                        xau[g] = max(xau.get(g, 0), d.h.pv(.95))
            mp = may_phat_hong(tg, tre, bo)
            ly = danh_gia(tg, nh, xet_p95=False)
            for g, nguong in SLA_P95_MS.items():
                if g in xau and xau[g] > nguong:
                    ly.append("%s p95 %.0f ms" % (g, xau[g]))
            if mp:
                kq, dat = "KHÔNG DÙNG ĐƯỢC (máy phát: %s)" % mp, None
            elif ly:
                kq, dat = "KHÔNG — " + ", ".join(ly), False
            else:
                kq, dat = "Đạt", True
            rps_that = tg.n / max(1e-9, thoi_luong)
            if ngan:
                kq += "  (bậc < 1 phút: p95 cả bậc)"
            print("%9s %8.1f %8.3f %5d %6.3f %5d %6d %10s %10s %10s %6s  %s" % (
                nhan, rps_that, 100.0 * tg.ok / tg.n, tg.c429, 100.0 * tg.c5xx / tg.n, tg.het_gio,
                tg.kh_toi, fmt(xau.get("bootstrap")), fmt(xau.get("rpc")), fmt(xau.get("login")),
                bay or "-", kq))
            bac_kq.append((nhan, dat, rps_that, tg, xau))
        if "login" not in SLA_P95_MS or not any("login" in x[4] for x in bac_kq):
            dl = theo_viec.get("login")
            if dl and dl.h.n:
                print("   (login nằm ở phần dựng pool / dựng phiên, ngoài các bậc: p95 cả bài %.0f ms,"
                      " ngưỡng %.0f ms → %s)" % (dl.h.pv(.95), SLA_P95_MS["login"],
                                                 "đạt" if dl.h.pv(.95) <= SLA_P95_MS["login"] else "KHÔNG đạt"))
        cuoi = None
        for nhan, dat, *_ in bac_kq:
            if dat is None:
                print("Dừng xét ở bậc %s: số đo của máy phát không tin được — sửa máy phát (B1) rồi đo lại." % nhan)
                break
            if not dat:
                break
            cuoi = nhan
        print()
        print("BẬC CUỐI CÒN ĐẠT SLA: %s" % (cuoi if cuoi is not None else "không có bậc nào đạt"))
        print("(Ngưỡng B-SLA là ĐỀ XUẤT, chưa được duyệt. 429 tính là KHÔNG thành công.)")

    if khong_dung_duoc:
        print()
        print("!" * 80)
        print("KẾT QUẢ KHÔNG DÙNG ĐƯỢC — máy phát có vấn đề, không đưa vào báo cáo (B10 quy tắc 5):")
        for ly in khong_dung_duoc:
            print("   - " + ly)
        print("!" * 80)
    print()

    if a.csv:
        import csv
        with open(a.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["viec", "mo_ta", "n", "ok", "4xx", "429", "5xx", "qua_han_cho", "khong_toi_duoc",
                        "p50_ms", "p95_ms", "p99_ms", "max_ms"])
            w.writerows(hang_csv)
        print("Đã ghi CSV:", a.csv)
        if bac_kq:
            tep = re.sub(r"\.csv$", "", a.csv) + "_bac.csv"
            with open(tep, "w", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                w.writerow(["bac", "dat_sla", "req_s", "n", "ok", "429", "5xx", "qua_han_cho", "khong_toi_duoc",
                            "p95_cua_so_bootstrap", "p95_cua_so_rpc", "p95_cua_so_login"])
                for nhan, dat, rps_that, tg, xau in bac_kq:
                    w.writerow([nhan, {True: "dat", False: "khong", None: "khong_dung_duoc"}[dat],
                                round(rps_that, 1), tg.n, tg.ok, tg.c429, tg.c5xx, tg.het_gio, tg.kh_toi,
                                xau.get("bootstrap"), xau.get("rpc"), xau.get("login")])
            print("Đã ghi CSV theo bậc:", tep)
    return 0


if __name__ == "__main__":
    sys.exit(main())
