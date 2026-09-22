import java.io.StringReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Element;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;
import org.xml.sax.helpers.DefaultHandler;

/** Project-specific regression policy for the generated manifest, not a security certification. */
class VerifyNativeManifest {
    static final String ANDROID = "http://schemas.android.com/apk/res/android";
    static final String PACKAGE = "tw.searchbefore.app";
    static final String MAIN = "tw.searchbefore.nativeapp.MainActivity";
    static final String JOB = "tw.searchbefore.nativeapp.ReminderJob";
    static final String IDP = "com.google.firebase.auth.internal.GenericIdpActivity";
    static final String CAPTCHA = "com.google.firebase.auth.internal.RecaptchaActivity";
    static final Map<String, String> EXPORTED = Map.of(
        "activity:" + MAIN, "",
        "activity:" + IDP, "",
        "activity:" + CAPTCHA, "",
        "service:" + JOB, "android.permission.BIND_JOB_SERVICE",
        "service:com.google.android.gms.auth.api.signin.RevocationBoundService",
            "com.google.android.gms.auth.api.signin.permission.REVOCATION_NOTIFICATION",
        "receiver:androidx.profileinstaller.ProfileInstallReceiver", "android.permission.DUMP"
    );
    static final Set<String> DEBUG_ONLY = Set.of(
        "activity:androidx.compose.ui.tooling.PreviewActivity", "activity:androidx.activity.ComponentActivity");
    static String a(Element e, String name) { return e.getAttributeNS(ANDROID, name); }
    static void require(boolean pass, String message) {
        if (!pass) throw new SecurityException(message);
    }
    static List<Element> children(Element parent, String tag) {
        var result = new ArrayList<Element>();
        for (var n = parent.getFirstChild(); n != null; n = n.getNextSibling())
            if (n instanceof Element e && (tag == null || e.getTagName().equals(tag))) result.add(e);
        return result;
    }
    static Element one(Element parent, String tag) {
        var found = children(parent, tag);
        require(found.size() == 1, "Expected exactly one " + tag);
        return found.get(0);
    }
    static Element parse(String xml) throws Exception {
        var factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        var builder = factory.newDocumentBuilder();
        builder.setErrorHandler(new DefaultHandler() {
            @Override public void error(SAXParseException e) throws SAXException { throw e; }
            @Override public void fatalError(SAXParseException e) throws SAXException { throw e; }
        });
        return builder.parse(new InputSource(new StringReader(xml))).getDocumentElement();
    }
    static Set<String> names(Element parent, String tag) {
        var names = new HashSet<String>();
        for (var e : children(parent, tag)) require(names.add(a(e, "name")), "Duplicate " + tag);
        return names;
    }
    static void authLink(Element component, String scheme) {
        var filter = one(component, "intent-filter");
        require(names(filter, "action").equals(Set.of("android.intent.action.VIEW")), "Unexpected auth action");
        require(names(filter, "category").equals(Set.of("android.intent.category.DEFAULT", "android.intent.category.BROWSABLE")), "Unexpected auth categories");
        var data = one(filter, "data");
        require(a(data, "scheme").equals(scheme) && a(data, "host").equals("firebase.auth") && a(data, "path").equals("/"), "Changed auth callback scope");
        // Additional URI match attributes require a separate review, even with the original path retained.
        require(data.getAttributes().getLength() == 3, "Additional auth URI attributes");
    }
    static void verify(String xml, boolean debug) throws Exception {
        var root = parse(xml);
        require(root.getTagName().equals("manifest"), "Not an Android manifest");
        String pkg = PACKAGE + (debug ? ".nativepreview" : "");
        require(root.getAttribute("package").equals(pkg), "Wrong variant package");
        var sdk = one(root, "uses-sdk");
        require(a(sdk, "minSdkVersion").equals("24") && a(sdk, "targetSdkVersion").equals("36"), "SDK policy changed; review compatibility first");
        var permissions = new HashSet<String>();
        for (var e : children(root, null)) {
            if (e.getTagName().startsWith("uses-permission")) {
                require(e.getTagName().equals("uses-permission"), "New SDK-qualified permission requires review");
                require(permissions.add(a(e, "name")), "Duplicate permission");
            }
        }
        require(permissions.equals(Set.of("android.permission.INTERNET", "android.permission.POST_NOTIFICATIONS",
            "android.permission.RECEIVE_BOOT_COMPLETED", "android.permission.ACCESS_NETWORK_STATE",
            "com.google.android.providers.gsf.permission.READ_GSERVICES", pkg + ".DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION")), "Permission baseline changed; review before release");
        var permission = one(root, "permission");
        require(a(permission, "name").equals(pkg + ".DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION") &&
            // PermissionInfo.PROTECTION_SIGNATURE = 2. bundletool renders the compiled
            // enum as 0x00000002; do not accept other bases or extra privilege flags.
            Set.of("signature", "2", "0x00000002").contains(a(permission, "protectionLevel")),
            "Dynamic receiver permission must remain signature-only");
        var app = one(root, "application");
        for (String flag : List.of("allowBackup", "fullBackupContent", "usesCleartextTraffic"))
            require(a(app, flag).equals("false"), flag + " must remain explicitly false");
        require(a(app, "dataExtractionRules").equals("@xml/data_extraction_rules"), "Backup rules reference changed");
        require(a(app, "networkSecurityConfig").isEmpty(), "New network configuration requires review; it can override cleartext policy");
        require(a(app, "testOnly").isEmpty() || a(app, "testOnly").equals("false"), "Test-only build cannot pass this gate");
        require(debug ? a(app, "debuggable").equals("true") : Set.of("", "false").contains(a(app, "debuggable")), "Wrong debuggable mode");
        require(children(app, "profileable").isEmpty(), "New profileable release surface requires review");
        var seen = new HashSet<String>();
        var exported = new HashSet<String>();
        for (var component : children(app, null)) {
            if (!Set.of("activity", "activity-alias", "service", "receiver", "provider").contains(component.getTagName())) continue;
            String name = a(component, "name");
            require(!name.isBlank(), "Unnamed component");
            String key = component.getTagName() + ":" + name;
            require(seen.add(key), "Duplicate component");
            if (!debug) require(!DEBUG_ONLY.contains(key), "Debug tooling must not enter release, even if not exported");
            require(Set.of("true", "false").contains(a(component, "exported")), "Component must explicitly declare exported: " + key);
            if (!a(component, "exported").equals("true")) continue;
            exported.add(key);
            if (debug && DEBUG_ONLY.contains(key)) continue;
            require(EXPORTED.containsKey(key), "Unreviewed exported component: " + key);
            require(a(component, "permission").equals(EXPORTED.get(key)), "Changed exported-component protection: " + key);
            if (name.equals(IDP)) authLink(component, "genericidp");
            if (name.equals(CAPTCHA)) authLink(component, "recaptcha");
            if (name.equals(MAIN)) {
                var filter = one(component, "intent-filter");
                require(names(filter, "action").equals(Set.of("android.intent.action.MAIN")) &&
                    names(filter, "category").equals(Set.of("android.intent.category.LAUNCHER")) && children(filter, "data").isEmpty(), "Launcher must not gain an unreviewed deep link");
            }
        }
        require(exported.containsAll(EXPORTED.keySet()), "Expected entry point missing or changed");
    }
    static String fixture() {
        return """
            <manifest xmlns:android="http://schemas.android.com/apk/res/android" package="tw.searchbefore.app">
              <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/>
              <uses-permission android:name="android.permission.INTERNET"/>
              <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
              <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
              <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
              <uses-permission android:name="com.google.android.providers.gsf.permission.READ_GSERVICES"/>
              <uses-permission android:name="tw.searchbefore.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"/>
              <permission android:name="tw.searchbefore.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" android:protectionLevel="signature"/>
              <application android:allowBackup="false" android:fullBackupContent="false" android:usesCleartextTraffic="false" android:dataExtractionRules="@xml/data_extraction_rules">
                <activity android:name="tw.searchbefore.nativeapp.MainActivity" android:exported="true">
                  <intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>
                </activity>
                <service android:name="tw.searchbefore.nativeapp.ReminderJob" android:exported="true" android:permission="android.permission.BIND_JOB_SERVICE"/>
                <service android:name="com.google.android.gms.auth.api.signin.RevocationBoundService" android:exported="true" android:permission="com.google.android.gms.auth.api.signin.permission.REVOCATION_NOTIFICATION"/>
                <receiver android:name="androidx.profileinstaller.ProfileInstallReceiver" android:exported="true" android:permission="android.permission.DUMP"/>
                <provider android:name="example.Private" android:exported="false"/>
                <activity android:name="com.google.firebase.auth.internal.GenericIdpActivity" android:exported="true">
                  <intent-filter><action android:name="android.intent.action.VIEW"/><category android:name="android.intent.category.DEFAULT"/><category android:name="android.intent.category.BROWSABLE"/><data android:scheme="genericidp" android:host="firebase.auth" android:path="/"/></intent-filter>
                </activity>
                <activity android:name="com.google.firebase.auth.internal.RecaptchaActivity" android:exported="true">
                  <intent-filter><action android:name="android.intent.action.VIEW"/><category android:name="android.intent.category.DEFAULT"/><category android:name="android.intent.category.BROWSABLE"/><data android:scheme="recaptcha" android:host="firebase.auth" android:path="/"/></intent-filter>
                </activity>
              </application>
            </manifest>
            """;
    }
    static void selfTest() throws Exception {
        String good = fixture();
        verify(good, false);
        for (String level : List.of("2", "0x00000002"))
            verify(good.replace("android:protectionLevel=\"signature\"", "android:protectionLevel=\"" + level + "\""), false);
        String debug = good.replace(PACKAGE, PACKAGE + ".nativepreview").replace("<application ", "<application android:debuggable=\"true\" ");
        verify(debug.replace("</application>", "<activity android:name=\"androidx.compose.ui.tooling.PreviewActivity\" android:exported=\"true\"/></application>"), true);
        var bad = List.of(
            good.replace("android:allowBackup=\"false\"", "android:allowBackup=\"true\""),
            good.replace("android:fullBackupContent=\"false\"", ""),
            good.replace("android:usesCleartextTraffic=\"false\"", "android:usesCleartextTraffic=\"true\""),
            good.replace("@xml/data_extraction_rules", "@xml/other"),
            good.replace("<application ", "<application android:networkSecurityConfig=\"@xml/other\" "),
            good.replace("<application ", "<application android:debuggable=\"true\" "),
            good.replace("<application ", "<application android:testOnly=\"true\" "),
            good.replace("</application>", "<profileable android:shell=\"true\"/></application>"),
            good.replace("android:targetSdkVersion=\"36\"", "android:targetSdkVersion=\"35\""),
            good.replace("android:minSdkVersion=\"24\"", "android:minSdkVersion=\"23\""),
            good.replace("</manifest>", "<uses-permission android:name=\"android.permission.CAMERA\"/></manifest>"),
            good.replace("</manifest>", "<uses-permission-sdk-23 android:name=\"android.permission.CAMERA\"/></manifest>"),
            good.replace("android:protectionLevel=\"signature\"", "android:protectionLevel=\"normal\""),
            good.replace("android:protectionLevel=\"signature\"", "android:protectionLevel=\"0x00000000\""),
            good.replace("android:protectionLevel=\"signature\"", "android:protectionLevel=\"0x00000001\""),
            good.replace("android:protectionLevel=\"signature\"", "android:protectionLevel=\"0x00000012\""),
            good.replace("android:protectionLevel=\"signature\"", "android:protectionLevel=\"signature|privileged\""),
            good.replace("android:permission=\"android.permission.BIND_JOB_SERVICE\"", ""),
            good.replace("android:permission=\"android.permission.DUMP\"", "android:permission=\"android.permission.INTERNET\""),
            good.replace("android:permission=\"com.google.android.gms.auth.api.signin.permission.REVOCATION_NOTIFICATION\"", ""),
            good.replace("android:name=\"example.Private\" android:exported=\"false\"", "android:name=\"example.Private\" android:exported=\"true\""),
            good.replace("android:exported=\"false\"", ""),
            good.replace("</application>", "<activity-alias android:name=\"example.Bypass\" android:exported=\"true\"/></application>"),
            good.replace("</application>", "<activity android:name=\"androidx.compose.ui.tooling.PreviewActivity\" android:exported=\"false\"/></application>"),
            good.replace("android:host=\"firebase.auth\"", "android:host=\"*\""),
            good.replace("android:path=\"/\"", "android:pathPrefix=\"/\""),
            good.replace("android:scheme=\"genericidp\"", "android:scheme=\"https\""),
            good.replace("android.intent.action.MAIN", "android.intent.action.VIEW"),
            good.replace("<application ", "<application/><application "),
            good.replace("<uses-sdk ", "<uses-sdk/><uses-sdk "),
            good.replace("</manifest>", "<uses-permission android:name=\"android.permission.INTERNET\"/></manifest>"),
            good.replace(PACKAGE, "other.app"),
            "<!DOCTYPE manifest [<!ENTITY x SYSTEM 'file:///must-not-read'>]>" + good,
            good.substring(0, good.length() / 2)
        );
        for (int i = 0; i < bad.size(); i++) {
            boolean rejected = false;
            try { verify(bad.get(i), false); } catch (SecurityException | SAXException expected) { rejected = true; }
            require(rejected, "Negative manifest test did not fail: " + i);
        }
        boolean variantRejected = false;
        try { verify(debug, false); } catch (SecurityException expected) { variantRejected = true; }
        require(variantRejected, "Debug must not be accepted as release");
        System.out.println("PASS: 4 valid manifests and " + (bad.size() + 1) + " rejected unsafe/malformed/variant fixtures.");
    }
    public static void main(String[] args) throws Exception {
        if (args.length == 1 && args[0].equals("--self-test")) { selfTest(); return; }
        if (args.length != 2 || !Set.of("debug", "release").contains(args[0]))
            throw new IllegalArgumentException("Usage: VerifyNativeManifest.java debug|release generated-manifest.xml OR --self-test");
        Path source = Path.of(args[1]);
        require(Files.size(source) <= 1024 * 1024, "Manifest exceeds expected size");
        verify(Files.readString(source), args[0].equals("debug"));
        System.out.println("PASS: " + args[0] + " generated manifest permission/component/backup/network baseline. Not a runtime or Play acceptance test.");
    }
}
