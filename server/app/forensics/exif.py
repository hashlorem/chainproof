"""Metadata analysis: what the file says about itself, and whether that story is consistent."""

import io

from PIL import ExifTags, Image

from app.forensics.common import finding

EDITORS = ("photoshop", "gimp", "lightroom", "snapseed", "picsart", "canva", "affinity", "pixelmator", "facetune", "paint.net", "photopea")
AI_TOOLS = ("dall-e", "dall·e", "midjourney", "stable diffusion", "firefly", "imagen", "gpt-image", "flux")
WANTED = ("Make", "Model", "Software", "DateTime", "DateTimeOriginal", "DateTimeDigitized", "LensModel",
          "ExposureTime", "FNumber", "ISOSpeedRatings", "Orientation", "ImageDescription", "Artist")


def _gps_decimal(gps: dict) -> dict | None:
    try:
        def conv(v, ref):
            d, m, s = (float(x) for x in v)
            out = d + m / 60 + s / 3600
            return -out if ref in ("S", "W") else out

        return {"lat": round(conv(gps[2], gps[1]), 6), "lon": round(conv(gps[4], gps[3]), 6)}
    except (KeyError, TypeError, ValueError, ZeroDivisionError):
        return None


def analyze(data: bytes) -> dict:
    img = Image.open(io.BytesIO(data))
    exif = img.getexif()
    tags: dict[str, str] = {}
    for tag_id, value in list(exif.items()) + list(exif.get_ifd(ExifTags.IFD.Exif).items()):
        name = ExifTags.TAGS.get(tag_id, str(tag_id))
        if name in WANTED:
            tags[name] = str(value).strip("\x00 ")[:200]
    gps = _gps_decimal(exif.get_ifd(ExifTags.IFD.GPSInfo))

    findings = []
    software = tags.get("Software", "").lower()
    xmp = (img.info.get("xmp") or b"")
    xmp_text = (xmp.decode("utf-8", "ignore") if isinstance(xmp, bytes) else str(xmp)).lower()

    if not exif:
        findings.append(finding("low", "No EXIF metadata", "Common for screenshots, messaging apps and social media re-uploads, but also for images that were cleaned on purpose."))
    else:
        if not tags.get("Make") and not tags.get("Model"):
            findings.append(finding("low", "No camera make/model", "The metadata does not say which camera took this photo."))
        if any(e in software for e in EDITORS) or any(e in xmp_text for e in ("photoshop", "lightroom", "gimp")):
            findings.append(finding("medium", "Edited with image software", f"Software tag: {tags.get('Software') or 'found in XMP data'}."))
        orig, modified = tags.get("DateTimeOriginal"), tags.get("DateTime")
        if orig and modified and orig != modified:
            findings.append(finding("medium", "Modified after it was taken", f"Taken {orig}, file last changed {modified}."))
    if any(a in software or a in xmp_text for a in AI_TOOLS) or "trainedalgorithmicmedia" in xmp_text:
        findings.append(finding("high", "AI generator named in metadata", "The file's metadata names an AI image generator."))
    if gps:
        findings.append(finding("info", "Location embedded", f"GPS {gps['lat']}, {gps['lon']}."))

    return {"format": img.format, "width": img.width, "height": img.height, "tags": tags, "gps": gps, "findings": findings}
