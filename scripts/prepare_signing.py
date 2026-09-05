#!/usr/bin/env python3
"""Restore the one permanent signing key from a single GitHub Actions secret.
Never creates a key and never puts private material inside the repository.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def prepare():
    encoded = os.environ.get('PCH1000_SIGNING_BUNDLE', '').strip()
    if not encoded:
        raise ValueError('Add the repository Actions secret PCH1000_SIGNING_BUNDLE. No APK will be published without it.')
    bundle = json.loads(base64.b64decode(encoded, validate=True))
    password, alias = bundle['password'], bundle['alias']
    if not isinstance(password, str) or not re.fullmatch(r'[A-Za-z0-9_-]{32,128}', password):
        raise ValueError('Invalid signing bundle password format')
    if not isinstance(alias, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', alias):
        raise ValueError('Invalid signing bundle alias')
    data = base64.b64decode(bundle['keystore_base64'], validate=True)
    if len(data) > 32768:
        raise ValueError('Unexpected keystore size')
    repo = Path(__file__).resolve().parents[1]
    directory = Path(os.environ['RUNNER_TEMP']).resolve()
    if directory == repo or repo in directory.parents:
        raise ValueError('Signing key must be outside the repository')
    destination = directory / 'pch1000-signing.p12'
    if any(c in str(destination) for c in '\r\n'):
        raise ValueError('Invalid temporary path')
    os.umask(0o077)
    try:
        destination.write_bytes(data)
        destination.chmod(0o600)
        env = dict(os.environ, PCH_KEYTOOL_PASSWORD=password)
        result = subprocess.run([
            'keytool', '-exportcert', '-keystore', str(destination), '-storetype', 'PKCS12',
            '-storepass:env', 'PCH_KEYTOOL_PASSWORD', '-alias', alias
        ], env=env, capture_output=True)
        if result.returncode:
            raise ValueError('Could not unlock the signing certificate')
        expected = (repo / 'signing-certificate.sha256').read_text().strip().lower()
        actual = hashlib.sha256(result.stdout).hexdigest()
        if not re.fullmatch(r'[0-9a-f]{64}', expected) or actual != expected:
            raise ValueError('Wrong signing certificate: refusing to replace the permanent key')
        if os.environ.get('GITHUB_ACTIONS') == 'true':
            print('::add-mask::' + password)
        with open(os.environ['GITHUB_ENV'], 'a', encoding='utf-8') as output:
            output.write(f'PCH_SIGNING_STORE_FILE={destination}\n')
            output.write(f'PCH_SIGNING_PASSWORD={password}\n')
            output.write(f'PCH_SIGNING_ALIAS={alias}\n')
        print('Permanent signing certificate validated: ' + actual)
    except Exception:
        destination.unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    try:
        prepare()
    except Exception as error:
        # Never dump the bundle, environment, subprocess input or passwords.
        print('Signing setup failed: ' + (str(error) if isinstance(error, ValueError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
