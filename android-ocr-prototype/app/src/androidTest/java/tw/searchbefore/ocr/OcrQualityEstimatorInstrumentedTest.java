package tw.searchbefore.ocr;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;

import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class OcrQualityEstimatorInstrumentedTest {
    @Test
    public void whitePaperIsNotMistakenForGlareAndStackedPanelsAreOneDocument() throws Exception {
        Bitmap bitmap = Bitmap.createBitmap(1200, 1800, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.WHITE);
        Paint line = new Paint();
        line.setColor(Color.BLACK);
        line.setStrokeWidth(8f);

        for (int panel = 0; panel < 3; panel++) {
            int top = 100 + panel * 560;
            int bottom = top + 430;
            canvas.drawRect(100, top, 1100, bottom, line);
            for (int row = 1; row < 5; row++) canvas.drawLine(100, top + row * 80, 1100, top + row * 80, line);
            for (int column = 1; column < 4; column++) canvas.drawLine(100 + column * 250, top, 100 + column * 250, bottom, line);
        }

        JSONObject quality = OcrQualityEstimator.estimate(bitmap);
        assertTrue("content coverage should be measured from the form", quality.getDouble("documentCoverage") > 0.65);
        assertTrue("grid should provide enough contrast", quality.getDouble("contrastScore") > 0.2);
        assertTrue("grid should provide measurable ink", quality.getDouble("inkRatio") > 0.01);
        assertTrue("white paper must not be counted as specular glare", quality.getDouble("glareRatio") < 0.08);
        assertFalse("stacked sections on one form are not multiple documents", quality.getBoolean("multipleDocumentsDetected"));
        bitmap.recycle();
    }
}
