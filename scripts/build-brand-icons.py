from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MASTER = 1024
GREEN = "#2E6B3F"
DEEP = "#17331F"
CREAM = "#F7F4EB"
ORANGE = "#D97A22"


def font(size):
    candidates = [
        Path(r"C:\Windows\Fonts\arialbd.ttf"),
        Path(r"C:\Windows\Fonts\segoeuib.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def build_master():
    image = Image.new("RGBA", (MASTER, MASTER), GREEN)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, MASTER - 1, MASTER - 1), radius=200, fill=GREEN)

    # 橘色握柄先畫在鏡面後方，維持 maskable icon 的安全留白。
    draw.line((624, 614, 846, 836), fill=ORANGE, width=104)
    draw.ellipse((794, 784, 898, 888), fill=ORANGE)

    # 搜尋鏡與柔和陰影。
    draw.ellipse((136, 128, 740, 732), fill=(23, 51, 31, 64))
    draw.ellipse((136, 120, 704, 688), fill=CREAM)

    # 嫩芽，延續農業識別並用雙色增加專屬感。
    draw.line((420, 250, 420, 334), fill=GREEN, width=24)
    draw.polygon([(410, 292), (320, 282), (300, 202), (386, 216)], fill=GREEN)
    draw.polygon([(430, 292), (520, 282), (540, 202), (454, 216)], fill=ORANGE)

    label_font = font(232)
    label = "SB"
    box = draw.textbbox((0, 0), label, font=label_font, stroke_width=0)
    width = box[2] - box[0]
    draw.text(((420 - width / 2), 338), label, font=label_font, fill=DEEP, spacing=0)
    return image


def main():
    master = build_master()
    targets = {
        "brand-logo-120.png": 120,
        "icon-180.png": 180,
        "icon-192.png": 192,
        "icon-512.png": 512,
        "icon-maskable-512.png": 512,
    }
    for filename, size in targets.items():
        output = master.resize((size, size), Image.Resampling.LANCZOS)
        output.save(ROOT / filename, "PNG", optimize=True)
        print(f"created {filename} ({size}x{size})")


if __name__ == "__main__":
    main()
