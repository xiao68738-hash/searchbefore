import io
import hashlib
from types import SimpleNamespace

from PIL import Image
from fastapi import HTTPException

from app.main import valid_request_id
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

    def word(text):
        return SimpleNamespace(symbols=[SimpleNamespace(text=char) for char in text])

    paragraph = SimpleNamespace(
        words=[word("文字一"), word("文字二")],
        confidence=0.91,
        bounding_box=SimpleNamespace(vertices=[vertex(1, 1), vertex(90, 1), vertex(90, 20), vertex(1, 20)]),
    )
    annotation = SimpleNamespace(pages=[SimpleNamespace(blocks=[SimpleNamespace(paragraphs=[paragraph])])])
    blocks = normalize_results(annotation, 100, 100)
    assert blocks[0]["text"] == "文字一 文字二"
    assert blocks[0]["confidence"] == 0.91
    assert blocks[0]["box"]["left"] == 0.01


def test_request_id_is_bounded_and_safe():
    assert valid_request_id("cloud-1234-abcd") == "cloud-1234-abcd"
    for value in ("", "contains space", "<script>", "a" * 129):
        try:
            valid_request_id(value)
            assert False
        except HTTPException as exc:
            assert exc.status_code == 422
