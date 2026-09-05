// Run: npm install --no-save playwright && npx playwright install chromium
// Then: node tests/check_layout.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', {
  paths: [process.cwd(), process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)
}));
const root = fileURLToPath(new URL('../app/src/main/assets/editor/', import.meta.url));
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!target.startsWith(root)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', ({'.html':'text/html', '.js':'text/javascript', '.css':'text/css'})[path.extname(target)] || 'application/octet-stream');
    res.end(await fs.readFile(target));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({headless:true, executablePath:process.env.LAYOUT_CHROMIUM || undefined});
const url = `http://127.0.0.1:${server.address().port}/`;
const rect = (page, selector) => page.locator(selector).boundingBox();
async function centered(page, dpr) {
  const s = await rect(page, '#stage'), p = await rect(page, '#phone');
  assert(Math.abs(p.x + p.width / 2 - s.x - s.width / 2) <= 1 / dpr, 'HMI horizontal center');
  assert(Math.abs(p.y + p.height / 2 - s.y - s.height / 2) <= 1 / dpr, 'HMI vertical center');
  assert(Math.abs(p.width * dpr / 320 - Math.round(p.width * dpr / 320)) < 0.001, 'integer physical scale');
}
function overlap(a,b) { return a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y; }
try {
  for (const [width,height,dpr] of [[393,795,2.75],[360,740,3],[412,850,2.625],[800,600,2]]) {
    const page = await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    // Hold renderer response: layout must be centered even before it is ready.
    await page.route('**/renderer.html*', async route => { await new Promise(r=>setTimeout(r,300)); await route.continue(); });
    await page.goto(url, {waitUntil:'domcontentloaded'});
    await page.waitForTimeout(150);
    await centered(page,dpr);
    await page.locator('#tour:not(.hidden)').waitFor();
    const targets=['#phone','#hardware','#mode-toggle','#export','#app-menu'];
    for(let i=0;i<targets.length;i++) {
      await page.waitForTimeout(120);
      const spot=await rect(page,'#tour-spot'),card=await rect(page,'.tour-card'),target=await rect(page,targets[i]);
      assert(spot.x>=0 && spot.y>=0 && spot.x+spot.width<=width && spot.y+spot.height<=height, 'spot in viewport');
      assert(!overlap(target,card), `step ${i+1}: card covers ${targets[i]}`);
      if(targets[i]!=='#phone') assert(target.x>=-0.1 && target.x+target.width<=width+0.1, 'target scrolled into view');
      assert(spot.width>0 && spot.height>0, 'visible spotlight');
      // Controls are reachable: the tour container must not intercept target taps.
      assert(await page.evaluate(({x,y})=>!document.elementFromPoint(x,y)?.closest('#tour'),{x:target.x+target.width/2,y:target.y+target.height/2}), 'target blocked by tour');
      if(process.env.LAYOUT_SCREENSHOTS)await page.screenshot({path:`${process.env.LAYOUT_SCREENSHOTS}/layout-${width}-step-${i+1}.png`});
      await page.locator('#tour-next').click();
    }
    await page.locator('#shell-close').click();
    await page.waitForTimeout(120);
    await centered(page,dpr);
    await page.locator('#app-menu').click();
    await page.locator('[data-shell-tab="github"]').click();
    await page.locator('#github-login').click();
    assert(await page.locator('#github-oauth-setup').evaluate(el=>el.open));
    await page.locator('#github-client-id').fill('Coal56AB');
    await page.locator('#github-client-save').click();
    assert.match(await page.locator('#shell-message').innerText(),/не имя аккаунта/);
    assert.equal(errors.length,0,errors.join('\n'));
    await page.close();
    console.log(`layout and tutorial OK: ${width}x${height} DPR ${dpr}`);
  }
  // Warm startup: the iframe may finish before the parent listener is installed.
  const page=await browser.newPage({viewport:{width:393,height:795},deviceScaleFactor:2.75});
  await page.addInitScript(()=>localStorage.setItem('pch-tour-v1','done'));
  await page.route('**/editor.js',async route=>{await new Promise(r=>setTimeout(r,700));await route.continue()});
  await page.goto(url);await page.waitForTimeout(150);await centered(page,2.75);
  await page.setViewportSize({width:412,height:820});await page.waitForTimeout(150);await centered(page,2.75);
  await page.close();
  console.log('warm startup and resize OK');
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
