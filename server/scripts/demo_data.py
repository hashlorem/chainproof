"""
Fills a running API with a demo case, acting as a phone (signs captures with its own key).
Lets you try the web app before the mobile app is set up.

    uv run uvicorn app.main:app --port 8000      # in another terminal
    uv run python -m scripts.demo_data
"""

import hashlib
import io
import json
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import numpy as np
import rfc8785
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from PIL import Image, ImageDraw, ImageFilter

API = "http://localhost:8000"


def scene(seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    w, h = 1024, 768
    x, y = np.meshgrid(np.linspace(0, 1, w), np.linspace(0, 1, h))
    img = Image.fromarray(np.stack([x * 120 + 60, y * 100 + 70, (1 - x) * 90 + 80], axis=2).astype(np.uint8))
    d = ImageDraw.Draw(img)
    for _ in range(160):
        x0, y0, r = rng.integers(0, w), rng.integers(0, h), rng.integers(6, 60)
        d.rectangle([x0, y0, x0 + r, y0 + r * rng.uniform(0.4, 1.6)], fill=tuple(int(v) for v in rng.integers(0, 255, 3)))
    img = img.filter(ImageFilter.GaussianBlur(1.0))
    noisy = np.asarray(img, dtype=np.int16) + rng.normal(0, 5, (h, w, 3))
    return Image.fromarray(np.clip(noisy, 0, 255).astype(np.uint8))


def jpeg(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=92)
    return buf.getvalue()


def main():
    c = httpx.Client(base_url=API, timeout=30)
    login = c.post("/auth/login", json={"email": "investigator@chainproof.dev", "password": "chainproof123"}).json()
    c.headers["Authorization"] = f"Bearer {login['token']}"
    user_id = login["user"]["id"]

    key = Ed25519PrivateKey.generate()
    pub = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw).hex()
    device = c.post("/devices", json={"name": "Demo phone (simulated)", "public_key_hex": pub}).json()

    case = c.post("/cases", json={
        "title": "Warehouse break-in, Chilonzor",
        "description": "Rear loading door forced overnight. Scene photographed by the first officer on site.",
    }).json()

    start = datetime.now(UTC) - timedelta(hours=3)
    spots = [(41.27532, 69.20412), (41.27541, 69.20438), (41.27519, 69.20401)]
    for i, (lat, lon) in enumerate(spots):
        data = jpeg(scene(10 + i))
        manifest = {
            "evidence_uuid": str(uuid.uuid4()),
            "case_id": case["id"],
            "sha256": hashlib.sha256(data).hexdigest(),
            "mime": "image/jpeg",
            "size": len(data),
            "captured_at": (start + timedelta(minutes=4 * i)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "gps": {"lat": lat, "lon": lon, "accuracy": 4.0 + i},
            "device_id": device["id"],
            "user_id": user_id,
            "app_version": "demo-script",
        }
        r = c.post(f"/cases/{case['id']}/evidence",
                   files={"file": (f"scene-{i + 1}.jpg", data, "image/jpeg")},
                   data={"manifest": json.dumps(manifest), "signature": key.sign(rfc8785.dumps(manifest)).hex()})
        r.raise_for_status()
        print("signed capture", r.json()["filename"])

    # A "tip from the public" with a cloned area, imported without a capture signature.
    tip = scene(42)
    tip.paste(tip.crop((120, 140, 320, 330)), (640, 380))
    r = c.post(f"/cases/{case['id']}/evidence", files={"file": ("tip-from-public.jpg", jpeg(tip), "image/jpeg")})
    r.raise_for_status()
    print("imported", r.json()["filename"])
    print(f"\nOpen http://localhost:3100/cases/{case['id']}")


if __name__ == "__main__":
    main()
