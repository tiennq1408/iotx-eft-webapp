#!/usr/bin/env python3
"""
Hiệu suất TRÊN MỖI VM và TRÊN MỖI vCPU cho từng bài tải đã chạy.

Lấy CPU thật của 5 máy DEV (iotx-dev-*) từ Google Cloud Monitoring đúng khung giờ của bài,
ghép với tải mà máy phát đã bắn ra trong từng phút, rồi tính:

  • tải mỗi phút          req/s (nhánh người dùng) hoặc số kết nối đang giữ (nhánh thiết bị)
  • vCPU đã dùng mỗi VM   phút có tải cao nhất, và % so với SỨC NỀN của loại máy
  • tải / vCPU            hiệu suất ở phút đỉnh, theo từng VM và theo cả hệ thống trên đường đi
  • trần ước tính mỗi VM  khớp đường thẳng vCPU = a + b × tải trên các phút (kèm 5 phút nghỉ trước
                          bài để có a = mức nền lúc không tải), rồi trần = (sức nền − a) / b.
                          VM có trần ước tính thấp nhất là mắt yếu nhất. Đây là NGOẠI SUY TUYẾN
                          TÍNH — chỉ đúng khi CPU là thứ cạn trước (không phải pool CSDL, khoá…).

SỨC NỀN: e2-small / e2-medium là máy "vCPU dùng chung": chỉ được bùng lên 2 vCPU trong ngắn hạn,
chạy dài bị kéo về 0,5 vCPU (e2-small) / 1 vCPU (e2-medium). Bài tải kéo dài nhiều phút nên
so với sức nền, không so với 2 vCPU. Số % > 100 nghĩa là máy đang tiêu tín dụng bùng nổ.

Một VM chạy nhiều container (VM2 = IBS + Postgres + Redis + MinIO + portal) chỉ ra MỘT con số:
Cloud Monitoring không tách được theo container.

Cần: gcloud đã đăng nhập (`gcloud auth login`) bằng tài khoản có quyền xem Monitoring
(roles/monitoring.viewer) trên project DEV, và GCP_PROJECT=<mã project> hoặc `gcloud config
set project`. Số liệu Monitoring có độ trễ ~3–4 phút: chạy lệnh này sau khi bài xong vài phút.

    python3 loadtest/do_vm.py --ngay 20261013                 # mọi kết quả của ngày
    python3 loadtest/do_vm.py --ngay 20261013-20261014        # đợt chạy qua đêm
    python3 loadtest/do_vm.py loadtest/ketqua/20261013_0930_b5_k6.json.gz
    python3 loadtest/do_vm.py --ngay 20261013 --khong-gcp     # chỉ thử đọc tải, không gọi GCP
"""
from __future__ import annotations

import argparse
import csv
import glob
import gzip
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

TD = os.path.dirname(os.path.abspath(__file__))
KQ = os.path.join(TD, "ketqua")

# Loại máy theo bảng GCP người dùng gửi ngày 13/10/2026. `nen` = sức bền vững (vCPU).
VM = {
    "iotx-dev-edge": {"vm": "VM1", "loai": "e2-small", "vcpu": 2, "nen": 0.5, "chay": "Caddy (TLS), web, dct, support"},
    "iotx-dev-app":  {"vm": "VM2", "loai": "e2-medium", "vcpu": 2, "nen": 1.0, "chay": "IBS + Postgres + Redis + MinIO + portal"},
    "iotx-dev-kc":   {"vm": "VM3", "loai": "e2-medium", "vcpu": 2, "nen": 1.0, "chay": "Keycloak + CSDL"},
    "iotx-dev-tb":   {"vm": "VM4", "loai": "e2-standard-2", "vcpu": 2, "nen": 2.0, "chay": "ThingsBoard + Kafka + Postgres TB"},
    "iotx-dev-pki":  {"vm": "VM5", "loai": "e2-small", "vcpu": 2, "nen": 0.5, "chay": "PKI"},
}
# Máy nằm trên đường đi của từng nhánh — tính "cả hệ thống" chỉ cộng các máy này.
DUONG = {
    "nguoi_dung": ["iotx-dev-edge", "iotx-dev-app", "iotx-dev-kc", "iotx-dev-tb"],
    "thiet_bi": ["iotx-dev-tb"],
    "thiet_bi_telemetry": ["iotx-dev-tb", "iotx-dev-app"],   # B4: TB đẩy telemetry sang IBS
}

# Dòng ghi nhận sự cố, không phải giao dịch (trùng với tong_hop.GHI_NHAN).
GHI_NHAN = {"bi_dang_xuat", "luong_im_lang", "luong_dut", "stream_401", "su_kien", "het_ve_401",
            "nhip_gop_chung", "refresh_bo_qua", "bo_qua_may_phat", "bi_cat_giua_chung"}
NGHI_TRUOC = 300   # giây nghỉ trước bài lấy làm mức nền (tải = 0)


def phut(epoch: float) -> int:
    return int(epoch // 60 * 60)


def epoch_iso(s: str) -> float:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


# ---------- đọc tải từ kết quả máy phát ----------

def tai_jsonl(duong):
    """do_phien.py / ban_rps.py: đếm giao dịch mỗi phút."""
    req, boot = defaultdict(int), defaultdict(int)
    with open(duong, encoding="utf-8") as f:
        for dong in f:
            try:
                r = json.loads(dong)
            except ValueError:
                continue
            if "ma" not in r or "luc" not in r or r.get("viec") in GHI_NHAN:
                continue
            m = phut(epoch_iso(r["luc"]))
            req[m] += 1
            if str(r.get("viec", "")).startswith("bootstrap"):
                boot[m] += 1
    return req, boot


def tai_k6(duong):
    req, boot = defaultdict(int), defaultdict(int)
    mo = gzip.open if duong.endswith(".gz") else open
    with mo(duong, "rt", encoding="utf-8") as f:
        for dong in f:
            if '"http_reqs"' not in dong or '"Point"' not in dong:
                continue
            d = json.loads(dong)["data"]
            m = phut(epoch_iso(d["time"]))
            req[m] += 1
            if d.get("tags", {}).get("loai", "").startswith("bootstrap"):
                boot[m] += 1
    return req, boot


def tai_mqtt(thu_muc):
    """Số kết nối đang giữ mỗi phút: dòng `mau` của su_kien.csv; không có thì cộng log emqtt-bench."""
    giu = defaultdict(int)
    bat_dau = {}
    tep = os.path.join(thu_muc, "su_kien.csv")
    if not os.path.exists(tep):
        return giu
    with open(tep, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            e = int(r["epoch"])
            if r["su_kien"] in ("mau", "mau_noi_lai") and r["so"]:
                giu[phut(e)] = max(giu[phut(e)], int(r["so"]))
            elif r["su_kien"] == "bat_dau":
                bat_dau[r["nhan"]] = e
    if any(giu.values()):
        return giu
    # B4 không ghi `mau`: lấy "Ns connect_succ total=X" của từng tiến trình, cộng theo phút.
    theo_tien_trinh = defaultdict(dict)
    for nhan, e0 in bat_dau.items():
        log = os.path.join(thu_muc, nhan + ".log")
        if not os.path.exists(log):
            continue
        for dong in open(log, encoding="utf-8", errors="replace"):
            m = re.match(r"(\d+)s connect_succ total=(\d+)", dong)
            if m:
                theo_tien_trinh[nhan][phut(e0 + int(m.group(1)))] = int(m.group(2))
    for _, ds in theo_tien_trinh.items():
        for m, v in ds.items():
            giu[m] += v
    return giu


def doc_bai(duong):
    ten = os.path.basename(duong.rstrip("/"))
    if os.path.isdir(duong):
        nhanh = "thiet_bi_telemetry" if ten.endswith("_b4") else "thiet_bi"
        return {"ten": ten, "nhanh": nhanh, "don_vi": "kết nối", "tai": tai_mqtt(duong), "boot": {}}
    if ".json" in ten and "k6" in ten:
        req, boot = tai_k6(duong)
    else:
        req, boot = tai_jsonl(duong)
    # đếm/phút → /giây
    return {"ten": ten, "nhanh": "nguoi_dung", "don_vi": "req/s",
            "tai": {m: v / 60 for m, v in req.items()}, "boot": {m: v / 60 for m, v in boot.items()}}


# ---------- Cloud Monitoring ----------

def gcloud(*args):
    try:
        return subprocess.run(["gcloud", *args], capture_output=True, text=True, check=True).stdout.strip()
    except FileNotFoundError:
        sys.exit("Không thấy gcloud. Cài: brew install --cask google-cloud-sdk  rồi  gcloud auth login")
    except subprocess.CalledProcessError as e:
        sys.exit(f"gcloud {' '.join(args)} hỏng: {e.stderr.strip()[:300]}\nChạy: gcloud auth login")


class TepXuat:
    """CPU / mạng đã xuất sẵn bằng curl trên máy có gcloud (vd. claude-vps): ketqua/cpu_<ngày>.json,
    ketqua/mang_<ngày>.json — đúng nguyên văn trả lời của API timeSeries.list (ALIGN_RATE 60 s)."""

    def __init__(self, cpu_tep, mang_tep):
        self.so = {"cpu": self._doc(cpu_tep), "mang": self._doc(mang_tep) if mang_tep else {}}

    @staticmethod
    def _doc(tep):
        ra = defaultdict(dict)
        j = json.load(open(tep, encoding="utf-8"))
        if "error" in j:
            sys.exit(f"{tep} là trả lời LỖI của Cloud Monitoring: {json.dumps(j['error'], ensure_ascii=False)[:300]}")
        for ts in j.get("timeSeries", []):
            may = ts["metric"]["labels"].get("instance_name")
            for p in ts.get("points", []):
                v = p["value"]
                ra[may][phut(epoch_iso(p["interval"]["endTime"])) - 60] = float(v.get("doubleValue", v.get("int64Value")))
        if not ra:
            sys.exit(f"{tep} không có chuỗi số nào cho iotx-dev-* — sai ngày hoặc sai project.")
        if j.get("nextPageToken"):
            print(f"CẢNH BÁO {tep}: còn trang sau chưa xuất — có thể thiếu số.")
        return ra

    def chuoi(self, loai_so, tu, den):
        nguon = self.so["cpu" if "cpu" in loai_so else "mang"]
        return {may: {m: v for m, v in d.items() if tu <= m <= den} for may, d in nguon.items()}


class GiamSat:
    def __init__(self, du_an):
        self.du_an = du_an
        self.ve = gcloud("auth", "print-access-token")

    def chuoi(self, loai_so, tu, den, loc_them=""):
        """{tên máy: {phút bắt đầu: giá trị/giây}} — ALIGN_RATE 60 s."""
        loc = (f'metric.type="{loai_so}" AND resource.type="gce_instance" '
               f'AND metric.labels.instance_name=monitoring.regex.full_match("iotx-dev-.*"){loc_them}')
        q = {"filter": loc,
             "interval.startTime": datetime.fromtimestamp(tu, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
             "interval.endTime": datetime.fromtimestamp(den, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
             "aggregation.alignmentPeriod": "60s", "aggregation.perSeriesAligner": "ALIGN_RATE"}
        ra = defaultdict(dict)
        trang = None
        while True:
            if trang:
                q["pageToken"] = trang
            url = (f"https://monitoring.googleapis.com/v3/projects/{self.du_an}/timeSeries?"
                   + urllib.parse.urlencode(q))
            req = urllib.request.Request(url, headers={"Authorization": "Bearer " + self.ve})
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    j = json.load(r)
            except urllib.error.HTTPError as e:
                sys.exit(f"Cloud Monitoring trả {e.code}: {e.read()[:300].decode(errors='replace')}\n"
                         "Kiểm GCP_PROJECT và quyền roles/monitoring.viewer.")
            for ts in j.get("timeSeries", []):
                may = ts["metric"]["labels"].get("instance_name")
                for p in ts.get("points", []):
                    v = p["value"]
                    gt = v.get("doubleValue", v.get("int64Value"))
                    ket_thuc = epoch_iso(p["interval"]["endTime"])
                    ra[may][phut(ket_thuc) - 60] = ra[may].get(phut(ket_thuc) - 60, 0) + float(gt)
            trang = j.get("nextPageToken")
            if not trang:
                return ra


# ---------- tính ----------

def khop_thang(xs, ys):
    """Bình phương tối thiểu y = a + b x. Trả (a, b) hoặc None nếu tải không đổi."""
    n = len(xs)
    if n < 3:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return None
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    return my - b * mx, b


def so(x, le=1):
    if x is None:
        return "—"
    return f"{x:,.{le}f}".replace(",", " ").replace(".", ",")


def phan_tich(bai, cpu, mang):
    tai = {m: v for m, v in bai["tai"].items() if v > 0}
    if not tai:
        return None, [f"## {bai['ten']}: không đọc được tải."]
    dau, cuoi = min(tai), max(tai)
    # Bỏ phút đầu và cuối (thường lấp lửng nửa phút) khi chọn phút đỉnh.
    giua = {m: v for m, v in tai.items() if dau < m < cuoi} or tai
    dinh = max(giua, key=giua.get)
    may_duong = DUONG[bai["nhanh"]]
    dv = bai["don_vi"]
    kq = {"bai": bai["ten"], "nhanh": bai["nhanh"], "don_vi": dv, "tai_dinh": giua[dinh],
          "phut_dinh": datetime.fromtimestamp(dinh).strftime("%H:%M"),
          "tu": datetime.fromtimestamp(dau).strftime("%d/%m %H:%M"),
          "den": datetime.fromtimestamp(cuoi + 60).strftime("%H:%M"), "may": {}}
    dong = [f"## {bai['ten']}  ({kq['tu']}–{kq['den']}, nhánh {bai['nhanh'].replace('_', ' ')})",
            f"Phút đỉnh {kq['phut_dinh']}: {so(giua[dinh])} {dv}"
            + (f", trong đó /bootstrap {so(bai['boot'].get(dinh, 0))}/s" if bai["boot"] else ""), ""]
    if cpu is None:
        dong.append("(--khong-gcp: bỏ qua CPU)")
        dong += [f"  {datetime.fromtimestamp(m).strftime('%H:%M')}  {so(v)} {dv}" for m, v in sorted(tai.items())]
        return kq, dong

    dong.append(f"| Máy | Chạy gì | vCPU dùng ở đỉnh | % sức nền | {dv} / vCPU dùng | vCPU lúc nghỉ | vCPU / 1 {dv} | Trần ước tính ({dv}) | CPU cao nhất cả bài |")
    dong.append("|---|---|---|---|---|---|---|---|---|")
    tong_dung = 0.0
    tran_ht = []
    for ten in VM:
        if ten not in cpu:
            continue
        th = VM[ten]
        c = cpu[ten]
        d = c.get(dinh)
        tren_duong = ten in may_duong
        # Khớp trên các phút có số CPU: phút nghỉ trước bài (tải 0) + phút chạy bài.
        xs, ys = [], []
        for m in range(dau - NGHI_TRUOC, cuoi + 60, 60):
            if m in c and (m < dau or m in tai):
                xs.append(tai.get(m, 0.0) if m >= dau else 0.0)
                ys.append(c[m])
        k = khop_thang(xs, ys)
        a, b = (k if k else (None, None))
        # Phút đỉnh TẢI có thể rơi vào lúc hệ đã sập (k6 bắn nhiều lời gọi hỏng, rẻ): xem thêm CPU
        # cao nhất suốt bài — chạm trần ở đây là dấu hiệu máy nghẽn dù bảng hồi quy nói khác.
        cao = max((v for m, v in c.items() if dau <= m <= cuoi), default=None)
        tran = (th["nen"] - a) / b if (k and b > 1e-6 and th["nen"] > a) else None
        if tran is not None and tran < 0:
            tran = None
        if tren_duong and d is not None:
            tong_dung += d
            if tran is not None:
                tran_ht.append((tran, ten))
        kq["may"][ten] = {"vcpu_dinh": d, "phan_tram_nen": d / th["nen"] * 100 if d is not None else None,
                          "tai_moi_vcpu": giua[dinh] / d if d else None, "a": a, "b": b, "tran": tran,
                          "tren_duong": tren_duong, "mang_ra_byte_s": mang.get(ten, {}).get(dinh), "cpu_cao_nhat": cao}
        nhan = f"{th['vm']} {ten}" + ("" if tren_duong else " (ngoài đường đi)")
        dong.append(f"| {nhan} | {th['chay']} | {so(d, 2)} / {th['vcpu']} | "
                    f"{so(d / th['nen'] * 100 if d is not None else None, 0)}% của {so(th['nen'], 1)} | "
                    f"{so(giua[dinh] / d if d else None)} | {so(a, 2)} | {so(b, 4)} | "
                    f"{so(tran, 0) if tran is not None else ('—' if not tren_duong else 'không tăng theo tải')} | "
                    f"{so(cao, 2)}{' ⚠ chạm trần' if cao is not None and cao >= th['vcpu'] * 0.95 else ''} |")
    nen_ht = sum(VM[t]["nen"] for t in may_duong if t in cpu)
    kq["he_thong"] = {"vcpu_dung": tong_dung, "suc_nen": nen_ht,
                      "tai_moi_vcpu": giua[dinh] / tong_dung if tong_dung else None,
                      "mat_yeu": min(tran_ht)[1] if tran_ht else None,
                      "tran_uoc_tinh": min(tran_ht)[0] if tran_ht else None}
    dong += ["",
             f"Cả hệ thống trên đường đi ({', '.join(VM[t]['vm'] for t in may_duong)}): "
             f"dùng {so(tong_dung, 2)} vCPU ở đỉnh / sức nền {so(nen_ht, 1)} vCPU → "
             f"{so(kq['he_thong']['tai_moi_vcpu'])} {dv} cho mỗi vCPU đang dùng."]
    if tran_ht:
        t, ten = min(tran_ht)
        dong.append(f"Mắt yếu nhất theo CPU: {VM[ten]['vm']} {ten} — trần ước tính ~{so(t, 0)} {dv} "
                    f"(đỉnh đo được {so(giua[dinh])}). Nếu đỉnh đo được đã gãy SLA mà mọi máy còn xa sức nền, "
                    "thì thứ cạn trước KHÔNG phải CPU (pool CSDL 10 kết nối, gọi ThingsBoard tuần tự, giới hạn tốc độ…).")
    return kq, dong


def main():
    p = argparse.ArgumentParser(description="Hiệu suất trên mỗi VM / mỗi vCPU cho các bài tải")
    p.add_argument("tep", nargs="*", help="tệp kết quả (.jsonl, k6 .json.gz) hoặc thư mục mqtt_*")
    p.add_argument("--ngay", help="lấy mọi kết quả trong ketqua/ có tiền tố YYYYMMDD")
    p.add_argument("--khong-gcp", action="store_true", help="chỉ đọc tải, không gọi Cloud Monitoring")
    p.add_argument("--cpu-tep", help="CPU đã xuất sẵn (mặc định ketqua/cpu_<ngày>.json nếu có)")
    p.add_argument("--mang-tep", help="mạng đã xuất sẵn (mặc định ketqua/mang_<ngày>.json nếu có)")
    a = p.parse_args()

    ds = list(a.tep)
    # Một đợt có thể vắt qua nửa đêm: --ngay 20261013-20261014 lấy kết quả của cả hai ngày,
    # và số CPU đọc từ ketqua/cpu_20261013-20261014.json (xuất một khung giờ phủ cả đợt).
    ngay_ds = re.split(r"[,-]", a.ngay) if a.ngay else []
    if a.ngay:
        a.ngay = "-".join(ngay_ds)
    for ngay in ngay_ds:
        ds += sorted(glob.glob(os.path.join(KQ, f"{ngay}_*.jsonl")) + glob.glob(os.path.join(KQ, f"{ngay}_*.json.gz"))
                     + [d for d in glob.glob(os.path.join(KQ, f"mqtt_{ngay}_*")) if os.path.isdir(d)])
    # b1 / thu bắn vào IBS giả cục bộ, b9 là trình duyệt — không có tải trên DEV để đo.
    ds = [d for d in ds if not re.search(r"_vm|_b9\.jsonl$|_b1_|_thu", os.path.basename(d.rstrip("/")))]
    if not ds:
        sys.exit("Không có tệp kết quả nào. Đưa đường dẫn hoặc --ngay YYYYMMDD.")

    bai_ds = [doc_bai(d) for d in ds]
    gs = None
    cpu_tep = a.cpu_tep or (a.ngay and os.path.exists(os.path.join(KQ, f"cpu_{a.ngay}.json")) and os.path.join(KQ, f"cpu_{a.ngay}.json"))
    mang_tep = a.mang_tep or (a.ngay and os.path.exists(os.path.join(KQ, f"mang_{a.ngay}.json")) and os.path.join(KQ, f"mang_{a.ngay}.json"))
    if cpu_tep and not a.khong_gcp:
        gs = TepXuat(cpu_tep, mang_tep)
        print(f"Dùng số CPU đã xuất: {cpu_tep}")
    elif not a.khong_gcp:
        du_an = os.environ.get("GCP_PROJECT") or gcloud("config", "get-value", "project")
        if not du_an:
            sys.exit("Chưa biết project GCP. Đặt GCP_PROJECT=<mã project DEV> hoặc gcloud config set project <mã>.")
        gs = GiamSat(du_an)
        print(f"Project GCP: {du_an}")

    tat_ca, ra = [], []
    for bai in bai_ds:
        cpu = mang = None
        if gs and bai["tai"]:
            tu, den = min(bai["tai"]) - NGHI_TRUOC, max(bai["tai"]) + 120
            if den > datetime.now().timestamp() - 240:
                print(f"CẢNH BÁO {bai['ten']}: bài vừa xong < 4 phút — Monitoring có thể chưa đủ số, chạy lại sau.")
            cpu = gs.chuoi("compute.googleapis.com/instance/cpu/usage_time", tu, den)
            mang = gs.chuoi("compute.googleapis.com/instance/network/sent_bytes_count", tu, den)
            if not cpu:
                print(f"CẢNH BÁO {bai['ten']}: Monitoring không trả số CPU nào cho iotx-dev-* — sai project?")
        kq, dong = phan_tich(bai, cpu, mang or {})
        if kq:
            tat_ca.append(kq)
        ra += dong + [""]

    van_ban = "\n".join(ra)
    print(van_ban)
    if not a.khong_gcp:
        goc = a.ngay or datetime.now().strftime("%Y%m%d_%H%M")
        with open(os.path.join(KQ, f"{goc}_hieu_suat_vm.md"), "w", encoding="utf-8") as f:
            f.write("# Hiệu suất trên mỗi VM / mỗi vCPU\n\n" + van_ban)
        with open(os.path.join(KQ, f"{goc}_hieu_suat_vm.json"), "w", encoding="utf-8") as f:
            json.dump(tat_ca, f, ensure_ascii=False, indent=1)
        print(f"Đã ghi loadtest/ketqua/{goc}_hieu_suat_vm.md và .json")


if __name__ == "__main__":
    main()
