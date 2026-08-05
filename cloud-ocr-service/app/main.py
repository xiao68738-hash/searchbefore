import asyncio
import re
import os
import time
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .ocr import InvalidImage, decode_image, engine
from .security import allowed_origins, configured_test_code_hash, ensure_firebase_app, verify_request


MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(12 * 1024 * 1024)))
OCR_TIMEOUT_SECONDS = int(os.getenv("OCR_TIMEOUT_SECONDS", "45"))
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
origins = allowed_origins()

app = FastAPI(title="SearchBefore Cloud OCR", docs_url=None, redoc_url=None, openapi_url=None)
app.state.allowed_origins = origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(origins),
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-OCR-Test-Code"],
    max_age=3600,
)


@app.on_event("startup")
def startup() -> None:
    ensure_firebase_app()
    app.state.ocr_test_code_sha256 = configured_test_code_hash()


@app.get("/v1/health", include_in_schema=False)
@app.get("/healthz", include_in_schema=False)
def healthz() -> dict:
    return {"status": "ok"}


def valid_request_id(value: str) -> str:
    request_id = str(value or "").strip()
    if not REQUEST_ID_PATTERN.fullmatch(request_id):
        raise HTTPException(status_code=422, detail="請求識別碼格式不正確")
    return request_id


@app.post("/v1/ocr")
async def recognize(
    request: Request,
    image: UploadFile = File(...),
    request_id: str = Form(...),
    _claims: dict = Depends(verify_request),
) -> dict:
    started = time.monotonic()
    safe_request_id = valid_request_id(request_id)
    content_type = (image.content_type or "").lower()
    data = await image.read(MAX_UPLOAD_BYTES + 1)
    await image.close()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="照片超過 12 MB，請改用較小的原始照片")
    try:
        decoded = decode_image(data, content_type)
    except InvalidImage as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        # 不寫入磁碟；離開請求後釋放原始檔位元組參照。
        data = b""
    try:
        blocks = await asyncio.wait_for(
            asyncio.to_thread(engine.recognize, decoded.content, decoded.width, decoded.height),
            timeout=OCR_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="辨識逾時，請稍後再試") from exc
    if not blocks:
        raise HTTPException(status_code=422, detail="沒有辨識到文字，請重新拍攝較清楚的照片")
    return {
        "type": "PQC_OCR_SCAN_RESULT",
        "protocolVersion": 1,
        "requestId": safe_request_id,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "engine": "Google Cloud Vision DOCUMENT_TEXT_DETECTION",
        "source": "google-cloud-vision",
        "quality": {
            "width": decoded.width,
            "height": decoded.height,
            "cornersDetected": False,
            "cornersConfirmedByUser": True,
            "assessment": "user-confirmed-before-upload",
        },
        "blocks": blocks,
        "processingMs": round((time.monotonic() - started) * 1000),
        "retention": "not-stored",
    }
