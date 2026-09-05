import com.android.apksig.ApkVerifier;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.util.HexFormat;
import java.util.List;

/** Checks the verified certificate bytes, never apksigner's human-readable output. */
class VerifyApkSigning {
    private static void checkCertificate(X509Certificate certificate, String expected) throws Exception {
        String actual = HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded()));
        System.out.println("Verified APK certificate SHA-256: " + actual);
        if (!actual.equals(expected)) {
            throw new SecurityException("APK certificate mismatch: expected " + expected + ", got " + actual);
        }
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("Expected APK and certificate pin paths");
        String expected = Files.readString(Path.of(args[1])).trim().toLowerCase(java.util.Locale.ROOT);
        if (!expected.matches("[0-9a-f]{64}")) throw new SecurityException("Invalid certificate pin");
        ApkVerifier.Result result = new ApkVerifier.Builder(new File(args[0])).build().verify();
        if (!result.isVerified()) {
            throw new SecurityException("APK cryptographic verification failed: " + result.getErrors());
        }
        List<X509Certificate> certificates = result.getSignerCertificates();
        if (certificates.size() != 1) {
            throw new SecurityException("Expected one APK signer, got " + certificates.size());
        }
        checkCertificate(certificates.get(0), expected);
        // All Android versions must see our permanent key, including any v3.1 SDK ranges.
        for (var signer : result.getV2SchemeSigners()) checkCertificate(signer.getCertificate(), expected);
        for (var signer : result.getV3SchemeSigners()) checkCertificate(signer.getCertificate(), expected);
        for (var signer : result.getV31SchemeSigners()) checkCertificate(signer.getCertificate(), expected);
        System.out.println("APK cryptographic signature and permanent certificate: OK");
    }
}
