from pathlib import Path
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "brand-lockup.png"


def emblem_source():
    image = Image.open(SOURCE).convert("RGB")
    # 以左上角背景色找出實際圖樣範圍，避免母圖尺寸更換後依舊使用固定裁切比例。
    background = Image.new("RGB", image.size, image.getpixel((0, 0)))
    difference = ImageChops.difference(image, background).convert("L")
    mask = difference.point(lambda value: 255 if value > 12 else 0)
    bounds = mask.getbbox()
    return image.crop(bounds) if bounds else image


def icon_canvas(emblem, size, coverage):
    canvas = Image.new("RGB", (size, size), "#FFFFFF")
    available = round(size * coverage)
    scale = available / max(emblem.size)
    logo_size = tuple(max(1, round(value * scale)) for value in emblem.size)
    logo = emblem.resize(logo_size, Image.Resampling.LANCZOS)
    offset = tuple((size - value) // 2 for value in logo_size)
    canvas.paste(logo, offset)
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
