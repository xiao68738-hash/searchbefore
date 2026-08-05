import hashlib
import hmac
import os
import re
import threading
import time
from collections import defaultdict, deque
from typing import Iterable

from fastapi import HTTPException, Request
from firebase_admin import auth, get_app, initialize_app


DEFAULT_ORIGINS = ("https://searchbefore.tw", "https://www.searchbefore.tw")
TEST_CODE_HEADER = "x-ocr-test-code"
SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")


class UserRateLimiter:
    def __init__(self, limit: int = 10, window_seconds: int = 60) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, user_id: str, now: float | None = None) -> bool:
        current = time.monotonic() if now is None else now
        cutoff = current - self.window_seconds
        with self._lock:
            events = self._events[user_id]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self.limit:
                return False
            events.append(current)
            return True


rate_limiter = UserRateLimiter(
    limit=int(os.getenv("OCR_REQUESTS_PER_MINUTE", "10")),
    window_seconds=60,
)


def allowed_origins() -> tuple[str, ...]:
    raw = os.getenv("ALLOWED_ORIGINS", ",".join(DEFAULT_ORIGINS))
    origins = tuple(item.strip().rstrip("/") for item in raw.split(",") if item.strip())
    if not origins or any(not item.startswith("https://") for item in origins):
        raise RuntimeError("ALLOWED_ORIGINS 必須至少包含一個 HTTPS 網址")
    return origins


def origin_is_allowed(origin: str | None, allowlist: Iterable[str]) -> bool:
    return bool(origin and origin.rstrip("/") in set(allowlist))


def ensure_firebase_app() -> None:
    try:
        get_app()
    except ValueError:
        initialize_app()


def configured_test_code_hash() -> str:
    value = os.getenv("OCR_TEST_CODE_SHA256", "").strip().lower()
    if not SHA256_PATTERN.fullmatch(value):
        raise RuntimeError("OCR_TEST_CODE_SHA256 必須設定為 64 字元 SHA-256 雜湊")
    return value


def matches_test_code(value: str | None, expected_hash: str) -> bool:
    candidate = str(value or "")
    if not candidate or len(candidate) > 128 or not SHA256_PATTERN.fullmatch(expected_hash):
        return False
    actual_hash = hashlib.sha256(candidate.encode("utf-8")).hexdigest()
    return hmac.compare_digest(actual_hash, expected_hash)


async def verify_request(request: Request) -> dict:
    if not origin_is_allowed(request.headers.get("origin"), request.app.state.allowed_origins):
        raise HTTPException(status_code=403, detail="不允許的網站來源")
    authorization = request.headers.get("authorization", "")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="請先使用 Google 帳號登入")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="登入權杖遺失")
    try:
        claims = auth.verify_id_token(token, check_revoked=True)
        user_id = str(claims.get("uid") or claims.get("sub") or "")
        if not user_id or not rate_limiter.allow(user_id):
            raise HTTPException(status_code=429, detail="操作太頻繁，請稍候一分鐘再試")
        expected_hash = str(getattr(request.app.state, "ocr_test_code_sha256", ""))
        if not expected_hash:
            raise HTTPException(status_code=503, detail="OCR 測試驗證尚未完成設定")
        if not matches_test_code(request.headers.get(TEST_CODE_HEADER), expected_hash):
            raise HTTPException(status_code=403, detail="OCR 測試驗證碼不正確，請重新輸入")
        return claims
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="登入狀態已失效，請重新登入") from exc
