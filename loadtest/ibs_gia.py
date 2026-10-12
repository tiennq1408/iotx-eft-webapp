#!/usr/bin/env python3
"""
IBS giả — để thử bộ đo mà KHÔNG đụng vào DEV.

Dựng đủ các cửa mà do_phien.py, ban_rps.py và hai script k6 dùng: đăng nhập, làm mới vé,
/bootstrap (có ETag, trả 304 như IBS thật), /products, /devices, lệnh RPC, /notifications,
/shares, /rules, hẹn giờ, và luồng /stream có nhịp giữ kết nối, thỉnh thoảng đứt.

    python3 loadtest/ibs_gia.py &
    export IOTX_EMAIL=thu@example.com IOTX_PASSWORD=matkhau123
    export IOTX_BASE=http://127.0.0.1:4020/v1
    python3 loadtest/do_phien.py --sessions 25 --ramp 8 --duration 60 --cut-at 35 --out thu.jsonl
    python3 loadtest/tong_hop.py thu.jsonl

Vé ở đây sống 20 giây (thật là 300) để thấy ngay vòng làm mới hoạt động. Đổi bằng --ve-song.

Hai núm để thử bộ đếm và bảng "Đạt SLA?":

    --ti-le-429 0.02   2% request bị trả 429, như khi có bộ giới hạn tốc độ đứng trước IBS.
                       Để thấy cột 429 tách riêng khỏi 4xx khác.
    --suc-chua 20      chỉ 20 request được "xử lý" cùng lúc, còn lại xếp hàng — giống một
                       tiến trình Node với pool Postgres nhỏ. Tải vượt sức chứa thì độ trễ
                       tăng dần và bảng theo bậc phải thấy bậc gãy. 0 = không giới hạn
                       (dùng cho B1-03: đo trần máy phát, máy chủ không được là nút thắt).

Máy chủ này chỉ nghe ở 127.0.0.1. Không có dữ liệu thật nào ở đây.
"""
import argparse
import asyncio
import json
import random
import time
import uuid

from aiohttp import web

VE = {}           # refresh token → access token đang đi kèm
HAN_VE = {}       # access token → mốc hết hạn (monotonic)
CFG = None
HANG_CHO = None   # asyncio.Semaphore khi có --suc-chua


def cap_ve(tenant=None):
    a, rf = "acc-" + uuid.uuid4().hex, "ref-" + uuid.uuid4().hex
    VE[rf] = a
    HAN_VE[a] = time.monotonic() + CFG.ve_song
    return {"accessToken": a, "refreshToken": rf, "expiresIn": CFG.ve_song, "tenant": tenant}


def ve_hop_le(r):
    h = r.headers.get("Authorization", "")
    if not h.startswith("Bearer "):
        return False
    han = HAN_VE.get(h[7:])
    return han is not None and han > time.monotonic()


async def xu_ly(tre_min, tre_max):
    """Giả thời gian xử lý. Có --suc-chua thì phải xếp hàng chờ chỗ trước."""
    if HANG_CHO is None:
        await asyncio.sleep(random.uniform(tre_min, tre_max))
        return
    async with HANG_CHO:
        await asyncio.sleep(random.uniform(tre_min, tre_max))


@web.middleware
async def gioi_han_toc_do(r, handler):
    # Giả một bộ giới hạn tốc độ (Caddy/Keycloak) đứng TRƯỚC IBS: trả 429 không cần xử lý gì.
    if CFG.ti_le_429 > 0 and r.path != "/v1/stream" and random.random() < CFG.ti_le_429:
        return web.json_response({"message": "too_many_requests"}, status=429,
                                 headers={"Retry-After": "1"})
    return await handler(r)


def can_ve(handler):
    async def boc(r):
        if not ve_hop_le(r):
            return web.json_response({"message": "unauthorized"}, status=401)
        return await handler(r)
    return boc


async def login(r):
    b = await r.json()
    if not b.get("email") or not b.get("password"):
        return web.json_response({"message": "not_found"}, status=404)
    await xu_ly(0.05, 0.2)
    return web.json_response(cap_ve(b.get("tenant")))


async def refresh(r):
    b = await r.json()
    if b.get("refreshToken") not in VE:
        return web.json_response({"message": "not_found"}, status=401)
    VE.pop(b["refreshToken"])
    await xu_ly(0.01, 0.05)
    return web.json_response(cap_ve())


@can_ve
async def me(r):
    return web.json_response({"email": "thu@example.com", "tenant": "livotec"})


def nhan_etag():
    # Dữ liệu "đổi" mỗi 30 giây. Giữa hai lần đổi, ai gửi If-None-Match đúng thì nhận 304 —
    # nhưng vẫn phải đợi xử lý đủ, đúng như IBS thật tính ETag SAU khi chạy hết truy vấn.
    return 'W/"bs-%d"' % (int(time.time()) // 30)


@can_ve
async def bootstrap(r):
    await xu_ly(0.05, 0.3)
    etag = nhan_etag()
    if r.headers.get("If-None-Match") == etag:
        return web.Response(status=304, headers={"ETag": etag})
    return web.json_response({"devices": [{"id": "dev-1", "name": "SBI314", "type": "quat"},
                                          {"id": "dev-2", "name": "Quat 2", "type": "quat"}],
                              "categories": [], "me": {"email": "thu@example.com"}, "unread": 0,
                              "phienBan": {"i18n": "1", "products": "1", "theme": "1"}},
                             headers={"ETag": etag})


async def products(r):
    await xu_ly(0.02, 0.08)
    return web.json_response({"quat": {"type": "quat", "capabilities": [{"key": "power", "kind": "onoff"}]}},
                             headers={"ETag": 'W/"pr-1"'})


@can_ve
async def devices(r):
    await xu_ly(0.03, 0.1)
    return web.json_response([{"id": "dev-1", "lastValues": {"power": True}}])


@can_ve
async def rpc(r):
    if not r.headers.get("Idempotency-Key"):
        return web.json_response({"message": "thieu Idempotency-Key"}, status=400)
    await xu_ly(0.1, 0.4)
    if random.random() < CFG.ti_le_loi_rpc:   # mặc định 3% hỏng, để thấy cột 5xx có chạy
        return web.json_response({"message": "loi gia"}, status=502)
    return web.json_response({"ok": True}, status=201)


@can_ve
async def notifications(r):
    await xu_ly(0.01, 0.05)
    return web.json_response({"unread": 0, "items": []})


@can_ve
async def shares(r):
    await xu_ly(0.01, 0.05)
    return web.json_response({"granted": [], "receivedFromOthers": []})


@can_ve
async def rules(r):
    await xu_ly(0.02, 0.08)
    return web.json_response({"rules": [], "tuThietBi": []})


@can_ve
async def hen_gio(r):
    await xu_ly(0.01, 0.05)
    return web.json_response({"batDuoc": True, "hen": None, "chuongTrinh": []})


@can_ve
async def stream(r):
    res = web.StreamResponse(headers={"Content-Type": "text/event-stream",
                                      "Cache-Control": "no-cache"})
    await res.prepare(r)
    try:
        for _ in range(1000):
            await asyncio.sleep(2.0)     # nhịp nhanh cho dễ thử; thật là 25–30 giây
            await res.write(b": giu-ket-noi\n\n")
            if random.random() < 0.10:   # 10% đứt, để thấy vòng nối lại có chạy
                break
            if random.random() < 0.20:
                await res.write(b'event: trang-thai\n'
                                b'data: ' + json.dumps({"deviceId": "dev-1", "key": "power",
                                                        "value": True, "ts": 1}).encode() + b'\n\n')
    except (ConnectionResetError, asyncio.CancelledError):
        pass
    return res


def main():
    global CFG, HANG_CHO
    p = argparse.ArgumentParser(description="IBS giả cho bộ đo tải — chỉ nghe ở 127.0.0.1")
    p.add_argument("--cong", type=int, default=4020)
    p.add_argument("--ve-song", type=int, default=20, help="vé sống bao nhiêu giây (thật là 300)")
    p.add_argument("--ti-le-429", type=float, default=0.0, help="tỉ lệ request bị trả 429, 0..1")
    p.add_argument("--ti-le-loi-rpc", type=float, default=0.03,
                   help="tỉ lệ lệnh RPC trả 502 (mặc định 3%%, để thấy cột 5xx có chạy)")
    p.add_argument("--suc-chua", type=int, default=0,
                   help="số request xử lý cùng lúc; 0 = không giới hạn")
    CFG = p.parse_args()

    async def khoi_dong(_app):
        global HANG_CHO
        if CFG.suc_chua > 0:
            HANG_CHO = asyncio.Semaphore(CFG.suc_chua)

    app = web.Application(middlewares=[gioi_han_toc_do])
    app.on_startup.append(khoi_dong)
    app.add_routes([web.post("/v1/auth/login", login),
                    web.post("/v1/auth/refresh", refresh),
                    web.get("/v1/me", me),
                    web.get("/v1/bootstrap", bootstrap),
                    web.get("/v1/products", products),
                    web.get("/v1/devices", devices),
                    web.post("/v1/devices/{id}/rpc", rpc),
                    web.get("/v1/devices/{id}/hen-gio", hen_gio),
                    web.get("/v1/notifications", notifications),
                    web.get("/v1/shares", shares),
                    web.get("/v1/rules", rules),
                    web.get("/v1/stream", stream)])
    print("IBS giả nghe ở http://127.0.0.1:%d/v1  | vé %ds | 429: %.1f%% | sức chứa: %s"
          % (CFG.cong, CFG.ve_song, CFG.ti_le_429 * 100, CFG.suc_chua or "không giới hạn"), flush=True)
    web.run_app(app, host="127.0.0.1", port=CFG.cong, print=None,
                backlog=4096, access_log=None)


if __name__ == "__main__":
    main()
