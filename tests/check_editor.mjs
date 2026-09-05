import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const html = read('app/src/main/assets/editor/index.html');
const editor = read('app/src/main/assets/editor/editor.js');
const shell = read('app/src/main/assets/editor/app-shell.js');
const manifest = read('app/src/main/AndroidManifest.xml');

const requiredIds = [
  'mode-toggle', 'export-folder', 'comparison-canvas', 'compare-bar', 'shell-modal',
  'choose-folder', 'github-login', 'github-repo', 'codex-start', 'ai-beta', 'tour'
];
for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing #${id}`);
}
if (!editor.includes('},500)')) throw new Error('Encoder hold is not 500 ms');
if (!editor.includes('startComparison')) throw new Error('Render comparison is not exposed');
if (!editor.includes("id==='font-size'||id==='gap-px'")) throw new Error('Safe numeric input handler is missing');
if (!shell.includes("@codex ")) throw new Error('Codex PR trigger is missing');
if (!shell.includes('codex-followup') || !shell.includes('codex-reject')) throw new Error('Codex PR follow-up controls are missing');
if (!manifest.includes('android.permission.INTERNET')) throw new Error('INTERNET permission is missing');
if (!manifest.includes('FileProvider')) throw new Error('APK update FileProvider is missing');

console.log('editor shell checks: OK');
