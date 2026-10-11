import fs from 'node:fs';
import { entries, OUT } from './inventory.mjs';
import { notes } from './notes.mjs';
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const lobby = [
 ['Purpose','The Inhouse page (/inhouse) coordinates private community Dota 2 matches: queueing, readiness, captain selection, team drafting and match status. It is the participation hub, not just a stats page.'],
 ['1. Sign in and qualify','Players sign in with Steam. Joining also checks Discord linking and community-server membership. The UI provides prompts to link Discord or join the server; Discord is used for voice coordination and match communication.'],
 ['2. Join the queue','Choose preferred roles and join. The page describes an automatically opened session when the first player joins, with the usual target of 10 players. Queue counts, registered players and countdowns show progress. Admin settings can change the player threshold and timing.'],
 ['3. Confirm readiness','The accepting phase asks queued players to accept or decline before a deadline. Accepted players are marked Ready. This is separate from merely registering in the queue.'],
 ['4. Select captains or balance teams','Supported modes include highest rank, random, highest roll, volunteers and skill-based auto-balancing. The UI includes voting and admin overrides. These are alternative modes, not steps every match runs through.'],
 ['5. Draft the players','In captain-based modes, captains pick players onto two teams. The board shows whose turn it is and the remaining pool. A per-pick deadline can auto-pick the highest-MMR remaining player if a captain stalls. This is a PLAYER draft; do not confuse it with hero pick/ban analysis or the standalone draft overlay.'],
 ['6. Prepare and play','Source code includes server provisioning, a failure state and retry controls, followed by an in-progress state. Important limitation: the dedicated-server connect panel is explicitly disabled in the inspected frontend (SHOW_SERVER_CONNECT = false). The landing copy describes connecting, but this guide does not claim a currently working browser-to-game launch flow. Live Steam/Dota hosting and provisioning were not exercised.'],
 ['7. Review afterwards','Past sessions and completed team boards provide context. Match pages, player profiles, ratings and replay tools are the follow-on analysis surfaces when the corresponding records are available. This review did not verify automatic ingestion or completion of a live game.'],
 ['Player versus staff controls','Players manage their participation and, if captain, their draft picks. Staff have separate controls for session settings, phase progression, provisioning/retries and diagnostics. Seeing a staff control in source does not prove it succeeds in production.'],
 ['Related pages','How It Works explains participation. Schedule covers planned events. Spectate supports watching. Matches and replay pages review games. Draft statistics/training are analysis tools, not the live player queue. OBS overlays are read-only broadcast views, not lobby-management screens.'],
 ['What the screenshots prove','Only the captured state at that time. An idle lobby, sign-in prompt or waiting overlay cannot demonstrate readiness, a populated draft or a completed match. This synopsis describes source-defined capabilities, with the known launch limitation above; no queue was joined and no game was started for documentation.'],
];
for (const privateEdition of [false,true]) {
 const selected=entries.filter(e=>e.private===privateEdition);
 const title=privateEdition?'PRIVATE — Staff and account page synopsis':'OCE Inhouse — Page synopsis and lobby walkthrough';
 const intro=privateEdition?'Owner/approved staff reference. Includes personal account and coaching workflows classified as private by the guide; not every page is admin-only.':'A short, screenshot-free explanation of the full-edition website. Community edition is outside this document.';
 const sections=[['Scope',intro+' Based on the current source inventory, not an end-to-end test. Features may require authentication, permissions, data or paid access.']];
 if (!privateEdition) sections.push(...lobby);
 let md=`# ${title}\n\n${sections.map(([h,p])=>`## ${h}\n\n${p}`).join('\n\n')}\n\n# Page-by-page synopsis\n`;
 let html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{max-width:960px;margin:36px auto;padding:0 22px;font:16px/1.65 system-ui;color:#182537}h1,h2{line-height:1.2}h2{margin-top:32px}section{border-bottom:1px solid #ddd;padding-bottom:18px}code{overflow-wrap:anywhere;font-size:13px}.note{background:#fff5d8;padding:16px}small{color:#465467}@media print{body{font-size:11pt}section{break-inside:avoid}}</style><h1>${esc(title)}</h1><p class="note">${esc(sections.shift()[1])}</p>`;
 for(const [h,p] of sections) html+=`<h2>${esc(h)}</h2><p>${esc(p)}</p>`;
 html+='<h1>Page-by-page synopsis</h1>';
 for(const group of [...new Set(selected.map(e=>notes[e.component][0]))]){
  html+=`<h2>${esc(group)}</h2>`;md+=`\n## ${group}\n`;
  for(const e of selected.filter(e=>notes[e.component][0]===group)){
   const [,purpose,audience,workflow]=notes[e.component];
   const routes=e.routes.map(r=>r.path).join(', ');
   md+=`\n### ${e.title}\n${routes}\n\n${purpose}\n\nWho: ${audience}.\nMain use: ${workflow}\n`;
   html+=`<section><h3>${esc(e.title)}</h3><code>${esc(routes)}</code><p>${esc(purpose)}</p><small><strong>Who:</strong> ${esc(audience)}.<br><strong>Main use:</strong> ${esc(workflow)}</small></section>`;
  }
 }
 html+='</html>';
 const base=privateEdition?'PRIVATE-page-synopsis':'OCE-Inhouse-page-synopsis';
 fs.writeFileSync(`${OUT}/${base}.html`,html);
 fs.writeFileSync(`${OUT}/${base}.md`,md);
}
// URL matching checks provenance, not visual completeness.
const ev=JSON.parse(fs.readFileSync(`${OUT}/evidence.json`));
let checked=0;const unmatched=[];
for(const e of ev.entries)for(const c of e.captures){
 checked++;
 const pathname=new URL(c.url).pathname;
 const matches=e.routes.some(r=>new RegExp('^'+r.path.split('/').map(s=>s.startsWith(':')?'[^/]+':s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/')+'/?$').test(pathname));
 if(!matches)unmatched.push({page:e.title,state:c.state,url:c.url});
}
fs.writeFileSync(`${OUT}/screenshot-route-audit.json`,JSON.stringify({checked,unmatched,limitation:'Route correspondence only; does not establish visual completeness or successful interactions.'},null,2));
console.log({checked,unmatched});
