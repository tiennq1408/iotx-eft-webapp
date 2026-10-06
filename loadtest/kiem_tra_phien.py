#!/usr/bin/env python3
"""
Việc ĐẦU TIÊN phải chạy. Cả kế hoạch một ngày dựa vào câu hỏi này:

    Một tài khoản có mở được nhiều phiên độc lập cùng lúc không?

Nếu CÓ, ta mô phỏng vài trăm phiên chỉ bằng một tài khoản, khỏi phải tạo tài khoản
hàng loạt trên DEV. Nếu KHÔNG (máy chủ xoay vòng refresh token theo người dùng, làm
mới phiên này giết phiên kia), phải quay lại xin IBS cấp một dải tài khoản.

Chỉ dùng thư viện chuẩn — chạy được ngay, không cần cài gì.

    export IOTX_EMAIL='...'
    export IOTX_PASSWORD='...'
    python3 loadtest/kiem_tra_phien.py
"""
from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("IOTX_BASE", "https://web.dev.happibot.net/v1")
TENANT = os.environ.get("IOTX_TENANT", "livotec")
EMAIL = os.environ.get("IOTX_EMAIL", "")
PASSWORD = os.environ.get("IOTX_PASSWORD", "")

CTX = ssl.create_default_context()


def goi(duong_dan, body=None, token=None, method=None):
    """Trả về (ma_http, du_lieu, mili_giay). Không ném lỗi HTTP."""
    url = BASE.rstrip("/") + duong_dan
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method or ("POST" if data else "GET"))
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=20) as r:
            raw = r.read()
            ms = (time.perf_counter() - t0) * 1000
            try:
                return r.status, json.loads(raw.decode() or "null"), ms
            except json.JSONDecodeError:
                return r.status, raw[:200], ms
    except urllib.error.HTTPError as e:
        ms = (time.perf_counter() - t0) * 1000
        raw = e.read()
        try:
            return e.code, json.loads(raw.decode() or "null"), ms
        except json.JSONDecodeError:
            return e.code, raw[:200], ms
    except Exception as e:  # mạng, DNS, TLS
        ms = (time.perf_counter() - t0) * 1000
        return 0, {"loi": repr(e)}, ms


def dang_nhap(nhan):
    ma, du_lieu, ms = goi("/auth/login", {"tenant": TENANT, "email": EMAIL, "password": PASSWORD})
    if ma != 200 and ma != 201:
        print("  [%s] đăng nhập HỎNG — mã %s %s" % (nhan, ma, du_lieu))
        return None
    print("  [%s] đăng nhập OK (%.0f ms), vé sống %ss" % (nhan, ms, du_lieu.get("expiresIn")))
    return du_lieu


def ve_con_dung_duoc(tokens, nhan):
    """Trả 'ok' | 'tu_choi' | 'khong_ro'.

    Phải tách bạch ba trường hợp. Nếu gộp "cửa /me hỏng" vào "vé bị từ chối" thì
    script sẽ kết luận nhầm là không dùng được nhiều phiên, và cả ngày đi sai hướng
    chỉ vì một cửa lỗi.
    """
    ma, _, ms = goi("/me", token=tokens["accessToken"])
    if ma == 200:
        ket = "ok"
    elif ma == 401:
        ket = "tu_choi"
    else:
        ket = "khong_ro"
    nhan_xet = {"ok": "OK", "tu_choi": "VÉ BỊ TỪ CHỐI", "khong_ro": "không kết luận được — cửa /me trả mã lạ"}[ket]
    print("  [%s] GET /me → %s (%.0f ms) %s" % (nhan, ma, ms, nhan_xet))
    return ket


def main():
    if not EMAIL or not PASSWORD:
        print("Thiếu IOTX_EMAIL / IOTX_PASSWORD trong biến môi trường.")
        print("  export IOTX_EMAIL='ban@example.com'")
        print("  export IOTX_PASSWORD='...'")
        return 2

    print("Máy chủ: %s   tenant: %s   tài khoản: %s" % (BASE, TENANT, EMAIL))
    print()

    print("1. Đăng nhập hai lần bằng cùng một tài khoản")
    a = dang_nhap("phiên A")
    b = dang_nhap("phiên B")
    if not a or not b:
        print("\nKẾT LUẬN: không đăng nhập được, dừng ở đây.")
        return 1

    khac_nhau = a["accessToken"] != b["accessToken"]
    print("  Hai vé khác nhau: %s" % ("CÓ" if khac_nhau else "KHÔNG — máy chủ trả lại đúng một vé"))
    print()

    print("2. Cả hai vé có dùng được không")
    a_ok = ve_con_dung_duoc(a, "phiên A")
    b_ok = ve_con_dung_duoc(b, "phiên B")
    print()

    print("3. Làm mới vé phiên A — xem có giết phiên B không")
    ma, moi, ms = goi("/auth/refresh", {"refreshToken": a["refreshToken"]})
    if ma not in (200, 201):
        print("  làm mới HỎNG — mã %s %s" % (ma, moi))
        return 1
    print("  làm mới OK (%.0f ms)" % ms)
    time.sleep(1)
    b_con_song = ve_con_dung_duoc(b, "phiên B sau khi A làm mới")
    print()

    print("4. Refresh token cũ của A còn dùng lại được không (có xoay vòng không)")
    ma_cu, _, _ = goi("/auth/refresh", {"refreshToken": a["refreshToken"]})
    xoay_vong = ma_cu not in (200, 201)
    print("  dùng lại refresh token cũ → mã %s (%s)" % (ma_cu, "bị vô hiệu, CÓ xoay vòng" if xoay_vong else "vẫn dùng được, KHÔNG xoay vòng"))
    print()

    print("=" * 62)
    if "khong_ro" in (a_ok, b_ok, b_con_song):
        print("KHÔNG KẾT LUẬN ĐƯỢC.")
        print("Cửa /me trả mã không phải 200 cũng không phải 401, nên không biết vé bị")
        print("từ chối hay chính cửa đó đang hỏng. Kiểm tra lại máy chủ rồi chạy lại.")
        return 1
    if khac_nhau and a_ok == "ok" and b_ok == "ok" and b_con_song == "ok":
        print("KẾT LUẬN: DÙNG ĐƯỢC.")
        print("Một tài khoản mở được nhiều phiên độc lập. Chạy do_phien.py với")
        print("--sessions vài trăm mà không cần tạo tài khoản hàng loạt.")
        print()
        print("Lưu ý khi báo cáo: đây là N phiên của MỘT người dùng, không phải N")
        print("người dùng khác nhau. Máy chủ có thể giữ trạng thái hoặc đặt hạn mức")
        print("theo từng người, nên ghi rõ đây là phép xấp xỉ.")
        return 0
    print("KẾT LUẬN: KHÔNG DÙNG ĐƯỢC.")
    if b_con_song == "tu_choi":
        print("Làm mới phiên A đã giết phiên B — máy chủ xoay vòng refresh token theo")
        print("người dùng. Các phiên sẽ tranh nhau.")
    if not khac_nhau:
        print("Máy chủ trả lại cùng một vé cho hai lần đăng nhập.")
    print("Phải xin IBS cấp một dải tài khoản thử trước khi chạy quy mô.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
