#!/usr/bin/env python3
"""Cryptographically verify the built APK and enforce the permanent certificate."""
import os
from pathlib import Path
import re
import subprocess
import sys

repo = Path(__file__).resolve().parents[1]
apk = repo / 'app/build/outputs/apk/release/app-release.apk'
sdk = Path(os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT'])
tools = list((sdk / 'build-tools').glob('*/apksigner'))
if not tools:
    raise SystemExit('Android apksigner is unavailable')
signer = max(tools, key=lambda p: tuple(map(int, re.findall(r'\d+', p.parent.name))))
result = subprocess.run([str(signer), 'verify', '--verbose', '--print-certs', str(apk)], capture_output=True, text=True)
if result.returncode:
    raise SystemExit('APK signature verification failed; release cancelled')
certificates = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)', result.stdout)
expected = (repo / 'signing-certificate.sha256').read_text().strip().lower()
if [c.lower() for c in certificates] != [expected]:
    raise SystemExit('APK signer does not match the permanent certificate; release cancelled')
print('APK cryptographic signature and permanent certificate: OK')
