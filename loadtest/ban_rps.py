#!/usr/bin/env python3
"""
B5 — bắn theo req/s, VÒNG MỞ (open-loop). Thang bậc, trộn lời gọi theo tỉ lệ thật.

Vòng mở nghĩa là bắn theo ĐỒNG HỒ: lời gọi thứ k đi ra đúng lúc t0 + k/R, không đợi lời
gọi trước trả về. Vòng đóng (đợi xong mới gửi tiếp) mắc lỗi coordinated omission: máy chủ
chậm thì máy phát tự chậm theo, p95 trông đẹp đúng lúc hệ thống đang gãy.

Độ trễ ghi ở cột `ms` tính TỪ LÚC LẼ RA PHẢI GỬI (theo lịch), không phải từ lúc thật sự
gửi — nên nếu chính máy phát tụt lịch thì độ trễ cũng phồng lên chứ không giấu đi. Lúc
tụt lịch ghi riêng ở `tre` (ms) để tong_hop.py phân biệt máy phát gãy với máy chủ gãy.

⚠️ Python KHÔNG tới được 15.000 req/s. Đo B1-03 ngày 09/10/2026 trên Mac của anh, bắn vào
ibs_gia.py cùng máy (HTTP thường, KHÔNG TLS, loopback): giữ đúng lịch tới 9.000 req/s, gãy ở
12.000 (bỏ lời gọi, trễ lịch). Đó là trần TỐT NHẤT có thể — qua HTTPS + mạng thật, mỗi lời gọi
tốn thêm bắt tay/mã hoá nên trần thấp hơn nhiều; đo lại B1-03 trên đúng máy phát. Các bậc
3.000 → 20.000 req/s vào máy chủ thật dùng k6 (loadtest/k6/b5_thong_luong.js). Bộ này dùng để
thử, để hiệu chuẩn và cho các bậc thấp.

Trộn mặc định (tài liệu B5, cần đối chiếu nhật ký thật):
    bootstrap 85 · rpc 8 · products 3 · refresh 3 · khac 1  (khac = notifications/rules/hẹn giờ, chỉ ĐỌC)

Không có --rpc-device thì phần rpc dồn sang bootstrap — KHÔNG tự bắn lệnh vào thiết bị nào.
Có --rpc-device thì thiết bị đó BẬT TẮT THẬT; nên dùng thiết bị ảo.

Cần: pip install aiohttp

    export IOTX_EMAIL='...'; export IOTX_PASSWORD='...'
    python3 loadtest/ban_rps.py --bac 100,200,500 --giu 300 --so-ve 50 --out b5.jsonl
    python3 loadtest/tong_hop.py b5.jsonl

Nhiều tài khoản: --tai-khoan-tep tep.txt (mỗi dòng một email; mật khẩu chung lấy từ
IOTX_PASSWORD — không ghi mật khẩu vào tệp). Mỗi vé trong pool lấy lần lượt một tài khoản.
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

TRON_MAC_DINH = "bootstrap=85,rpc=8,products=3,refresh=3,khac=1"
T0 = time.monotonic()


def giay():
    return time.monotonic() - T0


def bay_gio():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="milliseconds")


class Ghi:
    """JSONL thô. Ở vài nghìn dòng/giây thì khoá với flush từng dòng đều đắt — ghi đệm."""

    def __init__(self, duong_dan):
        self.f = open(duong_dan, "a", buffering=1 << 20, encoding="utf-8")

    def __call__(self, **t):
        t.setdefault("t", round(giay(), 3))
        self.f.write(json.dumps(t, ensure_ascii=False) + "\n")

    def dong(self):
        self.f.close()


class Ve:
    """Một ô trong pool vé: một phiên đăng nhập, có ETag /bootstrap riêng như một app."""

    def __init__(self, so, email):
        self.so = so
        self.email = email
        self.access = None
        self.refresh_token = None
        self.het_han = 0.0
        self.song = 300.0
        self.etag = None
        self.dang_lam_moi = False

    def nhan(self, d):
        self.access = d.get("accessToken")
        self.refresh_token = d.get("refreshToken") or self.refresh_token
        self.song = float(d.get("expiresIn") or 300)
        self.het_han = time.monotonic() + self.song


class May:
    def __init__(self, cfg, ghi):
        self.cfg = cfg
        self.ghi = ghi
        self.ve = []
        self.dang_bay = 0
        self.dinh_dang_bay = 0
        self.bac = None
        self.dang_dong = False
        conn = aiohttp.TCPConnector(limit=cfg.ket_noi_toi_da, ssl=ssl.create_default_context(),
                                    enable_cleanup_closed=True, ttl_dns_cache=300)
        self.s = aiohttp.ClientSession(connector=conn,
                                       timeout=aiohttp.ClientTimeout(total=cfg.het_gio))
        self.loai, self.trong_so = self._tron(cfg)

    @staticmethod
    def _tron(cfg):
        d = {}
        for manh in cfg.tron.split(","):
            k, _, v = manh.partition("=")
            d[k.strip()] = float(v)
        biet = {"bootstrap", "rpc", "products", "refresh", "khac"}
        la = set(d) - biet
        if la:
            raise SystemExit("Loại lạ trong --tron: %s (chỉ có %s)" % (", ".join(la), ", ".join(sorted(biet))))
        if not cfg.rpc_device and d.get("rpc"):
            print("Không có --rpc-device: phần rpc (%.0f) dồn sang bootstrap. Không bắn lệnh vào thiết bị nào."
                  % d["rpc"])
            d["bootstrap"] = d.get("bootstrap", 0) + d.pop("rpc")
        tong = sum(d.values())
        return list(d), [v / tong for v in d.values()]

    # ---------- một lời gọi ----------

    async def _gui(self, method, duong, body=None, headers=None):
        async with self.s.request(method, self.cfg.base + duong, json=body, headers=headers or {}) as r:
            raw = await r.read()
            return r.status, raw, r.headers.get("ETag")

    async def ban(self, loai, lich):
        """Bắn một lời gọi đã lên lịch lúc `lich` (giây kể từ T0)."""
        bac = self.bac
        tre = (giay() - lich) * 1000          # máy phát trễ lịch bao nhiêu
        t_gui = time.perf_counter()
        ma, viec, loi = 0, loai, None
        try:
            ma, viec = await self._mot_loai(loai)
        except asyncio.CancelledError:
            raise
        except asyncio.TimeoutError as e:
            ma, loi = -1, repr(e)[:160]
        except Exception as e:
            ma, loi = 0, repr(e)[:160]
        finally:
            self.dang_bay -= 1
        xong = time.perf_counter()
        if ma is None:
            self.ghi(viec=viec, ok=False, bac=bac, t=round(lich, 3))
            return
        ban_ghi = dict(viec=viec, ma=ma, ok=(200 <= ma < 300) or ma == 304,
                       ms=round((giay() - lich) * 1000, 1),          # tính từ LỊCH — chống coordinated omission
                       ms_gui=round((xong - t_gui) * 1000, 1),       # tính từ lúc thật sự gửi
                       tre=round(tre, 1), bac=bac, t=round(lich, 3))
        if loi:
            ban_ghi["loi"] = loi
        self.ghi(**ban_ghi)

    def _chon_ve(self):
        return self.ve[random.randrange(len(self.ve))]

    async def _mot_loai(self, loai):
        cfg = self.cfg
        if loai == "products":
            ma, _, _ = await self._gui("GET", "/products?lang=%s&tenant=%s" % (cfg.lang, cfg.tenant))
            return ma, "products"
        if loai == "refresh":
            # Không làm mới hai lần cùng một vé: refresh token xoay vòng, lần thứ hai chắc
            # chắn 401 và đó là lỗi của máy phát chứ không phải của máy chủ.
            for _ in range(8):
                v = self._chon_ve()
                if not v.dang_lam_moi:
                    break
            else:
                return None, "refresh_bo_qua"   # mọi ô đang làm mới — không bắn, ghi nhận riêng
            return await self._lam_moi(v), "refresh"
        v = self._chon_ve()
        h = {"Authorization": "Bearer %s" % v.access}
        if loai == "bootstrap":
            if cfg.etag and v.etag:
                h["If-None-Match"] = v.etag
            ma, _, etag = await self._gui("GET", "/bootstrap?lang=" + cfg.lang, headers=h)
            if etag and 200 <= ma < 300:
                v.etag = etag
        elif loai == "rpc":
            h["Idempotency-Key"] = str(uuid.uuid4())       # mỗi lệnh một khoá riêng — bắt buộc
            ma, _, _ = await self._gui("POST", "/devices/%s/rpc" % cfg.rpc_device,
                                       {"method": cfg.rpc_method,
                                        "params": {"on": random.choice([True, False])}}, h)
        else:  # khac — chỉ các cửa ĐỌC, không tạo/xoá gì trên máy chủ dùng chung
            cua = ["/notifications", "/rules"]
            if cfg.rpc_device:
                cua.append("/devices/%s/hen-gio" % cfg.rpc_device)
            duong = random.choice(cua)
            ma, _, _ = await self._gui("GET", duong, headers=h)
            loai = {"/notifications": "notifications", "/rules": "rules"}.get(duong, "hen_gio")
        if ma == 401 and not v.dang_lam_moi and not self.dang_dong:
            # Vé trong pool hết hạn: làm mới ở nền. Lời gọi này vẫn tính là 401 —
            # nếu thấy nhiều 401 nghĩa là vòng giữ vé chạy không kịp, tăng --so-ve hoặc báo.
            asyncio.ensure_future(self._lam_moi(v, nguon="sau_401"))
        return ma, loai

    async def _lam_moi(self, v, nguon="tron"):
        if self.dang_dong:
            return 0
        v.dang_lam_moi = True
        try:
            if nguon != "tron":
                t = giay()
                t0 = time.perf_counter()
                try:
                    ma, raw, _ = await self._gui("POST", "/auth/refresh", {"refreshToken": v.refresh_token})
                except Exception as e:
                    ma, raw = 0, b""
                    if self.dang_dong:          # bộ đo đang đóng — không phải lỗi máy chủ
                        return 0
                    self.ghi(viec="refresh_giu_ve", ma=0, ok=False, loi=repr(e)[:160], bac=self.bac,
                             t=round(t, 3), ms=round((time.perf_counter() - t0) * 1000, 1))
                else:
                    self.ghi(viec="refresh_giu_ve", ma=ma, ok=200 <= ma < 300, bac=self.bac, t=round(t, 3),
                             ms=round((time.perf_counter() - t0) * 1000, 1), nguon=nguon)
            else:
                ma, raw, _ = await self._gui("POST", "/auth/refresh", {"refreshToken": v.refresh_token})
            if 200 <= ma < 300:
                v.nhan(json.loads(raw.decode() or "{}"))
            elif ma in (400, 401, 404):
                # Refresh token đã chết: đăng nhập lại cho ô này, đừng để cả pool mục dần.
                await self._dang_nhap(v, viec="login_lai")
            return ma
        finally:
            v.dang_lam_moi = False

    async def _dang_nhap(self, v, viec="login"):
        t = giay()
        t0 = time.perf_counter()
        try:
            ma, raw, _ = await self._gui("POST", "/auth/login", {"tenant": self.cfg.tenant, "email": v.email,
                                                                  "password": self.cfg.password})
        except Exception as e:
            self.ghi(viec=viec, ma=-1 if isinstance(e, asyncio.TimeoutError) else 0, ok=False,
                     ms=round((time.perf_counter() - t0) * 1000, 1), loi=repr(e)[:160], t=round(t, 3),
                     bac=self.bac)
            return False
        ok = 200 <= ma < 300
        self.ghi(viec=viec, ma=ma, ok=ok, ms=round((time.perf_counter() - t0) * 1000, 1), t=round(t, 3),
                 bac=self.bac)
        if ok:
            v.nhan(json.loads(raw.decode() or "{}"))
        return ok

    # ---------- chuẩn bị và nền ----------

    async def dung_pool(self):
        """Đăng nhập sẵn --so-ve phiên, tối đa --dang-nhap-song-song cùng lúc."""
        emails = self.cfg.emails
        self.ve = [Ve(i, emails[i % len(emails)]) for i in range(self.cfg.so_ve)]
        cua = asyncio.Semaphore(self.cfg.dang_nhap_song_song)

        async def mot(v):
            async with cua:
                await self._dang_nhap(v)

        await asyncio.gather(*(mot(v) for v in self.ve))
        con = [v for v in self.ve if v.access]
        self.ve = con
        return len(con)

    async def giu_ve(self, den):
        """Vé sống 300 s. Ở bậc thấp, phần refresh 3% có thể không chạm hết mọi ô — ô nào
        sắp hết hạn thì làm mới ở nền (ghi dưới tên refresh_giu_ve, tách khỏi trộn)."""
        while giay() < den:
            await asyncio.sleep(2)
            gio = time.monotonic()
            for v in self.ve:
                # Làm mới khi còn 1/4 đời vé (tối đa 30 s) — vé thật 300 s thì còn 30 s.
                if not v.dang_lam_moi and v.het_han - gio < min(30.0, v.song / 4):
                    asyncio.ensure_future(self._lam_moi(v, nguon="giu_ve"))

    async def dem_bay(self, den):
        """Mỗi giây ghi số request đang bay — định lý Little: tăng tuyến tính theo độ trễ."""
        while giay() < den:
            await asyncio.sleep(1)
            self.ghi(viec="dang_bay", so=self.dang_bay, dinh=self.dinh_dang_bay, bac=self.bac)
            self.dinh_dang_bay = self.dang_bay

    async def mot_bac(self, rps, giu):
        """Bắn đều `rps` lời gọi/giây trong `giu` giây, theo lịch tuyệt đối."""
        self.bac = rps
        bat_dau = giay()
        self.ghi(viec="BAC", bac=rps, giu=giu, t=round(bat_dau, 3))
        print("  bậc %6d req/s — giữ %ds" % (rps, giu), flush=True)
        k = 0
        tong = int(rps * giu)
        bo_qua = 0
        viec = set()
        while k < tong:
            lich = bat_dau + k / rps
            con = lich - giay()
            # LUÔN nhường vòng lặp, kể cả khi lịch kế tiếp chỉ còn < 1 ms: không nhường thì ở
            # vài trăm req/s vòng này quay tại chỗ, các lời gọi đã tạo không được chạy, và máy
            # phát "đóng băng" cả bậc (đã dính khi chạy thử B1-03 ở 500 req/s).
            await asyncio.sleep(con if con > 0 else 0)
            # Bắn hết mọi lời gọi đã tới hạn — nếu vòng lặp tụt lịch thì đuổi lại, không bỏ.
            bay_gio_ = giay()
            while k < tong and bat_dau + k / rps <= bay_gio_:
                lich_k = bat_dau + k / rps
                k += 1
                if self.dang_bay >= self.cfg.toi_da_dang_bay:
                    # Trần an toàn của máy phát: không bắn thêm, ghi rõ là MÁY PHÁT bỏ.
                    bo_qua += 1
                    self.ghi(viec="bo_qua_may_phat", ok=False, bac=rps, t=round(lich_k, 3))
                    continue
                loai = random.choices(self.loai, self.trong_so)[0]
                # Đếm "đang bay" từ lúc TẠO lời gọi — lời gọi đã tới hạn mà chưa kịp chạy
                # cũng đang chiếm chỗ, và trần an toàn phải tính cả chúng.
                self.dang_bay += 1
                if self.dang_bay > self.dinh_dang_bay:
                    self.dinh_dang_bay = self.dang_bay
                tk = asyncio.ensure_future(self.ban(loai, lich_k))
                viec.add(tk)
                tk.add_done_callback(viec.discard)
        self.ghi(viec="HET_BAC", bac=rps, t=round(giay(), 3), bo_qua=bo_qua)
        return viec


async def chay(cfg):
    global T0
    T0 = time.monotonic()
    ghi = Ghi(cfg.out)
    ghi(viec="BAT_DAU", luc=bay_gio(), che_do="rps",
        cau_hinh={k: v for k, v in vars(cfg).items() if k not in ("password", "emails")},
        so_tai_khoan=len(cfg.emails))
    may = May(cfg, ghi)
    try:
        print("Đăng nhập sẵn %d vé (%d tài khoản)..." % (cfg.so_ve, len(cfg.emails)), flush=True)
        n = await may.dung_pool()
        if n == 0:
            print("Không đăng nhập được vé nào — dừng.")
            return 1
        print("Pool có %d vé." % n)
        tong_giay = sum(cfg.giu for _ in cfg.bac) + 60
        den = giay() + tong_giay
        nen = [asyncio.ensure_future(may.giu_ve(den)), asyncio.ensure_future(may.dem_bay(den))]
        con_bay = set()
        for rps in cfg.bac:
            con_bay |= await may.mot_bac(rps, cfg.giu)
        # Đợi các lời gọi cuối về (tối đa --het-gio) rồi mới đóng.
        con_bay = {t for t in con_bay if not t.done()}
        if con_bay:
            await asyncio.wait(con_bay, timeout=cfg.het_gio + 1)
        for t in nen:
            t.cancel()
        await asyncio.gather(*nen, return_exceptions=True)
    finally:
        may.dang_dong = True
        await may.s.close()
        ghi(viec="KET_THUC", luc=bay_gio())
        ghi.dong()
    print("Xong. Kết quả:", cfg.out)
    print("Tổng hợp:  python3 loadtest/tong_hop.py", cfg.out)
    return 0


def main():
    p = argparse.ArgumentParser(description="B5 — bắn theo req/s, vòng mở, thang bậc")
    p.add_argument("--base", default=os.environ.get("IOTX_BASE", "https://web.dev.happibot.net/v1"))
    p.add_argument("--tenant", default=os.environ.get("IOTX_TENANT", "livotec"))
    p.add_argument("--lang", default="vi")
    p.add_argument("--bac", default="50,100,200", help="các bậc req/s, cách nhau dấu phẩy")
    p.add_argument("--giu", type=float, default=300, help="giữ mỗi bậc bao nhiêu giây (tài liệu: ≥ 300)")
    p.add_argument("--tron", default=TRON_MAC_DINH, help="tỉ lệ trộn, vd. " + TRON_MAC_DINH)
    p.add_argument("--so-ve", type=int, default=50, help="số phiên đăng nhập sẵn trong pool")
    p.add_argument("--tai-khoan-tep", default=os.environ.get("IOTX_TAI_KHOAN_TEP", ""),
                   help="tệp mỗi dòng một email (mật khẩu chung từ IOTX_PASSWORD)")
    p.add_argument("--dang-nhap-song-song", type=int, default=5,
                   help="số lượt đăng nhập cùng lúc khi dựng pool — đừng tự làm bão đăng nhập")
    p.add_argument("--rpc-device", default="", help="id thiết bị nhận lệnh; bỏ trống = không gửi lệnh")
    p.add_argument("--rpc-method", default="setPower")
    p.add_argument("--khong-etag", dest="etag", action="store_false",
                   help="không gửi If-None-Match (app thật CÓ gửi)")
    p.add_argument("--het-gio", type=float, default=10, help="quá hạn chờ mỗi lời gọi, giây")
    p.add_argument("--ket-noi-toi-da", type=int, default=2000,
                   help="số kết nối TCP tối đa của máy phát; chạm trần này là MÁY PHÁT nghẽn")
    p.add_argument("--toi-da-dang-bay", type=int, default=20000,
                   help="trần an toàn số lời gọi đang bay; vượt thì bỏ và ghi bo_qua_may_phat")
    p.add_argument("--out", default="b5.jsonl")
    cfg = p.parse_args()

    cfg.base = cfg.base.rstrip("/")
    cfg.bac = [int(float(x)) for x in cfg.bac.split(",") if x.strip()]
    cfg.password = os.environ.get("IOTX_PASSWORD", "")
    if cfg.tai_khoan_tep:
        with open(cfg.tai_khoan_tep, encoding="utf-8") as f:
            cfg.emails = [d.strip() for d in f if d.strip() and not d.startswith("#")]
    else:
        cfg.emails = [os.environ.get("IOTX_EMAIL", "")] if os.environ.get("IOTX_EMAIL") else []
    if not cfg.emails or not cfg.password:
        print("Thiếu IOTX_EMAIL (hoặc --tai-khoan-tep) / IOTX_PASSWORD trong biến môi trường.")
        return 2
    if max(cfg.bac) > 3000:
        print("CẢNH BÁO: bậc %d req/s — một tiến trình Python không tới được mức này. Cột `tre`"
              " và dòng 'máy phát' trong tong_hop.py sẽ cho thấy máy phát tụt lịch. Dùng k6." % max(cfg.bac))
    print("Máy chủ %s | bậc %s req/s | giữ %.0fs mỗi bậc | trộn %s"
          % (cfg.base, ",".join(map(str, cfg.bac)), cfg.giu, cfg.tron))
    if cfg.rpc_device:
        print("CẢNH BÁO: sẽ gửi lệnh thật tới thiết bị %s — nó sẽ bật tắt thật." % cfg.rpc_device)
    try:
        return asyncio.run(chay(cfg))
    except KeyboardInterrupt:
        print("\nDừng theo yêu cầu. File kết quả vẫn dùng được.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
