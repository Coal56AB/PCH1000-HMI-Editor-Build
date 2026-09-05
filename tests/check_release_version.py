#!/usr/bin/env python3
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('release', ROOT / 'scripts/prepare_release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {'GITHUB_SHA': ''}):
    root = Path(tmp)
    def git(*args):
        return subprocess.check_output(['git', '-C', str(root), '-c', 'user.name=Release Test', '-c', 'user.email=test@example.invalid', *args], stderr=subprocess.DEVNULL).decode().strip()
    git('init', '-b', 'main')
    (root / 'app').mkdir()
    gradle = root / 'app/build.gradle'
    gradle.write_text("versionCode 8\nversionName '1.2.5'\n")
    git('add', '.'); git('commit', '-m', 'baseline')
    base = git('rev-parse', 'HEAD')
    assert release.version_for(root, base)['versionName'] == '1.2.5'
    git('checkout', '-b', 'feature')
    for i in range(3):
        (root / 'source.c').write_text(f'// change {i}\n')
        git('add', '.'); git('commit', '-m', f'change {i}')
    git('checkout', 'main'); git('merge', '--no-ff', 'feature', '-m', 'Merge feature')
    expected = release.version_for(root, base)
    assert expected['versionName'] == '1.2.6' and expected['versionCode'] == 9, 'One merge must increment both versions once'
    release.stamp(root, base)
    first = (root / 'release-metadata.json').read_bytes()
    release.stamp(root, base)
    assert (root / 'release-metadata.json').read_bytes() == first, 'Same commit has stable version on rerun'
    output = root / 'app/build/outputs/apk/release'
    output.mkdir(parents=True)
    (output / 'app-release.apk').write_bytes(b'APK fixture; signature is checked by the separate signing gate')
    element = {**expected, 'outputFile': 'app-release.apk'}
    (output / 'output-metadata.json').write_text(json.dumps({'applicationId': 'com.pch1000.hmieditor', 'elements': [element]}))
    release.package(root)
    with zipfile.ZipFile(root / 'release-files/PCH1000_HMI_Editor_v1.2.6_full.zip') as archive:
        assert archive.read('app/build.gradle').decode() == gradle.read_text()
        assert archive.read('source.c') == (root / 'source.c').read_bytes()
        assert json.loads(archive.read('release-metadata.json'))['sourceSha'] == git('rev-parse', 'HEAD')
        assert len(archive.namelist()) == len(set(archive.namelist())), 'No duplicate archive entries'
    element['versionCode'] = 8
    (output / 'output-metadata.json').write_text(json.dumps({'applicationId': 'com.pch1000.hmieditor', 'elements': [element]}))
    try: release.package(root)
    except ValueError as error: assert 'APK version' in str(error)
    else: raise AssertionError('Mismatched APK version accepted')
    try: release.version_for(root, '0' * 40)
    except ValueError: pass
    else: raise AssertionError('Missing/shallow history accepted')
    git('commit', '--allow-empty', '-m', 'Next main change')
    assert release.version_for(root, base)['versionName'] == '1.2.7'
    assert release.version_for(root, base)['versionCode'] == 10
print('PASS: mainline merge count, stable reruns, increasing Android versions, complete stamped source archive, wrong APK/history rejection')
