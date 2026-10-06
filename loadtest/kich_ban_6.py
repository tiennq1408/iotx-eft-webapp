#!/usr/bin/env python3
"""
Kịch bản 6 — Mạng kém và thao tác hỏng. Trình duyệt thật, vài phiên.

Đây là kịch bản duy nhất chạy được NGAY mà không cần xin IBS gì cả, và là chỗ mọi lỗi
client lộ ra. Nó không đo năng lực hệ thống — nó đo xem app cư xử thế nào khi mọi thứ
diễn ra không như ý.

Năm bài, mỗi bài ghi lại QUAN SÁT chứ không chỉ đạt/hỏng, vì phần lớn giá trị nằm ở
"app đã làm gì" chứ không ở một chữ PASS.

Cần:
    python3 -m pip install playwright && python3 -m playwright install chromium
    export IOTX_EMAIL='...'; export IOTX_PASSWORD='...'
    npm run dev          # app chạy ở localhost:3000

Chạy:
    python3 loadtest/kich_ban_6.py                      # bài không đụng phần cứng
    python3 loadtest/kich_ban_6.py --cho-phep-bat-tat   # gồm cả bài bật tắt thiết bị thật
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("Thiếu playwright. Chạy:")
    print("  python3 -m pip install playwright && python3 -m playwright install chromium")
    sys.exit(2)

APP = os.environ.get("APP_URL", "http://localhost:3000")
EMAIL = os.environ.get("IOTX_EMAIL", "")
PASSWORD = os.environ.get("IOTX_PASSWORD", "")
KHOA_PHIEN = "livotec-iotx-session"


class Ghi:
    def __init__(self, duong_dan):
        self.f = open(duong_dan, "a", buffering=1, encoding="utf-8")

    def __call__(self, **t):
        t.setdefault("luc", time.strftime("%Y-%m-%dT%H:%M:%S%z"))
        self.f.write(json.dumps(t, ensure_ascii=False) + "\n")

    def dong(self):
        self.f.close()


class TheoDoiMang:
    """Bắt mọi request đi ra /v1 để đếm và soi header."""

    def __init__(self, page):
        self.dong = []
        page.on("request", self._req)
        page.on("response", self._res)

    def _req(self, r):
        if "/v1/" in r.url:
            self.dong.append({"kieu": "req", "method": r.method, "url": r.url,
                              "idem": r.headers.get("idempotency-key"), "t": time.perf_counter()})

    def _res(self, r):
        if "/v1/" in r.url:
            self.dong.append({"kieu": "res", "ma": r.status, "url": r.url, "t": time.perf_counter()})

    def xoa(self):
        self.dong.clear()

    def dem(self, manh, kieu="req", method=None):
        return [d for d in self.dong
                if d["kieu"] == kieu and manh in d["url"] and (not method or d.get("method") == method)]


async def dang_nhap(page, ghi):
    await page.goto(APP, wait_until="domcontentloaded")
    await page.wait_for_timeout(2500)
    if await page.locator(".device-card").count() > 0:
        ghi(bai="dang_nhap", ket_qua="da_co_phien")
        return True
    o_user = page.locator('input[name="user"]')
    if await o_user.count() == 0:
        ghi(bai="dang_nhap", ket_qua="khong_thay_man_dang_nhap")
        return False
    await o_user.fill(EMAIL)
    await page.locator('input[name="password"]').fill(PASSWORD)
    t0 = time.perf_counter()
    await page.locator('button.primary[type="submit"]').click()
    try:
        await page.wait_for_selector(".device-card", timeout=20000)
    except Exception:
        ghi(bai="dang_nhap", ket_qua="that_bai",
            man_hinh=(await page.inner_text("body"))[:300])
        return False
    ghi(bai="dang_nhap", ket_qua="ok", ms=round((time.perf_counter() - t0) * 1000, 1))
    return True


async def bai_1_bam_dup(page, mang, ghi):
    """Bấm công tắc hai lần thật nhanh. Gửi hai lệnh cùng Idempotency-Key là hỏng:
    máy chủ coi lần hai là bấm lặp, người dùng thấy nút không phản ứng."""
    cong_tac = page.locator(".device-card footer .switch").first
    if await cong_tac.count() == 0:
        ghi(bai="bam_dup", ket_qua="khong_co_thiet_bi")
        return
    mang.xoa()
    await cong_tac.click()
    await page.wait_for_timeout(120)
    await cong_tac.click()
    await page.wait_for_timeout(3000)

    lenh = mang.dem("/rpc", method="POST")
    khoa = [d.get("idem") for d in lenh]
    ghi(bai="bam_dup", so_lenh_gui=len(lenh), khoa_idempotency=khoa,
        khoa_trung=len(khoa) > 1 and len(set(khoa)) < len(khoa),
        nhan_xet=("Hai lệnh cùng một khoá — lần hai bị coi là bấm lặp"
                  if len(khoa) > 1 and len(set(khoa)) < len(khoa)
                  else "Mỗi lệnh một khoá riêng" if len(lenh) > 1
                  else "Giao diện chặn lần bấm thứ hai"))


async def bai_2_mat_mang_giua_chung(page, mang, ghi):
    """Cắt mạng ngay sau khi bấm. App phải nói mất kết nối và trả giao diện về
    trạng thái cũ, không được để nguyên trạng thái mới như thể đã thành công."""
    cong_tac = page.locator(".device-card footer .switch").first
    if await cong_tac.count() == 0:
        ghi(bai="mat_mang_giua_chung", ket_qua="khong_co_thiet_bi")
        return
    truoc = await cong_tac.get_attribute("class")
    mang.xoa()
    await page.context.set_offline(True)
    await cong_tac.click()
    await page.wait_for_timeout(6000)
    sau = await cong_tac.get_attribute("class")
    loi = ""
    if await page.locator(".toast-loi, .form-message").count():
        loi = (await page.locator(".toast-loi, .form-message").first.inner_text())[:200]
    await page.context.set_offline(False)
    await page.wait_for_timeout(4000)
    cuoi = await cong_tac.get_attribute("class")
    con_dang_nhap = await page.locator(".device-card").count() > 0

    ghi(bai="mat_mang_giua_chung", lop_truoc=truoc, lop_khi_mat_mang=sau, lop_sau_khi_co_lai=cuoi,
        da_quay_ve=cuoi == truoc, thong_bao_loi=loi, con_dang_nhap=con_dang_nhap,
        nhan_xet=("Đã trả giao diện về trạng thái cũ" if cuoi == truoc
                  else "GIAO DIỆN KHÔNG QUAY VỀ — người dùng tưởng lệnh đã chạy"))


async def bai_3_ve_het_han(page, mang, ghi):
    """Làm hỏng vé rồi mới thao tác. Đúng ra app phải làm mới ĐÚNG MỘT LẦN rồi thử
    lại, và tuyệt đối không đá người dùng ra màn đăng nhập."""
    ok = await page.evaluate(
        """(khoa) => { try {
              const s = JSON.parse(sessionStorage.getItem(khoa) || localStorage.getItem(khoa));
              if (!s) return false;
              s.accessToken = 'het-han-gia-' + Date.now();
              (sessionStorage.getItem(khoa) ? sessionStorage : localStorage).setItem(khoa, JSON.stringify(s));
              return true; } catch (e) { return false; } }""", KHOA_PHIEN)
    if not ok:
        ghi(bai="ve_het_han", ket_qua="khong_doc_duoc_phien")
        return
    mang.xoa()
    await page.reload(wait_until="domcontentloaded")
    await page.wait_for_timeout(8000)

    so_lam_moi = len(mang.dem("/auth/refresh", method="POST"))
    con_dang_nhap = await page.locator(".device-card").count() > 0
    ghi(bai="ve_het_han", so_lan_lam_moi=so_lam_moi, con_dang_nhap=con_dang_nhap,
        nhan_xet=("Làm mới đúng một lần rồi chạy tiếp" if so_lam_moi == 1 and con_dang_nhap
                  else "BỊ ĐÁ RA MÀN ĐĂNG NHẬP" if not con_dang_nhap
                  else "Làm mới %d lần — nhiều hơn cần thiết" % so_lam_moi))


async def bai_4_luong_chet_am_tham(page, mang, ghi):
    """Cắt mạng lâu hơn đồng hồ canh lặng (35 giây) rồi nối lại. App phải tự mở lại
    luồng và gọi /devices ĐÚNG MỘT LẦN — nhiều hơn là nhân tải lên khi có sự cố."""
    mang.xoa()
    await page.context.set_offline(True)
    t0 = time.perf_counter()
    await page.wait_for_timeout(42000)
    await page.context.set_offline(False)
    await page.wait_for_timeout(25000)

    mo_lai = mang.dem("/stream")
    lay_thiet_bi = mang.dem("/devices", method="GET")
    ghi(bai="luong_chet_am_tham", giay_mat_mang=42,
        so_lan_mo_lai_luong=len(mo_lai), so_lan_goi_devices=len(lay_thiet_bi),
        tong_giay=round(time.perf_counter() - t0, 1),
        con_dang_nhap=await page.locator(".device-card").count() > 0,
        nhan_xet=("Nối lại và lấy lại thiết bị đúng một lần" if len(lay_thiet_bi) == 1
                  else "Không nối lại được" if not mo_lai
                  else "Gọi /devices %d lần sau một lần đứt" % len(lay_thiet_bi)))


async def bai_5_thiet_bi_ngoai_tuyen(page, ghi):
    """Thiết bị ngoại tuyến thì nút điều khiển phải bị khoá và nói rõ lý do."""
    the = page.locator(".device-card")
    n = await the.count()
    ket = []
    for i in range(n):
        t = the.nth(i)
        ten = await t.locator(".device-top strong").inner_text()
        trang_thai = await t.locator("footer span").inner_text()
        ngoai_tuyen = "offline" in (await t.locator("footer span").get_attribute("class") or "")
        ket.append({"ten": ten, "trang_thai": trang_thai, "ngoai_tuyen": ngoai_tuyen})
    ghi(bai="thiet_bi_ngoai_tuyen", the=ket,
        nhan_xet="Kiểm tra bằng mắt: thẻ ngoại tuyến có bị khoá điều khiển không")


async def main_async(a):
    ghi = Ghi(a.out)
    async with async_playwright() as pw:
        trinh_duyet = await pw.chromium.launch(headless=a.headless)
        ctx = await trinh_duyet.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        loi_console = []
        page.on("console", lambda m: loi_console.append(m.text[:200]) if m.type == "error" else None)
        mang = TheoDoiMang(page)

        if not await dang_nhap(page, ghi):
            print("Không đăng nhập được — dừng.")
            await trinh_duyet.close()
            ghi.dong()
            return 1

        await bai_5_thiet_bi_ngoai_tuyen(page, ghi)
        await bai_3_ve_het_han(page, mang, ghi)
        await bai_4_luong_chet_am_tham(page, mang, ghi)
        if a.cho_phep_bat_tat:
            await bai_1_bam_dup(page, mang, ghi)
            await bai_2_mat_mang_giua_chung(page, mang, ghi)
        else:
            print("Bỏ qua bài 1 và 2 (bật tắt thiết bị thật). Thêm --cho-phep-bat-tat để chạy.")

        if loi_console:
            ghi(bai="loi_console", so=len(loi_console), vi_du=loi_console[:10])
        await trinh_duyet.close()
    ghi.dong()

    print("\nKết quả:", a.out)
    with open(a.out, encoding="utf-8") as f:
        for dong in f:
            r = json.loads(dong)
            nx = r.get("nhan_xet") or r.get("ket_qua") or ""
            print("  %-24s %s" % (r.get("bai", ""), nx))
    return 0


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="kichban6.jsonl")
    p.add_argument("--headless", action="store_true", help="chạy ẩn; mặc định hiện cửa sổ để xem")
    p.add_argument("--cho-phep-bat-tat", action="store_true",
                   help="chạy cả bài gửi lệnh thật — THIẾT BỊ SẼ BẬT TẮT THẬT")
    a = p.parse_args()
    if not EMAIL or not PASSWORD:
        print("Thiếu IOTX_EMAIL / IOTX_PASSWORD.")
        return 2
    print("App: %s   (bài 4 mất 70 giây, kiên nhẫn)" % APP)
    return asyncio.run(main_async(a))


if __name__ == "__main__":
    sys.exit(main())
