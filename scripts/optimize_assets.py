"""Optimize demo UI assets: PNG -> sized WebP in webapp/public."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT / 'webapp' / 'public'

SPECS = {
    'cover-demo.png': ('cover-demo.webp', (1200, 640), 78, True),
    'avatar-demo.png': ('avatar-demo.webp', (256, 256), 80, False),
    'empty-day.png': ('empty-day.webp', (512, 512), 75, False),
    'empty-slots.png': ('empty-slots.webp', (512, 512), 75, False),
    'empty-clients.png': ('empty-clients.webp', (512, 512), 75, False),
    'success-check.png': ('success-check.webp', (512, 512), 80, False),
}


def main():
    for src_name, (dst_name, size, quality, flatten) in SPECS.items():
        src = PUB / src_name
        if not src.exists():
            print('skip missing', src_name)
            continue
        im = Image.open(src).convert('RGBA')
        im.thumbnail(size, Image.Resampling.LANCZOS)
        dst = PUB / dst_name
        if flatten:
            bg = Image.new('RGB', im.size, (11, 13, 16))
            bg.paste(im, mask=im.split()[-1])
            bg.save(dst, 'WEBP', quality=quality, method=6)
        else:
            im.save(dst, 'WEBP', quality=quality, method=6, exact=True)
        kb = dst.stat().st_size / 1024
        print(f'{dst_name}: {kb:.1f} KB')


if __name__ == '__main__':
    main()
