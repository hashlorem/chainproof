import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.config import settings
from app.core.signing import server_key
from app.db import init_db
from app.routers import auth, cases, devices, evidence, examination, forensics, reports, verify


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    init_db()
    server_key()
    yield


class CapUploads:
    """
    Refuses request bodies over a size limit on unauthenticated upload paths, before they are parsed (TM-005).
    Checks Content-Length up front and counts the bytes as they arrive, for clients that don't send one.
    """

    def __init__(self, app, paths: tuple[str, ...]):
        self.app, self.paths = app, paths

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST" or scope["path"] not in self.paths:
            return await self.app(scope, receive, send)
        cap = settings.public_verify_max_mb * 1024 * 1024
        too_large = f"File too large. The limit is {cap // (1024 * 1024)} MB."
        length = dict(scope["headers"]).get(b"content-length")
        if length and length.isdigit() and int(length) > cap:
            return await JSONResponse({"detail": too_large}, status_code=413)(scope, receive, send)
        received = 0

        async def counted():
            nonlocal received
            message = await receive()
            received += len(message.get("body", b""))
            if received > cap:
                raise HTTPException(413, too_large)
            return message

        await self.app(scope, counted, send)


logging.basicConfig(level=logging.INFO)
app = FastAPI(title="ChainProof API", version="0.1.0", lifespan=lifespan)
# Added before CORS so CORS wraps it and a browser can read the 413.
app.add_middleware(CapUploads, paths=("/public/verify",))
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Content-SHA256"],
)
@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response


for r in (auth, devices, cases, evidence, examination, forensics, reports, verify):
    app.include_router(r.router)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/meta")
def meta():
    """For the status bar: which build is running and which validation its error rates come from. No secrets."""
    from app.forensics import rates
    from app.routers.examination import _tool_versions

    r = rates.load()
    images = (r["checks"]["verdict_any"]["false_alarm"]["n"] + r["checks"]["verdict_any"]["detection"]["n"]) if r else None
    return {"commit": _tool_versions()[0], "validated_at": r and r["validated_at"], "validation_images": images}
