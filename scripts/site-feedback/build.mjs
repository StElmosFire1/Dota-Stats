import fs from 'node:fs';
import path from 'node:path';
import { OUT, entries as currentEntries, surfaces as currentSurfaces, slug } from './inventory.mjs';
import { notes } from './notes.mjs';
const evidence = JSON.parse(fs.readFileSync(`${OUT}/evidence.json`, 'utf8'));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
for (const e of evidence.entries) {
  e.notes = notes[e.component];
  const labels = { 'sign-in-required':'sign-in-message-visible', 'entitlement-gated':'pro-message-visible', 'empty-or-waiting':'empty-or-waiting-message-visible' };
  if (labels[e.status]) {
    e.status = labels[e.status];
    e.observation = `Browser observed a ${e.status.replaceAll('-', ' ')}. This message may apply to a control or section rather than the entire page. See the screenshot and source-verified access requirements; no full workflow was executed.`;
  }
  const current = currentEntries.find(c => c.id === e.id);
  for (const t of current.tabs) if (!e.tabs.some(x => x.id === t.id)) e.tabs.push(t);
  for (const s of current.sections) if (!e.sections.some(x => x.id === s.id)) e.sections.push(s);
  if (e.component === 'GamePlay') for (const tab of e.tabs)
    tab.status = e.captures.some(c => tab.key === 'endless' ? c.state.endsWith('-endless') : c.state === 'default') ? 'captured' : 'source-only';
  for (const route of e.routes) {
    const pattern = new RegExp('^' + route.path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/:[A-Za-z]+/g,'[^/]+') + '$');
    route.visualStatus = e.captures?.some(c=>pattern.test(new URL(c.url).pathname)) ? 'Matching route instance captured; inspect the screenshot state' : 'Source-mapped only; no separate browser capture of this route variant';
  }
}
const css = `
:root{color-scheme:light;font:16px/1.6 system-ui,sans-serif;color:#182537;background:#f1f3f6}
*{box-sizing:border-box}body{margin:0;overflow-wrap:anywhere}a{color:#14568d}header{background:#101e31;color:white;padding:40px max(24px,calc((100% - 1180px)/2))}
header a{color:#ffdb6e}header h1{font-size:clamp(28px,4vw,44px);line-height:1.15;margin:10px 0}header p{max-width:850px}
main{max-width:1240px;margin:auto;padding:24px}nav,article,.panel{background:white;border:1px solid #d3dae4;border-radius:8px;padding:24px;margin:20px 0}
h2{font-size:25px;line-height:1.3}h3{margin-top:28px}h4{margin:12px 0 6px}.eyebrow,.meta{font-size:12px;letter-spacing:.04em}.eyebrow{text-transform:uppercase;color:#ffdb6e}
.tag{display:inline-block;background:#edf1f6;border-radius:5px;padding:3px 8px;font-size:12px;margin:3px}.notice{border-left:4px solid #d69419;background:#fff7df;padding:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px}.index{columns:3;column-gap:24px}.index>div{break-inside:avoid;margin-bottom:16px}
.index a{display:block;font-size:14px;margin:4px 0}figure{margin:24px 0;border:1px solid #c5cfdb;background:#f5f7fa;padding:12px;break-inside:avoid}
figure img{width:100%;height:auto;display:block}figure.mobile img{width:390px;max-width:100%;margin:auto}figcaption{padding-top:12px}
figcaption ol{margin:8px 0}code,pre,textarea{font-family:ui-monospace,monospace}code{overflow-wrap:anywhere;font-size:.88em}pre{white-space:pre-wrap}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border-bottom:1px solid #d9dfe7;text-align:left;vertical-align:top;padding:9px}
.table-scroll{overflow:auto}button,input,textarea{font:inherit}button{padding:9px 14px;border:1px solid #899bb1;background:#e9eef5;border-radius:5px;cursor:pointer}
textarea{width:100%;min-height:150px;padding:10px}input[type=search]{width:100%;padding:12px;border:1px solid #899bb1}
.muted{color:#58677b}.back{font-size:13px}.evidence{font-size:13px;border-left:3px solid #31816d;padding-left:12px}.private{border-top:6px solid #ad4250}
[hidden]{display:none!important}.filters{position:sticky;top:0;background:#f1f3f6;padding:10px 0;z-index:2}
@media(max-width:700px){main{padding:10px}article,nav,.panel{padding:16px}.index{columns:1}header{padding:24px}}
@media print{body{background:white;font-size:10pt}header{background:white;color:black;padding:0}.eyebrow{color:black}main{padding:0}.filters,button,.back,.no-print{display:none}
article{break-before:page;border:0;padding:0}.index{columns:2}figure{padding:4px;max-width:100%;break-inside:avoid}figure img{max-height:155mm;object-fit:contain}
figure.mobile img{max-height:150mm;width:auto}a{color:inherit;text-decoration:none}details>*{display:block!important}summary{display:block}h2,h3{break-after:avoid}.panel,nav{border:0}}
`;
const script = `
document.getElementById('find').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('article[data-search]').forEach(a=>a.hidden=!a.dataset.search.includes(q));});
document.querySelectorAll('[data-feedback]').forEach(b=>b.addEventListener('click',async()=>{const t=document.getElementById('feedback');t.value='Page: '+b.dataset.feedback+'\\nCallout: \\nIssue: \\nSuggestion: \\nPriority: low / medium / high\\n';t.scrollIntoView({behavior:'smooth'});t.focus();t.select();try{await navigator.clipboard.writeText(t.value);document.getElementById('copy-status').textContent='Copied.'}catch{document.getElementById('copy-status').textContent='Template selected. Use Copy on your device.'}}));
document.getElementById('copy').addEventListener('click',()=>{const t=document.getElementById('feedback');t.focus();t.select();navigator.clipboard?.writeText(t.value).then(()=>document.getElementById('copy-status').textContent='Copied.').catch(()=>document.getElementById('copy-status').textContent='Use Copy on your device.');});
window.addEventListener('beforeprint',()=>document.querySelectorAll('article').forEach(a=>a.hidden=false));
`;

function figure(c, e, inline, directory) {
  const file = `${directory}/${c.file}`;
  if (!fs.existsSync(file)) throw Error(`Missing media ${file}`);
  const src = inline ? `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}` : c.file;
  return `<figure class="${c.state === 'mobile' ? 'mobile' : ''}" id="${esc(e.id+'-'+slug(c.state)+(c.file.includes('-detail.')?'-detail':''))}-figure-${esc(slug(c.file))}">
  <a href="${esc(src)}" title="Open full-resolution annotated screenshot"><img src="${esc(src)}" alt="${esc(e.title)} — ${esc(c.state)}; numbered callouts are described below" loading="lazy" width="${c.viewport.width}" height="${c.viewport.height}"></a>
  <figcaption><strong>${esc(c.state.replaceAll('-', ' '))}</strong>${c.masks ? ` · Privacy-redacted: ${c.masks} dynamic text/media regions masked before capture.` : ''}
  <ol>${c.callouts.map(x=>`<li id="${esc(x.id)}"><code>${esc(x.id)}</code> — <strong>${esc(x.label)}</strong>. ${caption(x.label, e, c)}</li>`).join('')}</ol>
  <p class="meta">${esc(c.url)}<br>Tab/state: ${esc(c.state)} · Role: ${esc(c.role)} · ${c.viewport.width}×${c.viewport.height}, scroll ${Math.round(c.scrollY)} px<br>${esc(c.environment)} · Capture: ${esc(c.capturedAt)} · Reference source: ${esc(c.sourceRevision)}</p></figcaption></figure>`;
}
function caption(label, entry, capture) {
  if (/current page state|restricted page heading/i.test(label)) return 'This marker identifies the visible state, not a hidden control. Read the access/data limitation above.';
  if (/sign.?in|access|admin only|not found|unavailable/i.test(label)) return 'This is an access or availability message; it does not demonstrate the protected workflow.';
  if (capture.state.startsWith('tab-')) return 'This identifies the selected section. Its controls belong to this tab; switching tabs is navigation, not confirmation of an action.';
  if (capture.state === 'mobile') return 'Compare this heading and its surrounding layout with the desktop view. Check whether the next step is clear on a narrow screen.';
  if (label.includes(entry.title)) return 'This heading establishes the page context. Use the workflow above to understand what a reviewer would do next.';
  return 'This heading identifies a distinct part of the page. Read the nearby labels and values together; a blank or gated region is not a successful result.';
}
function pageEntry(e, inline, directory) {
  const [group, purpose, audience, workflow, result] = e.notes;
  const related = evidence.entries.filter(x => x.private === e.private && x.id !== e.id && x.notes?.[0] === group).slice(0,4);
  const captures = e.captures || [];
  return `<article id="${e.id}" data-search="${esc((e.title+' '+group+' '+e.routes.map(r=>r.path).join(' ')+' '+e.tabs.map(t=>t.label).join(' ')).toLowerCase())}">
  <a class="back" href="#index">Back to page index</a><p class="muted">${esc(group)} · <code>${e.id}</code></p>
  <h2>${esc(e.title)}</h2><p>${esc(purpose)}</p><span class="tag">${esc(e.status)}</span><span class="tag">${captures.length} actual screenshots</span>
  <div class="grid"><div><h3>Who and how to reach it</h3><p>${esc(audience)}.</p><p>Open <code>${esc(e.routes[0].path)}</code>${e.representative ? `; the captured example uses <code>${esc(e.representative)}</code>` : ' using an eligible record from its parent index'}. The route table below lists aliases and related entry points.</p></div>
  <div><h3>Typical workflow</h3><p><strong>Source-verified explanation; not an executed transaction:</strong> ${esc(workflow)}</p><p><strong>Expected result:</strong> ${esc(result)}</p></div></div>
  <h3>What was actually observed</h3><p class="evidence">${esc(e.observation || 'No browser evidence is available. This entry accounts for the source-defined route only.')}</p>
  ${e.flags.length ? `<p>Source-defined feature gates: ${e.flags.map(f=>`<code>${esc(f)}</code>`).join(', ')}. No flag was changed for capture.</p>` : ''}
  ${e.private ? '<p class="notice">Private appendix. Dynamic records, inputs, images and operational values are masked. Automation elevation does not supply a player/coach Steam identity. Sign-in prompts are access gaps, not completed visual coverage of the protected screen.</p>' : ''}
  <h3>Controls and meaningful states</h3>
  ${e.tabs.length ? `<div class="table-scroll"><table><thead><tr><th>Stable tab ID / control</th><th>Purpose and evidence</th></tr></thead><tbody>${e.tabs.map(t=>`<tr id="${esc(t.id)}"><td><code>${esc(t.id)}</code><br>${esc(t.label)}</td><td>${esc(t.description || `Choose ${t.label.replace(/^[^\p{L}\p{N}]+/u,'')} to change the analysis or settings section without leaving this page family.`)}<br><strong>${esc(t.status)}</strong></td></tr>`).join('')}</tbody></table></div>` : `<p>${esc(workflow)} Any submission, purchase, save, deletion or participation control was left untouched.</p>`}
  ${captures.map(c=>figure(c,e,inline,directory)).join('')}
  ${!captures.length ? '<p class="notice">No screenshot: a safe representative record or required access was unavailable. No reconstructed or invented UI is substituted.</p>' : ''}
  ${e.sections.length ? `<details><summary>Section inventory (${e.sections.length}) — including source-only and record-dependent regions</summary><table><thead><tr><th>Section reference</th><th>Coverage</th></tr></thead><tbody>${e.sections.map(s=>`<tr id="${esc(s.id)}"><td>${esc(s.label)}<br><code>${esc(s.id)}</code></td><td>${esc(s.status)}${s.source ? `<br>Source: <code>${esc(s.source)}</code>` : ''}</td></tr>`).join('')}</tbody></table></details>` : ''}
  <h3>Neutral review questions</h3><ul><li>Can the intended audience identify the next step and any prerequisites?</li><li>Do the labels, selected context and result make sense together?</li><li>Does an empty, gated or error state explain what the reviewer can do next?</li>${captures.some(c=>c.state==='mobile')?'<li>On mobile, are the key information and controls readable without losing context?</li>':''}</ul>
  <button data-feedback="${e.id}">Copy feedback template for this page</button>
  <h3>Route family and provenance</h3><table><thead><tr><th>Route pattern</th><th>Relationship and visual evidence</th></tr></thead><tbody>${e.routes.map((r,i)=>`<tr><td><code>${esc(r.path)}</code></td><td>${i===0?'Primary registered entry':'Same component family; parameters, initial tab or identity resolution can differ'}${r.props ? ` · ${esc(r.props)}` : ''}<br>${esc(r.visualStatus)}</td></tr>`).join('')}</tbody></table>
  <p class="meta">Source explanation checked against <code>${esc(e.source)}</code> at ${esc(e.sourceRevision)}. A source-defined feature is not proof that the deployed version exposes it.</p>
  <p>Related: ${related.map(x=>`<a href="#${x.id}">${esc(x.title)}</a>`).join(' · ') || 'Use the group index above.'}</p></article>`;
}

function build(privateDoc, inline = false) {
  const directory = `${OUT}/${privateDoc ? 'private' : 'main'}`;
  const list = evidence.entries.filter(e => e.private === privateDoc);
  const groups = [...new Set(list.map(e => e.notes[0]))];
  const total = list.reduce((n,e)=>n+(e.captures?.length||0),0);
  const title = privateDoc ? 'OCE Inhouse — Private review appendix' : 'OCE Inhouse — Annotated site feedback guide';
  const issues = list.filter(e => ['browser-error','capture-interrupted','error-or-missing-data','blank-or-transparent'].includes(e.status));
  const sharedSurfaces = evidence.surfaces.filter(s => (s[4] !== 'anonymous') === privateDoc);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css}</style></head>
  <body class="${privateDoc?'private':''}"><header><div class="eyebrow">${privateDoc?'Restricted distribution • owner and approved staff only':'Reviewer edition • public and player-facing surfaces'}</div><h1>${title}</h1>
  <p>Actual website captures with numbered visual references, plain-language workflows and explicit access gaps. This is not a redesign and does not simulate missing screens.</p>
  <p>${list.length} page families · ${list.reduce((n,e)=>n+e.routes.length,0)} registered route patterns · ${total} screenshots · Capture date ${esc(evidence.capturedAt.slice(0,10))} (UTC)</p>
  <a href="#index">Page index</a> · <a href="#coverage">Coverage and limitations</a> · <a href="#observations">Observed issues</a> · <a href="#feedback">Feedback template</a></header>
  <main><section class="panel"><h2>Open, navigate and share</h2><ol><li>For the portable package, extract the whole ZIP and open <strong>index.html</strong> in a modern browser. Keep the media folder beside it. No app, server, Replit account or source checkout is needed.</li>
  <li>The standalone HTML embeds its screenshots and can be shared as one file. Click a screenshot to see it at full resolution. Use the index or search to find a page.</li>
  <li>Use your browser’s Print → Save as PDF for a print-friendly copy. The full guide is long; select the relevant pages when printing.</li>
  <li>${privateDoc?'Keep this appendix and its ZIP restricted to approved staff. It is physically separate and is not linked from the shareable guide.':'Share only the main guide or main ZIP. Private appendix assets are not bundled, linked or loaded by this document.'}</li></ol>
  <p class="notice">Live data changes. Reference source revision ${esc(list[0].sourceRevision)}; the deployed revision could not be independently verified. Captures show production, not a synthetic staging environment. No purchases, writes, notifications, queue joins or destructive actions were demonstrated.</p></section>
  <section class="panel" id="coverage"><h2>Coverage and evidence rules</h2>
  <p>The combined documents account for ${evidence.entries.length} canonical page families and ${evidence.entries.reduce((n,e)=>n+e.routes.length,0)} route patterns from the full-edition router. Dynamic IDs are representative instances, not an exhaustive archive. Community edition is excluded.</p>
  <p><strong>Browser-observed</strong> means the visible state was captured. <strong>Source-verified</strong> means the intended controls/workflow were read from the current code. <strong>Source-only</strong> means there is no visual evidence for that state. An HTTP 200 or rendered page is not proof of functional success.</p>
  <p>Personal settings and coach records require a consented player/coach identity that was not available. A superuser automation session was authorized for staff captures but does not impersonate a player. Record-dependent pages without a public sample link are explicitly listed as unavailable. No authentication, feature flag or record was altered to manufacture coverage.</p>
  <p>Mutation requests were blocked in the browser after establishing the authorized session. This can suppress analytics or automatic write-based features; it is a capture safety constraint, not an app defect. First-visit announcements were captured separately where available and then dismissed through their normal controls.</p>
  <div class="table-scroll"><table><thead><tr><th>Page</th><th>State / screenshots</th><th>Tabs</th></tr></thead><tbody>${list.map(e=>`<tr><td><a href="#${e.id}">${esc(e.title)}</a></td><td>${esc(e.status)} · ${e.captures?.length||0}</td><td>${e.tabs.filter(t=>t.status==='captured').length}/${e.tabs.length} captured</td></tr>`).join('')}</tbody></table></div></section>
  <nav id="index"><h2>Browse by journey</h2><div class="index">${groups.map(g=>`<div><strong>${esc(g)}</strong>${list.filter(e=>e.notes[0]===g).map(e=>`<a href="#${e.id}">${esc(e.title)}</a>`).join('')}</div>`).join('')}</div></nav>
  <section class="panel" id="observations"><h2>Observed issues — separate from improvement ideas</h2>
  <p>These are captured symptoms that deserve review, not confirmed root causes. Empty datasets, entitlement gates, transparent overlays and missing example records are not automatically defects.</p>
  ${issues.length?`<ul>${issues.map(e=>`<li><a href="#${e.id}">${esc(e.title)}</a>: ${esc(e.observation)}</li>`).join('')}</ul>`:'<p>No browser-error symptoms were classified in this document’s captured set. This does not establish that the site is defect-free.</p>'}
  <p><strong>Suggested review directions (not observed defects):</strong> assess whether the next step is clear, terminology is understandable, and dense statistics remain readable on mobile. Record a specific page and callout rather than requesting an unexplained redesign.</p></section>
  <section class="panel" id="special-surfaces"><h2>Shared and special-purpose surfaces</h2>
  ${sharedSurfaces.map(s=>`<div id="surface-${s[0]}"><h3>${esc(s[1])}</h3><p><code>surface-${s[0]}</code> · ${esc(s[3])} · Audience: ${esc(s[4])}</p><p>${esc(s[5])}</p><p class="evidence">${esc(s[6] || 'Source-verified surface; no separate interaction capture yet. Access or safety constraints apply; not completed visual coverage.')}</p></div>`).join('')}
  ${list.filter(e=>e.component==='Home').flatMap(e=>e.extraCaptures||[]).map(c=>figure(c,list.find(e=>e.component==='Home'),inline,directory)).join('')}</section>
  <div class="filters no-print"><label for="find">Filter page entries by name, route, group or tab</label><input id="find" type="search" placeholder="Try heroes, replay, settings or /matches"></div>
  ${list.map(e=>pageEntry(e,inline,directory)).join('')}
  <section class="panel" id="feedback-panel"><h2>Copyable feedback</h2><p>Include one issue per report. Callout IDs remain stable within this snapshot. No feedback is transmitted by this offline document.</p>
  <textarea id="feedback" aria-label="Feedback template">Page:
Callout:
Issue:
Suggestion:
Priority: low / medium / high</textarea><button id="copy">Copy template</button><span id="copy-status" role="status"></span>
  <h3>Privacy and capture boundaries</h3><p>Public captures use an anonymous session and public representative records. Public player handles and match statistics can appear because they are part of the public pages. Private captures mask dynamic text, form values and visual record data before saving. Neither package includes credentials, session cookies, browser storage, raw API responses or app source.</p>
  <p>Private review content remains restricted even after redaction. Do not redistribute the private appendix as the public guide. The packages do not call the application or load third-party resources; live URLs in captions are reference text.</p></section>
  </main><script>${script}</script></body></html>`;
}
for (const privateDoc of [false, true]) {
  const dir = `${OUT}/${privateDoc ? 'private' : 'main'}`;
  // Do not accidentally package superseded captures from earlier attempts.
  const referenced = new Set(evidence.entries.filter(e=>e.private===privateDoc).flatMap(e=>[...(e.captures||[]),...(e.extraCaptures||[])]).map(c=>path.basename(c.file)));
  for (const file of fs.readdirSync(`${dir}/media`)) if (!referenced.has(file)) fs.unlinkSync(`${dir}/media/${file}`);
  fs.writeFileSync(`${dir}/index.html`, build(privateDoc));
  fs.writeFileSync(`${OUT}/${privateDoc ? 'PRIVATE-appendix' : 'OCE-Inhouse-guide'}.html`, build(privateDoc, true));
  const manifest = evidence.entries.filter(e => e.private === privateDoc);
  fs.writeFileSync(`${dir}/coverage.json`, JSON.stringify({ captureDate: evidence.capturedAt, entries: manifest }, null, 2));
  fs.writeFileSync(`${dir}/README.txt`, `${privateDoc?'PRIVATE — only share with approved staff.':'SHAREABLE MAIN GUIDE — contains only anonymous/public captures.'}\nExtract the entire ZIP, then open index.html in a modern browser.\nKeep media/ beside index.html. No server, Replit account or app source is required.\nUse the search field, page index and numbered callout IDs to give feedback.\nUse browser Print / Save as PDF for a print-friendly copy.\nThe standalone HTML at the top level is an alternative one-file edition.\nCoverage gaps are explicit; source explanations are not browser tests.\n`);
}
fs.writeFileSync(`${OUT}/coverage-summary.json`, JSON.stringify({
  families: evidence.entries.length, routes: evidence.entries.reduce((n,e)=>n+e.routes.length,0),
  screenshots: evidence.entries.reduce((n,e)=>n+(e.captures?.length||0),0),
  gaps: evidence.entries.filter(e=>!e.captures?.length).map(e=>({ id:e.id,status:e.status })),
},null,2));
console.log('Built independent main and private HTML editions.');
