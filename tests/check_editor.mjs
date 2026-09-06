import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const html = read('app/src/main/assets/editor/index.html');
const editor = read('app/src/main/assets/editor/editor.js');
const shell = read('app/src/main/assets/editor/app-shell.js');
const edits = read('app/src/main/assets/editor/codex-edits.js');
const markdown = read('app/src/main/assets/editor/codex-markdown.js');
const cleanup = read('.github/workflows/cleanup-codex-branches.yml');
if (!html.includes('<script src="codex-markdown.js"></script>') || !html.includes('<script src="codex-edits.js"></script>') || !shell.includes('CodexEdits.init(')) throw new Error('Codex edit modules are not connected');
if (!markdown.includes('CodexMarkdown') || !edits.includes('CodexMarkdown.render')) throw new Error('Safe Markdown rendering is not connected');
if (!cleanup.includes("startsWith(github.head_ref, 'codex/')") || !cleanup.includes('deleteRef')) throw new Error('Codex branch cleanup workflow is missing');
const manifest = read('app/src/main/AndroidManifest.xml');

const requiredIds = [
  'mode-toggle', 'export-dialog', 'export-confirm', 'comparison-canvas', 'compare-bar', 'shell-modal',
  'choose-folder', 'github-login', 'github-repo', 'codex-start', 'ai-beta', 'tour',
  'codex-edit-status', 'codex-edit-conversation', 'codex-edit-open', 'codex-edit-load',
  'codex-edit-issue', 'codex-followup-text', 'codex-result-actions'
];
for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing #${id}`);
}
if (!editor.includes('},500)')) throw new Error('Encoder hold is not 500 ms');
if (!editor.includes('startComparison')) throw new Error('Render comparison is not exposed');
if (!editor.includes("id==='font-size'||id==='gap-px'")) throw new Error('Safe numeric input handler is missing');
if (!editor.includes("touchGesture={type:'pending'") || !editor.includes("touchGesture.type==='pinch'") || !editor.includes('TAP_SLOP=8')) throw new Error('Touch pan, pinch zoom and tap-only selection are missing');
if (!editor.includes('selectElement(targetAt(p.x,p.y))')) throw new Error('Touch selection must happen on pointer release');
if (!read('app/src/main/assets/editor/editor.css').includes('.editing .interaction{pointer-events:auto;touch-action:none}')) throw new Error('Editor touch surface must own touch gestures');
if (!shell.includes("@codex ")) throw new Error('Codex PR trigger is missing');
if (!edits.includes('codex-followup') || !edits.includes('codex-reject')) throw new Error('Codex PR follow-up controls are missing');
if (!manifest.includes('android.permission.INTERNET')) throw new Error('INTERNET permission is missing');
if (!manifest.includes('FileProvider')) throw new Error('APK update FileProvider is missing');

console.log('editor shell checks: OK');

const gradle = read('app/build.gradle');
const github = read('app/src/main/java/com/pch1000/hmieditor/GitHubService.java');
if (!gradle.includes('buildConfig true')) throw new Error('BuildConfig build fix missing');
if (!editor.includes('new ResizeObserver(fit).observe(stage)')) throw new Error('Stage resize observer missing');
if (html.includes('id="update-repo"') || shell.includes('state.updateRepo')) throw new Error('APK repo must not be user selectable');
if (!github.includes('UPDATE_REPO = "Coal56AB/PCH1000-HMI-Editor-Build"')) throw new Error('Wrong APK repository');
if (!manifest.includes('android:icon="@mipmap/ic_launcher"')) throw new Error('Custom launcher icon missing');
console.log('1.2.1 build, icon and update-source checks: OK');
