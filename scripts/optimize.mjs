import {readFileSync} from 'node:fs';
import {runInContext} from 'node:vm';
import {boot} from './devcheck/build_sim.harness.mjs';

// JSON input only; never execute caller-provided JavaScript. One fresh context per run.
const options = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : {target:'sdps',budget:300};
if (!options || Array.isArray(options) || typeof options !== 'object') throw Error('Expected an options object');
if (!Number.isInteger(options.budget ?? 300) || (options.budget ?? 300) < 1 || options.budget > 20000) throw Error('budget must be 1..20000');
options.budget ??= 300;
const {context, errors} = boot();
await runInContext('load()',context);
if (errors.length) throw Error(errors.join('\n'));
context.reviewOptions = options;
const result = runInContext('optimizeBuild(reviewOptions)',context,{timeout:120000});
console.log(JSON.stringify(result,null,2));
