// BACK-184: the page script of dashboard-page.html, verbatim between the two marker lines, wrapped as a
// module so the harness can require it instead of evaluating text. calc-harness.js checks it still matches.
'use strict';
module.exports = function load(dash, document, claude) {
// --- page script start ---
const AS_OF = Date.parse('2026-11-25T12:00:00Z');
function fx(f){ return (f && !Array.isArray(f)) ? f : null; }
dash.calc('src_rows', {title:'Source states', description:'Each source with its age at the fixture time and a display state.', inputs:['fixture'], fn:(fixture)=>{
  const f=fx(fixture); if(!f) return [];
  return f.sources.map(s=>{
    const age = s.lastReadAt ? Math.round((AS_OF-Date.parse(s.lastReadAt))/60000) : null;
    let shown = s.state;
    if (s.state==='ok' && age!==null && s.freshnessBudgetMin && age> s.freshnessBudgetMin) shown='stale';
    return {provider:s.provider, state:shown, ageMin:age, reason:s.reason||null};
  });
}});
dash.calc('ev_rows', {title:'Visible evidence', description:'Evidence rows the selected persona may see (client-side filter).', inputs:['fixture'], fn:(fixture)=>{
  const f=fx(fixture); if(!f) return [];
  const p=(dash.params().persona)||'owner'; const sees=f.personas[p].sees;
  const prov=Object.fromEntries(f.sources.map(s=>[s.id,s.provider]));
  return f.evidence.filter(e=>sees.includes(e.visibility)).map(e=>({id:e.id, provider:prov[e.sourceId], kind:e.payload.kind, observedAt:e.observedAt||'not read', ref:e.ref}));
}});
dash.calc('links', {title:'Deploy, error and ticket links', description:'Deployment to error when the release matches and the error was first seen after the deploy; error to ticket only when the ticket source is readable.', inputs:['fixture'], fn:(fixture)=>{
  const f=fx(fixture); if(!f) return [];
  const st=Object.fromEntries(f.sources.map(s=>[s.id,s.state]));
  const deps=f.evidence.filter(e=>e.payload.kind==='deployment');
  const errs=f.evidence.filter(e=>e.payload.kind==='error_issue');
  const tix=f.evidence.filter(e=>e.payload.kind==='ticket');
  const out=[];
  for(const d of deps) for(const e of errs){
    const same=e.payload.release===d.payload.release; const after=Date.parse(e.payload.firstSeen)>=Date.parse(d.observedAt);
    if(!(same&&after)) continue;
    const stale=st[e.sourceId]!=='ok';
    out.push({link:d.id+'>'+e.id, from:d.ref, to:e.ref, status: stale?'supported, error source stale':'supported',
      basis:'release '+d.payload.release+'; first seen '+Math.round((Date.parse(e.payload.firstSeen)-Date.parse(d.observedAt))/60000)+' min after deploy', cites:d.id+', '+e.id});
    for(const t of tix){ const readable=st[t.sourceId]==='ok';
      out.push({link:e.id+'>'+t.id, from:e.ref, to:t.ref, status: readable?'check ticket text':'unknown', basis: readable?'ticket readable':'ticket source '+st[t.sourceId]+'; not read', cites:e.id+', '+t.id}); }
  }
  return out;
}});
dash.calc('conflicts', {title:'Conflicts and gaps', description:'A health claim from a stale source contradicted by a newer failing run, and evidence that could not be read.', inputs:['fixture'], fn:(fixture)=>{
  const f=fx(fixture); if(!f) return [];
  const st=Object.fromEntries(f.sources.map(s=>[s.id,s.state])); const out=[];
  for(const c of f.evidence.filter(e=>e.payload.kind==='health_claim')){
    const svc=c.payload.service;
    const later=f.evidence.filter(e=>e.payload.kind==='workflow_run' && e.payload.conclusion==='failure' && (e.payload.workflow||'').startsWith(svc) && Date.parse(e.observedAt)>Date.parse(c.observedAt));
    if(later.length) out.push({subject:svc+' health', verdict:'conflict, unknown', why:'"'+c.payload.claim+'" from '+st[c.sourceId]+' source at '+c.observedAt.slice(11,16)+'; '+later[0].payload.workflow+' failed at '+later[0].observedAt.slice(11,16), cites:[c.id,...later.map(l=>l.id)].join(', ')});
    else out.push({subject:svc+' health', verdict: st[c.sourceId]==='ok'?c.payload.claim:'unknown', why:'only source is '+st[c.sourceId], cites:c.id});
  }
  for(const e of f.evidence.filter(e=>e.notRead)) out.push({subject:e.ref, verdict:'not read', why:'source '+st[e.sourceId], cites:e.id});
  return out;
}});
function cell(tr,v,cls){const td=document.createElement('td'); td.textContent=v==null?'':String(v); if(cls) td.className=cls; tr.appendChild(td);}
function rowsOrDash(el,id,cols,clsFn){ const d=dash.data(id); el.replaceChildren();
  if(d.status!=='ok'){ const tr=document.createElement('tr'); cell(tr, d.status==='error'?'Could not load.':'Loading…'); el.appendChild(tr); return; }
  for(const r of d.data){ const tr=document.createElement('tr'); for(const c of cols) cell(tr, Array.isArray(r[c])?r[c].join(', '):r[c], clsFn&&clsFn(c,r)); el.appendChild(tr);} }
dash.draw('srcgrid', el=>{ const d=dash.data('src_rows'); el.replaceChildren();
  if(d.status!=='ok'){ el.textContent='—'; return; }
  for(const s of d.data){ const div=document.createElement('div'); div.className='card';
    const h=document.createElement('div'); h.textContent=s.provider; h.style.fontWeight='600';
    const p=document.createElement('span'); p.className='pill '+(s.state==='ok'?'ok':s.state==='stale'?'warn':'bad'); p.textContent=s.state.replace('_',' ');
    p.dataset.source='src_rows'; p.dataset.field='state'; p.dataset.where='provider='+s.provider;
    const a=document.createElement('div'); a.className='muted'; a.textContent= s.ageMin==null ? 'never read' : ('last read '+s.ageMin+' min before fixture time');
    div.append(h,p,a); el.appendChild(div);} });
dash.draw('links', el=>rowsOrDash(el,'links',['link','from','to','status','basis','cites'],(c,r)=>c==='status'?(r.status==='unknown'?'warn':'ok'):''));
dash.draw('conflicts', el=>rowsOrDash(el,'conflicts',['subject','verdict','why','cites'],(c)=>c==='verdict'?'warn':''));
dash.draw('evtable', el=>rowsOrDash(el,'ev_rows',['id','provider','kind','observedAt','ref']));
dash.draw('evcount', el=>{ const d=dash.data('ev_rows'); el.textContent = d.status==='ok'? String(d.data.length) : '—'; });
dash.draw('dectable', el=>rowsOrDash(el,'decisions',['at','by','decision','citations']));
document.querySelectorAll('#persona').forEach(sel=>{ sel.addEventListener('change',()=>dash.setParams({persona: sel.value})); });
document.querySelectorAll('#decform').forEach(form=>form.addEventListener('submit', async ev=>{
  ev.preventDefault();
  const text=form.querySelector('#dec-text').value.trim(); const cites=form.querySelector('#dec-cites').value.split(',').map(s=>s.trim()).filter(Boolean);
  let ok=true;
  try{ const [db,user]=await Promise.all([claude.use('db'),claude.use('user')]);
    await db.collection('data/team/decisions').add({at:new Date().toISOString(), by: await user.id(), decision:text, citations:cites}); }
  catch{ ok=false; }
  form.querySelectorAll('#dec-err').forEach(p=>{p.hidden=ok;}); form.querySelectorAll('#dec-ok').forEach(p=>{p.hidden=!ok;});
}));
// --- page script end ---
};
