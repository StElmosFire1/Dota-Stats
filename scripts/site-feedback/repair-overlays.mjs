import fs from 'node:fs';
import { chromium } from 'playwright';
import { createCanvas, loadImage } from '@napi-rs/canvas';
const out = 'generated-artifacts/site-feedback';
const evidence = JSON.parse(fs.readFileSync(`${out}/evidence.json`));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.route('**/*', route => ['GET','HEAD','OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort());
for (const e of evidence.entries.filter(e => e.component.startsWith('Overlay'))) {
  const c = e.captures[0];
  await page.goto(c.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const info = await page.evaluate(() => {
    const root = document.querySelector('.overlay-root');
    const card = root?.querySelector('[class$="-card"], [class*="-card "]');
    const r = card?.getBoundingClientRect();
    return { text: root?.innerText || '', busy: root?.getAttribute('aria-busy'), box: r ? {x:r.x,y:r.y,width:r.width,height:r.height} : null };
  });
  // A neutral backdrop makes transparency legible; no data or layout is fabricated.
  await page.addStyleTag({content:'html, body {background:#202938 !important}'});
  const image = await loadImage(await page.screenshot({type:'jpeg',quality:85}));
  const canvas = createCanvas(1920,1080), ctx=canvas.getContext('2d');
  ctx.drawImage(image,0,0);
  const x=Math.max(18,Math.min(1900,(info.box?.x || 32)+15)), y=Math.max(18,Math.min(1060,(info.box?.y || 32)+15));
  ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);ctx.fillStyle='#ffe38a';ctx.fill();ctx.fillStyle='#111';ctx.font='bold 17px sans-serif';ctx.textAlign='center';ctx.fillText('1',x,y+6);
  fs.writeFileSync(`${out}/main/${c.file}`,canvas.toBuffer('image/jpeg',85));
  c.viewport={width:1920,height:1080}; c.capturedAt=new Date().toISOString();c.scrollY=0;
  c.callouts=[{id:`${e.id}-default-c1`,label:'Observed overlay state',x,y}];
  e.status=info.busy==='true'||!info.text.trim()?'blank-or-transparent':/waiting/i.test(info.text)?'empty-or-waiting':'overlay-content-visible';
  e.observation=`Captured at the intended 1920×1080 OBS size, against an added neutral dark backdrop to reveal transparent areas. ${e.status==='blank-or-transparent'?'No populated overlay was visible; missing data, loading or a failed request remain possible.':e.status==='empty-or-waiting'?'The overlay shows a waiting/idle state, not an active draft.':'Overlay content is visible for the URL shown; this is not an end-to-end test.'} Empty space is part of the broadcast canvas.`;
  console.log(e.component,e.status);
}
await browser.close();
fs.writeFileSync(`${out}/evidence.json`,JSON.stringify(evidence,null,2));
