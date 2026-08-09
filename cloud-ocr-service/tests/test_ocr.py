import io
import hashlib
from types import SimpleNamespace

from PIL import Image
from fastapi import HTTPException

from app.main import app, healthz, valid_request_id
from app.ocr import InvalidImage, decode_image, normalize_results
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
