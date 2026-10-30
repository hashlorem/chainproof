import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


logging.basicConfig(level=logging.INFO)
app = FastAPI(title="ChainProof API", version="0.1.0", lifespan=lifespan)
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
