"""
File history: what the file's structure says about where it has been. Cameras, editors and messaging apps each
write JPEGs their own way: which header blocks come first, which compression tables they use, whether camera data
survives, how far the image was resized. Measured on the VISION photos (docs/validation):

- camera originals start with the camera's own data block (EXIF) and keep the make and model;
- re-saves by other software put a JFIF header first, even when they copy the camera data across;
- Facebook adds a hidden "FBMD" marker, a colour profile and progressive encoding;
- WhatsApp strips camera data and re-saves with the standard quality-90 table at 1280/1600 px. Any program saving
  at that quality does the same, so this is only ever "consistent with WhatsApp".

These are indicators of handling, not of manipulation: they never change the verdict.
"""

import io
import struct

from PIL import Image

from app.forensics.common import finding

EDITORS = ("photoshop", "gimp", "lightroom", "snapseed", "picsart", "canva", "affinity", "pixelmator", "facetune",
           "paint.net", "photopea", "luminar", "darktable", "capture one")
# Longest side after WhatsApp's resizing: 960 and 1280 seen in the VISION copies; 1600 is what newer versions use but is
# not in our test data. Other sizes (HD mode) are left out: allowing them labelled ordinary re-saves as WhatsApp.
WHATSAPP_SIDES = (960, 1280, 1600)
# Luminance table seen on photos received through Facebook Messenger (one sender's phone, 5 photos, Oct 2026).
MESSENGER_TABLES = {
    (13, 10, 21, 22, 36, 37, 41, 41, 10, 15, 21, 25, 37, 34, 43, 43, 21, 21, 26, 30, 37, 42, 40, 45, 22, 25, 30, 36, 45,
     46, 46, 49, 36, 37, 37, 45, 49, 53, 60, 59, 37, 34, 42, 46, 53, 58, 55, 65, 41, 43, 40, 46, 60, 55, 58, 58, 41, 43,
     45, 49, 59, 65, 58, 47),
}


def _standard_tables() -> dict[tuple, int]:
    """The IJG/libjpeg tables for every quality, as Pillow reports them, so a table can be matched exactly."""
    tables = {}
    for q in range(1, 101):
        buf = io.BytesIO()
        Image.new("RGB", (16, 16)).save(buf, "JPEG", quality=q)
        tables.setdefault(tuple(Image.open(buf).quantization[0]), q)
    return tables


STANDARD = _standard_tables()


def _segments(data: bytes) -> list[tuple[int, bytes]]:
    """JPEG marker segments up to the start of image data: [(marker, body), ...]."""
    out, i = [], 2
    while i + 4 <= len(data) and data[i] == 0xFF:
        marker = data[i + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        length = struct.unpack(">H", data[i + 2:i + 4])[0]
        out.append((marker, data[i + 4:i + 2 + length]))
        if marker == 0xDA:
            break
        i += 2 + length
    return out


def _app_name(marker: int, body: bytes) -> str:
    tag = body[:16].split(b"\x00")[0].decode("latin-1", "replace")
    known = {"JFIF": "JFIF", "Exif": "EXIF", "http://ns.adobe.com/xap/1.0/": "XMP", "ICC_PROFILE": "ICC",
             "Photoshop 3.0": "IPTC", "Adobe": "Adobe", "MPF": "MPF"}
    for prefix, name in known.items():
        if tag.startswith(prefix[:12]):
            return name
    return f"APP{marker - 0xE0}"


def _quality(table: tuple) -> tuple[int, bool]:
    """(quality, is the standard table). Non-standard tables get the quality of the closest standard one."""
    if table in STANDARD:
        return STANDARD[table], True
    closest = min(STANDARD, key=lambda t: sum(abs(a - b) for a, b in zip(t, table)))
    return STANDARD[closest], False


def analyze(data: bytes) -> dict:
    img = Image.open(io.BytesIO(data))
    exif = img.getexif()
    make, model = str(exif.get(0x010F) or "").strip("\x00 "), str(exif.get(0x0110) or "").strip("\x00 ")
    software = str(exif.get(0x0131) or "").strip("\x00 ")
    xmp = img.info.get("xmp") or b""
    xmp_text = (xmp.decode("utf-8", "ignore") if isinstance(xmp, bytes) else str(xmp)).lower()
    out = {"format": img.format, "width": img.width, "height": img.height}

    if img.format != "JPEG":
        out |= {"source": "not_jpeg",
                "label": f"{img.format} file, not a camera JPEG",
                "detail": f"Phone cameras save JPEG or HEIC. A {img.format} usually comes from a screenshot, an editing app's "
                          "export or an AI tool, so this is at least one step away from the camera."}
        return out | {"findings": [finding("info", f"File history: {out['label']}", out["detail"])]}

    segs = _segments(data)
    apps = [_app_name(m, b) for m, b in segs if 0xE0 <= m <= 0xEF]
    progressive = any(m == 0xC2 for m, _ in segs)
    table = tuple(img.quantization[0]) if getattr(img, "quantization", None) else ()
    quality, standard = _quality(table) if table else (None, False)
    fbmd = any(m == 0xED and b"FBMD" in b for m, b in segs)
    editor = next((e for e in EDITORS if e in software.lower() or e in xmp_text), None)
    out |= {"progressive": progressive, "quality": quality, "standard_table": standard, "blocks": apps,
            "camera": " ".join(x for x in (make, model) if x) or None, "software": software or None}
    side = max(img.size)
    camera = out["camera"] or "unknown camera"

    if fbmd:
        source, label = "facebook", "Passed through Facebook"
        detail = ("The file carries Facebook's hidden FBMD marker, which Facebook (and apps that share its pipeline) adds when "
                  f"it re-encodes an upload. Camera data is gone; re-encoded at about quality {quality}.")
    elif editor:
        source, label = "editor", f"Saved by editing software ({editor.title()})"
        detail = f"The file names {software or editor} as the program that wrote it."
    elif apps[:1] == ["EXIF"] and make:
        source, label = "camera", f"Structure matches a camera original ({camera})"
        detail = ("Camera data comes first in the file, as cameras write it, and names the make and model. Software can copy "
                  "this structure, so it supports, but does not prove, that this is the camera's own file.")
    elif "EXIF" in apps and make:
        source, label = "resaved_with_camera_data", "Re-saved by other software, camera data copied across"
        detail = (f"Camera data from a {camera} is present, but a {apps[0]} header comes before it, which cameras don't write. "
                  f"The file was re-saved by a program (about quality {quality}), possibly after editing.")
    elif table in MESSENGER_TABLES:
        source, label = "messenger", "Looks like a Facebook Messenger copy"
        detail = ("Camera data removed and re-encoded with the compression table seen on photos received through Messenger. "
                  "That table comes from a small sample, so treat this as a lead, not an identification.")
    elif standard and not progressive and apps == ["JFIF"] and side in WHATSAPP_SIDES and quality and 75 <= quality <= 95:
        source, label = "whatsapp", "Consistent with WhatsApp"
        detail = (f"Camera data removed, re-saved with the standard quality-{quality} table and resized to {side} px, as WhatsApp "
                  "does. Any program saving the same way looks identical, so this is consistent with WhatsApp, not proof of it.")
    else:
        source, label = "stripped", "Re-saved without camera data"
        detail = (f"No camera data, and a {'standard' if standard else 'custom'} compression table (about quality {quality}). "
                  "A messaging app, social network, screenshot tool or editor re-saved this file; which one can't be told.")
    out |= {"source": source, "label": label, "detail": detail}
    return out | {"findings": [finding("info", f"File history: {label}", detail)]}
