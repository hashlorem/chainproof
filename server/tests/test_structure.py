import io
import struct

from PIL import Image

from app.forensics import structure
from tests.test_forensics import scene


def save(img: Image.Image, **kw) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", **kw)
    return buf.getvalue()


def camera_exif(software: str | None = None) -> bytes:
    ex = Image.Exif()
    ex[0x010F], ex[0x0110] = "Samsung", "SM-G960F"  # Make, Model
    if software:
        ex[0x0131] = software
    return ex.tobytes()


def drop_jfif(data: bytes) -> bytes:
    """Cameras write their EXIF block first and no JFIF header; Pillow writes JFIF first. Remove it to look like a camera."""
    assert data[2:4] == b"\xff\xe0"
    length = struct.unpack(">H", data[4:6])[0]
    return data[:2] + data[4 + length:]


def with_segment(data: bytes, marker: int, body: bytes) -> bytes:
    return data[:2] + bytes([0xFF, marker]) + struct.pack(">H", len(body) + 2) + body + data[2:]


def test_camera_original_structure():
    r = structure.analyze(drop_jfif(save(scene(), quality=95, exif=camera_exif())))
    assert r["source"] == "camera" and "Samsung SM-G960F" in r["label"]


def test_resave_with_copied_camera_data_is_not_called_original():
    r = structure.analyze(save(scene(), quality=85, exif=camera_exif()))
    assert r["source"] == "resaved_with_camera_data"


def test_editor_named_in_exif():
    r = structure.analyze(drop_jfif(save(scene(), quality=90, exif=camera_exif("Adobe Photoshop 26.1"))))
    assert r["source"] == "editor"


def test_facebook_marker():
    data = save(scene(), quality=71, progressive=True)
    r = structure.analyze(with_segment(data, 0xED, b"Photoshop 3.0\x008BIM\x04\x04\x00\x00\x00\x00\x00\x1c\x1c\x02g\x00\x14FBMD0a000a7a0100"))
    assert r["source"] == "facebook"


def test_whatsapp_like():
    r = structure.analyze(save(scene(size=(1280, 960)), quality=90))
    assert r["source"] == "whatsapp" and r["quality"] == 90 and r["standard_table"]


def test_same_resave_at_another_size_is_not_whatsapp():
    assert structure.analyze(save(scene(size=(1000, 750)), quality=90))["source"] == "stripped"


def test_messenger_table():
    luma = list(next(iter(structure.MESSENGER_TABLES)))
    r = structure.analyze(save(scene(), qtables=[luma, luma], progressive=True))
    assert r["source"] == "messenger"


def test_png_is_not_a_camera_file():
    buf = io.BytesIO()
    scene().save(buf, "PNG")
    assert structure.analyze(buf.getvalue())["source"] == "not_jpeg"
