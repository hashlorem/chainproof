import base64
import io

from PIL import Image, ImageOps


def open_rgb(data: bytes, max_side: int = 2048) -> Image.Image:
    """Decodes, applies EXIF rotation and caps the size so analysis stays fast on phone photos."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    if max(img.size) > max_side:
        img.thumbnail((max_side, max_side))
    return img


def png_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


def finding(severity: str, title: str, detail: str) -> dict:
    """severity: info | low | medium | high"""
    return {"severity": severity, "title": title, "detail": detail}
