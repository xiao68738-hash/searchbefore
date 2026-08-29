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
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileWriter;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;
import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
public final class MlKitTextCropBenchmarkTest {
    @Test
    public void recognizeAllBenchmarkCrops() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        File inputDirectory = context.getExternalFilesDir("benchmark-input");
        File outputDirectory = context.getExternalFilesDir("benchmark-output");
        assertNotNull(inputDirectory);
        assertNotNull(outputDirectory);
        assertTrue("Missing benchmark input directory: " + inputDirectory, inputDirectory.isDirectory());
        assertTrue(outputDirectory.mkdirs() || outputDirectory.isDirectory());

        File[] images = inputDirectory.listFiles((directory, name) -> name.toLowerCase().endsWith(".png"));
        assertNotNull(images);
        assertTrue("No PNG benchmark crops found in " + inputDirectory, images.length > 0);
        Arrays.sort(images, Comparator.comparing(File::getName));

        TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        try {
            for (File imageFile : images) {
                long startedAt = SystemClock.elapsedRealtime();
                JSONObject result = new JSONObject();
                result.put("schemaVersion", 1);
                result.put("sourceImage", imageFile.getName());
                result.put("engine", "Google ML Kit Text Recognition Latin 16.0.1");
                result.put("language", "Latin script");
                try {
                    InputImage input = InputImage.fromFilePath(context, Uri.fromFile(imageFile));
                    Text text = Tasks.await(recognizer.process(input), 60, TimeUnit.SECONDS);
                    result.put("text", text.getText());
                } catch (Exception error) {
                    result.put("text", "");
                    result.put("error", error.toString());
                }
                result.put("elapsedMs", SystemClock.elapsedRealtime() - startedAt);
                String baseName = imageFile.getName().substring(0, imageFile.getName().length() - 4);
                File outputFile = new File(outputDirectory, baseName + ".ml-kit.json");
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
