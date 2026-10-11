import fs from 'node:fs';
import { notes } from './notes.mjs';
const out='generated-artifacts/site-feedback';
const ev=JSON.parse(fs.readFileSync(`${out}/evidence.json`));
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function highlight(label,e){
 if(/current page state|observed overlay state|restricted page heading/i.test(label))return e.component.startsWith('Overlay')?'Look here for the broadcast display. A “Waiting” message means this picture is not showing an active draft.':'Look here for the page’s current message. Sign-in, permission or missing-data prompts can appear instead of the main content.';
 if(/why is this safe/i.test(label))return 'Look here for the explanation of Steam sign-in before connecting your account.';
 if(/sign in|log in/i.test(label))return 'Start here to sign in. Personal actions may stay unavailable until you do.';
 if(/latest matches/i.test(label))return 'Look here for recent games, then open a match to see its details.';
 if(/standings|leaderboard|rankings/i.test(label))return 'Look here to compare standings. Check the selected season or filters before comparing players.';
 if(/inhouse lobby/i.test(label))return 'This is the lobby area. In this capture, the sign-in screen is shown; queue and draft controls are not demonstrated.';
 if(/walkthrough/i.test(label))return 'Start here for the walkthrough explaining how to use the site.';
 return `Look for “${label}” at this marker to orient yourself on the page.`;
}
const lobby=`<aside><h3>The lobby, step by step</h3><ol><li><b>Sign in:</b> use Steam; joining also requires the Discord link and community membership checks.</li><li><b>Queue:</b> choose preferred roles and join the player pool. The usual target is 10 players.</li><li><b>Ready up:</b> accept when the readiness prompt appears. Being queued is not the same as being ready.</li><li><b>Make teams:</b> the selected captain or auto-balance mode determines team formation. Captains pick players when a captain draft is used.</li><li><b>Follow match status:</b> watch for preparation, in-progress or failure messages.</li></ol><p><b>Important:</b> this screenshot shows the sign-in view, not a live draft. The dedicated-server connection panel is disabled in the inspected source, so this guide does not promise a working one-click game launch.</p></aside>`;
for(const priv of [false,true]){
 const dir=`${out}/${priv?'basic-private':'basic-public'}`;fs.mkdirSync(`${dir}/media`,{recursive:true});
 const list=ev.entries.filter(e=>e.private===priv);
 const groups=[...new Set(list.map(e=>notes[e.component][0]))].sort((a,b)=>{
  const rank=g=>g==='Start here'?0:g==='Play & spectate'?1:g==='Stream overlays'?99:2;
  return rank(a)-rank(b);
 });
 const title=priv?'Private illustrated guide':'OCE Inhouse — Simple illustrated guide';
 let html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
 *{box-sizing:border-box}body{margin:0;background:#eef1f5;color:#172439;font:16px/1.6 system-ui}header{background:#122238;color:white;padding:38px max(22px,calc((100% - 1050px)/2))}h1,h2,h3{line-height:1.2}header p{max-width:760px}main{max-width:1100px;margin:auto;padding:24px}nav,article{background:white;padding:26px;border-radius:12px;margin-bottom:24px}nav ul{columns:3;padding-left:22px}a{color:#17609d}article{scroll-margin-top:16px}img{width:100%;height:auto;display:block;border-radius:6px;border:1px solid #c9d2dd}figure{margin:20px 0}figcaption,.small{font-size:13px;color:#546174}ol.highlights{padding-left:28px}ol.highlights li{padding:6px 0}ol.highlights li::marker{font-weight:bold;color:#946f00}aside{background:#fff6dd;border-left:4px solid #ceab54;padding:16px 22px;margin-top:18px}.route{overflow-wrap:anywhere;font-size:13px}input{width:100%;padding:12px;border:1px solid #bac5d2;border-radius:6px;font:inherit}footer{padding:20px;color:#546174}.group{margin-top:36px}@media(max-width:600px){main{padding:12px}nav,article{padding:18px}nav ul{columns:1}}@media print{body{background:white;font-size:11pt}nav,input,.back{display:none}article{break-before:page;padding:0}img{max-height:145mm;object-fit:contain}aside{break-inside:avoid}}
 body{overflow-wrap:anywhere}img{max-width:100%}
 </style></head><body><header><p>QUICK START • PICTURE GUIDE</p><h1>${title}</h1><p>What each page is for, what to do there, and where to look. Match the yellow numbers in each screenshot to the short tips below it.</p><p>${priv?'Keep this edition for the owner and approved staff. Account and coaching pages are included; not every page is admin-only.':'Start with the lobby if you want to play. Use the page index to explore stats, matches, coaching, games and stream tools.'}</p></header><main><nav id="index"><h2>Find a page</h2><input id="search" type="search" aria-label="Find a page" placeholder="Search: lobby, matches, heroes…"><ul>${list.map(e=>`<li><a href="#${e.id}">${esc(e.title)}</a></li>`).join('')}</ul><p class="small">One representative picture per page group. Related URL variants share a card. Screenshots show the state available at capture time; signed-in, paid and live-match views may differ. Blank, waiting and access-limited views are not examples of the complete feature.</p></nav>`;
 for(const group of groups){
 html+=`<h2 class="group">${esc(group)}</h2>`;
 for(const e of list.filter(e=>notes[e.component][0]===group)){
 const [,purpose,,workflow]=notes[e.component];const c=e.captures.find(c=>c.state==='default')||e.captures[0];
 html+=`<article id="${e.id}" data-search="${esc((e.title+' '+group+' '+e.routes.map(r=>r.path).join(' ')).toLowerCase())}"><a class="back" href="#index">Page index ↑</a><h2>${esc(e.title)}</h2><p><b>What it does:</b> ${esc(purpose)}</p><p><b>How to use it:</b> ${esc(workflow)}</p><p class="route">Where: ${e.routes.map(r=>`<code>${esc(r.path)}</code>`).join(' · ')}</p>`;
 if(c){
  const file=c.file;fs.copyFileSync(`${out}/${priv?'private':'main'}/${file}`,`${dir}/${file}`);
  html+=`<figure><a href="${file}"><img loading="lazy" src="${file}" alt="${esc(e.title)} screenshot with numbered highlights" width="${c.viewport.width}" height="${c.viewport.height}"></a><figcaption>Click the image for full size. ${c.masks?'Private values are masked. ':''}${e.component.startsWith('Overlay')?'OBS canvas shown against a dark backdrop; the unused area is intentional.':''}</figcaption></figure><h3>Where to look</h3><ol class="highlights">${c.callouts.map(a=>`<li>${esc(highlight(a.label,e))}</li>`).join('')}</ol>`;
 }else html+='<aside>No usable screenshot was available for this page. The explanation describes its intended use.</aside>';
 if(e.component==='Inhouse')html+=lobby;
 else if(/sign-in|entitlement|empty|waiting|blank|error|partial/.test(e.status))html+=`<p class="small"><b>Picture limitation:</b> ${esc(e.status.replaceAll('-',' '))}. This capture does not demonstrate the complete workflow.</p>`;
 html+='</article>';
 }}
 html+=`<footer>Full-edition website guide. A quick orientation, not a technical audit or proof that every action has been tested.</footer></main><script>document.querySelector('#search').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('article').forEach(a=>a.hidden=!a.dataset.search.includes(q));document.querySelectorAll('.group').forEach(h=>h.hidden=!!q)});</script></body></html>`;
 fs.writeFileSync(`${dir}/index.html`,html);
}
