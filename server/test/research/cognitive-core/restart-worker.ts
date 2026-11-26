// COG-01 research port (BACK-104) of COG-P0 test/restart-worker.mjs: a separate Node process evaluates a
// serialized synthetic snapshot so the spec can compare two fresh processes. Run only by the F12b test.
import { readFileSync } from 'node:fs';
import { evaluate } from './index';

const { fixture, scope, clock } = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
process.stdout.write(JSON.stringify(evaluate(fixture, scope, clock)));
