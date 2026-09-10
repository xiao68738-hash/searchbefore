import io
import hashlib
from types import SimpleNamespace

from PIL import Image
from fastapi import HTTPException

from app.main import app, healthz, valid_request_id
from app.ocr import InvalidImage, build_row_candidates, decode_image, normalize_results
from app.security import DEFAULT_ORIGINS, UserRateLimiter, matches_test_code, origin_is_allowed


def sample_image(width=800, height=800):
    output = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(output, format="JPEG")
    return output.getvalue()


def test_origin_allowlist_is_exact():
    assert origin_is_allowed("https://searchbefore.tw", DEFAULT_ORIGINS)
    assert not origin_is_allowed("https://searchbefore.tw.example.com", DEFAULT_ORIGINS)
    assert not origin_is_allowed(None, DEFAULT_ORIGINS)


def test_rate_limiter_is_per_user_and_windowed():
    limiter = UserRateLimiter(limit=2, window_seconds=60)
    assert limiter.allow("farmer-a", 100)
    assert limiter.allow("farmer-a", 101)
    assert not limiter.allow("farmer-a", 102)
    assert limiter.allow("farmer-b", 102)
    assert limiter.allow("farmer-a", 161)


def test_staging_code_is_checked_by_hash_without_storing_plaintext():
    expected = hashlib.sha256(b"temporary-test-code").hexdigest()
    assert matches_test_code("temporary-test-code", expected)
    assert not matches_test_code("wrong-code", expected)
    assert not matches_test_code("", expected)
    assert not matches_test_code("temporary-test-code", "invalid")


def test_decode_rejects_wrong_type_and_low_resolution():
    for data, content_type in ((sample_image(), "application/pdf"), (sample_image(320, 320), "image/jpeg")):
        try:
            decode_image(data, content_type)
            assert False
        except InvalidImage:
            pass


def test_decode_strips_original_metadata_and_reencodes():
    decoded = decode_image(sample_image(), "image/jpeg")
    assert decoded.width == 800
    assert decoded.height == 800
    assert decoded.content.startswith(b"\xff\xd8")


def test_normalize_results_limits_and_shapes_output():
    def vertex(x, y):
        return SimpleNamespace(x=x, y=y)

    detected_break = SimpleNamespace(type_=5, is_prefix=False)

    def word(text, left, right, confidence, with_break=False):
        symbols = [SimpleNamespace(text=char, property=None) for char in text]
        if with_break:
            symbols[-1].property = SimpleNamespace(detected_break=detected_break)
        return SimpleNamespace(
            symbols=symbols,
            confidence=confidence,
            bounding_box=SimpleNamespace(vertices=[vertex(left, 1), vertex(right, 1), vertex(right, 20), vertex(left, 20)]),
        )

    paragraph = SimpleNamespace(
        words=[word("文字一", 1, 40, 0.95), word("文字二", 45, 90, 0.89, with_break=True)],
        confidence=0.91,
        bounding_box=SimpleNamespace(vertices=[vertex(1, 1), vertex(90, 1), vertex(90, 20), vertex(1, 20)]),
    )
    parent_block = SimpleNamespace(
        paragraphs=[paragraph],
        bounding_box=SimpleNamespace(vertices=[vertex(0, 0), vertex(95, 0), vertex(95, 25), vertex(0, 25)]),
    )
    annotation = SimpleNamespace(pages=[SimpleNamespace(width=100, height=100, blocks=[parent_block])])
    blocks = normalize_results(annotation, 100, 100)
    assert blocks[0]["text"] == "文字一 文字二"
    assert blocks[0]["confidence"] == 0.91
    assert blocks[0]["box"]["left"] == 0.01
    assert blocks[0]["source"] == {"pageIndex": 0, "blockIndex": 0, "paragraphIndex": 0}
    assert blocks[0]["blockBox"]["right"] == 0.95
    assert blocks[0]["words"][0]["text"] == "文字一"
    assert blocks[0]["words"][0]["confidence"] == 0.95
    assert blocks[0]["words"][0]["box"]["right"] == 0.4
    assert blocks[0]["words"][1]["detectedBreak"] == {"type": "LINE_BREAK", "isPrefix": False}
    assert blocks[0]["wordsTruncated"] is False


def test_normalize_results_caps_word_geometry_without_dropping_legacy_text():
    def symbol(char):
        return SimpleNamespace(text=char, property=None)

    words = [
        SimpleNamespace(symbols=[symbol("字")], confidence=0.8, bounding_box=SimpleNamespace(vertices=[]))
        for _ in range(205)
    ]
    paragraph = SimpleNamespace(words=words, confidence=0.8, bounding_box=SimpleNamespace(vertices=[]))
    annotation = SimpleNamespace(pages=[SimpleNamespace(width=100, height=100, blocks=[SimpleNamespace(paragraphs=[paragraph], bounding_box=None)])])
    block = normalize_results(annotation, 100, 100)[0]
    assert block["text"].startswith("字 字")
    assert len(block["words"]) == 200
    assert block["wordsTruncated"] is True


def candidate_word(word_id, text, left, top, right, bottom, confidence=0.9, break_type=None):
    return {
        "id": word_id,
        "text": text,
        "confidence": confidence,
        "box": {"left": left, "top": top, "right": right, "bottom": bottom},
        "detectedBreak": {"type": break_type, "isPrefix": False} if break_type else None,
    }


def test_row_candidates_group_by_y_then_split_cells_by_horizontal_gaps():
    blocks = [
        {
            "source": {"pageIndex": 0, "blockIndex": 2, "paragraphIndex": 3},
            "words": [
                candidate_word("w1", "日期", 0.05, 0.10, 0.12, 0.13, 0.95),
                candidate_word("w2", "購入量", 0.30, 0.10, 0.40, 0.13, 0.90),
                candidate_word("w3", "15包", 0.70, 0.10, 0.76, 0.13, 0.85),
                candidate_word("w4", "次列", 0.05, 0.20, 0.12, 0.23, 0.80),
            ],
        }
    ]
    result = build_row_candidates(blocks, 1000, 1000)
    assert result["method"] == "geometry-only"
    assert result["semanticInference"] is False
    assert result["truncated"] is False
    assert len(result["rows"]) == 2
    first_row = result["rows"][0]
    assert first_row["source"] == {"pageIndex": 0, "regionIndex": 0}
    assert first_row["text"] == "日期 購入量 15包"
    assert len(first_row["cellCandidates"]) == 3
    assert first_row["cellCandidates"][1]["text"] == "購入量"
    assert first_row["cellCandidates"][1]["wordIds"] == ["w2"]
    assert first_row["words"][0]["source"] == {
        "pageIndex": 0,
        "blockIndex": 2,
        "paragraphIndex": 3,
        "wordIndex": 0,
        "regionIndex": 0,
    }


def test_wide_two_page_photo_does_not_merge_left_and_right_rows():
    blocks = [
        {
            "source": {"pageIndex": 0, "blockIndex": 0, "paragraphIndex": 0},
            "words": [
                candidate_word("left-1", "左頁", 0.05, 0.10, 0.14, 0.14),
                candidate_word("left-2", "紀錄", 0.20, 0.10, 0.28, 0.14),
            ],
        },
        {
            "source": {"pageIndex": 0, "blockIndex": 1, "paragraphIndex": 0},
            "words": [
                candidate_word("right-1", "右頁", 0.65, 0.10, 0.74, 0.14),
                candidate_word("right-2", "紀錄", 0.80, 0.10, 0.88, 0.14),
            ],
        },
    ]
    rows = build_row_candidates(blocks, 2000, 1000)["rows"]
    assert len(rows) == 2
    assert {row["source"]["regionIndex"] for row in rows} == {0, 1}
    assert {row["text"] for row in rows} == {"左頁 紀錄", "右頁 紀錄"}


def test_detected_line_break_starts_a_new_cell_candidate_even_with_small_gap():
    blocks = [{
        "source": {"pageIndex": 0, "blockIndex": 0, "paragraphIndex": 0},
        "words": [
            candidate_word("w1", "前格", 0.10, 0.10, 0.20, 0.14, break_type="LINE_BREAK"),
            candidate_word("w2", "後格", 0.21, 0.10, 0.31, 0.14),
        ],
    }]
    row = build_row_candidates(blocks, 1000, 1000)["rows"][0]
    assert [cell["text"] for cell in row["cellCandidates"]] == ["前格", "後格"]


def test_row_candidates_have_strict_row_and_word_limits():
    many_pages = []
    for page_index in range(251):
        many_pages.append({
            "source": {"pageIndex": page_index, "blockIndex": 0, "paragraphIndex": 0},
            "words": [candidate_word(f"page-{page_index}", "字", 0.1, 0.1, 0.2, 0.2)],
        })
    limited = build_row_candidates(many_pages, 1000, 1000)
    assert len(limited["rows"]) == 250
    assert limited["truncated"] is True

    crowded = [{
        "source": {"pageIndex": 0, "blockIndex": 0, "paragraphIndex": 0},
        "words": [candidate_word(f"w-{index}", "字", 0.1, 0.1, 0.2, 0.2) for index in range(105)],
    }]
    crowded_row = build_row_candidates(crowded, 1000, 1000)
    assert len(crowded_row["rows"][0]["words"]) == 100
    assert crowded_row["rows"][0]["wordsTruncated"] is True
    assert crowded_row["truncated"] is True


def test_request_id_is_bounded_and_safe():
    assert valid_request_id("cloud-1234-abcd") == "cloud-1234-abcd"
    for value in ("", "contains space", "<script>", "a" * 129):
        try:
            valid_request_id(value)
            assert False
        except HTTPException as exc:
            assert exc.status_code == 422


def test_health_check_is_available_on_versioned_path():
    routes = {route.path: getattr(route, "methods", set()) for route in app.routes}
    assert "/v1/health" in routes
    assert "GET" in routes["/v1/health"]
    assert healthz() == {"status": "ok"}
