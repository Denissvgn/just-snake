import {test} from 'node:test';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../helpers/config.mjs';
import {runWorker} from '../helpers/process.mjs';
import {parseCapabilityOptions,validateCapability,validateCapabilityReport,boundedOperation,forceOwnedBrowser,finalizeCapabilityReport,acquireOwnedHTTP} from '../../scripts/check-browser-capabilities.mjs';
import config from '../../playwright.config.mjs';
import {createServer} from '../../scripts/serve.mjs';
// Data fixtures test rejection contracts only; actual renderer certification is the live preflight.
const row={engine:'chromium',passed:true,executableArchitecture:'Mach-O arm64',gl:{supported:true,lost:false,error:0,shaderCompiled:true,programLinked:true,pixel:[51,102,153,255]},boot:{booted:true,frames:1,lost:false,failure:null},gamePixels:{w:128,h:128,framebufferBound:false,error:0,nonzeroPixels:100,distinctColors:10,frames:1,attempts:1},record:{schemaVersion:2,rulesVersion:2,seed:'browser-capability-preflight-v2',mode:'classic',category:'custom',timeMs:115,outcome:'wall'},recordCount:1,nativeActions:[{trusted:true,screen:'playing'}],completion:{resumeCount:0,maxResumes:3,timeoutMs:15000,elapsedMs:100},final:{booted:true,frames:2,lost:false,failure:null,hidden:false,focused:true},errors:{pageErrors:[],consoleErrors:[],unexpectedRequests:[]}};
test('Semantic browser configuration retains per-case PNG and DOM/network/source tracing without screencast',()=>{
 assert.deepEqual(config.use.viewport,{width:1000,height:700});assert.equal(config.use.screenshot,'on');
 assert.deepEqual(config.use.trace,{mode:'on',screenshots:false,snapshots:true,sources:true});
 assert.equal(config.timeout,30000);assert.equal(config.workers,1);assert.equal(config.retries,0);
});
test('Capability parser rejects empty unknown duplicate selectors and missing candidate',()=>{
 for(const args of[[],['--candidate','x','--output','y','--engines',''],['--candidate','x','--output','y','--engines','chrome'],['--candidate','x','--output','y','--engines','firefox,firefox'],['--candidate','x','--output','y','--output','z']])assert.throws(()=>parseCapabilityOptions(args));
 assert.deepEqual(parseCapabilityOptions(['--candidate','x','--output','y']).engines,['chromium','firefox','webkit']);
});
test('Capability contract rejects absent GL failed pixels blank game no movement errors and identity drift',()=>{
 assert.equal(validateCapability(row),true);
 for(const mutate of[r=>r.gl.supported=false,r=>r.gl.pixel=[0,0,0,0],r=>r.gl.error=1282,r=>r.gl.shaderCompiled=false,r=>r.gamePixels.nonzeroPixels=0,r=>r.gamePixels.framebufferBound=true,r=>r.boot.frames=0,r=>r.record.timeMs=0,r=>r.final.frames=1,r=>r.final.lost=true,r=>r.nativeActions[0].trusted=false,r=>delete r.gamePixels.nonzeroPixels,r=>delete r.gamePixels.distinctColors,r=>r.errors={},r=>delete r.boot.frames,r=>delete r.final.frames,r=>delete r.boot.lost,r=>delete r.final.lost,r=>r.gl.supported='true',r=>r.gl.shaderCompiled=1,r=>r.boot.booted=1,r=>r.final.focused='true',r=>delete r.completion.resumeCount,r=>r.completion.resumeCount=4,r=>r.completion.timeoutMs=16000,r=>r.gamePixels.nonzeroPixels='100',r=>r.errors.consoleErrors=['unknown'],r=>r.errors.unexpectedRequests=['https://external.invalid']]){const bad=structuredClone(row);mutate(bad);assert.throws(()=>validateCapability(bad));}
 const identity={files:{fixture:'hash'},sha256:'identity'},payload={'index.html':{sha256:'bytes',bytes:1}};
 const report={schemaVersion:1,kind:'candidate-capability-preflight',passed:true,architecture:'arm64',platform:'darwin',engines:['chromium'],inputs:identity,payload,checks:[row]};
 const expected={engines:['chromium'],inputs:identity,payload,platform:'darwin'};assert.equal(validateCapabilityReport(report,expected),true);const unsupported=structuredClone(report);unsupported.platform='linux';unsupported.engines=['webkit'];unsupported.checks[0].engine='webkit';assert.throws(()=>validateCapabilityReport(unsupported,{...expected,engines:['webkit']}),/platform/);
 for(const mutate of[r=>r.checks=[],r=>r.checks.push(row),r=>r.passed=false,r=>r.engines=['firefox'],r=>r.inputs.sha256='drift',r=>r.payload['index.html'].sha256='drift',r=>r.architecture='x64',r=>r.platform='unknown']){const bad=structuredClone(report);mutate(bad);assert.throws(()=>validateCapabilityReport(bad,expected));}
});
test('Hosted release fails fast and preserves failed incomplete evidence when native browser is missing',{timeout:20000},async()=>{
 const directory=await fs.mkdtemp(path.join(ROOT,'.artifacts/capability-failfast-'));
 const result=await runWorker(process.execPath,[path.join(ROOT,'scripts/run-tests.mjs'),'release','--only=A01 redirects'],{timeoutMs:15000,cwd:ROOT,env:{...process.env,GITHUB_ACTIONS:'true',PLAYWRIGHT_BROWSERS_PATH:path.join(directory,'missing-native-browsers'),TEST_ARTIFACTS:directory}});
 assert.equal(result.timedOut,false);assert.notEqual(result.exitCode,0);
 const report=JSON.parse(await fs.readFile(path.join(directory,'release-results.json')));
 assert.equal(report.passed,false);assert.equal(report.incomplete,true);assert.equal(report.failFast,true);assert.equal(report.scope,'partial_failed');assert.equal(report.status,'partial_failed');assert.equal(report.intendedScope,'filtered_subset');
 const partitions=report.checks.filter(c=>c.name.startsWith('release-')&&c.name!=='release-inventory');assert.equal(partitions.length,1);assert.equal(partitions[0].exitCode,1);assert.equal(report.abortedAfter,partitions[0].name);
 assert.equal(report.checks.some(c=>c.name.startsWith('release-firefox-')||c.name.startsWith('release-dist-')),false);
 await assert.doesNotReject(()=>fs.access(path.join(partitions[0].evidence,'stderr.log')));
});

test('Fresh capability CLI selects the repo-owned browser cache before registry imports',{timeout:10000},async()=>{
 const env={...process.env};delete env.PLAYWRIGHT_BROWSERS_PATH;
 const result=await runWorker(process.execPath,['--input-type=module','-e',"await import('./scripts/check-browser-capabilities.mjs');const{chromium}=await import('playwright');console.log(JSON.stringify({cache:process.env.PLAYWRIGHT_BROWSERS_PATH,executable:chromium.executablePath()}));"],{timeoutMs:8000,cwd:ROOT,env});
 assert.equal(result.exitCode,0,result.output.toString());const value=JSON.parse(result.stdout.toString());assert.equal(value.cache,path.join(ROOT,'.tools/playwright'));assert.ok(value.executable.startsWith(value.cache+path.sep));
});

test('Wedged capability operations and owned-process cleanup remain bounded',{timeout:5000},async()=>{
 await assert.rejects(()=>boundedOperation('wedged readback',()=>new Promise(()=>{}),20),/deadline exceeded/);
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});await once(child,'spawn');
 const closed=once(child,'close');
 try{
  await assert.rejects(()=>forceOwnedBrowser({process:()=>child,kill:()=>new Promise(()=>{})},{timeoutMs:20}),/Owned browser kill deadline exceeded/);
  await boundedOperation('controlled owned child close',()=>closed,1000);
  assert.throws(()=>process.kill(child.pid,0),/ESRCH/);
 }finally{try{process.kill(-child.pid,'SIGKILL');}catch{}}
});

test('Cleanup failure persists a failed preflight and prevents any release matrix',{timeout:5000},async()=>{
 const candidate={inputs:{files:{fixture:'negative-contract-only'},sha256:'identity'},payload:{'index.html':{sha256:'bytes',bytes:1}}};
 const otherwiseValid={schemaVersion:1,kind:'candidate-capability-preflight',passed:true,architecture:'arm64',platform:process.platform,engines:['chromium'],inputs:candidate.inputs,payload:candidate.payload,checks:[structuredClone(row)]};
 let saved;
 await assert.rejects(()=>finalizeCapabilityReport(otherwiseValid,{closeHTTP:async()=>{throw Error('controlled HTTP cleanup failure');},persist:async report=>{saved=structuredClone(report);}}),/controlled HTTP cleanup failure/);
 assert.equal(saved.passed,false);assert.match(saved.error,/controlled HTTP cleanup failure/);
 const original=Error('original readback timeout');let originalSaved;
 await assert.rejects(()=>finalizeCapabilityReport({passed:false,error:original.message},{originalError:original,closeHTTP:async()=>{throw Error('secondary cleanup failure');},persist:async report=>{originalSaved=structuredClone(report);}}),error=>error===original);
 assert.equal(originalSaved.error,original.message);assert.match(originalSaved.cleanupErrors[0],/secondary/);
 const{releaseAfterCapability}=await import('../../scripts/qualify.mjs');let matrices=0;
 await assert.rejects(()=>releaseAfterCapability({candidate:'unused-negative-fixture',output:ROOT,engines:'chromium'},candidate,{preflight:async()=>saved,runMatrix:async()=>{matrices++;}}),/Failed\/incomplete capability report/);
 assert.equal(matrices,0);
});

test('Late actual HTTP listener is registered and closed after acquisition deadline',{timeout:5000},async()=>{
 let owner;let release;const available=new Promise(resolve=>release=resolve);
 await assert.rejects(()=>acquireOwnedHTTP(async()=>{await new Promise(resolve=>setTimeout(resolve,40));return createServer();},{timeoutMs:10,register:value=>{owner=value;release();}}),/HTTP server deadline exceeded/);
 await boundedOperation('late listener registration',()=>available,1000);
 // The creation fulfilled after the caller already failed; wait for its real close callback.
 await boundedOperation('late listener closure',async()=>{while(owner.server.listening)await new Promise(resolve=>setTimeout(resolve,5));},1000);
 assert.equal(owner.server.listening,false);
 await assert.rejects(()=>fetch(owner.baseURL));
});
