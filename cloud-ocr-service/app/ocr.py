import io
from dataclasses import dataclass
from typing import Any, Iterable

from PIL import Image, ImageOps, UnidentifiedImageError


ALLOWED_MIME_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
MAX_PIXELS = 24_000_000
MAX_PARAGRAPHS = 500
MAX_WORDS_PER_PARAGRAPH = 200
MAX_TOTAL_WORDS = 5_000
MAX_WORD_TEXT_LENGTH = 128

BREAK_TYPE_NAMES = {
    0: "UNKNOWN",
    1: "SPACE",
    2: "SURE_SPACE",
    3: "EOL_SURE_SPACE",
    4: "HYPHEN",
    5: "LINE_BREAK",
}


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


def _confidence(value: Any) -> float:
    return max(0.0, min(float(value or 0.0), 1.0))


def _break_type_name(value: Any) -> str:
    """將 protobuf enum 轉成不依賴 Vision SDK 版本的穩定字串。"""
    name = getattr(value, "name", None)
    if name:
        return str(name)
    try:
        return BREAK_TYPE_NAMES.get(int(value), "UNKNOWN")
    except (TypeError, ValueError):
        return "UNKNOWN"


def _detected_break(symbols: list[Any]) -> dict | None:
    """DetectedBreak 會附在單字最後一個 symbol，僅回傳版面提示，不回傳 SDK 物件。"""
    for symbol in reversed(symbols):
        prop = getattr(symbol, "property", None)
        detected = getattr(prop, "detected_break", None)
        if detected is None:
            continue
        break_type = getattr(detected, "type_", None)
        if break_type is None:
            break_type = getattr(detected, "type", None)
        return {
            "type": _break_type_name(break_type),
            "isPrefix": bool(getattr(detected, "is_prefix", False)),
        }
    return None


def _normalized_word(word: Any, paragraph_id: str, word_index: int, width: int, height: int) -> dict | None:
    symbols = list(getattr(word, "symbols", None) or [])
    text = "".join(str(getattr(symbol, "text", "") or "") for symbol in symbols).strip()
    if not text:
        return None
    return {
        "id": f"{paragraph_id}-w{word_index + 1}",
        "text": text[:MAX_WORD_TEXT_LENGTH],
        "confidence": _confidence(getattr(word, "confidence", 0.0)),
        "box": _normalized_box(_vertices(getattr(word, "bounding_box", None)), width, height),
        "detectedBreak": _detected_break(symbols),
    }


def normalize_results(annotation: Any, width: int = 1, height: int = 1) -> list[dict]:
    """將 Vision 結構轉成向後相容的段落 blocks，並保留可覆核的單字位置。"""
    blocks: list[dict] = []
    total_words = 0
    for page_index, page in enumerate(getattr(annotation, "pages", None) or []):
        page_width = int(getattr(page, "width", 0) or width)
        page_height = int(getattr(page, "height", 0) or height)
        for block_index, block in enumerate(getattr(page, "blocks", None) or []):
            block_box = _normalized_box(
                _vertices(getattr(block, "bounding_box", None)),
                page_width,
                page_height,
            )
            for paragraph_index, paragraph in enumerate(getattr(block, "paragraphs", None) or []):
                text = _paragraph_text(paragraph)
                if not text:
                    continue
                paragraph_id = f"cloud-{len(blocks) + 1}"
                normalized_words: list[dict] = []
                paragraph_words = list(getattr(paragraph, "words", None) or [])
                available_words = max(0, min(MAX_WORDS_PER_PARAGRAPH, MAX_TOTAL_WORDS - total_words))
                for word_index, word in enumerate(paragraph_words[:available_words]):
                    normalized_word = _normalized_word(word, paragraph_id, word_index, page_width, page_height)
                    if normalized_word is not None:
                        normalized_words.append(normalized_word)
                total_words += len(normalized_words)
                blocks.append({
                    "id": paragraph_id,
                    "text": text[:500],
                    "confidence": _confidence(getattr(paragraph, "confidence", 0.0)),
                    "box": _normalized_box(
                        _vertices(getattr(paragraph, "bounding_box", None)),
                        page_width,
                        page_height,
                    ),
                    "source": {
                        "pageIndex": page_index,
                        "blockIndex": block_index,
                        "paragraphIndex": paragraph_index,
                    },
                    "blockBox": block_box,
                    "words": normalized_words,
                    "wordsTruncated": len(paragraph_words) > len(normalized_words),
                })
                if len(blocks) >= MAX_PARAGRAPHS:
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
