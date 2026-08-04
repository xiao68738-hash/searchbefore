import asyncio
import os
import time
import uuid

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .ocr import InvalidImage, decode_image, engine
from .security import allowed_origins, ensure_firebase_app, verify_request


MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(12 * 1024 * 1024)))
OCR_TIMEOUT_SECONDS = int(os.getenv("OCR_TIMEOUT_SECONDS", "45"))
origins = allowed_origins()

app = FastAPI(title="SearchBefore Cloud OCR", docs_url=None, redoc_url=None, openapi_url=None)
app.state.allowed_origins = origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(origins),
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=3600,
)


@app.on_event("startup")
def startup() -> None:
    ensure_firebase_app()


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict:
    return {"status": "ok"}


@app.post("/v1/ocr")
async def recognize(
    request: Request,
    image: UploadFile = File(...),
    _claims: dict = Depends(verify_request),
) -> dict:
    started = time.monotonic()
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
            asyncio.to_thread(engine.recognize, decoded.pixels),
            timeout=OCR_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="辨識逾時，請稍後再試") from exc
    if not blocks:
        raise HTTPException(status_code=422, detail="沒有辨識到文字，請重新拍攝較清楚的照片")
    return {
        "type": "PQC_OCR_SCAN_RESULT",
        "protocolVersion": 1,
        "requestId": f"cloud-{uuid.uuid4().hex}",
        "createdAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "engine": "PaddleOCR 3.7 / PP-OCRv6-small (Cloud Run)",
        "source": "cloud-paddleocr",
        "quality": {
            "width": decoded.width,
            "height": decoded.height,
            "cornersDetected": True,
            "assessment": "user-confirmed-before-upload",
        },
        "blocks": blocks,
        "processingMs": round((time.monotonic() - started) * 1000),
        "retention": "not-stored",
    }
