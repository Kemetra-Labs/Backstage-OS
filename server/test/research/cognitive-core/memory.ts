// COG-01 research port (BACK-104) of COG-P0 src/memory.ts, archive kawalys-cog-p0-v0.1.zip (SHA-256 b67f5545...d78ae5).
// Changes from COG-P0: extensionless relative imports and explicit sort/reduce arguments (README). Synthetic research code; never imported by src/.
import type {Scope,Clock,Input,Task,Event,Fact,Pack,ResolvedTask,Value} from './contract';
import {cmp,deepFreeze,sortedUnique} from './contract';
const text=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<=500;
const time=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const values=new Set<Value>(['complete','pending','granted','pass','fail','unknown']);
const inScope=(x:{workspace:string;project:string;source:string},s:Scope)=>x.workspace===s.workspace&&x.project===s.project&&s.grants.includes(x.source);
const missing=(slot:string,status:Fact['status']='missing',refs:readonly string[]=[]):Fact=>({slot,value:'unknown',status,refs:sortedUnique(refs)});
function validateScope(s:Scope,c:Clock){if(!text(s.workspace)||!text(s.project)||!text(s.grantVersion)||!Array.isArray(s.grants)||!s.grants.every(text)||!time(c.effectiveAt)||!time(c.knownAt)||!time(c.evaluationAt)||c.effectiveAt>c.evaluationAt||c.knownAt>c.evaluationAt)throw Error('invalid-input');}
function validateTask(t:Task){
 if(!text(t.id)||!text(t.ref)||!text(t.title)||!Array.isArray(t.aliases)||!t.aliases.every(text)||!Array.isArray(t.requirements))throw Error('invalid-input');
 const seen=new Set<string>();for(const r of t.requirements){
  if(!text(r.id)||seen.has(r.id)||!text(r.ref)||!text(r.slot)||!Array.isArray(r.authorities)||!r.authorities.length||!r.authorities.every(text)||!['dependency','approval','check'].includes(r.kind))throw Error('invalid-input');
  const valid=r.kind==='dependency'?r.expected==='complete'&&text(r.dependency)&&r.slot===`life:${r.dependency}`:r.kind==='approval'?r.expected==='granted'&&r.dependency===undefined:r.expected==='pass'&&r.dependency===undefined;
  if(!valid)throw Error('invalid-input');seen.add(r.id);
 }
}
function validEvent(e:Event):boolean{return text(e.ref)&&text(e.slot)&&text(e.revision)&&(e.order===undefined||time(e.order))&&time(e.effectiveAt)&&time(e.recordedAt)&&time(e.validUntil)&&e.validUntil>=e.effectiveAt&&values.has(e.value)&&['ok','stale','error','denied','unknown'].includes(e.state);}
function perSource(slot:string,events:readonly Event[],clock:Clock):Fact{
 if(!events.length)return missing(slot);
 // Revisions are only ordered when the fixture adapter explicitly declares integer order.
 // Opaque distinct revisions or inconsistent ordering are unresolved, never lexically sorted.
 const refs=sortedUnique(events.map(e=>e.ref));const groups=new Map<string,Event[]>();
 for(const e of events){const group=groups.get(e.revision)??[];group.push(e);groups.set(e.revision,group);}
 const semantic=(e:Event)=>JSON.stringify([e.value,e.state,e.order??null,e.effectiveAt,e.validUntil]);
 if([...groups.values()].some(g=>new Set(g.map(semantic)).size>1))return missing(slot,'conflict',refs);
 let group:Event[];
 if(groups.size===1)group=[...groups.values()][0]!;
 else {const representatives=[...groups.values()].map(g=>g[0]!);if(representatives.some(e=>e.order===undefined)||new Set(representatives.map(e=>e.order)).size!==representatives.length)return missing(slot,'conflict',refs);const latest=representatives.reduce((a,b)=>a.order!>b.order!?a:b,representatives[0]!);group=groups.get(latest.revision)!;}
 // Preserve earliest canonical evidence for an identical replay, even if it was assigned a new storage ref.
 const e=[...group].sort((a,b)=>a.recordedAt-b.recordedAt||cmp(a.ref,b.ref))[0]!;const support=[e.ref];
 if(e.state==='stale'||clock.evaluationAt>=e.validUntil)return missing(slot,'stale',support);
 if(e.state!=='ok'||e.value==='unknown')return missing(slot,'unknown',support);
 return {slot,value:e.value,status:'verified',refs:support};
}
function resolve(slot:string,authorities:readonly string[],events:readonly Event[],scope:Scope,clock:Clock):Fact{
 // All declared authorities must be accessible and agree. Generic missing proof on absent grant.
 // Do not cite identifiers of inaccessible or undisclosed sources.
 if(authorities.some(s=>!scope.grants.includes(s)))return missing(slot);
 const allowed=sortedUnique(authorities);
 const results=allowed.map(s=>perSource(slot,events.filter(e=>e.source===s&&e.slot===slot&&e.effectiveAt<=clock.effectiveAt&&e.recordedAt<=clock.knownAt),clock));
 const refs=sortedUnique(results.flatMap(r=>r.refs));
 if(results.some(r=>r.status==='conflict')||new Set(results.filter(r=>r.status==='verified').map(r=>r.value)).size>1)return missing(slot,'conflict',refs);
 if(results.some(r=>r.status!=='verified'))return missing(slot,results.some(r=>r.status==='stale')?'stale':results.some(r=>r.status==='unknown')?'unknown':'missing',refs);
 return {slot,value:results[0]!.value,status:'verified',refs};
}
export function project(input:Input,scope:Scope,clock:Clock):Pack{
 validateScope(scope,clock);if(!text(input.fixtureVersion)||!text(input.policyVersion)||!Array.isArray(input.tasks)||!Array.isArray(input.events))throw Error('invalid-input');
 // Filter first: unrelated or inaccessible record contents cannot change authorized output.
 const tasks:Task[]=input.tasks.filter(t=>t&&inScope(t,scope)).sort((a,b)=>cmp(a.id,b.id));
 const events:Event[]=input.events.filter(e=>e&&inScope(e,scope));
 const ids=new Set<string>();const declared=new Map<string,Set<string>>();const register=(slot:string,sources:readonly string[])=>{const s=declared.get(slot)??new Set<string>();sources.forEach(x=>s.add(x));declared.set(slot,s);};
 for(const t of tasks){validateTask(t);if(ids.has(t.id))throw Error('invalid-input');ids.add(t.id);register(`life:${t.id}`,[t.source]);}
 const visibleById=new Map(tasks.map(t=>[t.id,t]));
 for(const t of tasks)for(const r of t.requirements){if(r.kind==='dependency'){const dependency=visibleById.get(r.dependency!);if(dependency)register(r.slot,[dependency.source]);}else register(r.slot,r.authorities);}
 // A non-authoritative or irrelevant note is not a fact slot. Do not execute text.
 const relevant=events.filter(e=>declared.get(e.slot)?.has(e.source)&&!(time(e.recordedAt)&&e.recordedAt>clock.knownAt)&&!(time(e.effectiveAt)&&e.effectiveAt>clock.effectiveAt));
 if(relevant.some(e=>!validEvent(e)))throw Error('invalid-input');
 const usedRefs=new Map<string,string>();
 for(const t of tasks)for(const ref of [t.ref,...t.requirements.map(r=>r.ref)]){if(usedRefs.has(ref))throw Error('invalid-input');usedRefs.set(ref,'definition');}
 for(const e of relevant){const key=JSON.stringify([e.source,e.slot,e.revision]);const prev=usedRefs.get(e.ref);if(prev!==undefined&&prev!==key)throw Error('invalid-input');usedRefs.set(e.ref,key);}
 const result:ResolvedTask[]=tasks.map(t=>{
  const life=resolve(`life:${t.id}`,[t.source],relevant,scope,clock);
  if(life.status==='verified'&&!['complete','pending'].includes(life.value))throw Error('invalid-input');
  const requirements=[...t.requirements].sort((a,b)=>cmp(a.id,b.id)).map(r=>{
   const dependency=r.dependency?visibleById.get(r.dependency):undefined;
   // A missing/withheld dependency has no ID or source exposed in the pack.
   const fact=r.kind==='dependency'&&!dependency?missing(r.id):resolve(r.slot,r.kind==='dependency'?[dependency!.source]:r.authorities,relevant,scope,clock);
   const permitted=r.kind==='approval'?['granted','pending','fail']:r.kind==='check'?['pass','fail','pending']:['complete','pending'];
   if(fact.status==='verified'&&!permitted.includes(fact.value))throw Error('invalid-input');
   return {id:r.id,kind:r.kind,ref:r.ref,expected:r.expected,fact:{...fact,slot:r.id},...(dependency?{visibleDependency:dependency.id}:{})};
  });return {id:t.id,ref:t.ref,title:t.title,aliases:[...t.aliases].sort(cmp),life,requirements};
 });
 return deepFreeze({fixtureVersion:input.fixtureVersion,policyVersion:input.policyVersion,grantVersion:scope.grantVersion,clock:{...clock},tasks:result});
}
// Search-only normalization. Never alter native identifiers or original evidence.
const normalize=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/gu,'').replace(/[أإآٱ]/gu,'ا').trim();
const tokens=(s:string)=>[...new Set(normalize(s).match(/[\p{L}\p{N}]+/gu)??[])];
export function retrieve(pack:Pack,query:string):Readonly<{kind:'match'|'no-match'|'ambiguous';ids:readonly string[]}>{
 if(typeof query!=='string'||!query.trim()||query.length>500)return {kind:'no-match',ids:[]};
 const exact=pack.tasks.filter(t=>t.id===query.trim());if(exact.length===1)return {kind:'match',ids:[exact[0]!.id]};
 // Native-looking task IDs are exact only: avoid a fuzzy identity collision.
 if(/^T[0-9]+$/i.test(query.trim()))return {kind:'no-match',ids:[]};
 const q=tokens(query);if(!q.length)return {kind:'no-match',ids:[]};
 const found=pack.tasks.filter(t=>{const set=new Set(tokens([t.title,...t.aliases].join(' ')));return q.every(x=>set.has(x));}).map(t=>t.id).sort(cmp);
 return found.length===1?{kind:'match',ids:found}:{kind:found.length?'ambiguous':'no-match',ids:[]};
}
