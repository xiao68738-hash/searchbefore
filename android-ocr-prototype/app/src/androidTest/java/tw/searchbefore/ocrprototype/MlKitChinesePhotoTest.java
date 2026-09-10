package tw.searchbefore.ocrprototype;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.net.Uri;
import android.os.SystemClock;

import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileWriter;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
public final class MlKitChinesePhotoTest {
    @Test
    public void recognizeChineseTestPhotos() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        File inputDirectory = context.getExternalFilesDir("benchmark-input");
        File outputDirectory = context.getExternalFilesDir("benchmark-output");
        assertNotNull(inputDirectory);
        assertNotNull(outputDirectory);
        assertTrue(inputDirectory.isDirectory());
        assertTrue(outputDirectory.mkdirs() || outputDirectory.isDirectory());

        File[] images = inputDirectory.listFiles((directory, name) -> {
            String lower = name.toLowerCase(Locale.ROOT);
            return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png");
        });
        assertNotNull(images);
        assertTrue("No test photos found in " + inputDirectory, images.length > 0);
        Arrays.sort(images, Comparator.comparing(File::getName));

        TextRecognizer recognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
        try {
            for (File imageFile : images) {
                long startedAt = SystemClock.elapsedRealtime();
                JSONObject result = new JSONObject();
                result.put("schemaVersion", 1);
                result.put("sourceImage", imageFile.getName());
                result.put("engine", "Google ML Kit Chinese Text Recognition 16.0.1");
                try {
                    InputImage input = InputImage.fromFilePath(context, Uri.fromFile(imageFile));
                    Text text = Tasks.await(recognizer.process(input), 90, TimeUnit.SECONDS);
                    result.put("text", text.getText());
                    JSONArray lines = new JSONArray();
                    for (Text.TextBlock block : text.getTextBlocks()) {
                        for (Text.Line line : block.getLines()) {
                            JSONObject item = new JSONObject().put("text", line.getText());
                            if (line.getBoundingBox() != null) {
                                item.put("left", line.getBoundingBox().left);
                                item.put("top", line.getBoundingBox().top);
                                item.put("right", line.getBoundingBox().right);
                                item.put("bottom", line.getBoundingBox().bottom);
                            }
                            lines.put(item);
                        }
                    }
                    result.put("lines", lines);
                } catch (Exception error) {
                    result.put("text", "");
                    result.put("error", error.toString());
                }
                result.put("elapsedMs", SystemClock.elapsedRealtime() - startedAt);
                String baseName = imageFile.getName().replaceFirst("(?i)\\.(?:jpe?g|png)$", "");
                File outputFile = new File(outputDirectory, baseName + ".ml-kit-chinese.json");
                try (FileWriter writer = new FileWriter(outputFile, StandardCharsets.UTF_8)) {
                    writer.write(result.toString(2));
                    writer.write("\n");
                }
            }
        } finally {
            recognizer.close();
        }
    }
}
