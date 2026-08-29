package tw.searchbefore.ocr;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;

import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanner;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class ScanActivity extends Activity {
    private static final int REQUEST_SCAN = 2001;

    private ProgressBar progress;
    private TextView statusText;
    private Button scanButton;
    private String requestId;
    private boolean standaloneMode;
    private final GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(false)
            .setPageLimit(1)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        standaloneMode = getIntent() == null || !getIntent().hasExtra(OcrContract.EXTRA_OCR_REQUEST_ID);
        requestId = OcrContract.requestIdFrom(getIntent());
        setContentView(R.layout.activity_scan);
        progress = findViewById(R.id.progress);
        statusText = findViewById(R.id.statusText);
        scanButton = findViewById(R.id.scanButton);
        scanButton.setOnClickListener(view -> startDocumentScanner());
    }

    private void startDocumentScanner() {
        setBusy(true, "正在開啟文件掃描器…");
        GmsDocumentScanner scanner = GmsDocumentScanning.getClient(options);
        scanner.getStartScanIntent(this)
                .addOnSuccessListener(intentSender -> {
                    try {
                        startIntentSenderForResult(intentSender, REQUEST_SCAN, null, 0, 0, 0);
                    } catch (Exception error) {
                        showError("無法開啟掃描器：" + safeMessage(error));
                    }
                })
                .addOnFailureListener(error -> showError("掃描器啟動失敗：" + safeMessage(error)));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_SCAN) return;
        if (resultCode != RESULT_OK || data == null) {
            if (standaloneMode) {
                setBusy(false, "已取消掃描；可以按下按鈕重新開始。");
                return;
            }
            setResult(RESULT_CANCELED);
            finish();
            return;
        }
        GmsDocumentScanningResult result = GmsDocumentScanningResult.fromActivityResultIntent(data);
        List<GmsDocumentScanningResult.Page> pages = result == null ? null : result.getPages();
        if (pages == null || pages.isEmpty()) {
            showError("掃描結果沒有影像，請重新拍攝。");
            return;
        }
        recognizePage(pages.get(0).getImageUri());
    }

    private void recognizePage(Uri imageUri) {
        setBusy(true, "影像只在裝置內進行繁中與數字雙模型辨識…");
        final Bitmap bitmap;
        try (InputStream stream = getContentResolver().openInputStream(imageUri)) {
            bitmap = BitmapFactory.decodeStream(stream);
            if (bitmap == null) throw new IOException("無法解碼掃描影像");
        } catch (IOException error) {
            showError("無法讀取掃描影像：" + safeMessage(error));
            return;
        }

        InputImage inputImage = InputImage.fromBitmap(bitmap, 0);
        TextRecognizer chineseRecognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
        TextRecognizer latinRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        Task<Text> chineseTask = chineseRecognizer.process(inputImage);
        Task<Text> latinTask = latinRecognizer.process(inputImage);

        Tasks.whenAllComplete(chineseTask, latinTask).addOnCompleteListener(ignored -> {
            boolean completedSuccessfully = false;
            try {
                Text chineseText = chineseTask.isSuccessful() ? chineseTask.getResult() : null;
                Text latinText = latinTask.isSuccessful() ? latinTask.getResult() : null;
                Text primaryText = chineseText != null ? chineseText : latinText;
                Text alternativeText = chineseText != null ? latinText : null;
                String primaryModel = chineseText != null ? "mlkit-chinese-16.0.1" : "mlkit-latin-16.0.1-fallback";
                String alternativeModel = alternativeText != null ? "mlkit-latin-16.0.1" : "";
                if (primaryText == null) {
                    Throwable failure = chineseTask.getException() != null ? chineseTask.getException() : latinTask.getException();
                    showError("OCR 辨識失敗：" + safeMessage(failure));
                } else {
                    JSONObject payload = buildPayload(primaryText, alternativeText, bitmap, primaryModel, alternativeModel);
                    statusText.setText(previewText(primaryText, payload));
                    Intent resultIntent = new Intent();
                    resultIntent.putExtra(OcrContract.EXTRA_OCR_RESULT_JSON, payload.toString());
                    setResult(RESULT_OK, resultIntent);
                    completedSuccessfully = true;
                }
            } catch (JSONException error) {
                showError("無法整理 OCR 辨識結果：" + safeMessage(error));
            } finally {
                chineseRecognizer.close();
                latinRecognizer.close();
                bitmap.recycle();
                setBusy(false, statusText.getText().toString());
                if (completedSuccessfully && standaloneMode) scanButton.setText("再掃描一張");
                try {
                    getContentResolver().delete(imageUri, null, null);
                } catch (Exception ignoredDeleteFailure) {
                    // Scanner temporary URI is best-effort deleted after both on-device recognizers finish.
                }
                if (completedSuccessfully && !standaloneMode) finish();
            }
        });
    }

    private JSONObject buildPayload(Text primaryText, Text alternativeText, Bitmap bitmap,
                                    String primaryModel, String alternativeModel) throws JSONException {
        int width = Math.max(1, bitmap.getWidth());
        int height = Math.max(1, bitmap.getHeight());
        JSONArray blocks = new JSONArray();
        JSONArray alternativeBlocks = new JSONArray();
        appendTextBlocks(blocks, primaryText, "block", width, height);
        appendTextBlocks(alternativeBlocks, alternativeText, "alternative", width, height);
        JSONObject consensus = recognitionConsensus(primaryText, alternativeText);
        JSONObject quality = OcrQualityEstimator.estimate(bitmap)
                .put("recognitionCompared", alternativeText != null)
                .put("recognitionTextAgreement", consensus.optDouble("textAgreement", 0))
                .put("recognitionDigitAgreement", consensus.optDouble("digitAgreement", 0))
                .put("recognitionNumericConflict", consensus.optBoolean("numericConflict", false));
        return new JSONObject()
                .put("type", OcrContract.MESSAGE_SCAN_RESULT)
                .put("protocolVersion", OcrContract.PROTOCOL_VERSION)
                .put("requestId", requestId)
                .put("createdAt", new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US).format(new Date()))
                .put("recognizer", primaryModel)
                .put("alternativeRecognizer", alternativeModel)
                .put("recognitionConsensus", consensus)
                .put("requiresReview", true)
                .put("autoCommitAllowed", false)
                .put("quality", quality)
                .put("blocks", blocks)
                .put("alternativeBlocks", alternativeBlocks);
    }

    private void appendTextBlocks(JSONArray destination, Text text, String idPrefix, int width, int height) throws JSONException {
        if (text == null) return;
        int blockIndex = 0;
        for (Text.TextBlock block : text.getTextBlocks()) {
            blockIndex++;
            int lineIndex = 0;
            for (Text.Line line : block.getLines()) {
                lineIndex++;
                JSONObject item = new JSONObject()
                        .put("id", idPrefix + "-" + blockIndex + "-line-" + lineIndex)
                        .put("text", line.getText())
                        .put("confidence", lineConfidence(line));
                addBox(item, line.getBoundingBox(), width, height);
                destination.put(item);
            }
            if (lineIndex == 0 && !block.getText().trim().isEmpty()) {
                JSONObject item = new JSONObject()
                        .put("id", idPrefix + "-" + blockIndex)
                        .put("text", block.getText())
                        .put("confidence", 0.0);
                addBox(item, block.getBoundingBox(), width, height);
                destination.put(item);
            }
        }
    }

    private void addBox(JSONObject item, Rect rect, int width, int height) throws JSONException {
        if (rect == null) return;
        item.put("box", new JSONObject()
                .put("left", clamp01((double) rect.left / width))
                .put("top", clamp01((double) rect.top / height))
                .put("right", clamp01((double) rect.right / width))
                .put("bottom", clamp01((double) rect.bottom / height)));
    }

    private double lineConfidence(Text.Line line) {
        Float confidence = line == null ? null : line.getConfidence();
        return confidence == null ? 0 : clamp01(confidence);
    }

    private JSONObject recognitionConsensus(Text primaryText, Text alternativeText) throws JSONException {
        String primary = primaryText == null ? "" : primaryText.getText();
        String alternative = alternativeText == null ? "" : alternativeText.getText();
        String primaryNormalized = normalizedForAgreement(primary);
        String alternativeNormalized = normalizedForAgreement(alternative);
        String primaryDigits = digitSignature(primary);
        String alternativeDigits = digitSignature(alternative);
        double textAgreement = similarity(primaryNormalized, alternativeNormalized);
        double digitAgreement = similarity(primaryDigits, alternativeDigits);
        boolean numericConflict = primaryDigits.length() >= 2
                && alternativeDigits.length() >= 2
                && digitAgreement < 0.6;
        return new JSONObject()
                .put("textAgreement", textAgreement)
                .put("digitAgreement", digitAgreement)
                .put("numericConflict", numericConflict)
                .put("primaryDigitCharacters", primaryDigits.length())
                .put("alternativeDigitCharacters", alternativeDigits.length());
    }

    private String normalizedForAgreement(String value) {
        String normalized = String.valueOf(value == null ? "" : value)
                .toLowerCase(Locale.ROOT)
                .replaceAll("[\\s\\p{Punct}，。；：、／－]+", "");
        return normalized.length() > 1200 ? normalized.substring(0, 1200) : normalized;
    }

    private String digitSignature(String value) {
        String normalized = String.valueOf(value == null ? "" : value).replaceAll("[^0-9./-]", "");
        return normalized.length() > 400 ? normalized.substring(0, 400) : normalized;
    }

    private double similarity(String left, String right) {
        if (left.isEmpty() && right.isEmpty()) return 1;
        if (left.isEmpty() || right.isEmpty()) return 0;
        int[] previous = new int[right.length() + 1];
        for (int i = 1; i <= left.length(); i++) {
            int[] current = new int[right.length() + 1];
            for (int j = 1; j <= right.length(); j++) {
                current[j] = left.charAt(i - 1) == right.charAt(j - 1)
                        ? previous[j - 1] + 1
                        : Math.max(previous[j], current[j - 1]);
            }
            previous = current;
        }
        return clamp01((double) previous[right.length()] / Math.max(left.length(), right.length()));
    }

    private String previewText(Text text, JSONObject payload) {
        String body = text.getText().trim();
        if (body.isEmpty()) body = "沒有辨識到文字，請確認照片清晰且表格已完整入鏡。";
        return "辨識完成（尚未儲存）\n\n"
                + qualityAdvice(payload, text)
                + "\n\n辨識原文：\n" + body
                + "\n\n請逐欄核對；任何候選都不會自動儲存。\n資料大小：" + payload.toString().length() + " 字元";
    }

    private String qualityAdvice(JSONObject payload, Text text) {
        JSONObject quality = payload.optJSONObject("quality");
        if (text.getTextBlocks().isEmpty()) return "⚠ 沒有可用文字，建議重新拍攝。";
        if (quality == null) return "⚠ 無法判斷照片品質，請人工確認。";
        double sharpness = quality.optDouble("sharpness", 0);
        double glareRatio = quality.optDouble("glareRatio", 1);
        double contrastScore = quality.optDouble("contrastScore", 0);
        if (quality.optBoolean("recognitionNumericConflict", false)) return "⚠ 兩個模型對數字判讀不一致，日期、數量與倍數請逐字核對。";
        if (sharpness < 0.35 && glareRatio > 0.18) return "⚠ 照片模糊且有局部反光，建議重新拍攝。";
        if (sharpness < 0.35) return "⚠ 照片偏模糊，請靠近並拿穩手機重新拍攝。";
        if (glareRatio > 0.18) return "⚠ 照片有局部反光，請調整角度或光線。";
        if (contrastScore < 0.25) return "⚠ 文字對比偏低，淡色筆跡可能漏字。";
        return "✓ 拍攝品質初步通過；仍須逐欄核對辨識結果。";
    }

    private void setBusy(boolean busy, String message) {
        progress.setVisibility(busy ? View.VISIBLE : View.GONE);
        scanButton.setEnabled(!busy);
        statusText.setText(message);
    }

    private void showError(String message) {
        setBusy(false, message);
        setResult(RESULT_CANCELED);
    }

    private String safeMessage(Throwable error) {
        String message = error == null ? "未知錯誤" : error.getMessage();
        if (message == null || message.trim().isEmpty()) return "未知錯誤";
        if (message.contains("Feature not available") && message.contains("Google Play services")) {
            return "此裝置尚未提供文件掃描元件；請更新 Google Play 服務後再試。";
        }
        return message;
    }

    private double clamp01(double value) {
        return Math.max(0, Math.min(1, value));
    }
}
