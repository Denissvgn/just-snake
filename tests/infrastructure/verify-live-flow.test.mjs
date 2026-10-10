import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{spawn}from'node:child_process';
import {runLivePlayerFlow,createLiveDiagnostics,validateLiveResult,parseLiveOptions,parseLiveProcessRow,readLiveProcess,forceOwnedLiveProcess} from '../../scripts/verify-live.mjs';
test('Live flow uses exact qualified shared3/10→15 budget and original native Start/restart actions',async()=>{
 let clicks=0,screen='title';const calls=[],diagnostics=createLiveDiagnostics(),row={errors:[]};
 const page={waitForFunction:async fn=>{calls.push(String(fn).includes('__snakeBooted')?'boot':'restart-playing');},locator:selector=>({click:async()=>{assert.equal(selector,'#actionBtn');clicks++;screen='playing';calls.push(clicks===1?'start':'restart');},getAttribute:async()=>screen})};
 const record=await runLivePlayerFlow(page,{phase:(name,action)=>diagnostics.phase(name,action),info:diagnostics.info(row),progress:async(p,options)=>{assert.equal(p,page);assert.equal(options.timeoutMs,10000);assert.equal(options.budget.record.maxResumes,3);options.budget.record.resumeCount=2;options.budget.record.progressReady=true;calls.push('eat');await options.info.attach('progress',{body:JSON.stringify(options.budget.record)});},complete:async(p,options)=>{assert.equal(options.budget.record.timeoutMs,15000);assert.equal(options.budget.record.resumeCount,2);options.budget.record.resumeCount=3;screen='summary';calls.push('summary');await options.info.attach('completion',{body:JSON.stringify(options.budget.record)});}});
 assert.deepEqual(calls,['boot','start','eat','summary','restart','restart-playing']);assert.equal(clicks,2);assert.equal(record.resumeCount,3);assert.equal(row.helperObservations.length,2);assert.equal(row.helperObservations[0].record.timeoutMs,10000);assert.equal(row.helperObservations[1].record.timeoutMs,15000);
});
test('Node-held phases/observations preserve original failure and false/cleanup results never verify',async()=>{
 const diagnostics=createLiveDiagnostics(),error=Error('original bounded progress exhausted'),promise=Promise.reject(error);assert.equal(diagnostics.phase('eat',()=>promise),promise);await assert.rejects(()=>promise,e=>e===error);assert.equal(diagnostics.report.stages[0].error,error.message);
 const row={errors:[]};await diagnostics.info(row).attach('failed-progress',{body:JSON.stringify({resumeCount:3,timeoutMs:10000})});diagnostics.error('real page error',row);for(let i=0;i<300;i++)diagnostics.error('another',row);assert.equal(diagnostics.report.errors.length,200);assert.equal(diagnostics.report.errorCount,301);assert.equal(row.helperObservations[0].record.resumeCount,3);
 assert.throws(()=>validateLiveResult({verified:true},diagnostics.report));for(const report of[{cleanupError:'closed deadline',errors:[]},{primaryError:'failed',errors:[]}])assert.throws(()=>validateLiveResult({verified:true},report));assert.throws(()=>validateLiveResult({verified:false},{errors:[]}));assert.equal(validateLiveResult({verified:true},{errors:[]}),true);
});
test('Live CLI contracts and Pages owned diagnostic upload remain precise',async()=>{
 assert.deepEqual(parseLiveOptions(['--url','https://fixture.invalid/just-snake/']),{url:'https://fixture.invalid/just-snake/',manifest:null,record:null});assert.equal(parseLiveOptions(['https://fixture.invalid/just-snake/','manifest.json','--record','known.json']).record,'known.json');
 const source=await fs.readFile(new URL('../../scripts/verify-live.mjs',import.meta.url),'utf8');assert.ok(source.indexOf('PLAYWRIGHT_BROWSERS_PATH ||=BROWSER_PATH')<source.indexOf("import('../tests/helpers/player-flow.mjs')"));assert.match(source,/headless:true/);assert.match(source,/'--use-angle=swiftshader'/);assert.match(source,/for\(const entry of\['','snake-three.html'\]\)/);assert.doesNotMatch(source,/for\(let i=0;i<5;i\+\+\)/);
 const pages=await fs.readFile(new URL('../../.github/workflows/pages.yml',import.meta.url),'utf8');assert.match(pages,/if: always\(\)\n        with: \{name: live-verification-diagnostics, path: .artifacts\/live-verification/);assert.doesNotMatch(pages,/path: .artifacts\/tasks/);
});

test('Portable live owner parser preserves full commands with spaces and fallback kills only verified owned child',{timeout:5000},async()=>{
 const row=parseLiveProcessRow('123 45 123 /path with spaces/Chromium --remote-debugging-pipe');assert.equal(row.command,'/path with spaces/Chromium --remote-debugging-pipe');assert.equal(row.ppid,45);assert.equal(parseLiveProcessRow('malformed'),null);
 const start=code=>{const child=spawn(process.execPath,['-e',code],{detached:true,stdio:['ignore','pipe','ignore']});const closed=new Promise(resolve=>child.once('close',resolve));return{child,closed,ready:new Promise(resolve=>child.stdout.once('data',resolve))};};
 const own=start("process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"),other=start("console.log('ready');setInterval(()=>{},1000)");await Promise.all([own.ready,other.ready]);
 try{const owner=readLiveProcess(own.child.pid);assert.ok(owner);const wrong={...owner,command:owner.command+' wrong'};await assert.rejects(()=>forceOwnedLiveProcess(wrong,{termMs:50,killMs:200}),/ownership changed/);assert.equal(own.child.signalCode,null);await forceOwnedLiveProcess(owner,{termMs:50,killMs:500});await own.closed;assert.equal(own.child.signalCode,'SIGKILL');assert.equal(other.child.signalCode,null);}finally{if(own.child.exitCode===null&&own.child.signalCode===null)own.child.kill('SIGKILL');if(other.child.exitCode===null&&other.child.signalCode===null)other.child.kill('SIGKILL');await Promise.all([own.closed,other.closed]);}
});

test('Owned live PID inspection rejects invalid identifiers and distinguishes absence from unknown failures',async()=>{
 for(const line of ['0 1 1 command','1 0 1 command','1 1 0 command','9007199254740992 1 1 command'])assert.equal(parseLiveProcessRow(line),null);
 for(const pid of [0,-1,NaN,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>readLiveProcess(pid));
 const absent=Object.assign(Error('absent'),{status:1,signal:null,stdout:'',stderr:''});assert.equal(readLiveProcess(123,{execute:()=>{throw absent;},probe:()=>{throw Object.assign(Error('absent'),{code:'ESRCH'});}}),null);
 assert.throws(()=>readLiveProcess(123,{execute:()=>{throw absent;},probe:()=>{throw Object.assign(Error('denied'),{code:'EPERM'});}}));assert.throws(()=>readLiveProcess(123,{execute:()=>{throw absent;},probe:()=>{}}));
 for(const problem of [Object.assign(Error('denied'),{status:1,stderr:'permission denied'}),Object.assign(Error('timeout'),{status:null,signal:'SIGTERM',stdout:'',stderr:''})])assert.throws(()=>readLiveProcess(123,{execute:()=>{throw problem;}}));
 for(const text of ['', 'malformed','124 1 1 command'])assert.throws(()=>readLiveProcess(123,{execute:()=>text}));
 for(const change of [{pid:0},{pgid:-1},{ppid:0}])await assert.rejects(()=>forceOwnedLiveProcess({pid:123,ppid:process.pid,pgid:123,command:'unused',...change}));
 for(const termMs of [0,-1,NaN,1001])await assert.rejects(()=>forceOwnedLiveProcess({pid:123,ppid:process.pid,pgid:123,command:'unused'},{termMs}));
});

test('Verified denied group signals fall back only to the same owned positive PID and preserve denial metadata',{timeout:5000},async()=>{
 const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"],{detached:true,stdio:['ignore','pipe','ignore']});const closed=new Promise(resolve=>child.once('close',resolve));await new Promise(resolve=>child.stdout.once('data',resolve));const owner=readLiveProcess(child.pid),calls=[];
 try{await assert.rejects(()=>forceOwnedLiveProcess(owner,{termMs:50,killMs:500,signalProcess:pid=>{throw Object.assign(Error('controlled permission denial'),{code:pid<0?'EPERM':'EACCES'});}}),error=>error.code==='EACCES'&&error.groupDenials.length===1&&error.groupDenials[0].code==='EPERM');assert.equal(child.signalCode,null);const outcome=await forceOwnedLiveProcess(owner,{termMs:50,killMs:500,signalProcess:(pid,signal)=>{calls.push({pid,signal});if(pid<0)throw Object.assign(Error('controlled group permission denial'),{code:'EPERM'});return process.kill(pid,signal);}});await closed;assert.equal(outcome.closed,true);assert.equal(outcome.groupDenials.length,2);assert.deepEqual(calls.map(call=>call.pid),[-owner.pid,owner.pid,-owner.pid,owner.pid]);}finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await closed;}
});
