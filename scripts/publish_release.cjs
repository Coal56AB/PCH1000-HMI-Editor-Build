'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function version(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return match ? match.slice(1).map(Number) : null;
}
function newer(a, b) {
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
async function optional(request) {
  try { return (await request()).data; }
  catch (error) { if (error.status === 404) return null; throw error; }
}

module.exports = async function publish({github, context, core, directory = 'release-files'}) {
  const meta = JSON.parse(fs.readFileSync(path.join(directory, 'release-metadata.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(meta.versionName) || !/^[0-9a-f]{40}$/.test(meta.sourceSha) ||
      meta.sourceSha !== context.sha || !Number.isSafeInteger(meta.versionCode) || meta.versionCode < 1) {
    throw new Error('Invalid release metadata or wrong source commit');
  }
  const prefix = `PCH1000_HMI_Editor_v${meta.versionName}`;
  const names = [`${prefix}.apk`, `${prefix}_full.zip`, 'release-metadata.json'];
  const sums = new Map(fs.readFileSync(path.join(directory, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').map(line => {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match) throw new Error('Invalid SHA256SUMS.txt');
    return [match[2], match[1]];
  }));
  for (const name of names) {
    const data = fs.readFileSync(path.join(directory, name));
    if (!data.length || crypto.createHash('sha256').update(data).digest('hex') !== sums.get(name)) {
      throw new Error(`Release asset checksum mismatch: ${name}`);
    }
  }
  const tag = `v${meta.versionName}`, repo = context.repo;
  // Never attach this build to a tag belonging to another commit.
  const ref = await optional(() => github.rest.git.getRef({...repo, ref: `tags/${tag}`}));
  if (ref) {
    let object = ref.object;
    for (let i = 0; object.type === 'tag' && i < 5; i++) {
      object = (await github.rest.git.getTag({...repo, tag_sha: object.sha})).data.object;
    }
    if (object.type !== 'commit' || object.sha !== meta.sourceSha) throw new Error('Release tag points to a different commit');
  }
  const before = await github.paginate(github.rest.repos.listReleases, {...repo, per_page: 100});
  let release = before.find(item => item.tag_name === tag);
  if (release && !ref && (!release.draft || release.target_commitish !== meta.sourceSha)) {
    throw new Error('Existing release has no matching tag or draft target');
  }
  if (release && !release.draft) {
    core.info(`${tag} is already published for this commit; rerun leaves its assets unchanged.`);
    return;
  }
  if (!release) {
    release = (await github.rest.repos.createRelease({...repo, tag_name: tag, target_commitish: meta.sourceSha,
      name: `PCH1000 HMI Editor ${meta.versionName}`, draft: true, generate_release_notes: true,
      body: `Автоматическая сборка main. Версия APK: ${meta.versionName}, versionCode: ${meta.versionCode}.\n\nКоммит: ${meta.sourceSha}.\n\nСохранена постоянная подпись APK. Архив содержит исходники этого коммита с версией, использованной при сборке.`})).data;
  }
  // Only unpublished drafts may be repaired after an interrupted upload.
  const assets = await github.paginate(github.rest.repos.listReleaseAssets, {...repo, release_id: release.id, per_page: 100});
  for (const name of [...names, 'SHA256SUMS.txt']) {
    for (const asset of assets.filter(asset => asset.name === name)) {
      await github.rest.repos.deleteReleaseAsset({...repo, asset_id: asset.id});
    }
    const data = fs.readFileSync(path.join(directory, name));
    await github.rest.repos.uploadReleaseAsset({...repo, release_id: release.id, name, data,
      headers: {'content-type': 'application/octet-stream', 'content-length': data.length}});
  }
  const releases = await github.paginate(github.rest.repos.listReleases, {...repo, per_page: 100});
  const isLatest = !releases.some(item => !item.draft && !item.prerelease && version(item.tag_name) && newer(version(item.tag_name), version(tag)));
  await github.rest.repos.updateRelease({...repo, release_id: release.id, draft: false, make_latest: isLatest ? 'true' : 'false'});
  core.info(`Published ${tag}${isLatest ? ' as latest' : ' without replacing a newer release'}.`);
};
