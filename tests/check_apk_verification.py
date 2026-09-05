#!/usr/bin/env python3
"""Integration checks on the real signed APK, run after assembleRelease in CI."""
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
apk = root / 'app/build/outputs/apk/release/app-release.apk'
pin = root / 'signing-certificate.sha256'
verifier = root / 'scripts/verify_apk_signing.py'


def verify(candidate, certificate_pin, expected_ok, expected_error=None):
    result = subprocess.run([sys.executable, str(verifier), str(candidate), str(certificate_pin)],
                            capture_output=True, text=True)
    output = result.stdout + result.stderr
    if (result.returncode == 0) != expected_ok or (expected_error and expected_error not in output):
        raise AssertionError('Unexpected APK verification result:\n' + output)


verify(apk, pin, True)
with tempfile.TemporaryDirectory(prefix='pch-apk-verify-') as temp:
    work = Path(temp)
    wrong_pin = work / 'wrong.sha256'
    wrong_pin.write_text('0' * 64)
    verify(apk, wrong_pin, False, 'APK certificate mismatch:')
    damaged = work / 'damaged.apk'
    shutil.copyfile(apk, damaged)
    with zipfile.ZipFile(damaged) as archive:
        entry = archive.getinfo('classes.dex')
    # Modify actual signed entry data without changing the ZIP layout or certificate.
    with damaged.open('r+b') as stream:
        stream.seek(entry.header_offset)
        header = stream.read(30)
        assert header[:4] == b'PK\x03\x04' and entry.compress_size > 0
        name_len, extra_len = struct.unpack_from('<HH', header, 26)
        offset = entry.header_offset + 30 + name_len + extra_len
        stream.seek(offset)
        value = stream.read(1)[0]
        stream.seek(offset)
        stream.write(bytes([value ^ 1]))
    verify(damaged, pin, False, 'APK cryptographic verification failed:')
print('PASS: actual signed APK accepted; wrong pin and tampered signed content rejected')
