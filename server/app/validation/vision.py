"""
Real camera photos from the VISION dataset (35 phones, 11 brands), each also as shared through WhatsApp and Facebook.
Shullani et al., "VISION: a video and image dataset for source identification", EURASIP J. on Information Security, 2017.
Licence: CC BY-SA 4.0. https://lesc.dinfo.unifi.it/VISION/
"""

import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

from app.validation.dataset import Item, append, sha256_file

LIST_URL = "https://lesc.dinfo.unifi.it/VISION/VISION_files.txt"
LICENCE = "CC BY-SA 4.0, VISION dataset (Shullani et al. 2017)"
# Natural scenes: the camera original plus its WhatsApp and Facebook (low quality) versions.
VARIANTS = {"nat": "original", "natWA": "whatsapp", "natFBL": "facebook"}
NAME = re.compile(r"/(D\d\d)_[^/]+/images/(nat|natWA|natFBL)/D\d\d_I_\w+?_(\d{4})\.jpg$")


def pick(urls: list[str], per_device: int) -> dict[tuple[str, str], dict[str, str]]:
    """Chooses evenly spaced photo numbers per phone, keeping only those that exist in all three variants."""
    found: dict[tuple[str, str], dict[str, str]] = defaultdict(dict)
    for url in urls:
        m = NAME.search(url)
        if m:
            found[(m.group(1), m.group(3))][m.group(2)] = url
    complete = sorted(k for k, v in found.items() if len(v) == len(VARIANTS))
    by_device: dict[str, list[str]] = defaultdict(list)
    for device, num in complete:
        by_device[device].append(num)
    chosen = {}
    for device, nums in sorted(by_device.items()):
        step = len(nums) / (per_device + 1)
        for i in range(1, per_device + 1):
            num = nums[int(i * step)]
            chosen[(device, num)] = found[(device, num)]
    return chosen


def fetch(root: Path, per_device: int = 3, workers: int = 8) -> list[Item]:
    root.mkdir(parents=True, exist_ok=True)
    urls = httpx.get(LIST_URL, timeout=60).text.split()
    jobs = [(device, num, variant, url) for (device, num), v in pick(urls, per_device).items() for variant, url in v.items()]

    def download(job) -> Item:
        device, num, variant, url = job
        rel = Path("vision") / variant / url.rsplit("/", 1)[1]
        path = root / rel
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            r = httpx.get(url, timeout=120, follow_redirects=True)
            r.raise_for_status()
            path.write_bytes(r.content)
        return Item(file=str(rel), sha256=sha256_file(path), truth=VARIANTS[variant],
                    source=f"VISION {device} {variant}_{num}", licence=LICENCE)

    with ThreadPoolExecutor(workers) as pool:
        items = list(pool.map(download, jobs))
    append(root, items)
    return items
