import io
import threading
from dataclasses import dataclass
from typing import Any

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError


ALLOWED_MIME_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
MAX_PIXELS = 24_000_000


class InvalidImage(ValueError):
    pass


@dataclass(frozen=True)
class DecodedImage:
    pixels: np.ndarray
    width: int
    height: int


def decode_image(data: bytes, content_type: str) -> DecodedImage:
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
                raise InvalidImage("照片像素過大，請使用 2400 萬像素以下的圖片")
            return DecodedImage(np.asarray(image), width, height)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        if isinstance(exc, InvalidImage):
            raise
        raise InvalidImage("圖片格式損壞或無法讀取") from exc


def _value(result: Any, key: str, default: Any = None) -> Any:
    if isinstance(result, dict):
        return result.get(key, default)
    data = getattr(result, "json", None)
    if isinstance(data, dict):
        return data.get("res", data).get(key, default)
    data = getattr(result, "res", None)
    if isinstance(data, dict):
        return data.get(key, default)
    return default


def normalize_results(results: list[Any], width: int = 1, height: int = 1) -> list[dict]:
    blocks: list[dict] = []
    for result in results:
        texts = list(_value(result, "rec_texts", []) or [])
        scores = list(_value(result, "rec_scores", []) or [])
        boxes = list(_value(result, "rec_polys", []) or _value(result, "dt_polys", []) or [])
        for index, text in enumerate(texts):
            clean = str(text or "").strip()
            if not clean:
                continue
            score = float(scores[index]) if index < len(scores) else 0.0
            polygon = boxes[index] if index < len(boxes) else []
            if hasattr(polygon, "tolist"):
                polygon = polygon.tolist()
            points = [point for point in polygon if isinstance(point, (list, tuple)) and len(point) >= 2]
            box = None
            if points:
                xs = [float(point[0]) for point in points]
                ys = [float(point[1]) for point in points]
                box = {
                    "left": max(0.0, min(min(xs) / max(width, 1), 1.0)),
                    "top": max(0.0, min(min(ys) / max(height, 1), 1.0)),
                    "right": max(0.0, min(max(xs) / max(width, 1), 1.0)),
                    "bottom": max(0.0, min(max(ys) / max(height, 1), 1.0)),
                }
            blocks.append({
                "id": f"cloud-{len(blocks) + 1}",
                "text": clean[:500],
                "confidence": max(0.0, min(score, 1.0)),
                "box": box,
            })
    return blocks[:500]


class PaddleEngine:
    def __init__(self) -> None:
        self._engine = None
        self._lock = threading.Lock()

    def _load(self):
        if self._engine is None:
            from paddleocr import PaddleOCR

            self._engine = PaddleOCR(
                text_detection_model_name="PP-OCRv6_small_det",
                text_recognition_model_name="PP-OCRv6_small_rec",
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
                device="cpu",
                cpu_threads=4,
            )
        return self._engine

    def recognize(self, image: np.ndarray) -> list[dict]:
        # Paddle 推論物件不是設計給同一行程多執行緒同時使用。
        with self._lock:
            height, width = image.shape[:2]
            return normalize_results(list(self._load().predict(image)), width, height)


engine = PaddleEngine()
