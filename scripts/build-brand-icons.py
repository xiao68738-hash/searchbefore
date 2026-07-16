from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "brand-lockup.png"


def emblem_source():
    image = Image.open(SOURCE).convert("RGB")
    width, height = image.size
    # 取出上半部的放大鏡、植物與噴頭；比例以生成的品牌母圖為基準。
    left = round(width * 0.315)
    top = round(height * 0.015)
    side = round(height * 0.69)
    return image.crop((left, top, left + side, top + side))


def icon_canvas(emblem, size, coverage):
    canvas = Image.new("RGB", (size, size), "#FFFFFF")
    logo_size = round(size * coverage)
    logo = emblem.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    offset = (size - logo_size) // 2
    canvas.paste(logo, (offset, offset))
    return canvas


def main():
    emblem = emblem_source()
    targets = [
        ("brand-logo-120.png", 120, 0.94),
        ("icon-180.png", 180, 0.90),
        ("icon-192.png", 192, 0.90),
        ("icon-512.png", 512, 0.90),
        ("icon-maskable-512.png", 512, 0.72),
    ]
    for filename, size, coverage in targets:
        output = icon_canvas(emblem, size, coverage)
        output.save(ROOT / filename, "PNG", optimize=True)
        print(f"created {filename} ({size}x{size})")


if __name__ == "__main__":
    main()
