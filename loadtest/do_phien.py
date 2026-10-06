#!/usr/bin/env python3
"""
Bộ đo phiên người dùng cho Livotec Home — đo PHÍA APP, không đo đường đi của lệnh.

Mô phỏng đúng vòng đời một phiên của webapp:
    đăng nhập → mở app (/bootstrap) → giữ luồng /stream → làm mới vé mỗi ~280 giây
    → (tuỳ chọn) gửi lệnh → khi luồng đứt thì nối lại và gọi /devices một lần

Ghi JSONL THÔ, mỗi request một dòng. Không tự tổng hợp — tong_hop.py làm việc đó.
Lý do: báo cáo của GSH tổng hợp sẵn bằng trung bình cộng các bài, ra 89,39% trong khi
theo giao dịch là 99,86%. Giữ dữ liệu thô thì tính lại kiểu nào cũng được.

Cần: pip install aiohttp

Ví dụ:
    export IOTX_EMAIL='...'; export IOTX_PASSWORD='...'
    # kịch bản 1 — bão đăng nhập, dựng 300 phiên trong 120 giây rồi giữ 10 phút
    python3 loadtest/do_phien.py --sessions 300 --ramp 120 --duration 600 --out kb1_300.jsonl
    # kịch bản 3 (nửa client) — cắt hết luồng ở giây thứ 300 để đo nối lại
    python3 loadtest/do_phien.py --sessions 300 --ramp 60 --duration 900 --cut-at 300 --out kb3_300.jsonl
    # kịch bản 2/8 — giữ phiên dài, chạy qua đêm
    python3 loadtest/do_phien.py --sessions 200 --ramp 120 --duration 43200 --out kb8_200.jsonl
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import ssl
import sys
import time
import uuid
from datetime import datetime, timezone

try:
    import aiohttp
except ImportError:
    print("Thiếu aiohttp. Chạy:  python3 -m pip install aiohttp")
    sys.exit(2)

# Hợp đồng: nhịp giữ kết nối tối đa mỗi 30 giây, 30 giây không thấy gì thì coi như đứt.
# Để 35 giây cho có biên, giống hệt app thật (STREAM_IM_LANG_MS trong lib/iotx/client.ts).
IM_LANG_S = 35.0
# Vé sống 300 giây. Làm mới sớm hơn một chút để không bao giờ chạm hạn.
LAM_MOI_TRUOC_S = 20.0

dem_luong_dang_mo = 0
ghi_lock: asyncio.Lock


def bay_gio():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="milliseconds")


class KetNoi:
    """Giữ ClientSession hiện hành.

    Ban đầu kịch bản 3 làm bằng cách gọi connector.close(). Sai: aiohttp đóng
    connector là đóng vĩnh viễn, mọi request sau đó đều hỏng, và ta đang mô phỏng
    "mạng chết hẳn" chứ không phải "kết nối bị reset rồi dựng lại được" — tức là
    không đo được cái cần đo. Đúng ra phải NGẮT các kết nối đang mở rồi lập tức
    có connector mới, đúng như khi máy chủ khởi động lại.
    """

    def __init__(self):
        self.s = self._moi()

    def _moi(self):
        conn = aiohttp.TCPConnector(limit=0, ssl=ssl.create_default_context(),
                                    enable_cleanup_closed=True)
        to = aiohttp.ClientTimeout(total=None, connect=30, sock_connect=30, sock_read=None)
        return aiohttp.ClientSession(connector=conn, timeout=to)

    async def ngat_het(self):
        cu = self.s
        self.s = self._moi()
        await cu.close()

    async def dong(self):
        await self.s.close()


class Nhat_ky:
    """Ghi JSONL. Mốc thời gian có múi giờ để ghép được với nhật ký của IBS."""

    def __init__(self, duong_dan):
        self.f = open(duong_dan, "a", buffering=1, encoding="utf-8")
        self.lock = asyncio.Lock()

    async def ghi(self, **truong):
        truong.setdefault("luc", bay_gio())
        async with self.lock:
            self.f.write(json.dumps(truong, ensure_ascii=False) + "\n")

    def dong(self):
        self.f.close()


async def do(nk, phien, viec, coro):
    """Chạy một request, ghi mã HTTP và thời lượng. Trả về (ma, du_lieu, byte)."""
    t0 = time.perf_counter()
    try:
        ma, du_lieu, so_byte = await coro
        ms = (time.perf_counter() - t0) * 1000
        await nk.ghi(phien=phien, viec=viec, ma=ma, ms=round(ms, 1), byte=so_byte,
                     ok=200 <= ma < 300)
        return ma, du_lieu, so_byte
    except asyncio.CancelledError:
        raise
    except Exception as e:
        ms = (time.perf_counter() - t0) * 1000
        # ma=0 nghĩa là không tới được máy chủ (DNS, TLS, hết cổng, quá hạn chờ).
        # Tách bạch với lỗi HTTP thật, vì ma=0 thường là MÁY PHÁT TẢI gãy chứ không
        # phải máy chủ gãy — nhầm chỗ này là báo cáo sai.
        await nk.ghi(phien=phien, viec=viec, ma=0, ms=round(ms, 1), ok=False, loi=repr(e)[:200])
        return 0, None, 0


async def json_goi(sess, method, url, body=None, token=None, headers=None):
    h = dict(headers or {})
    if token:
        h["Authorization"] = "Bearer " + token
    async with sess.request(method, url, json=body, headers=h) as r:
        raw = await r.read()
        try:
            return r.status, json.loads(raw.decode() or "null"), len(raw)
        except Exception:
            return r.status, None, len(raw)


class Phien:
    def __init__(self, cfg, so, nk, kn):
        self.cfg = cfg
        self.so = so
        self.nk = nk
        self.kn = kn
        self.access = None
        self.refresh_token = None
        self.het_han_luc = 0.0
        self.da_tung_noi = False
        self.dut_luc = 0.0
        self.thiet_bi = []

    @property
    def ten(self):
        return "p%04d" % self.so

    async def dang_nhap(self):
        ma, du_lieu, _ = await do(self.nk, self.ten, "login", json_goi(
            self.kn.s, "POST", self.cfg.base + "/auth/login",
            {"tenant": self.cfg.tenant, "email": self.cfg.email, "password": self.cfg.password}))
        if not (200 <= ma < 300) or not du_lieu:
            return False
        self._nhan_ve(du_lieu)
        return True

    def _nhan_ve(self, du_lieu):
        self.access = du_lieu.get("accessToken")
        self.refresh_token = du_lieu.get("refreshToken") or self.refresh_token
        song = float(du_lieu.get("expiresIn") or 300)
        self.het_han_luc = time.monotonic() + song

    async def lam_moi(self):
        ma, du_lieu, _ = await do(self.nk, self.ten, "refresh", json_goi(
            self.kn.s, "POST", self.cfg.base + "/auth/refresh",
            {"refreshToken": self.refresh_token}))
        if 200 <= ma < 300 and du_lieu:
            self._nhan_ve(du_lieu)
            return True
        # Làm mới hỏng = người dùng bị văng ra khỏi app. Đây là chỉ số IBS cần nhất.
        await self.nk.ghi(phien=self.ten, viec="bi_dang_xuat", ma=ma, ok=False)
        return False

    async def mo_app(self):
        ma, du_lieu, so_byte = await do(self.nk, self.ten, "bootstrap", json_goi(
            self.kn.s, "GET", self.cfg.base + "/bootstrap?lang=" + self.cfg.lang, token=self.access))
        if 200 <= ma < 300 and isinstance(du_lieu, dict):
            self.thiet_bi = [d.get("id") for d in (du_lieu.get("devices") or []) if d.get("id")]
            await self.nk.ghi(phien=self.ten, viec="bootstrap_kich_thuoc", byte=so_byte,
                              so_thiet_bi=len(self.thiet_bi), ok=True)
        return 200 <= ma < 300

    async def lay_thiet_bi(self):
        """Hợp đồng: nối LẠI xong gọi /devices đúng một lần để lấy lastValues."""
        await do(self.nk, self.ten, "devices_sau_noi_lai", json_goi(
            self.kn.s, "GET", self.cfg.base + "/devices?lang=" + self.cfg.lang, token=self.access))

    async def gui_lenh(self):
        if not self.cfg.rpc_device:
            return
        await do(self.nk, self.ten, "rpc", json_goi(
            self.kn.s, "POST", self.cfg.base + "/devices/%s/rpc" % self.cfg.rpc_device,
            {"method": self.cfg.rpc_method, "params": {"on": random.choice([True, False])}},
            token=self.access, headers={"Idempotency-Key": str(uuid.uuid4())}))

    async def giu_luong(self, den_luc):
        """Mở /stream và giữ. Đo thời gian tới byte đầu, nhịp giữ kết nối, và lần đứt."""
        global dem_luong_dang_mo
        lan_thu = 0
        while time.monotonic() < den_luc:
            t0 = time.perf_counter()
            mo_duoc = False
            try:
                async with self.kn.s.get(self.cfg.base + "/stream",
                                         headers={"Authorization": "Bearer " + self.access,
                                                  "Accept": "text/event-stream"}) as r:
                    if r.status == 401:
                        await self.nk.ghi(phien=self.ten, viec="stream_401", ma=401, ok=False)
                        if not await self.lam_moi():
                            return
                        continue
                    if r.status != 200:
                        await self.nk.ghi(phien=self.ten, viec="stream_mo", ma=r.status, ok=False,
                                          ms=round((time.perf_counter() - t0) * 1000, 1))
                        raise RuntimeError("stream_%s" % r.status)

                    ttfb = (time.perf_counter() - t0) * 1000
                    await self.nk.ghi(phien=self.ten, viec="stream_mo", ma=200, ok=True,
                                      ms=round(ttfb, 1), lan_thu=lan_thu)
                    mo_duoc = True
                    dem_luong_dang_mo += 1
                    lan_thu = 0

                    if self.da_tung_noi:
                        moc = (time.perf_counter() - self.dut_luc) * 1000
                        await self.nk.ghi(phien=self.ten, viec="noi_lai_xong", ok=True,
                                          ms=round(moc, 1))
                        await self.lay_thiet_bi()
                    self.da_tung_noi = True

                    lan_cuoi = time.perf_counter()
                    while time.monotonic() < den_luc:
                        try:
                            dong = await asyncio.wait_for(r.content.readline(), timeout=IM_LANG_S)
                        except asyncio.TimeoutError:
                            # Luồng chết âm thầm: không byte nào trong 35 giây mà cũng
                            # không báo lỗi. Đây là thứ đồng hồ canh lặng của app bắt được.
                            await self.nk.ghi(phien=self.ten, viec="luong_im_lang", ok=False,
                                              ms=IM_LANG_S * 1000)
                            break
                        if not dong:
                            break
                        gio = time.perf_counter()
                        if dong.startswith(b":"):
                            await self.nk.ghi(phien=self.ten, viec="nhip_giu_ket_noi", ok=True,
                                              ms=round((gio - lan_cuoi) * 1000, 1))
                            lan_cuoi = gio
                        elif dong.startswith(b"event:"):
                            await self.nk.ghi(phien=self.ten, viec="su_kien", ok=True)
                            lan_cuoi = gio
            except asyncio.CancelledError:
                raise
            except Exception as e:
                await self.nk.ghi(phien=self.ten, viec="luong_dut", ok=False, loi=repr(e)[:160])
            finally:
                if mo_duoc:
                    dem_luong_dang_mo -= 1

            self.dut_luc = time.perf_counter()
            if time.monotonic() >= den_luc:
                return
            # Giãn gấp đôi + rải ngẫu nhiên trong nửa khoảng, chặn trên 15 giây —
            # giống hệt app thật. Không có phần ngẫu nhiên thì mọi máy nối lại cùng lúc.
            tran = min(1.0 * 2 ** lan_thu, 15.0)
            lan_thu += 1
            await asyncio.sleep(tran / 2 + random.random() * (tran / 2))

    async def chay(self, den_luc):
        if not await self.dang_nhap():
            return
        await self.mo_app()

        async def vong_lam_moi():
            while time.monotonic() < den_luc:
                cho = max(5.0, self.het_han_luc - time.monotonic() - LAM_MOI_TRUOC_S)
                await asyncio.sleep(min(cho, den_luc - time.monotonic()))
                if time.monotonic() >= den_luc:
                    return
                if not await self.lam_moi():
                    return

        async def vong_lenh():
            if not self.cfg.rpc_device:
                return
            while time.monotonic() < den_luc:
                await asyncio.sleep(self.cfg.rpc_every * (0.5 + random.random()))
                if time.monotonic() >= den_luc:
                    return
                await self.gui_lenh()

        await asyncio.gather(self.giu_luong(den_luc), vong_lam_moi(), vong_lenh(),
                             return_exceptions=True)


async def theo_doi(nk, den_luc):
    """Mỗi 10 giây ghi số luồng đang mở — chỉ số đầu bảng khi báo cáo cho IBS."""
    while time.monotonic() < den_luc:
        await asyncio.sleep(10)
        await nk.ghi(viec="dem_luong_dang_mo", so=dem_luong_dang_mo)


async def cat_luong(cfg, kn, nk):
    """Kịch bản 3 nửa client: ngắt sạch kết nối đang mở ở giây thứ N, giống như khi
    IBS khởi động lại. Kết nối MỚI vẫn dựng được ngay — ta đang đo app nối lại nhanh
    chậm thế nào, không đo app xử lý mạng chết vĩnh viễn."""
    await asyncio.sleep(cfg.cut_at)
    await nk.ghi(viec="CAT_KET_NOI", so=dem_luong_dang_mo)
    await kn.ngat_het()


async def main_async(cfg):
    nk = Nhat_ky(cfg.out)
    await nk.ghi(viec="BAT_DAU", cau_hinh={k: v for k, v in vars(cfg).items() if k != "password"})

    kn = KetNoi()
    try:
        den_luc = time.monotonic() + cfg.duration
        viec = [asyncio.create_task(theo_doi(nk, den_luc))]
        if cfg.cut_at:
            viec.append(asyncio.create_task(cat_luong(cfg, kn, nk)))

        for i in range(cfg.sessions):
            p = Phien(cfg, i, nk, kn)
            viec.append(asyncio.create_task(p.chay(den_luc)))
            if cfg.ramp > 0:
                await asyncio.sleep(cfg.ramp / cfg.sessions)

        await asyncio.sleep(max(0.0, den_luc - time.monotonic()))
        for t in viec:
            t.cancel()
        await asyncio.gather(*viec, return_exceptions=True)
    finally:
        await kn.dong()

    await nk.ghi(viec="KET_THUC")
    nk.dong()
    print("Xong. Kết quả:", cfg.out)
    print("Tổng hợp:  python3 loadtest/tong_hop.py", cfg.out)


def main():
    p = argparse.ArgumentParser(description="Đo phiên người dùng Livotec Home")
    p.add_argument("--base", default=os.environ.get("IOTX_BASE", "https://web.dev.happibot.net/v1"))
    p.add_argument("--tenant", default=os.environ.get("IOTX_TENANT", "livotec"))
    p.add_argument("--lang", default="vi")
    p.add_argument("--sessions", type=int, default=50, help="số phiên đồng thời")
    p.add_argument("--ramp", type=float, default=60, help="giây để dựng đủ số phiên")
    p.add_argument("--duration", type=float, default=600, help="tổng thời gian chạy, giây")
    p.add_argument("--cut-at", type=float, default=0, help="giây thứ N thì cắt sạch kết nối (kịch bản 3)")
    p.add_argument("--rpc-device", default="", help="id thiết bị để gửi lệnh; bỏ trống = không gửi")
    p.add_argument("--rpc-method", default="setPower")
    p.add_argument("--rpc-every", type=float, default=60)
    p.add_argument("--out", default="ketqua.jsonl")
    cfg = p.parse_args()

    cfg.base = cfg.base.rstrip("/")
    cfg.email = os.environ.get("IOTX_EMAIL", "")
    cfg.password = os.environ.get("IOTX_PASSWORD", "")
    if not cfg.email or not cfg.password:
        print("Thiếu IOTX_EMAIL / IOTX_PASSWORD trong biến môi trường.")
        return 2

    print("Máy chủ %s | %d phiên | dựng trong %.0fs | chạy %.0fs"
          % (cfg.base, cfg.sessions, cfg.ramp, cfg.duration))
    if cfg.rpc_device:
        print("CẢNH BÁO: sẽ gửi lệnh thật tới thiết bị %s — nó sẽ bật tắt thật." % cfg.rpc_device)
    try:
        asyncio.run(main_async(cfg))
    except KeyboardInterrupt:
        print("\nDừng theo yêu cầu. File kết quả vẫn dùng được.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
