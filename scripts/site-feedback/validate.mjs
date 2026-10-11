import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { entries, OUT } from './inventory.mjs';
import { notes } from './notes.mjs';

for (const entry of entries) assert(notes[entry.component], `Missing editorial explanation: ${entry.component}`);
const delivered = ['main','private'].flatMap(dir=>JSON.parse(fs.readFileSync(`${OUT}/${dir}/coverage.json`)).entries);
assert.equal(delivered.length, entries.length, 'Every source route family must be accounted for');
assert.equal(new Set(delivered.map(e=>e.id)).size, delivered.length);
for (const entry of entries) {
  const found = delivered.find(e=>e.id===entry.id);
  assert.deepEqual(found.routes.map(r=>r.path), entry.routes.map(r=>r.path), `Route drift: ${entry.id}`);
  assert.notEqual(found.status, 'pending', `Unaccounted state ${entry.id}`);
}

const report = { validatedAt: new Date().toISOString(), families: delivered.length, routePatterns: delivered.reduce((n,e)=>n+e.routes.length,0), packages: [] };
const browser = await chromium.launch();
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'oce-guide-offline-'));
for (const dir of ['main','private']) {
  const archive = `${OUT}/${dir === 'main' ? 'OCE-Inhouse-guide' : 'PRIVATE-appendix'}.zip`;
  execFileSync('python3', ['-c', `
import zipfile, pathlib, sys
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(root.rglob('*')):
        if file.is_file(): archive.write(file,file.relative_to(root))
`, `${OUT}/${dir}`, archive]);
  execFileSync('python3',['-c','import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',archive,`${temp}/${dir}`]);
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const network = [];
  await context.route(/^https?:\/\//, route=>{network.push(route.request().url().split('?')[0]); return route.abort();});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror',error=>errors.push(error.name));
  await page.goto(`file://${temp}/${dir}/index.html`);
  await page.locator('img').evaluateAll(async imgs => {
    for (const img of imgs) img.loading='eager';
    await Promise.all(imgs.map(img=>img.decode().catch(()=>{})));
  });
  const broken = await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.getAttribute('src')));
  assert.deepEqual(broken,[],`${dir}: broken images`);
  const duplicateIds = await page.locator('[id]').evaluateAll(els=>{
    const seen=new Set(); return els.map(e=>e.id).filter(id=>seen.has(id)||!seen.add(id));
  });
  assert.deepEqual(duplicateIds,[],`${dir}: duplicate reference IDs`);
  const brokenLinks = await page.locator('a[href^="#"]').evaluateAll(els=>els.map(e=>e.getAttribute('href').slice(1)).filter(id=>!document.getElementById(id)));
  assert.deepEqual(brokenLinks,[],`${dir}: broken internal links`);
  assert.equal(network.length,0,`${dir}: offline guide must not make network requests`);
  assert.deepEqual(errors,[],`${dir}: browser script errors`);
  const count = await page.locator('article').count();
  await page.locator('#find').fill('impossible-filter-phrase');
  assert.equal(await page.locator('article:visible').count(),0);
  await page.locator('#find').fill('');
  assert.equal(await page.locator('article:visible').count(),count);
  await page.locator('[data-feedback]').first().click();
  assert.match(await page.locator('#feedback').inputValue(),/Page: page-/);
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:`${OUT}/${dir}-guide-desktop-check.jpg`,quality:80,type:'jpeg'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:`${OUT}/${dir}-guide-mobile-check.jpg`,quality:80,type:'jpeg'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`${dir}: guide horizontal overflow`);
  await page.emulateMedia({media:'print'});
  await page.pdf({path:`${OUT}/${dir}-print-check.pdf`,format:'A4',pageRanges:'1-2',printBackground:true});
  const html=fs.readFileSync(`${OUT}/${dir}/index.html`,'utf8');
  assert(!/src=["']https?:/i.test(html),'No external assets');
  assert(!/\b(?:sk_live_|sk_test_|whsec_)[A-Za-z0-9]{12,}/.test(html),'No credential-shaped tokens');
  if(dir==='main') {
    assert(!/\.\.\/private|PRIVATE-appendix|page-admin-panel/.test(html),'Main must not reference private assets or appendix entries');
    assert(JSON.parse(fs.readFileSync(`${OUT}/main/coverage.json`)).entries.every(e=>!e.private));
  }
  for(const e of delivered.filter(e=>e.private===(dir==='private'))) for(const c of [...(e.captures||[]),...(e.extraCaptures||[])]) {
    assert(c.url&&c.role&&c.capturedAt&&c.environment&&c.viewport&&c.state,`Metadata missing ${c.file}`);
    assert(c.callouts.length,`Callout missing ${c.file}`);
    for(const point of c.callouts) assert(point.x>=0&&point.y>=0&&point.x<c.viewport.width&&point.y<c.viewport.height,`Callout outside image ${point.id}`);
  }
  report.packages.push({name:dir,entries:count,images:await page.locator('img').count(),bytes:fs.statSync(archive).size,offline:true,search:true,feedback:true,links:true,mobileLayout:true,printSample:true});
  await context.close();
}
await browser.close();
fs.rmSync(temp,{recursive:true,force:true});
fs.writeFileSync(`${OUT}/validation.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
