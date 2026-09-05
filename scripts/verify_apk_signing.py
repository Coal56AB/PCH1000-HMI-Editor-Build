#!/usr/bin/env python3
"""Verify APK integrity and pinned certificate through Android's apksig API."""
import os
from pathlib import Path
import re
import subprocess
import sys


def main():
    repo = Path(__file__).resolve().parents[1]
    if len(sys.argv) not in (1, 3):
        raise SystemExit('Usage: verify_apk_signing.py [APK CERTIFICATE_PIN]')
    apk, pin = (map(Path, sys.argv[1:]) if len(sys.argv) == 3 else (
        repo / 'app/build/outputs/apk/release/app-release.apk',
        repo / 'signing-certificate.sha256'))
    sdk_path = os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
    if not sdk_path:
        raise SystemExit('Android SDK is unavailable')
    jars = [p for p in (Path(sdk_path) / 'build-tools').glob('*/lib/apksigner.jar')
            if re.fullmatch(r'\d+\.\d+\.\d+', p.parent.parent.name)]
    if not jars:
        raise SystemExit('Stable Android build-tools/apksigner.jar is unavailable')
    # Use the SDK generation this project targets, if present. Never select a preview by accident.
    jar = next((p for p in jars if p.parent.parent.name == '35.0.0'), None)
    if jar is None:
        jar = max(jars, key=lambda p: tuple(map(int, p.parent.parent.name.split('.'))))
    if not apk.is_file() or not pin.is_file():
        raise SystemExit('APK or certificate pin file is missing')
    print('Checking APK with Android apksig: ' + str(jar), flush=True)
    # Java source-file mode uses the same official verifier shipped with apksigner.
    # Its API returns X509Certificate objects; console wording cannot change the result.
    result = subprocess.run(['java', '--class-path', str(jar),
                             str(repo / 'scripts/VerifyApkSigning.java'), str(apk), str(pin)])
    if result.returncode:
        raise SystemExit('APK verification failed; release cancelled (details above)')


if __name__ == '__main__':
    main()
