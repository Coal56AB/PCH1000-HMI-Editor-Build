#!/usr/bin/env python3
"""Exercise secret restoration with disposable test keys; no production secret needed."""
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='pch-sign-test-') as temp:
    work = Path(temp)
    repo = work / 'repo'
    (repo / 'scripts').mkdir(parents=True)
    runner = work / 'runner'
    runner.mkdir()
    shutil.copy(root / 'scripts/prepare_signing.py', repo / 'scripts/prepare_signing.py')
    password = secrets.token_urlsafe(36)
    env = dict(os.environ, PCH_KEYTOOL_PASSWORD=password)
    env.pop('GITHUB_ACTIONS', None)
    keystore = work / 'test.p12'
    subprocess.run(['keytool', '-genkeypair', '-keystore', str(keystore), '-storetype', 'PKCS12',
                    '-storepass:env', 'PCH_KEYTOOL_PASSWORD', '-alias', 'test', '-keyalg', 'RSA',
                    '-keysize', '2048', '-validity', '1', '-dname', 'CN=Disposable test', '-noprompt'],
                   env=env, capture_output=True, check=True)
    cert = subprocess.run(['keytool', '-exportcert', '-keystore', str(keystore),
                           '-storepass:env', 'PCH_KEYTOOL_PASSWORD', '-alias', 'test'],
                          env=env, capture_output=True, check=True).stdout
    pin = repo / 'signing-certificate.sha256'
    pin.write_text(hashlib.sha256(cert).hexdigest())
    bundle = {'keystore_base64': base64.b64encode(keystore.read_bytes()).decode(),
              'password': password, 'alias': 'test'}
    encoded = base64.b64encode(json.dumps(bundle).encode()).decode()
    env.update(RUNNER_TEMP=str(runner), GITHUB_ENV=str(work / 'github-env'), PCH1000_SIGNING_BUNDLE=encoded)

    def run(expected_success):
        result = subprocess.run(['python3', str(repo / 'scripts/prepare_signing.py')], env=env, capture_output=True, text=True)
        assert (result.returncode == 0) == expected_success, 'Unexpected signing setup result'
        assert password not in result.stdout + result.stderr, 'Password leaked'
        assert encoded not in result.stdout + result.stderr, 'Bundle leaked'
        return result

    run(True)
    assert (runner / 'pch1000-signing.p12').read_bytes() == keystore.read_bytes()
    run(True)
    assert (runner / 'pch1000-signing.p12').read_bytes() == keystore.read_bytes(), 'Key changed between builds'
    pin.write_text('0' * 64)
    run(False)
    assert not (runner / 'pch1000-signing.p12').exists(), 'Rejected key left on disk'
    env['PCH1000_SIGNING_BUNDLE'] = ''
    run(False)
    env['PCH1000_SIGNING_BUNDLE'] = 'not-valid-base64!'
    run(False)
print('PASS: stable key restoration, identical repeat, mismatched certificate rejected, missing/malformed secret rejected, no credential output')
