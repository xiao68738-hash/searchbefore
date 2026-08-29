package tw.searchbefore.ocr;

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
        long darkPixels = 0;
        long luminanceSum = 0;
        double luminanceSquaredSum = 0;
        double edgeEnergy = 0;
        long edgeSamples = 0;
        int sampledRows = Math.max(1, (height - (2 * sampleStep) + sampleStep - 1) / sampleStep);
        int sampledColumns = Math.max(1, (width - (2 * sampleStep) + sampleStep - 1) / sampleStep);
        int[] rowDarkPixels = new int[sampledRows];
        int[] columnDarkPixels = new int[sampledColumns];
        int minContentX = width;
        int minContentY = height;
        int maxContentX = -1;
        int maxContentY = -1;

        int rowIndex = 0;
        for (int y = sampleStep; y < height - sampleStep; y += sampleStep, rowIndex++) {
            int columnIndex = 0;
            for (int x = sampleStep; x < width - sampleStep; x += sampleStep, columnIndex++) {
                int center = luminance(bitmap.getPixel(x, y));
                int left = luminance(bitmap.getPixel(x - sampleStep, y));
                int right = luminance(bitmap.getPixel(x + sampleStep, y));
                int up = luminance(bitmap.getPixel(x, y - sampleStep));
                int down = luminance(bitmap.getPixel(x, y + sampleStep));
                int laplacian = Math.abs((4 * center) - left - right - up - down);
                edgeEnergy += Math.min(laplacian, 1020);
                edgeSamples++;
                luminanceSum += center;
                luminanceSquaredSum += (double) center * center;
                int neighborMean = (left + right + up + down) / 4;
                if (center >= 253 && neighborMean < 242) glarePixels++;
                if (center < 225) {
                    darkPixels++;
                    rowDarkPixels[rowIndex]++;
                    columnDarkPixels[columnIndex]++;
                    minContentX = Math.min(minContentX, x);
                    minContentY = Math.min(minContentY, y);
                    maxContentX = Math.max(maxContentX, x);
                    maxContentY = Math.max(maxContentY, y);
                }
                sampled++;
            }
        }

        double averageEdge = edgeSamples == 0 ? 0 : edgeEnergy / edgeSamples;
        double sharpness = clamp(averageEdge / 42.0);
        double glareRatio = sampled == 0 ? 1 : (double) glarePixels / sampled;
        double meanLuminance = sampled == 0 ? 0 : (double) luminanceSum / sampled;
        double luminanceVariance = sampled == 0 ? 0 : Math.max(0, (luminanceSquaredSum / sampled) - (meanLuminance * meanLuminance));
        double contrastScore = clamp(Math.sqrt(luminanceVariance) / 55.0);
        double inkRatio = sampled == 0 ? 0 : (double) darkPixels / sampled;
        double contentBoundsArea = maxContentX < minContentX || maxContentY < minContentY
                ? 0
                : ((double) (maxContentX - minContentX + sampleStep) * (maxContentY - minContentY + sampleStep)) / ((double) width * height);
        double documentCoverage = clamp(contentBoundsArea / 0.78);
        int horizontalRegions = countContentRegions(rowDarkPixels, sampledColumns);
        int verticalRegions = countContentRegions(columnDarkPixels, sampledRows);
        int contentRegionCount = Math.max(horizontalRegions, verticalRegions);
        boolean multipleDocumentsDetected = horizontalRegions > 1 && verticalRegions > 1;

        return new JSONObject()
                .put("width", width)
                .put("height", height)
                .put("documentCoverage", documentCoverage)
                .put("sharpness", sharpness)
                .put("glareRatio", glareRatio)
                .put("contrastScore", contrastScore)
                .put("inkRatio", inkRatio)
                .put("meanLuminance", meanLuminance / 255.0)
                .put("skewDegrees", 0)
                .put("contentRegionCount", contentRegionCount)
                .put("horizontalContentRegions", horizontalRegions)
                .put("verticalContentRegions", verticalRegions)
                .put("multipleDocumentsDetected", multipleDocumentsDetected)
                .put("cornersDetected", true);
    }

    private static int countContentRegions(int[] darkCounts, int perpendicularSamples) {
        if (darkCounts.length == 0 || perpendicularSamples <= 0) return 0;
        int activeThreshold = Math.max(2, (int) Math.ceil(perpendicularSamples * 0.025));
        int minimumRegionLength = Math.max(2, (int) Math.ceil(darkCounts.length * 0.12));
        int minimumBlankGap = Math.max(2, (int) Math.ceil(darkCounts.length * 0.08));
        int regions = 0;
        int runStart = -1;
        int blankRun = 0;

        for (int index = 0; index <= darkCounts.length; index++) {
            boolean active = index < darkCounts.length && darkCounts[index] >= activeThreshold;
            if (active) {
                if (runStart < 0) runStart = index;
                blankRun = 0;
                continue;
            }
            if (runStart < 0) continue;
            blankRun++;
            boolean closesRegion = blankRun >= minimumBlankGap || index == darkCounts.length;
            if (!closesRegion) continue;
            int runEnd = index - blankRun + 1;
            if (runEnd - runStart >= minimumRegionLength) regions++;
            runStart = -1;
            blankRun = 0;
        }
        return regions;
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
