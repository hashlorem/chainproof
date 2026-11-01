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
    """Lossless, for pictures whose exact pixel values matter (ELA heatmap, difference map). Pillow's optimize=True
    was measured at about 4x slower and a larger file on these noisy images, so it stays off."""
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def jpeg_b64(img: Image.Image, quality: int = 90) -> str:
    """For annotated copies of a photo (the clone overlay): about a tenth of the PNG's size, and only a visual aid."""
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode()


def finding(severity: str, title: str, detail: str) -> dict:
    """severity: info | low | medium | high"""
    return {"severity": severity, "title": title, "detail": detail}
