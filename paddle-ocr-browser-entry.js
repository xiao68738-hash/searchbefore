import { PaddleOCR } from "@paddleocr/paddleocr-js";

const MODEL_VERSION = "PP-OCRv6-tiny";
const DETECTION_MODEL = "PP-OCRv6_tiny_det";
const RECOGNITION_MODEL = "PP-OCRv6_tiny_rec";
const RUNTIME_VERSION = "1.22.0";
const WASM_PATH = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${RUNTIME_VERSION}/dist/`;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_INPUT_SIDE = 1600;
let enginePromise = null;

function status(callback, message) {
  if (typeof callback === "function") callback(message);
}

function safeText(value) {
  return String(value == null ? "" : value).normalize("NFKC").trim().slice(0, 500);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizedBox(poly, width, height) {
  const points = Array.isArray(poly) ? poly : [];
  const xs = points.map((point) => Number(point && (point.x ?? point[0]))).filter(Number.isFinite);
  const ys = points.map((point) => Number(point && (point.y ?? point[1]))).filter(Number.isFinite);
  if (!xs.length || !ys.length) return null;
  return {
    left: clamp01(Math.min(...xs) / Math.max(1, width)),
    top: clamp01(Math.min(...ys) / Math.max(1, height)),
    right: clamp01(Math.max(...xs) / Math.max(1, width)),
    bottom: clamp01(Math.max(...ys) / Math.max(1, height))
  };
}

async function inspectImage(file) {
  const bitmap = await createImageBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  const scale = Math.min(1, 900 / Math.max(width, height));
  const sampleWidth = Math.max(1, Math.round(width * scale));
  const sampleHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("無法讀取照片內容");
  }
  context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
  bitmap.close();
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const step = Math.max(1, Math.floor(Math.min(sampleWidth, sampleHeight) / 260));
  let edge = 0;
  let edgeSamples = 0;
  const luminanceAt = (x, y) => {
    const offset = (y * sampleWidth + x) * 4;
    return (pixels[offset] * 299 + pixels[offset + 1] * 587 + pixels[offset + 2] * 114) / 1000;
  };
  for (let y = step; y < sampleHeight - step; y += step) {
    for (let x = step; x < sampleWidth - step; x += step) {
      const center = luminanceAt(x, y);
      const laplacian = Math.abs(
        4 * center
        - luminanceAt(x - step, y)
        - luminanceAt(x + step, y)
        - luminanceAt(x, y - step)
        - luminanceAt(x, y + step)
      );
      edge += Math.min(laplacian, 1020);
      edgeSamples += 1;
    }
  }
  return {
    width,
    height,
    documentCoverage: 1,
    sharpness: clamp01((edgeSamples ? edge / edgeSamples : 0) / 42),
    /* 瀏覽器版以使用者勾選確認反光與四角；自動閘門只判斷解析度與清晰度。 */
    glareRatio: 0,
    skewDegrees: 0,
    cornersDetected: true
  };
}

async function prepareImage(file, onStatus) {
  status(onStatus, "正在縮小照片，避免手機記憶體不足…");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_INPUT_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    bitmap.close();
    throw new Error("無法縮小照片，請改用較小的圖片檔案");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("照片縮小失敗")), "image/jpeg", 0.9);
  });
  canvas.width = 1;
  canvas.height = 1;
  return blob;
}

function validateFile(file) {
  if (!(file instanceof Blob)) throw new Error("請先選擇照片");
  if (!/^image\/(?:jpeg|png|webp)$/i.test(file.type || "")) {
    throw new Error("目前只支援 JPG、PNG 或 WebP 圖片");
  }
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    throw new Error("照片必須小於 20 MB");
  }
}

async function getEngine(onStatus) {
  if (!enginePromise) {
    status(onStatus, "第一次使用正在下載 PaddleOCR 模型，請保持網路連線…");
    enginePromise = PaddleOCR.create({
      textDetectionModelName: DETECTION_MODEL,
      textRecognitionModelName: RECOGNITION_MODEL,
      textDetectionBatchSize: 1,
      textRecognitionBatchSize: 1,
      ortOptions: {
        backend: "wasm",
        wasmPaths: WASM_PATH,
        numThreads: 1,
        simd: true,
        proxy: false
      }
    }).catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

async function recognize(file, options = {}) {
  validateFile(file);
  const onStatus = options.onStatus;
  const preparedFile = await prepareImage(file, onStatus);
  status(onStatus, "正在檢查照片清晰度…");
  const quality = await inspectImage(preparedFile);
  status(onStatus, "正在裝置內辨識文字，請勿關閉頁面…");
  const engine = await getEngine(onStatus);
  const results = await engine.predict(preparedFile, {
    textDetLimitSideLen: 1280,
    textDetLimitType: "max",
    textRecScoreThresh: 0.35
  });
  const result = results && results[0];
  if (!result) throw new Error("PaddleOCR 沒有回傳辨識結果");
  const width = Number(result.image && result.image.width) || quality.width;
  const height = Number(result.image && result.image.height) || quality.height;
  const blocks = (Array.isArray(result.items) ? result.items : []).slice(0, 500).map((item, index) => ({
    id: `paddle-${index + 1}`,
    text: safeText(item && item.text),
    confidence: clamp01(item && item.score),
    box: normalizedBox(item && item.poly, width, height)
  })).filter((item) => item.text);
  status(onStatus, blocks.length ? `辨識完成，共找到 ${blocks.length} 行文字` : "沒有辨識到文字，請重新拍攝");
  return {
    type: "PQC_OCR_SCAN_RESULT",
    protocolVersion: 1,
    requestId: `paddle-${Date.now()}`,
    createdAt: new Date().toISOString(),
    engine: `PaddleOCR.js ${MODEL_VERSION}`,
    quality,
    blocks,
    metrics: result.metrics || null,
    runtime: result.runtime || null
  };
}

globalThis.PQC_PADDLE_OCR = Object.freeze({
  MODEL_VERSION,
  DETECTION_MODEL,
  RECOGNITION_MODEL,
  RUNTIME_VERSION,
  MAX_FILE_BYTES,
  MAX_INPUT_SIDE,
  recognize
});
