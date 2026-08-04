import io

from PIL import Image
from fastapi import HTTPException

from app.main import valid_request_id
from app.ocr import InvalidImage, decode_image, normalize_results
from app.security import DEFAULT_ORIGINS, UserRateLimiter, origin_is_allowed


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


def test_decode_rejects_wrong_type_and_low_resolution():
    try:
        decode_image(sample_image(), "application/pdf")
        assert False
    except InvalidImage:
        pass
    try:
        decode_image(sample_image(320, 320), "image/jpeg")
        assert False
    except InvalidImage:
        pass


def test_normalize_results_limits_and_shapes_output():
    result = {"rec_texts": [" 文字一 ", "文字二"], "rec_scores": [0.91, 2], "rec_polys": [[[0, 0]], [[1, 1]]]}
    blocks = normalize_results([result], 100, 100)
    assert blocks[0]["text"] == "文字一"
    assert blocks[0]["confidence"] == 0.91
    assert blocks[1]["confidence"] == 1.0
    assert blocks[1]["box"]["left"] == 0.01


def test_request_id_is_bounded_and_safe():
    assert valid_request_id("cloud-1234-abcd") == "cloud-1234-abcd"
    for value in ("", "contains space", "<script>", "a" * 129):
        try:
            valid_request_id(value)
            assert False
        except HTTPException as exc:
            assert exc.status_code == 422
