// COG-01 research port (BACK-104) of COG-P0 src/index.ts, archive kawalys-cog-p0-v0.1.zip (SHA-256 b67f5545...d78ae5).
// Only change: relative imports drop the .ts extension. Synthetic research code; never imported by src/.
import type {Input,Scope,Clock,Result} from './contract';
import {project} from './memory';import {reason} from './reasoner';import {validate} from './validator';
export function evaluate(input:Input,scope:Scope,clock:Clock):Result{
 const pack=project(input,scope,clock);const result=reason(pack);if(!validate(pack,result))throw Error('validation-failed');return result;
}
// Serve only after rebuilding the authorized pack at the requested current grant version.
// No cache or live grant authority implemented in this prototype.
export function validateAtRead(input:Input,scope:Scope,clock:Clock,previous:unknown):boolean{try{return validate(project(input,scope,clock),previous);}catch{return false;}}
