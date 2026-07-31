package tw.searchbefore.ocrprototype;

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

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanner;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public class ScanActivity extends Activity {
    public static final String EXTRA_OCR_RESULT_JSON = "tw.searchbefore.extra.OCR_RESULT_JSON";
    private static final int REQUEST_SCAN = 2001;

    private ProgressBar progress;
    private TextView statusText;
    private Button scanButton;
    private final GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(false)
            .setPageLimit(1)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_scan);
        progress = findViewById(R.id.progress);
        statusText = findViewById(R.id.statusText);
        scanButton = findViewById(R.id.scanButton);
        scanButton.setOnClickListener(view -> startDocumentScanner());
    }

    private void startDocumentScanner() {
        setBusy(true, "正在開啟相機……");
        GmsDocumentScanner scanner = GmsDocumentScanning.getClient(options);
        scanner.getStartScanIntent(this)
                .addOnSuccessListener(intentSender -> {
                    try {
                        startIntentSenderForResult(intentSender, REQUEST_SCAN, null, 0, 0, 0);
                    } catch (Exception error) {
                        showError("無法開啟表單掃描：" + safeMessage(error));
                    }
                })
                .addOnFailureListener(error -> showError("無法啟動掃描器：" + safeMessage(error)));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_SCAN) return;
        if (resultCode != RESULT_OK || data == null) {
            setBusy(false, "已取消拍攝，沒有建立草稿。");
            return;
        }
        GmsDocumentScanningResult result = GmsDocumentScanningResult.fromActivityResultIntent(data);
        List<GmsDocumentScanningResult.Page> pages = result == null ? null : result.getPages();
        if (pages == null || pages.isEmpty()) {
            showError("掃描結果沒有照片，請重新拍攝。");
            return;
        }
        recognizePage(pages.get(0).getImageUri());
    }

    private void recognizePage(Uri imageUri) {
        setBusy(true, "照片處理中，正在辨識文字……");
        final Bitmap bitmap;
        final InputImage inputImage;
        try {
            inputImage = InputImage.fromFilePath(this, imageUri);
            try (InputStream stream = getContentResolver().openInputStream(imageUri)) {
                bitmap = BitmapFactory.decodeStream(stream);
            }
            if (bitmap == null) throw new IOException("無法讀取掃描影像");
        } catch (IOException error) {
            showError("無法讀取照片：" + safeMessage(error));
            return;
        }

        TextRecognizer recognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
        recognizer.process(inputImage)
                .addOnSuccessListener(text -> {
                    try {
                        JSONObject payload = buildPayload(text, bitmap);
                        String json = payload.toString();
                        statusText.setText(previewText(text, payload));
                        Intent resultIntent = new Intent();
                        resultIntent.putExtra(EXTRA_OCR_RESULT_JSON, json);
                        setResult(RESULT_OK, resultIntent);
                    } catch (JSONException error) {
                        showError("無法整理辨識結果：" + safeMessage(error));
                    }
                })
                .addOnFailureListener(error -> showError("文字辨識失敗：" + safeMessage(error)))
                .addOnCompleteListener(task -> {
                    recognizer.close();
                    bitmap.recycle();
                    setBusy(false, statusText.getText().toString());
                    try {
                        getContentResolver().delete(imageUri, null, null);
                    } catch (Exception ignored) {
                        // 掃描器提供的暫存 URI 可能不允許呼叫端刪除；本程式不另存副本。
                    }
                });
    }

    private JSONObject buildPayload(Text text, Bitmap bitmap) throws JSONException {
        JSONArray blocks = new JSONArray();
        int width = Math.max(1, bitmap.getWidth());
        int height = Math.max(1, bitmap.getHeight());
        int index = 0;
        for (Text.TextBlock block : text.getTextBlocks()) {
            JSONObject item = new JSONObject()
                    .put("id", "block-" + (++index))
                    .put("text", block.getText())
                    .put("confidence", 0.0);
            Rect rect = block.getBoundingBox();
            if (rect != null) {
                item.put("box", new JSONObject()
                        .put("left", clamp01((double) rect.left / width))
                        .put("top", clamp01((double) rect.top / height))
                        .put("right", clamp01((double) rect.right / width))
                        .put("bottom", clamp01((double) rect.bottom / height)));
            }
            blocks.put(item);
        }
        return new JSONObject()
                .put("type", "PQC_OCR_SCAN_RESULT")
                .put("protocolVersion", 1)
                .put("requestId", UUID.randomUUID().toString())
                .put("createdAt", Instant.now().toString())
                .put("quality", OcrQualityEstimator.estimate(bitmap))
                .put("blocks", blocks);
    }

    private String previewText(Text text, JSONObject payload) {
        String body = text.getText().trim();
        if (body.isEmpty()) body = "沒有辨識到文字，請確認照片是否清楚。";
        return "辨識完成（尚未儲存）\n\n" + body + "\n\n已建立安全草稿資料，可交給噴前查網頁端逐欄確認。\n資料大小：" + payload.toString().length() + " 字元";
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
        return message == null || message.trim().isEmpty() ? "未知錯誤" : message;
    }

    private double clamp01(double value) {
        return Math.max(0, Math.min(1, value));
    }
}
