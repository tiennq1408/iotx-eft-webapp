#!/usr/bin/env python3
"""
IBS giả — để thử bộ đo mà KHÔNG đụng vào DEV.

Dựng đủ sáu cửa mà do_phien.py dùng, có cả nhịp giữ kết nối và thỉnh thoảng đứt luồng.
Dùng nó để chắc chắn máy của anh chạy được bộ đo, trước khi bắn vào máy chủ thật.

    python3 loadtest/ibs_gia.py &
    export IOTX_EMAIL=thu@example.com IOTX_PASSWORD=matkhau123
    export IOTX_BASE=http://127.0.0.1:4020/v1
    python3 loadtest/do_phien.py --sessions 25 --ramp 8 --duration 60 --cut-at 35 --out thu.jsonl
    python3 loadtest/tong_hop.py thu.jsonl

Vé ở đây sống 20 giây (thật là 300) để thấy ngay vòng làm mới hoạt động.
"""
import asyncio
import random
import uuid

from aiohttp import web

VE = {}


async def login(r):
    b = await r.json()
    if not b.get("email") or not b.get("password"):
        return web.json_response({"message": "not_found"}, status=404)
    a, rf = "acc-" + uuid.uuid4().hex, "ref-" + uuid.uuid4().hex
    VE[rf] = a
    await asyncio.sleep(random.uniform(0.05, 0.2))
    return web.json_response({"accessToken": a, "refreshToken": rf, "expiresIn": 20,
                              "tenant": b.get("tenant")})


async def refresh(r):
    b = await r.json()
    if b.get("refreshToken") not in VE:
        return web.json_response({"message": "not_found"}, status=401)
    a, rf = "acc-" + uuid.uuid4().hex, "ref-" + uuid.uuid4().hex
    VE.pop(b["refreshToken"])
    VE[rf] = a
    return web.json_response({"accessToken": a, "refreshToken": rf, "expiresIn": 20})


async def me(r):
    if not r.headers.get("Authorization", "").startswith("Bearer acc-"):
        return web.json_response({"message": "not_found"}, status=401)
    return web.json_response({"email": "thu@example.com", "tenant": "livotec"})


async def bootstrap(r):
    await asyncio.sleep(random.uniform(0.05, 0.3))
    return web.json_response({"devices": [{"id": "dev-1", "name": "SBI314"},
                                          {"id": "dev-2", "name": "Quat 2"}],
                              "categories": [], "me": {"email": "thu@example.com"}, "unread": 0,
                              "phienBan": {"i18n": "1", "products": "1", "theme": "1"}})


async def devices(r):
    return web.json_response([{"id": "dev-1", "lastValues": {"power": True}}])


async def rpc(r):
    await asyncio.sleep(random.uniform(0.1, 0.4))
    if random.random() < 0.03:          # 3% hỏng, để thấy cột lỗi có chạy
        return web.json_response({"message": "loi gia"}, status=502)
    return web.json_response({"ok": True})


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
                                b'data: {"deviceId":"dev-1","key":"power","value":true,"ts":1}\n\n')
    except (ConnectionResetError, asyncio.CancelledError):
        pass
    return res


app = web.Application()
app.add_routes([web.post("/v1/auth/login", login),
                web.post("/v1/auth/refresh", refresh),
                web.get("/v1/me", me),
                web.get("/v1/bootstrap", bootstrap),
                web.get("/v1/devices", devices),
                web.post("/v1/devices/{id}/rpc", rpc),
                web.get("/v1/stream", stream)])

if __name__ == "__main__":
    print("IBS giả nghe ở http://127.0.0.1:4020/v1")
    web.run_app(app, host="127.0.0.1", port=4020, print=None)
