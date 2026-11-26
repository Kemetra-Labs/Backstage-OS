// COG-01 research port (BACK-104) of COG-P0 src/reasoner.ts, archive kawalys-cog-p0-v0.1.zip (SHA-256 b67f5545...d78ae5).
// Only change: relative imports drop the .ts extension. Synthetic research code; never imported by src/.
import type {Pack,Result,TaskResult,ResolvedTask,Reason} from './contract';
import {cmp,sortedUnique,deepFreeze} from './contract';
function cycle(pack:Pack):boolean{
 const graph=new Map(pack.tasks.map(t=>[t.id,t.requirements.flatMap(r=>r.visibleDependency?[r.visibleDependency]:[])]));
 const open=new Set<string>(),closed=new Set<string>();
 function visit(id:string):boolean{if(open.has(id))return true;if(closed.has(id))return false;open.add(id);if((graph.get(id)??[]).some(visit))return true;open.delete(id);closed.add(id);return false;}
 return pack.tasks.some(t=>visit(t.id));
}
function classify(t:ResolvedTask):TaskResult{
 const life=t.life;const root:Reason={code:life.status==='verified'?`lifecycle-${life.value}`:`lifecycle-${life.status}`,refs:sortedUnique([t.ref,...life.refs])};
 const reasons:Reason[]=[root];
 if(life.value==='complete'&&life.status==='verified')return {id:t.id,state:'done',reasons,refs:root.refs};
 if(life.status!=='verified'||life.value!=='pending')return {id:t.id,state:'unknown',reasons,refs:root.refs};
 let blocked=false,unknown=false;
 for(const r of t.requirements){const f=r.fact;let suffix:string;if(f.status!=='verified'){unknown=true;suffix=f.status;}else if(f.value!==r.expected){blocked=true;suffix='unsatisfied';}else suffix='satisfied';
  reasons.push({code:`${r.kind}-${suffix}`,requirement:r.id,refs:sortedUnique([r.ref,...f.refs])});}
 return {id:t.id,state:blocked?'blocked':unknown?'unknown':'ready',reasons,refs:sortedUnique(reasons.flatMap(r=>r.refs))};
}
export function reason(pack:Pack):Result{
 const meta={fixtureVersion:pack.fixtureVersion,policyVersion:pack.policyVersion,grantVersion:pack.grantVersion,clock:{...pack.clock}};
 if(cycle(pack))return deepFreeze({...meta,kind:'invalid-input',selected:null,tasks:[]});
 const tasks=[...pack.tasks].sort((a,b)=>cmp(a.id,b.id)).map(classify);const selected=tasks.find(t=>t.state==='ready')?.id??null;
 return deepFreeze({...meta,kind:selected?'recommended':tasks.some(t=>t.state==='unknown')?'insufficient-evidence':'no-ready-task',selected,tasks});
}
