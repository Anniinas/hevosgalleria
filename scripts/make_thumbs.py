"""Tekee pikkukuvat (pidempi sivu 480 px) local-sources.json:n gallerioista.

Käyttö: python scripts/make_thumbs.py [gallerian-id ...]
Tulos: <thumbsDir>/<gallerian-id>/<tiedosto>.jpg. Jo tehdyt pikkukuvat ohitetaan.
Vaatii Pillow-kirjaston: python -m pip install pillow
"""
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageOps

SIZE = 480
QUALITY = 80
ROOT = Path(__file__).resolve().parent.parent


def make(src: Path, dst: Path) -> bool:
    if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
        return False
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((SIZE, SIZE), Image.LANCZOS)
        im.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    return True


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    cfg = json.loads((ROOT / "local-sources.json").read_text(encoding="utf-8"))
    root = Path(cfg["imagesRoot"])
    out_root = Path(cfg["thumbsDir"])
    wanted = sys.argv[1:]
    for gid, source in cfg["galleries"].items():
        rel = source if isinstance(source, str) else source["dir"]
        if wanted and gid not in wanted:
            continue
        src_dir = root / rel
        dst_dir = out_root / gid
        dst_dir.mkdir(parents=True, exist_ok=True)
        files = sorted(p for p in src_dir.iterdir() if p.suffix.lower() in (".jpg", ".jpeg"))
        with ThreadPoolExecutor() as pool:
            made = sum(pool.map(lambda p: make(p, dst_dir / p.name), files))
        size = sum(p.stat().st_size for p in dst_dir.iterdir()) / 1024 / 1024
        print(f"{gid}: {len(files)} kuvaa, {made} uutta pikkukuvaa, yhteensä {size:.1f} Mt")
        # Merkitse pystykuvat gallerian JSONiin (jos galleria on jo tuotu)
        if (ROOT / "data" / "galleries" / f"{gid}.json").exists():
            subprocess.run(["node", str(ROOT / "scripts" / "orientation.mjs"), gid], check=True)


if __name__ == "__main__":
    main()
