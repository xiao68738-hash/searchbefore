import java.nio.*;
import java.util.zip.ZipFile;
class InspectNativeElf {
    public static void main(String[] args) throws Exception {
        try (var zip = new ZipFile(args[0])) {
            for (var entries = zip.entries(); entries.hasMoreElements();) {
                var e = entries.nextElement();
                if (!e.getName().endsWith(".so") || !(e.getName().contains("arm64-v8a") || e.getName().contains("x86_64"))) continue;
                byte[] bytes; try (var s = zip.getInputStream(e)) { bytes = s.readAllBytes(); }
                var b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
                if (b.get(4) != 2) throw new IllegalArgumentException("Not ELF64");
                int stride = Short.toUnsignedInt(b.getShort(54)), count = Short.toUnsignedInt(b.getShort(56));
                System.out.println(e.getName());
                for (int i = 0; i < count; i++) {
                    int h = Math.toIntExact(b.getLong(32) + (long)stride*i), type = b.getInt(h);
                    if (type == 1 || type == 0x6474e552)
                        System.out.printf("  %s start=%x mem=%x end=%x alignment=%x flags=%x%n",type==1?"LOAD":"RELRO",b.getLong(h+16),b.getLong(h+40),b.getLong(h+16)+b.getLong(h+40),b.getLong(h+48),b.getInt(h+4));
                }
            }
        }
    }
}
