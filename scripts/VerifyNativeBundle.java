import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.jar.JarFile;

/** Read-only verification of our AAB. No keystore, credentials or user records are read. */
class VerifyNativeBundle {
    record Segment(long start, long end, int flags) {}
    // Android rounds RELRO to whole pages. Reject protection of writable/executable
    // bytes outside RELRO, not harmless padding after an entirely protected LOAD.
    // Source: platform/bionic/linker/linker_phdr.cpp, _phdr_table_set_gnu_relro_prot.
    static boolean safeRelro(java.util.List<Segment> loads, Segment relro) {
        long first = relro.start & ~16383L, last = Math.addExact(relro.end, 16383) & ~16383L;
        for (var load : loads) {
            if ((load.flags & 3) == 0) continue;
            if (Math.max(load.start, first) < Math.min(Math.min(load.end, relro.start), last) ||
                Math.max(Math.max(load.start, relro.end), first) < Math.min(load.end, last)) return false;
        }
        return true;
    }
    static void selfTest() {
        var whole = new Segment(0x5100,0x5400,6);
        var relro = new Segment(0x5100,0x6000,4);
        if (!safeRelro(java.util.List.of(whole,new Segment(0x9400,0x9401,6)),relro)) throw new AssertionError("whole LOAD/padding false positive");
        if (safeRelro(java.util.List.of(new Segment(0x5100,0x6800,6)),relro)) throw new AssertionError("unprotected RW suffix");
        if (safeRelro(java.util.List.of(new Segment(0x4f00,0x5400,6)),relro)) throw new AssertionError("unprotected RW prefix");
        if (safeRelro(java.util.List.of(whole,new Segment(0x7000,0x7100,6)),relro)) throw new AssertionError("adjacent RW overlap");
        if (safeRelro(java.util.List.of(whole,new Segment(0x7000,0x7100,5)),relro)) throw new AssertionError("adjacent executable overlap");
        if (!safeRelro(java.util.List.of(new Segment(0x4000,0x9000,6)),new Segment(0x4000,0x8000,4))) throw new AssertionError("aligned prefix false positive");
        System.out.println("PASS: 6 synthetic RELRO boundary checks (including unsafe prefixes/suffixes and adjacent pages).");
    }
    public static void main(String[] args) throws Exception {
        selfTest();
        if (args.length == 1 && args[0].equals("--self-test")) return;
        if (args.length != 1) throw new IllegalArgumentException("Supply the candidate AAB path");
        String expected = "d749133d6c22aabb0e48654a424652f45dbf9220c2c586813a9347cda7bf2fbe";
        int signed = 0, elf64 = 0;
        var names = new HashSet<String>();
        var alignmentIssues = new java.util.ArrayList<String>();
        try (var jar = new JarFile(args[0], true)) {
            var entries = jar.entries();
            while (entries.hasMoreElements()) {
                var entry = entries.nextElement();
                String name = entry.getName();
                if (!names.add(name)) throw new SecurityException("Duplicate bundle entry");
                if (entry.isDirectory()) continue;
                // Reading every byte forces JarFile's signature/digest validation.
                byte[] bytes;
                try (var stream = jar.getInputStream(entry)) { bytes = stream.readAllBytes(); }
                if (!name.startsWith("META-INF/")) {
                    var signers = entry.getCodeSigners();
                    if (signers == null || signers.length != 1) throw new SecurityException("Missing or multiple bundle signers");
                    var cert = (X509Certificate) signers[0].getSignerCertPath().getCertificates().get(0);
                    cert.checkValidity();
                    String fingerprint = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(cert.getEncoded()));
                    if (!expected.equals(fingerprint)) throw new SecurityException("Unexpected upload signer");
                    signed++;
                }
                if ((name.startsWith("base/lib/arm64-v8a/") || name.startsWith("base/lib/x86_64/")) && name.endsWith(".so")) {
                    var b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
                    if (b.getInt(0) != 0x464c457f || b.get(4) != 2 || b.get(5) != 1) throw new SecurityException("Unsupported ELF header");
                    long offset = b.getLong(32);
                    int stride = Short.toUnsignedInt(b.getShort(54)), count = Short.toUnsignedInt(b.getShort(56));
                    if (stride < 56 || offset < 0 || offset + (long) stride * count > bytes.length) throw new SecurityException("Invalid ELF program headers");
                    var loads = new java.util.ArrayList<Segment>();
                    var relros = new java.util.ArrayList<Segment>();
                    for (int i = 0; i < count; i++) {
                        int header = Math.toIntExact(offset + (long) stride * i);
                        if (b.getInt(header) == 1) {
                            long align = b.getLong(header + 48);
                            if (align < 16384 || (align & (align - 1)) != 0 ||
                                Math.floorMod(b.getLong(header + 8) - b.getLong(header + 16), 16384) != 0)
                                throw new SecurityException("64-bit library is not 16-KB load aligned");
                        }
                        var segment = new Segment(b.getLong(header+16),Math.addExact(b.getLong(header+16),b.getLong(header+40)),b.getInt(header+4));
                        if (b.getInt(header) == 1) loads.add(segment);
                        if (b.getInt(header) == 0x6474e552) relros.add(segment);
                    }
                    if (loads.isEmpty()) throw new SecurityException("Missing ELF load segments");
                    for (var relro : relros) if (!safeRelro(loads,relro)) alignmentIssues.add("16-KB RELRO protection overlaps writable/executable bytes: " + name);
                    elf64++;
                }
            }
        }
        if (signed == 0 || elf64 == 0) throw new SecurityException("Incomplete native bundle");
        if (!alignmentIssues.isEmpty()) throw new SecurityException(String.join("\n", alignmentIssues));
        System.out.printf("PASS: %d signed payload entries, expected upload certificate, %d 64-bit libraries with 16-KB LOAD alignment and safe RELRO page boundaries.%n", signed, elf64);
        System.out.println("Not a Play-install/login check; APK ZIP alignment and Play acceptance remain separate.");
    }
}
