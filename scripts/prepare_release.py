#!/usr/bin/env python3
"""Stamp a deterministic mainline version; package the exact APK build inputs."""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile

# Last main commit before automatic releases. One mainline commit = one patch.
BASE_COMMIT = '1e87aefb0b5a1d9b68d0063c3b17fea969b70bfe'
BASE_PATCH = 5
BASE_CODE = 8
ROOT = Path(__file__).resolve().parents[1]


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])


def version_for(root, base=BASE_COMMIT):
    chain = git(root, 'rev-list', '--first-parent', 'HEAD').decode().splitlines()
    if base not in chain:
        raise ValueError('Release baseline missing from first-parent history; fetch full history (fetch-depth: 0)')
    distance = chain.index(base)
    code = BASE_CODE + distance
    if not 1 <= code <= 2100000000:
        raise ValueError('Android versionCode is out of range')
    return {'versionName': f'1.2.{BASE_PATCH + distance}', 'versionCode': code, 'sourceSha': chain[0]}


def stamp(root=ROOT, base=BASE_COMMIT):
    metadata = version_for(root, base)
    if os.environ.get('GITHUB_SHA') and os.environ['GITHUB_SHA'] != metadata['sourceSha']:
        raise ValueError('Checkout does not match the triggering commit')
    path = root / 'app/build.gradle'
    text = path.read_text(encoding='utf-8')
    text, codes = re.subn(r'\bversionCode\s+\d+', f'versionCode {metadata["versionCode"]}', text)
    text, names = re.subn(r"\bversionName\s+'\d+\.\d+\.\d+'", f"versionName '{metadata['versionName']}'", text)
    if (codes, names) != (1, 1):
        raise ValueError('Expected exactly one Android versionCode and versionName')
    path.write_text(text, encoding='utf-8')
    metadata['gradleSha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    (root / 'release-metadata.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
    print(f"Release {metadata['versionName']} ({metadata['versionCode']}) from {metadata['sourceSha']}")


def package(root=ROOT):
    metadata = json.loads((root / 'release-metadata.json').read_text())
    if git(root, 'rev-parse', 'HEAD').decode().strip() != metadata['sourceSha']:
        raise ValueError('Release metadata refers to a different commit')
    if hashlib.sha256((root / 'app/build.gradle').read_bytes()).hexdigest() != metadata['gradleSha256']:
        raise ValueError('Gradle build inputs changed after version stamping')
    output = root / 'app/build/outputs/apk/release'
    apk_metadata = json.loads((output / 'output-metadata.json').read_text())
    elements = apk_metadata['elements']
    if apk_metadata['applicationId'] != 'com.pch1000.hmieditor' or len(elements) != 1:
        raise ValueError('Expected one production APK, not a debug build or split APKs')
    element = elements[0]
    if any(element[key] != metadata[key] for key in ('versionName', 'versionCode')):
        raise ValueError('APK version does not match release metadata')
    if element['outputFile'] != 'app-release.apk':
        raise ValueError('Unexpected release APK filename')
    apk = output / 'app-release.apk'
    if not apk.is_file() or apk.stat().st_size == 0:
        raise ValueError('Release APK missing or empty')
    destination = root / 'release-files'
    destination.mkdir(exist_ok=True)
    if any(destination.iterdir()):
        raise ValueError('Release staging directory must be empty')
    prefix = f"PCH1000_HMI_Editor_v{metadata['versionName']}"
    shutil.copyfile(apk, destination / f'{prefix}.apk')
    # Preserve all tracked sources, plus the exact version stamp used by Gradle.
    archive = git(root, 'archive', '--format=zip', metadata['sourceSha'])
    with zipfile.ZipFile(io.BytesIO(archive)) as source, zipfile.ZipFile(destination / f'{prefix}_full.zip', 'w', zipfile.ZIP_DEFLATED) as target:
        for entry in source.infolist():
            if entry.filename not in ('app/build.gradle', 'release-metadata.json'):
                target.writestr(entry, source.read(entry.filename))
        target.write(root / 'app/build.gradle', 'app/build.gradle')
        target.write(root / 'release-metadata.json', 'release-metadata.json')
    shutil.copyfile(root / 'release-metadata.json', destination / 'release-metadata.json')
    checksums = ''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n'
                        for path in sorted(destination.iterdir()))
    (destination / 'SHA256SUMS.txt').write_text(checksums, encoding='utf-8')
    print('Verified APK version and packaged release files')


if __name__ == '__main__':
    if sys.argv[1:] == ['stamp']:
        stamp()
    elif sys.argv[1:] == ['package']:
        package()
    else:
        raise SystemExit('Usage: prepare_release.py stamp|package')
