// COG-01 research port (BACK-104) of COG-P0 src/validator.ts, archive kawalys-cog-p0-v0.1.zip (SHA-256 b67f5545...d78ae5).
// Changes from COG-P0: extensionless relative imports and explicit sort/reduce arguments (README). Synthetic research code; never imported by src/.
// Independent semantic validator: uses Kahn ordering rather than reasoner's DFS,
// and verifies the entire expected result directly from resolved, authorized facts.
// It deliberately does not call reason() or classify(). Temporal projection is
// a separate trusted boundary and independently fixture-tested; no production auth.
import type {Pack,Result,TaskResult,Reason} from './contract';
import {cmp,sortedUnique,sameJSON} from './contract';
export function validate(pack:Pack,candidate:unknown):candidate is Result{
 try{
  const ids=pack.tasks.map(t=>t.id);const remaining=new Set(ids);
  while(remaining.size){const free=pack.tasks.filter(t=>remaining.has(t.id)&&t.requirements.every(r=>!r.visibleDependency||!remaining.has(r.visibleDependency)));if(!free.length)break;for(const t of free)remaining.delete(t.id);}
  const meta={fixtureVersion:pack.fixtureVersion,policyVersion:pack.policyVersion,grantVersion:pack.grantVersion,clock:pack.clock};
  if(remaining.size)return sameJSON(candidate,{...meta,kind:'invalid-input',selected:null,tasks:[]});
  const tasks:TaskResult[]=[];
  for(const t of [...pack.tasks].sort((a,b)=>cmp(a.id,b.id))){
   const l=t.life;const reasons:Reason[]=[{code:'lifecycle-'+(l.status==='verified'?l.value:l.status),refs:sortedUnique([...l.refs,t.ref])}];
   let state:TaskResult['state']='unknown';
   if(l.status==='verified'&&l.value==='complete')state='done';
   else if(l.status==='verified'&&l.value==='pending'){
    const unsatisfied=t.requirements.filter(r=>r.fact.status==='verified'&&r.fact.value!==r.expected);
    const unverified=t.requirements.filter(r=>r.fact.status!=='verified');
    state=unsatisfied.length?'blocked':unverified.length?'unknown':'ready';
    for(const r of t.requirements){const bad=unsatisfied.includes(r);const gap=unverified.includes(r);reasons.push({code:r.kind+'-'+(bad?'unsatisfied':gap?r.fact.status:'satisfied'),requirement:r.id,refs:sortedUnique([...r.fact.refs,r.ref])});}
   }
   tasks.push({id:t.id,state,reasons,refs:sortedUnique(reasons.flatMap(r=>r.refs))});
  }
  const ready=tasks.filter(t=>t.state==='ready').map(t=>t.id).sort(cmp);const selected=ready[0]??null;
  const expected={...meta,selected,kind:ready.length?'recommended':tasks.some(t=>t.state==='unknown')?'insufficient-evidence':'no-ready-task',tasks};
  return sameJSON(candidate,expected);
 }catch{return false;}
}
