import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {parsePulseControl,createFreshPulseOutput,pulseJobBudget,pulseRunPlan,retainPulseSample,validatePulseQualification,validatePulseBackendReport,pulseLaunchArgs,validatePulseProvenance,validatePulseActivity,pulseId,pulsePrivateEnvironment,pulseCommandTimeout,stopOwnedChild} from '../../scripts/run-pulseaudio-control.mjs';
import {ROOT} from '../helpers/config.mjs';
test('Pulse control rejects malformed arguments, nonnative packages and absent real server/sink proof',()=>{
 for(const args of [[],['--output'],['--output','x','--engines','firefox'],['--wrong','x']])assert.throws(()=>parsePulseControl(args));
 assert.equal(parsePulseControl(['--output','x']).output,path.join(ROOT,'x'));
 const args=pulseLaunchArgs('/tmp/owned/pulse.sock');assert.ok(args.includes('--daemonize=no'));assert.ok(args.includes('-n'));assert.ok(args.includes('module-null-sink sink_name=just_snake_ci'));assert.ok(args.includes('module-native-protocol-unix socket=/tmp/owned/pulse.sock auth-cookie=/tmp/owned/auth-cookie'));assert.equal(args.some(arg=>/tcp|anonymous/.test(arg)),false);assert.throws(()=>pulseLaunchArgs('relative'));
 const proof={platform:'linux',architecture:'arm64',packageArchitecture:'arm64\n',packages:'pulseaudio arm64 16.1\npulseaudio-utils arm64 16.1\n',binary:'/usr/bin/pulseaudio: ELF ARM aarch64\n/usr/bin/pactl: ELF ARM aarch64\n',defaultSink:'just_snake_ci\n',modules:'module-null-sink\nmodule-native-protocol-unix',sinks:'just_snake_ci'};
 assert.equal(validatePulseProvenance(proof),true);
 for(const change of [{platform:'darwin'},{architecture:'x64'},{packages:'pulseaudio amd64 16.1\npulseaudio-utils arm64 16.1'},{binary:'/usr/bin/pulseaudio: ELF aarch64\n/usr/bin/pactl: ELF x86-64'},{defaultSink:'physical'},{modules:'module-native-protocol-unix'},{sinks:''}])assert.throws(()=>validatePulseProvenance({...proof,...change}));
});
test('Control cleanup terminates only its actual owned child and preserves unrelated process',{timeout:5000},async()=>{
 const spawnWait=()=>{const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});const closed=new Promise(resolve=>child.once('close',resolve));return{child,closed};};
 const own=spawnWait(),other=spawnWait();try{await stopOwnedChild(own.child,own.closed);assert.notEqual(own.child.signalCode,null);assert.equal(other.child.exitCode,null);assert.equal(other.child.signalCode,null);}finally{await stopOwnedChild(other.child,other.closed);}
});
test('Actual control keeps one fixed original Firefox source case and bounded active OS samples',()=>{
 const source=fs.readFileSync(ROOT+'/scripts/run-pulseaudio-control.mjs','utf8');
 assert.match(source,/--engines=firefox/);assert.match(source,/--only=queued held input audio suspension and stale resume ownership/);assert.match(source,/report.samples.length>180/);assert.match(source,/\['clients','sink-inputs'\]/);assert.match(source,/diagnosticOnly:mode==='diagnostic',qualified:false/);assert.doesNotMatch(source,/autoplay|pkill|killall|ctx\.resume/);
});

test('Owned Pulse runtime/state/auth isolation and active Firefox associated stream proof fail closed',()=>{
 const env=pulsePrivateEnvironment('/tmp/owned',{HOME:'/unchanged',PULSE_COOKIE:'/shared'});assert.equal(env.HOME,'/unchanged');assert.equal(env.PULSE_COOKIE,'/tmp/owned/auth-cookie');assert.equal(env.PULSE_RUNTIME_PATH,'/tmp/owned/runtime');assert.equal(env.PULSE_STATE_PATH,'/tmp/owned/state');assert.equal(env.PULSE_SERVER,'unix:/tmp/owned/pulse.sock');
 assert.equal(pulseCommandTimeout(1),1);for(const timeout of [0,-1,3001,NaN])assert.throws(()=>pulseCommandTimeout(timeout));
 const sink=[{name:'just_snake_ci',index:9}],sample={clients:[{index:5,properties:{'application.name':'Firefox'}}],'sink-inputs':[{client:5,sink:9}]};assert.equal(validatePulseActivity([sample],sink),true);
 for(const samples of [[],[{clients:[],'sink-inputs':[]}],[{...sample,clients:[{index:5,properties:{'application.name':'pactl'}}]}],[{...sample,'sink-inputs':[{client:6,sink:9}]}],[{...sample,'sink-inputs':[{client:5,sink:10}]}]])assert.throws(()=>validatePulseActivity(samples,sink));
 assert.throws(()=>validatePulseActivity([sample],[{name:'other',index:9}]));
});

test('Pulse16.1 actual JSON numeric client/string association accepts only canonical nonnegative safe IDs',()=>{
 const sinks=[{name:'just_snake_ci',index:0}],samples=[{clients:[{index:36,properties:{'application.name':'Nightly','application.process.binary':'firefox'}}],'sink-inputs':[{client:'36',sink:0}]}];
 assert.equal(validatePulseActivity(samples,sinks),true);
 for(const value of [0,36,Number.MAX_SAFE_INTEGER,'0','36',String(Number.MAX_SAFE_INTEGER)])assert.equal(pulseId(value),Number(value));
 for(const value of [NaN,Infinity,-Infinity,-1,-0,.5,Number.MAX_SAFE_INTEGER+1,true,false,null,undefined,{},'', '00','036','+36','-0','-36','36.0','3.6','3e1',' 36','36 ','36x','9007199254740992'])assert.throws(()=>pulseId(value));
 for(const value of ['036','+36','36.0','3e1',true,'9007199254740992']){const bad=structuredClone(samples);bad[0]['sink-inputs'][0].client=value;assert.throws(()=>validatePulseActivity(bad,sinks));}
 const unrelated=structuredClone(samples);unrelated[0]['sink-inputs'][0].client='37';assert.throws(()=>validatePulseActivity(unrelated,sinks));
 const empty=structuredClone(samples);empty[0]['sink-inputs']=[];assert.throws(()=>validatePulseActivity(empty,sinks));
});

test('Normal Pulse mode fixes full Firefox qualification and shares early job budget with cleanup/upload',()=>{
 const options=parsePulseControl(['--mode','normal','--candidate','candidate','--output','linux']);const plan=pulseRunPlan(options);assert.deepEqual(plan.args.slice(1),['--phase','test','--candidate',options.candidate,'--group','release','--engines','firefox','--output',options.output]);assert.equal(plan.artifacts,options.output);
 for(const args of [['--mode','normal','--output','x'],['--mode','diagnostic','--candidate','x','--output','y'],['--mode','other','--output','x'],['--output','x','--output','y']])assert.throws(()=>parsePulseControl(args));
 const env={JUST_SNAKE_BROWSER_JOB_START_MS:'1000',JUST_SNAKE_BROWSER_JOB_DEADLINE_MS:String(1000+120*60000)};assert.equal(pulseJobBudget(env,2000).remainingMs,120*60000-61000);assert.equal(pulseJobBudget(env,2000).cleanupReserveMs,10000);assert.equal(pulseJobBudget(env,2000).uploadReserveMs,50000);
 for(const values of [{},{...env,JUST_SNAKE_BROWSER_JOB_START_MS:'3000'},{...env,JUST_SNAKE_BROWSER_JOB_DEADLINE_MS:'2001'},{...env,JUST_SNAKE_BROWSER_JOB_DEADLINE_MS:String(1000+121*60000)}])assert.throws(()=>pulseJobBudget(values,2000));
});
test('First actual Firefox witness survives bounded rolling samples and sampling remains active for late audio',()=>{
 const sinks=[{name:'just_snake_ci',index:0}],report={samples:[],sinksJSON:sinks};const witness={at:'first',clients:[{index:36,properties:{'application.process.binary':'firefox'}}],'sink-inputs':[{client:'36',sink:0}]};retainPulseSample(report,witness);
 for(let i=0;i<500;i++)retainPulseSample(report,{at:i,clients:[],'sink-inputs':[]});assert.equal(report.sampleCount,501);assert.equal(report.samples.length,180);assert.equal(report.firstStreamWitness.at,'first');assert.equal(validatePulseActivity([report.firstStreamWitness],sinks),true);
 const source=fs.readFileSync(ROOT+'/scripts/run-pulseaudio-control.mjs','utf8');assert.match(source,/while\(active\)/);assert.match(source,/mode==='normal'&&report.firstStreamWitness\?5000:1000/);
});
test('Normal backend identity/phase/full reports and private cleanup fail closed without self-qualification',()=>{
 const candidate={inputs:{sha256:'inputs'},payload:{'index.html':{sha256:'payload'}}};
 const proof={identity:{...candidate,group:'release',engines:['firefox'],platform:'linux',architecture:'arm64'},sourcePrefix:{passed:true,scope:'full_group',filter:null,engines:['firefox'],acceptanceComplete:true},root:{passed:true,scope:'full_production_ui',filter:null,engines:['firefox']}};assert.equal(validatePulseQualification(proof,candidate),true);
 for(const mutate of [p=>p.identity.inputs.sha256='drift',p=>p.identity.payload={},p=>p.identity.engines=['chromium'],p=>p.sourcePrefix.scope='filtered_subset',p=>p.sourcePrefix.acceptanceComplete=false,p=>p.root.passed=false]){const bad=structuredClone(proof);mutate(bad);assert.throws(()=>validatePulseQualification(bad,candidate));}
 const options=parsePulseControl(['--mode','normal','--candidate','candidate','--output','linux']);
 const report={kind:'owned-native-pulseaudio-backend',mode:'normal',diagnosticOnly:false,qualified:false,passed:true,...candidate,candidateDirectory:options.candidate,outputDirectory:options.output,command:{args:pulseRunPlan(options).args},test:{code:0,signal:null},server:{socket:'/tmp/owned/pulse.sock',args:pulseLaunchArgs('/tmp/owned/pulse.sock'),closed:{code:0,signal:null},permissions:{directory:0o700,runtime:0o700,state:0o700,cookie:0o600},privateRemoved:true},budget:pulseJobBudget({JUST_SNAKE_BROWSER_JOB_START_MS:'1000',JUST_SNAKE_BROWSER_JOB_DEADLINE_MS:String(1000+120*60000)},2000),platform:'linux',architecture:'arm64',packageArchitecture:'arm64',packages:'pulseaudio arm64 16.1\npulseaudio-utils arm64 16.1',binary:'/usr/bin/pulseaudio: ELF aarch64\n/usr/bin/pactl: ELF aarch64',defaultSink:'just_snake_ci',modules:'module-null-sink module-native-protocol-unix',sinks:'just_snake_ci',sinksJSON:[{index:0,name:'just_snake_ci'}],firstStreamWitness:{clients:[{index:1,properties:{'application.process.binary':'firefox'}}],'sink-inputs':[{client:'1',sink:0}]},qualification:proof};assert.equal(validatePulseBackendReport(report,candidate),true);assert.equal(report.qualified,false);
 for(const mutate of [r=>r.passed=false,r=>r.server.closed=null,r=>r.server.privateRemoved=false,r=>r.server.permissions.cookie=0o644,r=>r.inputs={sha256:'drift'},r=>r.payload={},r=>r.command.args[2]='prepare',r=>r.qualification.sourcePrefix.scope='filtered_subset',r=>r.budget=null,r=>r.firstStreamWitness=null,r=>r.cleanupErrors=['failure']]){const bad=structuredClone(report);mutate(bad);assert.throws(()=>validatePulseBackendReport(bad,candidate));}
 const qualifier=fs.readFileSync(ROOT+'/scripts/qualify.mjs','utf8');assert.match(qualifier,/identity.platform==='linux'&&identity.engines.includes\('firefox'\)\)validatePulseBackendReport/);
});

test('Fresh nested backend output creates only missing parent and refuses an existing output unchanged',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-output-')),output=path.join(directory,'new','reports','linux');
 try{await createFreshPulseOutput(output);assert.equal(fs.statSync(output).isDirectory(),true);fs.writeFileSync(path.join(output,'foreign'),'preserve');await assert.rejects(()=>createFreshPulseOutput(output),{code:'EEXIST'});assert.equal(fs.readFileSync(path.join(output,'foreign'),'utf8'),'preserve');}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
