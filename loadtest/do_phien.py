#!/usr/bin/env python3
"""
Bộ đo phiên người dùng cho Livotec Home — đo PHÍA APP, không đo đường đi của lệnh.
Dùng cho B6 (thang bậc phiên), mốc chuẩn 100 phiên (B10 quy tắc 3) và nửa phiên của B7.

Mô phỏng đúng vòng đời một phiên của webapp HIỆN TẠI (đối chiếu mã 09/10/2026):

    đăng nhập
    → mở app = syncRemote(): /bootstrap, /products, rồi /notifications + /shares + /rules song song
    → giữ luồng SSE /stream                        (iotxClient.subscribe)
    → hỏi vòng /bootstrap NỐI ĐUÔI                  (hooks/useDongBoNen.ts)
          2,5 s nếu đang mở màn chi tiết, 10 s nếu đang ở danh sách;
          tab chạy nền thì KHÔNG hỏi; mỗi lần có If-None-Match, 304 là thành công
    → vé hết hạn thì request đầu tiên gặp 401 → làm mới ĐÚNG MỘT LẦN → gửi lại
    → luồng đứt thì nối lại có giãn + ngẫu nhiên, nối xong gọi /bootstrap MỘT lần
      (app gọi dongBoNhip → /bootstrap, KHÔNG phải /devices như tài liệu tích hợp cũ ghi)
    → (tuỳ chọn) gửi lệnh

Tài liệu kịch bản (mục 1.2, A4) ghi "webapp không dùng SSE, chỉ hỏi vòng" — SAI so với mã:
app dùng CẢ HAI. Mặc định bộ này chạy cả hai; --khong-sse để so với kiểu web.dev (chỉ hỏi
vòng), --khong-hoi-vong để quay về kiểu đo cũ (chỉ SSE).

Ghi JSONL THÔ, mỗi request một dòng, có trường `t` = giây kể từ lúc bắt đầu. Không tự tổng
hợp — tong_hop.py làm việc đó (kể cả req/s thực tế sinh ra để so với mục 1.2).

Cần: pip install aiohttp

Ví dụ:
    export IOTX_EMAIL='...'; export IOTX_PASSWORD='...'
    # B6 — 1000 phiên, 25% đang mở màn chi tiết, dựng trong 300 s rồi giữ đủ 15 phút
    python3 loadtest/do_phien.py --sessions 1000 --ramp 300 --duration 900 --xem-ky-ti-le 0.25 --out b6_1000.jsonl
    # mốc chuẩn B10 — 100 phiên × 5 phút
    python3 loadtest/do_phien.py --sessions 100 --ramp 30 --duration 330 --out moc.jsonl
    # nửa client của bão nối lại — cắt hết kết nối ở giây thứ 300
    python3 loadtest/do_phien.py --sessions 300 --ramp 60 --duration 900 --cut-at 300 --out cat_300.jsonl
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
# Chỉ dùng khi --lam-moi chu-dong: làm mới trước hạn chừng này giây.
LAM_MOI_TRUOC_S = 20.0
# Nhịp hỏi vòng của app — hooks/useDongBoNen.ts (NHIP_XEM_KY_MS, NHIP_THUONG_MS).
NHIP_XEM_KY_S = 2.5
NHIP_THUONG_S = 10.0

dem_luong_dang_mo = 0
dem_dang_bay = 0          # request HTTP đang chờ phản hồi — chỉ số Little ở B5/B6
T0 = time.monotonic()


def bay_gio():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="milliseconds")


def giay():
    return round(time.monotonic() - T0, 3)


class KetNoi:
    """Giữ ClientSession hiện hành.

    Ban đầu kịch bản cắt kết nối làm bằng cách gọi connector.close(). Sai: aiohttp đóng
    connector là đóng vĩnh viễn, mọi request sau đó đều hỏng, và ta đang mô phỏng
    "mạng chết hẳn" chứ không phải "kết nối bị reset rồi dựng lại được" — tức là
    không đo được cái cần đo. Đúng ra phải NGẮT các kết nối đang mở rồi lập tức
    có connector mới, đúng như khi máy chủ khởi động lại.
    """

    def __init__(self):
        self.s = self._moi()
        self.the_he = 0           # tăng mỗi lần cắt — để biết request nào bị chính ta cắt ngang

    def _moi(self):
        conn = aiohttp.TCPConnector(limit=0, ssl=ssl.create_default_context(),
                                    enable_cleanup_closed=True)
        to = aiohttp.ClientTimeout(total=None, connect=30, sock_connect=30, sock_read=None)
        return aiohttp.ClientSession(connector=conn, timeout=to)

    async def ngat_het(self):
        cu = self.s
        self.the_he += 1
        self.s = self._moi()
        await cu.close()

    async def dong(self):
        await self.s.close()


class Nhat_ky:
    """Ghi JSONL. Mốc thời gian có múi giờ để ghép được với nhật ký của IBS; `t` là giây
    kể từ lúc bắt đầu để tong_hop.py cắt cửa sổ trượt mà khỏi phải đọc múi giờ."""

    def __init__(self, duong_dan):
        self.f = open(duong_dan, "a", buffering=1, encoding="utf-8")

    async def ghi(self, **truong):
        truong.setdefault("luc", bay_gio())
        truong.setdefault("t", giay())
        # Một vòng lặp sự kiện, write() đồng bộ — không cần khoá.
        self.f.write(json.dumps(truong, ensure_ascii=False) + "\n")

    def dong(self):
        self.f.close()


async def do(nk, phien, viec, coro, viec_401=None, kn=None):
    """Chạy một request, ghi mã HTTP và thời lượng. Trả về (ma, du_lieu, byte, etag).

    ma=0  : không tới được máy chủ (DNS, TLS, hết cổng, từ chối kết nối) — thường là MÁY
            PHÁT gãy chứ không phải máy chủ gãy. Nhầm chỗ này là báo cáo sai.
    ma=-1 : quá hạn chờ (--het-gio) — máy chủ không trả lời kịp.
    viec_401: nếu có và máy chủ trả 401, ghi dưới tên này (một GHI NHẬN, không phải giao
            dịch hỏng) vì app sẽ làm mới vé rồi gửi lại — lần gửi lại mới là giao dịch.
    kn    : nếu có và request hỏng vì chính bộ đo vừa cắt kết nối (--cut-at), ghi là GHI NHẬN
            `bi_cat_giua_chung` — đó là cái ta cố tình gây ra, không phải máy phát gãy.
    """
    global dem_dang_bay
    t_bat_dau = giay()
    t0 = time.perf_counter()
    the_he = kn.the_he if kn else None
    dem_dang_bay += 1
    try:
        ma, du_lieu, so_byte, etag = await coro
        ms = (time.perf_counter() - t0) * 1000
        ten = viec_401 if (ma == 401 and viec_401) else viec
        await nk.ghi(phien=phien, viec=ten, ma=ma, ms=round(ms, 1), byte=so_byte,
                     ok=(200 <= ma < 300) or ma == 304, t=t_bat_dau)
        return ma, du_lieu, so_byte, etag
    except asyncio.CancelledError:
        raise
    except asyncio.TimeoutError as e:
        ms = (time.perf_counter() - t0) * 1000
        await nk.ghi(phien=phien, viec=viec, ma=-1, ms=round(ms, 1), ok=False,
                     loi=repr(e)[:200], t=t_bat_dau)
        return -1, None, 0, None
    except Exception as e:
        ms = (time.perf_counter() - t0) * 1000
        if kn is not None and kn.the_he != the_he:
            await nk.ghi(phien=phien, viec="bi_cat_giua_chung", ok=False, viec_goc=viec,
                         loi=repr(e)[:200], t=t_bat_dau)
            return 0, None, 0, None
        await nk.ghi(phien=phien, viec=viec, ma=0, ms=round(ms, 1), ok=False,
                     loi=repr(e)[:200], t=t_bat_dau)
        return 0, None, 0, None
    finally:
        dem_dang_bay -= 1


async def json_goi(sess, method, url, body=None, headers=None, het_gio=30.0):
    to = aiohttp.ClientTimeout(total=het_gio) if het_gio else None
    async with sess.request(method, url, json=body, headers=headers or {}, timeout=to) as r:
        raw = await r.read()
        etag = r.headers.get("ETag")
        try:
            return r.status, json.loads(raw.decode() or "null"), len(raw), etag
        except Exception:
            return r.status, None, len(raw), etag


class Phien:
    def __init__(self, cfg, so, nk, kn, xem_ky=False, nen=False):
        self.cfg = cfg
        self.so = so
        self.nk = nk
        self.kn = kn
        self.xem_ky = xem_ky      # đang mở màn chi tiết → hỏi 2,5 s
        self.nen = nen            # tab chạy nền → không hỏi vòng
        self.access = None
        self.refresh_token = None
        self.het_han_luc = 0.0
        self.da_tung_noi = False
        self.dut_luc = 0.0
        self.thiet_bi = []
        self.etag = {}            # khoá → ETag đang giữ, như ghiEtag/docEtag của app
        self.nhan_products = None
        self.da_dong_bo_du = False
        self.dang_lam_moi = None  # Future: mọi request cùng gặp 401 đợi chung một lần làm mới
        self.dang_dong_bo = None  # Future: hỏi vòng, quay lại tab, SSE nối lại dùng chung
        self.het_phien = False

    @property
    def ten(self):
        return "p%05d" % self.so

    @property
    def nhip(self):
        return self.cfg.nhip_xem_ky if self.xem_ky else self.cfg.nhip_thuong

    # ---------- vé ----------

    async def dang_nhap(self):
        ma, du_lieu, _, _ = await do(self.nk, self.ten, "login", json_goi(
            self.kn.s, "POST", self.cfg.base + "/auth/login",
            {"tenant": self.cfg.tenant, "email": self.cfg.email, "password": self.cfg.password},
            het_gio=self.cfg.het_gio))
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
        ma, du_lieu, _, _ = await do(self.nk, self.ten, "refresh", json_goi(
            self.kn.s, "POST", self.cfg.base + "/auth/refresh",
            {"refreshToken": self.refresh_token}, het_gio=self.cfg.het_gio))
        if 200 <= ma < 300 and du_lieu:
            self._nhan_ve(du_lieu)
            return True
        # Làm mới hỏng = người dùng bị văng ra khỏi app. Đây là chỉ số IBS cần nhất.
        await self.nk.ghi(phien=self.ten, viec="bi_dang_xuat", ma=ma, ok=False)
        self.het_phien = True
        return False

    async def lam_moi_sau_401(self, da_dung):
        """Như lamMoiSau401 của app: vé đã đổi thì chỉ cần gửi lại; đang có lần làm mới
        bay thì đợi chung; không thì làm mới đúng một lần."""
        if self.access and self.access != da_dung:
            return True
        if self.dang_lam_moi is None:
            self.dang_lam_moi = asyncio.ensure_future(self.lam_moi())
            try:
                return await self.dang_lam_moi
            finally:
                self.dang_lam_moi = None
        return await asyncio.shield(self.dang_lam_moi)

    async def goi(self, viec, method, duong, body=None, headers=None, auth=True, etag_khoa=None):
        """Một lời gọi như iotxClient.request: gắn vé và If-None-Match; gặp 401 thì làm mới
        một lần rồi gửi lại. Trả về (ma, du_lieu)."""
        for lan in (0, 1):
            h = dict(headers or {})
            da_dung = self.access
            if auth and da_dung:
                h["Authorization"] = "Bearer " + da_dung
            giu = self.etag.get(etag_khoa) if etag_khoa else None
            if giu:
                h["If-None-Match"] = giu[0]
            co_the_lam_lai = auth and lan == 0 and self.cfg.lam_moi == "sau-401"
            ma, du_lieu, so_byte, etag = await do(
                self.nk, self.ten, viec,
                json_goi(self.kn.s, method, self.cfg.base + duong, body, h, self.cfg.het_gio),
                viec_401="het_ve_401" if co_the_lam_lai else None, kn=self.kn)
            if ma == 401 and co_the_lam_lai:
                if not await self.lam_moi_sau_401(da_dung):
                    return 401, None
                continue
            if ma == 304 and giu:
                return 304, giu[1]
            if etag_khoa and etag and 200 <= ma < 300:
                self.etag[etag_khoa] = (etag, du_lieu)
            if viec.startswith("bootstrap") and 200 <= ma < 300:
                await self.nk.ghi(phien=self.ten, viec="bootstrap_kich_thuoc", byte=so_byte,
                                  so_thiet_bi=len((du_lieu or {}).get("devices") or []), ok=True)
            return ma, du_lieu
        return 401, None

    # ---------- dữ liệu ----------

    async def mo_app(self):
        """syncRemote() của app: /bootstrap → /products (nếu chưa có bản cho nhãn này) →
        /notifications + /shares + /rules song song. Ghi thêm một dòng `mo_app` = cả cụm."""
        t0 = time.perf_counter()
        t_bat_dau = giay()
        lang = self.cfg.lang
        ma, bs = await self.goi("bootstrap", "GET", "/bootstrap?lang=" + lang, etag_khoa="bootstrap")
        ok = ma in range(200, 300) or ma == 304
        if ok and isinstance(bs, dict):
            self.thiet_bi = [d.get("id") for d in (bs.get("devices") or []) if d.get("id")]
            nhan = (bs.get("phienBan") or {}).get("products")
            if self.nhan_products is None or nhan != self.nhan_products:
                ma_p, _ = await self.goi("products", "GET",
                                         "/products?lang=%s&tenant=%s" % (lang, self.cfg.tenant),
                                         auth=False, etag_khoa="products")
                ok = ok and (ma_p in range(200, 300) or ma_p == 304)
                self.nhan_products = nhan
            ba = await asyncio.gather(self.goi("notifications", "GET", "/notifications"),
                                      self.goi("shares", "GET", "/shares"),
                                      self.goi("rules", "GET", "/rules"))
            ok = ok and all(m in range(200, 300) for m, _ in ba)
        await self.nk.ghi(phien=self.ten, viec="mo_app", ok=ok, t=t_bat_dau,
                          ms=round((time.perf_counter() - t0) * 1000, 1))
        if ok:
            self.da_dong_bo_du = True
        return ok

    async def _mot_nhip(self, viec):
        if not self.da_dong_bo_du:
            await self.mo_app()
            return
        ma, bs = await self.goi(viec, "GET", "/bootstrap?lang=" + self.cfg.lang, etag_khoa="bootstrap")
        if isinstance(bs, dict):
            nhan = (bs.get("phienBan") or {}).get("products")
            if nhan != self.nhan_products:
                await self.goi("products", "GET",
                               "/products?lang=%s&tenant=%s" % (self.cfg.lang, self.cfg.tenant),
                               auth=False, etag_khoa="products")
                self.nhan_products = nhan

    async def dong_bo_nhip(self, viec):
        """dongBoNhip của app: một luồng thôi — hỏi vòng và SSE nối lại có thể rơi cùng lúc."""
        if self.dang_dong_bo is None:
            self.dang_dong_bo = asyncio.ensure_future(self._mot_nhip(viec))
            try:
                await self.dang_dong_bo
            finally:
                self.dang_dong_bo = None
        else:
            await self.nk.ghi(phien=self.ten, viec="nhip_gop_chung", ok=True)
            await asyncio.shield(self.dang_dong_bo)

    async def gui_lenh(self):
        if not self.cfg.rpc_device:
            return
        await self.goi("rpc", "POST", "/devices/%s/rpc" % self.cfg.rpc_device,
                       {"method": self.cfg.rpc_method, "params": {"on": random.choice([True, False])}},
                       headers={"Idempotency-Key": str(uuid.uuid4())})

    # ---------- ba vòng nền ----------

    async def giu_luong(self, den_luc):
        """Mở /stream và giữ. Đo thời gian tới byte đầu, nhịp giữ kết nối, và lần đứt."""
        global dem_luong_dang_mo
        lan_thu = 0
        da_lam_moi_lan_nay = False
        while time.monotonic() < den_luc and not self.het_phien:
            t0 = time.perf_counter()
            mo_duoc = False
            try:
                da_dung = self.access
                async with self.kn.s.get(self.cfg.base + "/stream",
                                         headers={"Authorization": "Bearer " + (da_dung or ""),
                                                  "Accept": "text/event-stream"}) as r:
                    if r.status == 401:
                        await self.nk.ghi(phien=self.ten, viec="stream_401", ma=401, ok=False)
                        # App: mỗi lần nối chỉ được làm mới một lần, hỏng nữa là hết phiên.
                        if da_lam_moi_lan_nay or not await self.lam_moi_sau_401(da_dung):
                            self.het_phien = True
                            return
                        da_lam_moi_lan_nay = True
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
                    da_lam_moi_lan_nay = False

                    if self.da_tung_noi:
                        moc = (time.perf_counter() - self.dut_luc) * 1000
                        await self.nk.ghi(phien=self.ten, viec="noi_lai_xong", ok=True,
                                          ms=round(moc, 1))
                        # App: onReconnect → dongBoNhip → /bootstrap (không phải /devices).
                        asyncio.ensure_future(self.dong_bo_nhip("bootstrap_sau_noi_lai"))
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

    async def vong_hoi(self, den_luc):
        """Hỏi vòng nối đuôi như useDongBoNen: hẹn nhịp → hỏi → đợi xong → hẹn nhịp tiếp.
        Không phải setInterval: máy chủ chậm thì nhịp giãn ra theo, không chồng request."""
        if self.nen:
            return
        while not self.het_phien:
            con = den_luc - time.monotonic()
            if con <= 0:
                return
            await asyncio.sleep(min(self.nhip, con))
            if time.monotonic() >= den_luc or self.het_phien:
                return
            await self.dong_bo_nhip("bootstrap_hoi_vong")

    async def vong_lam_moi_chu_dong(self, den_luc):
        """Kiểu đo cũ: làm mới trước hạn. App hiện tại KHÔNG làm vậy (chỉ làm mới sau 401)."""
        while time.monotonic() < den_luc and not self.het_phien:
            cho = max(5.0, self.het_han_luc - time.monotonic() - LAM_MOI_TRUOC_S)
            await asyncio.sleep(min(cho, max(0.0, den_luc - time.monotonic())))
            if time.monotonic() >= den_luc:
                return
            if not await self.lam_moi():
                return

    async def vong_lenh(self, den_luc):
        if not self.cfg.rpc_device:
            return
        while time.monotonic() < den_luc and not self.het_phien:
            await asyncio.sleep(self.cfg.rpc_every * (0.5 + random.random()))
            if time.monotonic() >= den_luc:
                return
            await self.gui_lenh()

    async def chay(self, den_luc):
        if not await self.dang_nhap():
            return
        await self.mo_app()
        viec = [self.vong_lenh(den_luc)]
        if not self.cfg.khong_sse:
            viec.append(self.giu_luong(den_luc))
        if not self.cfg.khong_hoi_vong:
            viec.append(self.vong_hoi(den_luc))
        if self.cfg.lam_moi == "chu-dong":
            viec.append(self.vong_lam_moi_chu_dong(den_luc))
        await asyncio.gather(*viec, return_exceptions=True)


async def theo_doi(nk, den_luc):
    """Mỗi 5 giây ghi số luồng đang mở và số request đang bay."""
    while time.monotonic() < den_luc:
        await asyncio.sleep(5)
        await nk.ghi(viec="dem_luong_dang_mo", so=dem_luong_dang_mo)
        await nk.ghi(viec="dang_bay", so=dem_dang_bay)


async def cat_luong(cfg, kn, nk):
    """Nửa client của bão nối lại: ngắt sạch kết nối đang mở ở giây thứ N, giống như khi
    IBS khởi động lại. Kết nối MỚI vẫn dựng được ngay — ta đang đo app nối lại nhanh
    chậm thế nào, không đo app xử lý mạng chết vĩnh viễn."""
    await asyncio.sleep(cfg.cut_at)
    await nk.ghi(viec="CAT_KET_NOI", so=dem_luong_dang_mo)
    await kn.ngat_het()


def chia_deu(i, ti_le):
    """Phiên thứ i có thuộc nhóm chiếm `ti_le` không — rải đều, đúng tỉ lệ, không ngẫu nhiên."""
    return int((i + 1) * ti_le) > int(i * ti_le)


def req_s_ly_thuyet(cfg):
    """Mục 1.2 của tài liệu: mỗi phiên đang mở app tự sinh 1/nhịp req/s."""
    if cfg.khong_hoi_vong:
        return 0.0
    moi_phien = cfg.xem_ky_ti_le / cfg.nhip_xem_ky + (1 - cfg.xem_ky_ti_le) / cfg.nhip_thuong
    return cfg.sessions * (1 - cfg.nen_ti_le) * moi_phien


async def main_async(cfg):
    global T0
    T0 = time.monotonic()
    nk = Nhat_ky(cfg.out)
    await nk.ghi(viec="BAT_DAU", cau_hinh={k: v for k, v in vars(cfg).items() if k != "password"},
                 req_s_ly_thuyet=round(req_s_ly_thuyet(cfg), 2))

    kn = KetNoi()
    try:
        den_luc = time.monotonic() + cfg.duration
        viec = [asyncio.create_task(theo_doi(nk, den_luc))]
        if cfg.cut_at:
            viec.append(asyncio.create_task(cat_luong(cfg, kn, nk)))

        for i in range(cfg.sessions):
            p = Phien(cfg, i, nk, kn, xem_ky=chia_deu(i, cfg.xem_ky_ti_le),
                      nen=chia_deu(i, cfg.nen_ti_le))
            viec.append(asyncio.create_task(p.chay(den_luc)))
            if cfg.ramp > 0:
                await asyncio.sleep(cfg.ramp / cfg.sessions)
        await nk.ghi(viec="DUNG_XONG", so=cfg.sessions)

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
    p = argparse.ArgumentParser(description="Đo phiên người dùng Livotec Home (mô phỏng app hiện tại)")
    p.add_argument("--base", default=os.environ.get("IOTX_BASE", "https://web.dev.happibot.net/v1"))
    p.add_argument("--tenant", default=os.environ.get("IOTX_TENANT", "livotec"))
    p.add_argument("--lang", default="vi")
    p.add_argument("--sessions", type=int, default=50, help="số phiên đồng thời")
    p.add_argument("--ramp", type=float, default=60, help="giây để dựng đủ số phiên")
    p.add_argument("--duration", type=float, default=600, help="tổng thời gian chạy, giây")
    p.add_argument("--cut-at", type=float, default=0, help="giây thứ N thì cắt sạch kết nối")
    p.add_argument("--xem-ky-ti-le", type=float, default=0.25,
                   help="tỉ lệ phiên đang mở màn chi tiết (hỏi mỗi 2,5 s); còn lại hỏi mỗi 10 s")
    p.add_argument("--nen-ti-le", type=float, default=0.0,
                   help="tỉ lệ phiên có tab chạy nền — không hỏi vòng, vẫn giữ SSE")
    p.add_argument("--nhip-xem-ky", type=float, default=NHIP_XEM_KY_S, help="giây; mã app là 2,5")
    p.add_argument("--nhip-thuong", type=float, default=NHIP_THUONG_S, help="giây; mã app là 10")
    p.add_argument("--khong-sse", action="store_true", help="không mở /stream (kiểu web.dev)")
    p.add_argument("--khong-hoi-vong", action="store_true", help="không hỏi vòng (kiểu đo cũ)")
    p.add_argument("--lam-moi", choices=["sau-401", "chu-dong"], default="sau-401",
                   help="sau-401 = như app hiện tại; chu-dong = làm mới trước hạn như bộ đo cũ")
    p.add_argument("--het-gio", type=float, default=30, help="quá hạn chờ mỗi request, giây")
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
    for ten in ("xem_ky_ti_le", "nen_ti_le"):
        if not 0 <= getattr(cfg, ten) <= 1:
            print("--%s phải nằm trong 0..1" % ten.replace("_", "-"))
            return 2

    print("Máy chủ %s | %d phiên | dựng trong %.0fs | chạy %.0fs"
          % (cfg.base, cfg.sessions, cfg.ramp, cfg.duration))
    print("Mô phỏng: SSE %s · hỏi vòng %s (%.0f%% màn chi tiết %.1fs, còn lại %.0fs; %.0f%% tab nền) · làm mới %s"
          % ("TẮT" if cfg.khong_sse else "bật", "TẮT" if cfg.khong_hoi_vong else "bật",
             cfg.xem_ky_ti_le * 100, cfg.nhip_xem_ky, cfg.nhip_thuong, cfg.nen_ti_le * 100, cfg.lam_moi))
    print("Hỏi vòng theo lý thuyết mục 1.2: %.1f req/s khi đã dựng đủ phiên" % req_s_ly_thuyet(cfg))
    if cfg.rpc_device:
        print("CẢNH BÁO: sẽ gửi lệnh thật tới thiết bị %s — nó sẽ bật tắt thật." % cfg.rpc_device)
    try:
        asyncio.run(main_async(cfg))
    except KeyboardInterrupt:
        print("\nDừng theo yêu cầu. File kết quả vẫn dùng được.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
