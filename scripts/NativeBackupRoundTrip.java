import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import org.json.JSONObject;
import tw.searchbefore.nativeapp.Backup;

/** Offline acceptance helper. Uses compiled app parser; never contacts Firebase or opens the app store. */
class NativeBackupRoundTrip {
    public static void main(String[] args) {
        try {
            if (args.length != 2) throw new IllegalArgumentException();
            Path input = Path.of(args[0]).toRealPath();
            Path output = Path.of(args[1]).toAbsolutePath().normalize();
            if (Files.size(input) > Backup.MAX_BYTES || input.equals(output)) throw new IllegalArgumentException();
            JSONObject data = Backup.INSTANCE.parse(Files.readAllBytes(input));
            byte[] encoded = Backup.INSTANCE.encode(data);
            if (!data.similar(Backup.INSTANCE.parse(encoded))) throw new IllegalStateException();
            // Never overwrite a previous acceptance artifact or the source backup.
            Files.write(output, encoded, StandardOpenOption.CREATE_NEW);
            for (String key : new String[]{"fieldPlots", "records", "farmRecords", "recipes"})
                System.out.println(key + ": " + data.getJSONArray(key).length());
            System.out.println("NATIVE_BACKUP_ROUNDTRIP_PASS (no record values logged)");
        } catch (Exception exception) {
            // Parser messages can contain private input. Do not print them or stack traces.
            System.err.println("NATIVE_BACKUP_ROUNDTRIP_FAILED (details suppressed)");
            System.exit(1);
        }
    }
}
