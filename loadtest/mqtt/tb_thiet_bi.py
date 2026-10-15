#!/usr/bin/env python3
"""
Tạo / dọn hàng loạt thiết bị test trong ThingsBoard cho nhánh thiết bị (B2–B4).

Mỗi thiết bị xác thực MQTT bằng clientId (MQTT Basic, không user/mật khẩu) — cách đã thử
thông trên DEV ngày 12/10/2026: TLS một chiều tới cổng 8883, clientId = tên thiết bị.
Chứng thư client (mTLS) KHÔNG dùng ở đây: emqtt-bench chỉ mang một chứng thư mỗi tiến trình,
và ThingsBoard DEV chưa nhận CA test. Báo cáo phải ghi: B2–B4 chưa tính chi phí xác minh
chứng thư client (kịch bản mục 1.1d).

Gọi REST của ThingsBoard bằng tài khoản QUẢN TRỊ TENANT, đọc từ biến môi trường hoặc tệp
loadtest/.tb-tai-khoan (quyền 600, đã .gitignore):
    export TB_URL='https://iotserver.dev.happibot.net'
    export TB_USER='…'
    export TB_PASS='…'

    python3 loadtest/mqtt/tb_thiet_bi.py tao --so 20000            # ltb0 … ltb19999
    python3 loadtest/mqtt/tb_thiet_bi.py dem                       # đếm thiết bị test đang có
    python3 loadtest/mqtt/tb_thiet_bi.py don                       # xoá hết (hỏi trước)

Mọi thiết bị test mang nhãn (label) "loadtest" và tên <tiền tố><số>. Lệnh `don` chỉ xoá
thiết bị khớp CẢ HAI điều kiện — không đụng thiết bị thật.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

NHAN = "loadtest"
TEP_TAI_KHOAN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".tb-tai-khoan")


def _ngu_canh_ssl():
    # Python cài từ python.org trên macOS không có kho chứng thư gốc — dùng certifi nếu có.
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


CTX = _ngu_canh_ssl()


def doc_tai_khoan():
    """Biến môi trường thắng; thiếu thì đọc tệp .tb-tai-khoan (phải là quyền 600)."""
    if not (os.environ.get("TB_USER") and os.environ.get("TB_PASS")) and os.path.exists(TEP_TAI_KHOAN):
        quyen = os.stat(TEP_TAI_KHOAN).st_mode & 0o777
        if quyen & 0o077:
            sys.exit("loadtest/.tb-tai-khoan đang để người khác đọc được. Chạy: chmod 600 loadtest/.tb-tai-khoan")
        for dong in open(TEP_TAI_KHOAN, encoding="utf-8"):
            m = re.match(r"\s*(?:export\s+)?(TB_URL|TB_USER|TB_PASS)\s*=\s*(['\"]?)(.*)\2\s*$", dong)
            if m and not os.environ.get(m.group(1)):
                os.environ[m.group(1)] = m.group(3)
    url = os.environ.get("TB_URL", "https://iotserver.dev.happibot.net").rstrip("/")
    user, mk = os.environ.get("TB_USER"), os.environ.get("TB_PASS")
    if not (user and mk):
        sys.exit("Thiếu TB_USER / TB_PASS (tài khoản QUẢN TRỊ TENANT). Đặt biến môi trường hoặc tạo loadtest/.tb-tai-khoan.")
    return url, user, mk


class TB:
    def __init__(self, url, user, mk):
        self.url, self.user, self.mk = url, user, mk
        self.khoa = threading.Lock()
        self.ve = None
        self.dang_nhap()

    def dang_nhap(self):
        with self.khoa:
            ma, j = self._goi("POST", "/api/auth/login", {"username": self.user, "password": self.mk}, ve=False)
            if ma != 200 or not j or "token" not in j:
                sys.exit(f"Đăng nhập ThingsBoard hỏng (mã {ma}). Kiểm tài khoản quản trị tenant và TB_URL={self.url}")
            self.ve = j["token"]
        # Thiết bị chỉ tạo được bằng QUẢN TRỊ TENANT. sysadmin đăng nhập được nhưng mọi lời gọi
        # tạo/xoá thiết bị trả 403 — báo ngay thay vì để từng lời gọi hỏng.
        ma, u = self._goi("GET", "/api/auth/user")
        vai = (u or {}).get("authority")
        if vai != "TENANT_ADMIN":
            sys.exit(f"Tài khoản {self.user} có vai trò {vai or '?'}, cần TENANT_ADMIN (quản trị tenant). "
                     "sysadmin không tạo được thiết bị — dùng tài khoản quản trị của tenant livotec.")
        self.tenant = (u.get("tenantId") or {}).get("id")

    def _goi(self, phuong_thuc, duong, than=None, ve=True):
        h = {"Content-Type": "application/json", "Accept": "application/json"}
        if ve and self.ve:
            h["X-Authorization"] = "Bearer " + self.ve
        req = urllib.request.Request(self.url + duong, method=phuong_thuc, headers=h,
                                     data=json.dumps(than).encode() if than is not None else None)
        try:
            with urllib.request.urlopen(req, context=CTX, timeout=30) as r:
                raw = r.read()
                return r.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return e.code, json.loads(raw)
            except Exception:
                return e.code, {"message": raw[:200].decode(errors="replace")}
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            # Mạng chập / máy chủ không kịp nhận kết nối: mã 0 để `goi` thử lại, không làm sập lệnh.
            return 0, {"message": f"không tới được máy chủ: {getattr(e, 'reason', e)}"}

    def goi(self, phuong_thuc, duong, than=None, so_lan=4):
        for lan in range(so_lan):
            ma, j = self._goi(phuong_thuc, duong, than)
            if ma == 401:   # vé JWT hết hạn giữa chừng: đăng nhập lại một lần
                self.dang_nhap()
                ma, j = self._goi(phuong_thuc, duong, than)
            # Chỉ thử lại lỗi tạm thời: không tới được máy chủ, 429, 5xx. Lỗi 4xx khác là thật.
            if ma == 0 or ma == 429 or ma >= 500:
                time.sleep(2 * (lan + 1))
                continue
            return ma, j
        return ma, j

    def tim_test(self, tien_to):
        """Mọi thiết bị test: tên <tiền tố><số> VÀ nhãn loadtest."""
        mau = re.compile(r"^%s\d+$" % re.escape(tien_to))
        ra, trang = [], 0
        while True:
            ma, j = self.goi("GET", f"/api/tenant/devices?pageSize=1000&page={trang}&textSearch={tien_to}")
            if ma != 200:
                sys.exit(f"Không liệt kê được thiết bị (mã {ma}): {j}")
            for d in j.get("data", []):
                if mau.match(d.get("name", "")) and d.get("label") == NHAN:
                    ra.append((d["name"], d["id"]["id"]))
            if not j.get("hasNext"):
                return ra
            trang += 1


def tao_mot(tb, ten):
    than = {
        "device": {"name": ten, "label": NHAN, "type": "default"},
        "credentials": {"credentialsType": "MQTT_BASIC",
                        "credentialsValue": json.dumps({"clientId": ten, "userName": None, "password": None})},
    }
    ma, j = tb.goi("POST", "/api/device-with-credentials", than)
    if ma == 200:
        return "tao"
    thong_bao = (j or {}).get("message", "")
    if ma == 400 and "already exists" in thong_bao.lower():
        return "da_co"
    return f"loi {ma}: {thong_bao[:120]}"


def main():
    p = argparse.ArgumentParser(description="Tạo / dọn thiết bị test trong ThingsBoard (nhánh thiết bị)")
    p.add_argument("viec", choices=["tao", "dem", "don"])
    p.add_argument("--so", type=int, default=1000, help="số thiết bị cần có (tao)")
    p.add_argument("--bat-dau", type=int, default=0)
    p.add_argument("--tien-to", default=os.environ.get("MQTT_PREFIX_TB", "ltb"))
    p.add_argument("--song-song", type=int, default=8, help="số lời gọi REST cùng lúc — đừng đẩy cao, TB DEV chỉ 2 vCPU")
    p.add_argument("--co", action="store_true", help="dọn không hỏi lại")
    a = p.parse_args()

    url, user, mk = doc_tai_khoan()
    tb = TB(url, user, mk)
    print(f"ThingsBoard: {url}  · tiền tố: {a.tien_to}")

    if a.viec == "dem":
        print(f"Đang có {len(tb.tim_test(a.tien_to))} thiết bị test (tên {a.tien_to}<số>, nhãn {NHAN}).")
        return 0

    if a.viec == "don":
        ds = tb.tim_test(a.tien_to)
        if not ds:
            print("Không có thiết bị test nào để dọn.")
            return 0
        print(f"Sẽ XOÁ {len(ds)} thiết bị (vd. {', '.join(t for t, _ in ds[:3])}…), chỉ những cái có nhãn '{NHAN}'.")
        if not a.co:
            if input("Gõ 'xoa' để xoá: ").strip() != "xoa":
                print("Bỏ qua.")
                return 1
        dem, loi, t0 = 0, 0, time.time()
        with ThreadPoolExecutor(a.song_song) as ex:
            for f in as_completed([ex.submit(tb.goi, "DELETE", f"/api/device/{i}") for _, i in ds]):
                ma, _ = f.result()
                dem += 1
                loi += ma != 200
                if dem % 500 == 0:
                    print(f"  đã xoá {dem}/{len(ds)} ({dem / (time.time() - t0):.0f}/s)")
        print(f"Xong: xoá {dem - loi}, lỗi {loi}.")
        return 0 if loi == 0 else 1

    # tao
    if not a.co:
        print(f"Sẽ tạo {a.so} thiết bị {a.tien_to}{a.bat_dau} … {a.tien_to}{a.bat_dau + a.so - 1} trên ThingsBoard này.")
        print("Mỗi thiết bị là một bản ghi thật trong CSDL ThingsBoard — đĩa DEV phải còn chỗ (kịch bản mục 0.2).")
        if input("Gõ 'co' để tạo: ").strip() != "co":
            print("Bỏ qua.")
            return 1
    ket = {"tao": 0, "da_co": 0}
    loi = []
    t0 = time.time()
    ten = [f"{a.tien_to}{i}" for i in range(a.bat_dau, a.bat_dau + a.so)]
    with ThreadPoolExecutor(a.song_song) as ex:
        for n, f in enumerate(as_completed([ex.submit(tao_mot, tb, t) for t in ten]), 1):
            r = f.result()
            if r in ket:
                ket[r] += 1
            else:
                loi.append(r)
            if n % 500 == 0:
                print(f"  {n}/{a.so} ({n / (time.time() - t0):.0f}/s) — tạo {ket['tao']}, đã có {ket['da_co']}, lỗi {len(loi)}")
            if len(loi) >= 20 and len(loi) > n // 2:
                print("Quá nửa số lời gọi hỏng — dừng. Lỗi đầu tiên:", loi[0])
                ex.shutdown(cancel_futures=True)
                break
    giay = time.time() - t0
    print(f"Xong sau {giay:.0f} s: tạo mới {ket['tao']}, đã có sẵn {ket['da_co']}, lỗi {len(loi)}"
          f" — tốc độ tạo ~{(ket['tao'] + ket['da_co']) / max(giay, 1):.0f} thiết bị/s.")
    if loi:
        print("Ví dụ lỗi:", *sorted(set(loi))[:5], sep="\n  ")
    return 0 if not loi else 1


if __name__ == "__main__":
    sys.exit(main())
