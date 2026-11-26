// COG-01 research port (BACK-104) of COG-P0 src/contract.ts, archive kawalys-cog-p0-v0.1.zip (SHA-256 b67f5545...d78ae5).
// Only change: relative imports drop the .ts extension. Synthetic research code; never imported by src/.
// Standalone COG-P0 research contract. No production auth or transport.
export type Scope = Readonly<{workspace:string; project:string; grants:readonly string[]; grantVersion:string}>;
export type Clock = Readonly<{effectiveAt:number; knownAt:number; evaluationAt:number}>;
export type Value = 'complete'|'pending'|'granted'|'pass'|'fail'|'unknown';
export type SlotKind = 'lifecycle'|'dependency'|'approval'|'check';
export type Requirement = Readonly<{id:string; kind:Exclude<SlotKind,'lifecycle'>; slot:string; authorities:readonly string[]; expected:Value; dependency?:string; ref:string}>;
export type Task = Readonly<{workspace:string; project:string; source:string; id:string; ref:string; title:string; aliases:readonly string[]; requirements:readonly Requirement[]}>;
export type Event = Readonly<{workspace:string;project:string;source:string;slot:string;revision:string;order?:number;ref:string;effectiveAt:number;recordedAt:number;validUntil:number;value:Value;state:'ok'|'stale'|'error'|'denied'|'unknown'}>;
export type Input = Readonly<{fixtureVersion:string;policyVersion:string;tasks:readonly Task[];events:readonly Event[]}>;
export type Fact = Readonly<{slot:string;value:Value;status:'verified'|'missing'|'conflict'|'stale'|'unknown';refs:readonly string[]}>;
export type ResolvedRequirement = Readonly<{id:string;kind:Exclude<SlotKind,'lifecycle'>;ref:string;expected:Value;fact:Fact;visibleDependency?:string}>;
export type ResolvedTask = Readonly<{id:string;ref:string;title:string;aliases:readonly string[];life:Fact;requirements:readonly ResolvedRequirement[]}>;
export type Pack = Readonly<{fixtureVersion:string;policyVersion:string;grantVersion:string;clock:Clock;tasks:readonly ResolvedTask[]}>;
export type Reason = Readonly<{code:string;requirement?:string;refs:readonly string[]}>;
export type TaskResult = Readonly<{id:string;state:'done'|'ready'|'blocked'|'unknown';reasons:readonly Reason[];refs:readonly string[]} >;
export type Result = Readonly<{kind:'recommended'|'no-ready-task'|'insufficient-evidence'|'invalid-input';selected:string|null;tasks:readonly TaskResult[];fixtureVersion:string;policyVersion:string;grantVersion:string;clock:Clock}>;
export const sortedUnique = (xs:readonly string[]):string[] => [...new Set(xs)].sort();
export const cmp = (a:string,b:string):number => a<b?-1:a>b?1:0;
export function deepFreeze<T>(obj:T):T { if(obj!==null && typeof obj==='object' && !Object.isFrozen(obj)){Object.freeze(obj);for(const v of Object.values(obj))deepFreeze(v);}return obj; }
export function sameJSON(a:unknown,b:unknown):boolean {
 // Only plain JSON data may cross the output boundary. Reject values that JSON
 // would silently erase or coerce, including undefined, NaN and sparse arrays.
 const ancestors=new Set<object>();
 function canonical(x:unknown):unknown {
  if(x===null||typeof x==='string'||typeof x==='boolean')return x;
  if(typeof x==='number'&&Number.isFinite(x))return x;
  if(typeof x!=='object'||ancestors.has(x))throw Error('non-json');
  ancestors.add(x);
  let result:unknown;
  if(Array.isArray(x)){
   if(Object.keys(x).length!==x.length||Reflect.ownKeys(x).length!==x.length+1)throw Error('non-json');
   result=Array.from(x,canonical);
  }else{
   const proto=Object.getPrototypeOf(x);
   if((proto!==Object.prototype&&proto!==null)||Reflect.ownKeys(x).length!==Object.keys(x).length)throw Error('non-json');
   result=Object.fromEntries(Object.entries(x).sort(([a],[b])=>cmp(a,b)).map(([k,v])=>[k,canonical(v)]));
  }
  ancestors.delete(x);return result;
 }
 try{return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));}catch{return false;}
}
