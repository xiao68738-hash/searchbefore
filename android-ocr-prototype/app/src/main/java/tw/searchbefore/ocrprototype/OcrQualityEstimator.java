package tw.searchbefore.ocrprototype;

import android.graphics.Bitmap;

import org.json.JSONException;
import org.json.JSONObject;

final class OcrQualityEstimator {
    private OcrQualityEstimator() {}

    static JSONObject estimate(Bitmap bitmap) throws JSONException {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int sampleStep = Math.max(1, Math.min(width, height) / 320);
        long sampled = 0;
        long glarePixels = 0;
        double edgeEnergy = 0;
        long edgeSamples = 0;

        for (int y = sampleStep; y < height - sampleStep; y += sampleStep) {
            for (int x = sampleStep; x < width - sampleStep; x += sampleStep) {
                int center = luminance(bitmap.getPixel(x, y));
                int left = luminance(bitmap.getPixel(x - sampleStep, y));
                int right = luminance(bitmap.getPixel(x + sampleStep, y));
                int up = luminance(bitmap.getPixel(x, y - sampleStep));
                int down = luminance(bitmap.getPixel(x, y + sampleStep));
                int laplacian = Math.abs((4 * center) - left - right - up - down);
                edgeEnergy += Math.min(laplacian, 1020);
                edgeSamples++;
                if (center >= 247) glarePixels++;
                sampled++;
            }
        }

        double averageEdge = edgeSamples == 0 ? 0 : edgeEnergy / edgeSamples;
        double sharpness = clamp(averageEdge / 42.0);
        double glareRatio = sampled == 0 ? 1 : (double) glarePixels / sampled;

        return new JSONObject()
                .put("width", width)
                .put("height", height)
                .put("documentCoverage", 1.0)
                .put("sharpness", sharpness)
                .put("glareRatio", glareRatio)
                .put("skewDegrees", 0)
                .put("cornersDetected", true);
    }

    private static int luminance(int color) {
        int red = (color >> 16) & 0xff;
        int green = (color >> 8) & 0xff;
        int blue = color & 0xff;
        return (red * 299 + green * 587 + blue * 114) / 1000;
    }

    private static double clamp(double value) {
        return Math.max(0, Math.min(1, value));
    }
}
