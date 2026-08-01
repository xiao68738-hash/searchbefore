package tw.searchbefore.ocr;

import android.content.Context;
import android.content.Intent;

import java.util.UUID;

/** Stable message and Activity contract shared by the standalone tester and the formal TWA host. */
public final class OcrContract {
    public static final int PROTOCOL_VERSION = 1;
    public static final String MESSAGE_SCAN_REQUEST = "PQC_OCR_SCAN_REQUEST";
    public static final String MESSAGE_SCAN_RESULT = "PQC_OCR_SCAN_RESULT";
    public static final String MESSAGE_WEB_READY = "PQC_OCR_WEB_READY";
    public static final String EXTRA_OCR_REQUEST_ID = "tw.searchbefore.extra.OCR_REQUEST_ID";
    public static final String EXTRA_OCR_RESULT_JSON = "tw.searchbefore.extra.OCR_RESULT_JSON";

    private OcrContract() {}

    public static Intent createScanIntent(Context context, String requestId) {
        return new Intent(context, ScanActivity.class).putExtra(EXTRA_OCR_REQUEST_ID, requestId);
    }

    public static String resultJsonFrom(Intent intent) {
        return intent == null ? null : intent.getStringExtra(EXTRA_OCR_RESULT_JSON);
    }

    static String requestIdFrom(Intent intent) {
        String requestId = intent == null ? null : intent.getStringExtra(EXTRA_OCR_REQUEST_ID);
        if (requestId == null || requestId.trim().isEmpty() || requestId.length() > 128) {
            return UUID.randomUUID().toString();
        }
        return requestId;
    }
}
