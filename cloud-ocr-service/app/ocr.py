import io
from dataclasses import dataclass
from statistics import median
from typing import Any, Iterable

from PIL import Image, ImageOps, UnidentifiedImageError


ALLOWED_MIME_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
MAX_PIXELS = 24_000_000
MAX_PARAGRAPHS = 500
MAX_WORDS_PER_PARAGRAPH = 200
MAX_TOTAL_WORDS = 5_000
MAX_WORD_TEXT_LENGTH = 128
MAX_CANDIDATE_ROWS = 250
MAX_CANDIDATE_CELLS = 1_000
MAX_CANDIDATE_WORDS = 2_500
MAX_WORDS_PER_CANDIDATE_ROW = 100
MAX_CELLS_PER_CANDIDATE_ROW = 20
MAX_CANDIDATE_ROW_TEXT_LENGTH = 500
MAX_CANDIDATE_CELL_TEXT_LENGTH = 250

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


def _valid_normalized_box(box: Any) -> bool:
    if not isinstance(box, dict):
        return False
    try:
        left = float(box["left"])
        top = float(box["top"])
        right = float(box["right"])
        bottom = float(box["bottom"])
    except (KeyError, TypeError, ValueError):
        return False
    return 0.0 <= left < right <= 1.0 and 0.0 <= top < bottom <= 1.0


def _union_boxes(boxes: Iterable[dict]) -> dict | None:
    valid = [box for box in boxes if _valid_normalized_box(box)]
    if not valid:
        return None
    return {
        "left": min(float(box["left"]) for box in valid),
        "top": min(float(box["top"]) for box in valid),
        "right": max(float(box["right"]) for box in valid),
        "bottom": max(float(box["bottom"]) for box in valid),
    }


def _mean_confidence(words: list[dict]) -> float:
    if not words:
        return 0.0
    return round(sum(_confidence(word.get("confidence", 0.0)) for word in words) / len(words), 4)


def _is_same_row(row_box: dict, word_box: dict) -> bool:
    overlap = max(0.0, min(row_box["bottom"], word_box["bottom"]) - max(row_box["top"], word_box["top"]))
    row_height = max(row_box["bottom"] - row_box["top"], 0.0001)
    word_height = max(word_box["bottom"] - word_box["top"], 0.0001)
    overlap_ratio = overlap / min(row_height, word_height)
    row_center = (row_box["top"] + row_box["bottom"]) / 2
    word_center = (word_box["top"] + word_box["bottom"]) / 2
    center_tolerance = max(0.006, min(row_height, word_height) * 0.65)
    return overlap_ratio >= 0.35 or abs(row_center - word_center) <= center_tolerance


def _split_cell_candidates(words: list[dict]) -> list[list[dict]]:
    if not words:
        return []
    ordered = sorted(words, key=lambda item: (item["box"]["left"], item["box"]["top"]))
    heights = [item["box"]["bottom"] - item["box"]["top"] for item in ordered]
    gap_threshold = max(0.02, min(0.12, median(heights) * 1.5))
    cells: list[list[dict]] = [[ordered[0]]]
    for word in ordered[1:]:
        previous = cells[-1][-1]
        gap = word["box"]["left"] - previous["box"]["right"]
        previous_break = previous.get("detectedBreak")
        break_type = previous_break.get("type") if isinstance(previous_break, dict) else None
        if gap > gap_threshold or break_type in {"EOL_SURE_SPACE", "LINE_BREAK"}:
            cells.append([word])
        else:
            cells[-1].append(word)
    return cells


def _assign_page_regions(words: list[dict], image_width: int, image_height: int) -> None:
    """寬幅照片若中央有明顯裝訂溝，分成左右來源區，避免把兩頁同高文字當成同一列。"""
    for word in words:
        word["source"]["regionIndex"] = 0
    if image_width < max(image_height, 1) * 1.2 or len(words) < 4:
        return
    left_words = [word for word in words if (word["box"]["left"] + word["box"]["right"]) / 2 < 0.5]
    right_words = [word for word in words if (word["box"]["left"] + word["box"]["right"]) / 2 >= 0.5]
    minimum_side_words = max(2, round(len(words) * 0.15))
    if len(left_words) < minimum_side_words or len(right_words) < minimum_side_words:
        return
    left_edge = max(word["box"]["right"] for word in left_words)
    right_edge = min(word["box"]["left"] for word in right_words)
    if right_edge - left_edge < 0.015:
        return
    split_at = (left_edge + right_edge) / 2
    for word in words:
        center = (word["box"]["left"] + word["box"]["right"]) / 2
        word["source"]["regionIndex"] = 0 if center < split_at else 1


def build_row_candidates(blocks: list[dict], image_width: int = 1, image_height: int = 1) -> dict:
    """依單字幾何位置產生列／格候選；不推論欄位名稱、資料類型或業務語意。"""
    flattened: list[dict] = []
    truncated = False
    for block in blocks:
        source = block.get("source") if isinstance(block.get("source"), dict) else {}
        for word_index, word in enumerate(block.get("words") or []):
            if len(flattened) >= MAX_CANDIDATE_WORDS:
                truncated = True
                break
            box = word.get("box") if isinstance(word, dict) else None
            if not _valid_normalized_box(box):
                continue
            flattened.append({
                "id": str(word.get("id") or f"candidate-word-{len(flattened) + 1}"),
                "text": str(word.get("text") or "")[:MAX_WORD_TEXT_LENGTH],
                "confidence": _confidence(word.get("confidence", 0.0)),
                "box": dict(box),
                "detectedBreak": word.get("detectedBreak"),
                "source": {
                    "pageIndex": int(source.get("pageIndex", 0) or 0),
                    "blockIndex": int(source.get("blockIndex", 0) or 0),
                    "paragraphIndex": int(source.get("paragraphIndex", 0) or 0),
                    "wordIndex": word_index,
                },
            })
        if truncated:
            break

    grouped_by_page: dict[int, list[dict]] = {}
    for word in flattened:
        grouped_by_page.setdefault(word["source"]["pageIndex"], []).append(word)
    for page_words in grouped_by_page.values():
        _assign_page_regions(page_words, image_width, image_height)

    grouped_rows: list[dict] = []
    for page_index in sorted(grouped_by_page):
        region_indexes = sorted({word["source"]["regionIndex"] for word in grouped_by_page[page_index]})
        for region_index in region_indexes:
            page_rows: list[dict] = []
            ordered_words = sorted(
                [word for word in grouped_by_page[page_index] if word["source"]["regionIndex"] == region_index],
                key=lambda item: (
                    (item["box"]["top"] + item["box"]["bottom"]) / 2,
                    item["box"]["left"],
                ),
            )
            for word in ordered_words:
                matching_rows = [row for row in page_rows if _is_same_row(row["box"], word["box"])]
                if matching_rows:
                    row = min(
                        matching_rows,
                        key=lambda item: abs(
                            ((item["box"]["top"] + item["box"]["bottom"]) / 2)
                            - ((word["box"]["top"] + word["box"]["bottom"]) / 2)
                        ),
                    )
                    row["words"].append(word)
                    row["box"] = _union_boxes([row["box"], word["box"]]) or row["box"]
                else:
                    page_rows.append({
                        "pageIndex": page_index,
                        "regionIndex": region_index,
                        "box": dict(word["box"]),
                        "words": [word],
                    })
            page_rows.sort(key=lambda item: (item["box"]["top"], item["box"]["left"]))
            grouped_rows.extend(page_rows)

    if len(grouped_rows) > MAX_CANDIDATE_ROWS:
        truncated = True
    rows: list[dict] = []
    total_cells = 0
    page_row_counts: dict[tuple[int, int], int] = {}
    for grouped_row in grouped_rows[:MAX_CANDIDATE_ROWS]:
        page_index = grouped_row["pageIndex"]
        region_index = grouped_row["regionIndex"]
        row_key = (page_index, region_index)
        page_row_counts[row_key] = page_row_counts.get(row_key, 0) + 1
        row_id = f"candidate-row-p{page_index + 1}-r{region_index + 1}-{page_row_counts[row_key]}"
        ordered_words = sorted(grouped_row["words"], key=lambda item: (item["box"]["left"], item["box"]["top"]))
        if len(ordered_words) > MAX_WORDS_PER_CANDIDATE_ROW:
            truncated = True
        row_words = ordered_words[:MAX_WORDS_PER_CANDIDATE_ROW]
        raw_cells = _split_cell_candidates(row_words)
        available_cells = max(0, min(MAX_CELLS_PER_CANDIDATE_ROW, MAX_CANDIDATE_CELLS - total_cells))
        if len(raw_cells) > available_cells:
            truncated = True
        cell_candidates: list[dict] = []
        for cell_index, cell_words in enumerate(raw_cells[:available_cells]):
            cell_candidates.append({
                "id": f"{row_id}-c{cell_index + 1}",
                "box": _union_boxes(word["box"] for word in cell_words),
                "text": " ".join(word["text"] for word in cell_words).strip()[:MAX_CANDIDATE_CELL_TEXT_LENGTH],
                "confidence": _mean_confidence(cell_words),
                "wordIds": [word["id"] for word in cell_words],
            })
        total_cells += len(cell_candidates)
        rows.append({
            "id": row_id,
            "source": {"pageIndex": page_index, "regionIndex": region_index},
            "box": _union_boxes(word["box"] for word in row_words),
            "text": " ".join(word["text"] for word in row_words).strip()[:MAX_CANDIDATE_ROW_TEXT_LENGTH],
            "confidence": _mean_confidence(row_words),
            "words": row_words,
            "wordsTruncated": len(ordered_words) > len(row_words),
            "cellCandidates": cell_candidates,
            "cellsTruncated": len(raw_cells) > len(cell_candidates),
        })

    return {
        "method": "geometry-only",
        "semanticInference": False,
        "rows": rows,
        "truncated": truncated,
    }


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
