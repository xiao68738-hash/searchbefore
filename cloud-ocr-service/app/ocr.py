import io
from dataclasses import dataclass
from typing import Any, Iterable

from PIL import Image, ImageOps, UnidentifiedImageError


ALLOWED_MIME_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
MAX_PIXELS = 24_000_000


class InvalidImage(ValueError):
    pass


@dataclass(frozen=True)
class DecodedImage:
    content: bytes
    width: int
    height: int


def decode_image(data: bytes, content_type: str) -> DecodedImage:
    """驗證圖片並重新編碼，避免把原始檔案或 EXIF 直接送至第三方服務。"""
    if content_type not in ALLOWED_MIME_TYPES:
        raise InvalidImage("只接受 JPG、PNG 或 WebP 圖片")
    try:
        with Image.open(io.BytesIO(data)) as source:
            source.verify()
        with Image.open(io.BytesIO(data)) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            width, height = image.size
            if width < 480 or height < 480:
                raise InvalidImage("照片解析度太低，請靠近表單重新拍攝")
            if width * height > MAX_PIXELS:
                raise InvalidImage("照片像素過高，請改用 2400 萬像素以下的圖片")
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=92, optimize=True)
            return DecodedImage(output.getvalue(), width, height)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        if isinstance(exc, InvalidImage):
            raise
        raise InvalidImage("圖片內容無法讀取，請重新選擇照片") from exc


def _vertices(box: Any) -> list[Any]:
    return list(getattr(box, "vertices", None) or [])


def _normalized_box(vertices: Iterable[Any], width: int, height: int) -> dict | None:
    points = [(float(getattr(v, "x", 0) or 0), float(getattr(v, "y", 0) or 0)) for v in vertices]
    if not points:
        return None
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return {
        "left": max(0.0, min(min(xs) / max(width, 1), 1.0)),
        "top": max(0.0, min(min(ys) / max(height, 1), 1.0)),
        "right": max(0.0, min(max(xs) / max(width, 1), 1.0)),
        "bottom": max(0.0, min(max(ys) / max(height, 1), 1.0)),
    }


def _paragraph_text(paragraph: Any) -> str:
    words = []
    for word in getattr(paragraph, "words", None) or []:
        text = "".join(str(getattr(symbol, "text", "") or "") for symbol in getattr(word, "symbols", None) or [])
        if text:
            words.append(text)
    return " ".join(words).strip()


def normalize_results(annotation: Any, width: int = 1, height: int = 1) -> list[dict]:
    """將 Vision 的頁／區塊／段落結構轉成前端共用的 OCR blocks。"""
    blocks: list[dict] = []
    for page in getattr(annotation, "pages", None) or []:
        for block in getattr(page, "blocks", None) or []:
            for paragraph in getattr(block, "paragraphs", None) or []:
                text = _paragraph_text(paragraph)
                if not text:
                    continue
                confidence = float(getattr(paragraph, "confidence", 0.0) or 0.0)
                blocks.append({
                    "id": f"cloud-{len(blocks) + 1}",
                    "text": text[:500],
                    "confidence": max(0.0, min(confidence, 1.0)),
                    "box": _normalized_box(_vertices(getattr(paragraph, "bounding_box", None)), width, height),
                })
                if len(blocks) >= 500:
                    return blocks
    return blocks


class GoogleVisionEngine:
    def __init__(self) -> None:
        self._client = None

    def _load(self):
        if self._client is None:
            from google.cloud import vision

            self._client = vision.ImageAnnotatorClient()
        return self._client

    def recognize(self, content: bytes, width: int, height: int) -> list[dict]:
        from google.cloud import vision

        response = self._load().document_text_detection(image=vision.Image(content=content))
        if response.error.message:
            raise RuntimeError(f"Google Cloud Vision 辨識失敗：{response.error.message}")
        return normalize_results(response.full_text_annotation, width, height)


engine = GoogleVisionEngine()
