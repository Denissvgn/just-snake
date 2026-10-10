import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ROOT,node24} from '../tests/helpers/config.mjs';
import {exact} from './release-contract.mjs';
export function parsePulseControl(args){
  const options={mode:'diagnostic',candidate:null,output:null},seen=new Set();
  for(let i=0;i<args.length;i+=2){const key=args[i]?.slice(2),value=args[i+1];if(!args[i]?.startsWith('--')||!Object.hasOwn(options,key)||!value||seen.has(key))throw Error('Unknown/missing/duplicate Pulse option');seen.add(key);options[key]=value;}
  if(!options.output||!['diagnostic','normal'].includes(options.mode)||options.mode==='normal'&&!options.candidate||options.mode==='diagnostic'&&options.candidate)throw Error('Invalid Pulse mode/candidate');
  options.output=path.resolve(options.output);if(options.candidate)options.candidate=path.resolve(options.candidate);return options;
}
export function pulseJobBudget(env=process.env,now=Date.now()){
  const start=pulseId(env.JUST_SNAKE_BROWSER_JOB_START_MS),end=pulseId(env.JUST_SNAKE_BROWSER_JOB_DEADLINE_MS);
  if(start>now||end<=now+60000||end<=start||end-start>120*60000)throw Error('Missing/expired/broader Pulse browser job budget');
  return {start,end,cleanupReserveMs:10000,uploadReserveMs:50000,totalReserveMs:60000,remainingMs:end-now-60000};
}
export function pulseRunPlan(options){
  if(options.mode==='normal')return {args:[path.join(ROOT,'scripts/qualify.mjs'),'--phase','test','--candidate',options.candidate,'--group','release','--engines','firefox','--output',options.output],artifacts:options.output};
  return {args:[path.join(ROOT,'scripts/run-tests.mjs'),'release','--engines=firefox','--only=queued held input audio suspension and stale resume ownership'],artifacts:path.join(options.output,'source-audio')};
}
export async function createFreshPulseOutput(output){
  await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output,{recursive:false});
}
export function pulsePrivateEnvironment(directory,env=process.env){
  if(!path.isAbsolute(directory))throw Error('Invalid owned Pulse directory');
  return {...env,PULSE_SERVER:'unix:'+path.join(directory,'pulse.sock'),PULSE_RUNTIME_PATH:path.join(directory,'runtime'),PULSE_STATE_PATH:path.join(directory,'state'),PULSE_COOKIE:path.join(directory,'auth-cookie')};
}
export function pulseLaunchArgs(socket,cookie=path.join(path.dirname(socket),'auth-cookie')){
  if(!path.isAbsolute(socket)||socket.length>100)throw Error('Invalid owned Pulse UNIX socket');
  return ['--daemonize=no','--use-pid-file=no','--exit-idle-time=-1','--fail','--log-target=stderr','-n','-L','module-native-protocol-unix socket='+socket+' auth-cookie='+cookie,'-L','module-null-sink sink_name=just_snake_ci'];
}
export async function stopOwnedChild(child,closed,{graceMs=3000,killMs=1000,group=false}={}){
  if(!child)return;
  const wait=ms=>{let timer;return Promise.race([closed.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),ms);})]).finally(()=>clearTimeout(timer));};
  if(child.exitCode!==null||child.signalCode!==null){await closed;return;}
  const kill=signal=>{try{if(group)process.kill(-child.pid,signal);else child.kill(signal);}catch(error){if(error.code!=='ESRCH')throw error;}};
  kill('SIGTERM');if(await wait(graceMs))return;
  kill('SIGKILL');if(!await wait(killMs))throw Error('Owned Pulse child did not close');
}
export function pulseCommandTimeout(timeout){if(!Number.isSafeInteger(timeout)||timeout<1||timeout>3000)throw Error('Invalid bounded Pulse command timeout');return timeout;}
const command=(file,args,env=process.env,timeout=3000)=>new Promise((resolve,reject)=>execFile(file,args,{env,timeout:pulseCommandTimeout(timeout),killSignal:'SIGKILL',maxBuffer:256*1024,encoding:'utf8'},(error,stdout,stderr)=>error?reject(Object.assign(error,{stdout,stderr})):resolve({file,args,stdout,stderr})));
export function validatePulseProvenance(proof){
  if(proof.platform!=='linux'||proof.architecture!=='arm64'||proof.packageArchitecture.trim()!=='arm64')throw Error('Pulse control requires actual native Linux ARM64');
  const packages=typeof proof.packages==='string'?proof.packages.trim().split('\n').map(line=>line.split(/\s+/)):[];
  if(packages.length!==2||packages.some(row=>row[1]!=='arm64'||!row[2])||JSON.stringify(packages.map(row=>row[0]).sort())!==JSON.stringify(['pulseaudio','pulseaudio-utils']))throw Error('Pulse packages are not native ARM64');
  const binaries=typeof proof.binary==='string'?proof.binary.trim().split('\n'):[];
  if(binaries.length!==2||binaries.some(line=>!/aarch64|arm64/i.test(line))||!binaries.some(line=>line.startsWith('/usr/bin/pulseaudio:'))||!binaries.some(line=>line.startsWith('/usr/bin/pactl:')))throw Error('Pulse binaries are not native ARM64');
  if(proof.defaultSink.trim()!=='just_snake_ci'||!proof.modules.includes('module-null-sink')||!proof.modules.includes('module-native-protocol-unix')||!proof.sinks.includes('just_snake_ci'))throw Error('Real Pulse server/default null sink missing');
  return true;
}
export function pulseId(value){
  if(typeof value==='string'){if(!/^(?:0|[1-9]\d*)$/.test(value))throw Error('Noncanonical Pulse identifier');value=Number(value);}
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||Object.is(value,-0))throw Error('Invalid Pulse identifier');
  return value;
}
export function pulseStreamWitness(samples,sinks){
  const sink=sinks?.find(sink=>sink.name==='just_snake_ci');
  if(!sink||!Array.isArray(samples))throw Error('Actual owned null sink/client activity missing');
  const sinkId=pulseId(sink.index);
  const firefox=client=>/firefox/i.test(client.properties?.['application.name']||'')||/(?:^|\/)firefox(?:-esr)?$/i.test(client.properties?.['application.process.binary']||'');
  for(const sample of samples){const clients=sample.clients?.filter(firefox)||[];for(const stream of sample['sink-inputs']||[]){const target=pulseId(stream.sink),id=pulseId(stream.client),client=clients.find(client=>pulseId(client.index)===id);if(target===sinkId&&client)return {at:sample.at,clients:[client],'sink-inputs':[stream]};}}
  return null;
}
export function validatePulseActivity(samples,sinks){if(!pulseStreamWitness(samples,sinks))throw Error('No actual Firefox client and associated null-sink stream captured while case active');return true;}
export function retainPulseSample(report,sample){
  report.sampleCount=(report.sampleCount||0)+1;report.samples.push(sample);if(report.samples.length>180)report.samples.shift();
  report.firstStreamWitness??=pulseStreamWitness([sample],report.sinksJSON);
}
export function validatePulseQualification(proof,candidate){
  const {identity,sourcePrefix,root}=proof;
  exact(identity?.inputs,candidate.inputs,'Backend qualification input');exact(identity?.payload,candidate.payload,'Backend qualification payload');exact(identity?.engines,['firefox'],'Backend selected engine');
  if(identity?.group!=='release'||identity.platform!=='linux'||identity.architecture!=='arm64'||sourcePrefix?.passed!==true||sourcePrefix.scope!=='full_group'||sourcePrefix.filter!==null||sourcePrefix.acceptanceComplete!==true||root?.passed!==true||root.scope!=='full_production_ui'||root.filter!==null)throw Error('Backend qualification incomplete/filtered');
  for(const report of [sourcePrefix,root])exact(report.engines,['firefox'],'Backend actual engines');return true;
}
export function validatePulseBackendReport(report,candidate){
  const args=report.command?.args;if(!Array.isArray(args)||!args[0]?.endsWith('/scripts/qualify.mjs'))throw Error('Wrong backend qualification phase');exact(args.slice(1),['--phase','test','--candidate',report.candidateDirectory,'--group','release','--engines','firefox','--output',report.outputDirectory],'Backend full qualification command');
  if(report.kind!=='owned-native-pulseaudio-backend'||report.mode!=='normal'||report.diagnosticOnly!==false||report.passed!==true||report.test?.code!==0||report.test.signal!==null||report.server?.closed?.code!==0||report.server.closed.signal!==null||report.cleanupErrors?.length||report.samplingFailed||report.error)throw Error('Failed/incomplete normal Pulse backend');
  if(report.budget?.cleanupReserveMs!==10000||report.budget.uploadReserveMs!==50000||report.budget.totalReserveMs!==60000)throw Error('Backend shared job reserve missing');pulseJobBudget({JUST_SNAKE_BROWSER_JOB_START_MS:String(report.budget.start),JUST_SNAKE_BROWSER_JOB_DEADLINE_MS:String(report.budget.end)},report.budget.start);
  if(report.server.permissions?.directory!==0o700||report.server.permissions.runtime!==0o700||report.server.permissions.state!==0o700||report.server.permissions.cookie!==0o600||report.server.privateRemoved!==true)throw Error('Backend private ownership/cleanup proof missing');exact(report.server.args,pulseLaunchArgs(report.server.socket),'Backend actual private launch');
  exact(report.inputs,candidate.inputs,'Pulse backend input');exact(report.payload,candidate.payload,'Pulse backend payload');validatePulseProvenance(report);validatePulseActivity([report.firstStreamWitness].filter(Boolean),report.sinksJSON);validatePulseQualification(report.qualification,candidate);return true;
}
export async function runPulseControl(options){
  const {output,mode='diagnostic',candidate:directoryCandidate}=options;
  const budget=mode==='normal'?pulseJobBudget():null;
  node24();if(process.platform!=='linux'||process.arch!=='arm64')throw Error('Pulse control is native Linux ARM64 only');
  await createFreshPulseOutput(output);
  const report={schemaVersion:1,kind:'owned-native-pulseaudio-backend',mode,diagnosticOnly:mode==='diagnostic',qualified:false,passed:false,platform:process.platform,architecture:process.arch,startedAt:new Date().toISOString(),candidateDirectory:directoryCandidate,outputDirectory:output,samples:[],method:'One real owned per-user foreground PulseAudio UNIX server/null sink; rolling180 OS samples plus first associated Firefox witness throughout current runner',budget};
  let directory,daemon,daemonClosed,runner,runnerClosed,sampler,failure,sampleWake,sampleTimer,active=false,serverLog='';
  let interrupted;const onSignal=signal=>{interrupted??=Error('Owned Pulse interruption '+signal);active=false;try{if(runner?.pid&&runner.exitCode===null&&runner.signalCode===null)process.kill(-runner.pid,'SIGTERM');}catch{}try{if(daemon&&daemon.exitCode===null&&daemon.signalCode===null)daemon.kill('SIGTERM');}catch{}};const signalINT=()=>onSignal('SIGINT'),signalTERM=()=>onSignal('SIGTERM');process.once('SIGINT',signalINT);process.once('SIGTERM',signalTERM);let setupTimer;
  try{
    setupTimer=setTimeout(()=>onSignal('setup60s deadline'),Math.min(60000,budget?.remainingMs??60000));
    if(mode==='normal'){const {verifyCandidate}=await import('./qualify.mjs');const candidate=await verifyCandidate(directoryCandidate);report.inputs=candidate.inputs;report.payload=candidate.payload;}
    report.packageArchitecture=(await command('dpkg',['--print-architecture'])).stdout;
    report.packages=(await command('dpkg-query',['-W','-f=${binary:Package} ${Architecture} ${Version}\n','pulseaudio','pulseaudio-utils'])).stdout;
    report.binary=(await command('file',['/usr/bin/pulseaudio','/usr/bin/pactl'])).stdout;
    report.versions=[await command('pulseaudio',['--version']),await command('pactl',['--version'])];
    directory=await fs.mkdtemp(path.join(os.tmpdir(),'js-pulse-'));await fs.chmod(directory,0o700);
    const env=pulsePrivateEnvironment(directory);await fs.mkdir(env.PULSE_RUNTIME_PATH,{mode:0o700});await fs.mkdir(env.PULSE_STATE_PATH,{mode:0o700});await fs.writeFile(env.PULSE_COOKIE,randomBytes(256),{mode:0o600});
    const socket=path.join(directory,'pulse.sock');report.server={socket,permissions:{directory:(await fs.stat(directory)).mode&0o777,runtime:(await fs.stat(env.PULSE_RUNTIME_PATH)).mode&0o777,state:(await fs.stat(env.PULSE_STATE_PATH)).mode&0o777,cookie:(await fs.stat(env.PULSE_COOKIE)).mode&0o777},runtime:env.PULSE_RUNTIME_PATH,state:env.PULSE_STATE_PATH,authCookie:'Private ephemeral local authentication; never logged or retained',transport:'private Unix socket',args:pulseLaunchArgs(socket,env.PULSE_COOKIE)};
    if(interrupted)throw interrupted;
    daemon=spawn('pulseaudio',report.server.args,{env,stdio:['ignore','pipe','pipe']});report.server.pid=daemon.pid;
    daemonClosed=new Promise(resolve=>{daemon.once('error',error=>resolve({error:error.message}));daemon.once('close',(code,signal)=>resolve({code,signal}));});
    for(const stream of [daemon.stdout,daemon.stderr])stream.on('data',chunk=>{if(serverLog.length<1024*1024)serverLog+=chunk.toString();else report.server.logTruncated=true;});
    const readyEnd=Date.now()+10000;let readyError;
    while(Date.now()<readyEnd){try{report.info=(await command('pactl',['info'],env,Math.max(1,Math.min(1500,readyEnd-Date.now())))).stdout;break;}catch(error){readyError=error.message;if(daemon.exitCode!==null)throw error;await new Promise(resolve=>setTimeout(resolve,100));}}
    if(!report.info)throw Error('Pulse client connection readiness failed: '+readyError);
    await command('pactl',['set-default-sink','just_snake_ci'],env);
    report.defaultSink=(await command('pactl',['get-default-sink'],env)).stdout;
    report.modules=(await command('pactl',['list','short','modules'],env)).stdout;
    report.sinks=(await command('pactl',['list','short','sinks'],env)).stdout;
    validatePulseProvenance(report);report.sinksJSON=JSON.parse((await command('pactl',['-f','json','list','sinks'],env)).stdout);
    if(interrupted)throw interrupted;clearTimeout(setupTimer);
    active=true;
    sampler=(async()=>{while(active){const sample={at:new Date().toISOString()};for(const type of ['clients','sink-inputs'])try{sample[type]=JSON.parse((await command('pactl',['-f','json','list',type],env,1500)).stdout);}catch(error){sample.error=error.message;report.samplingFailed=true;}retainPulseSample(report,sample);if(active)await new Promise(resolve=>{sampleWake=resolve;sampleTimer=setTimeout(resolve,mode==='normal'&&report.firstStreamWitness?5000:1000);});}})().catch(error=>{report.samplingFailed=true;report.samplingError=error.message;});
    const plan=pulseRunPlan({...options,mode});report.command={file:process.execPath,args:plan.args};
    if(interrupted)throw interrupted;
    runner=spawn(process.execPath,plan.args,{cwd:ROOT,env:{...env,TEST_ARTIFACTS:plan.artifacts},detached:true,stdio:['ignore','inherit','inherit']});
    runnerClosed=new Promise((resolve,reject)=>{runner.once('error',reject);runner.once('close',(code,signal)=>resolve({code,signal}));});
    let timer;try{report.test=await Promise.race([runnerClosed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned Firefox runner deadline exceeded')),mode==='normal'?Math.max(1,Math.min(110*60000,budget.end-Date.now()-budget.totalReserveMs)):180000);})]);}finally{clearTimeout(timer);}
    active=false;clearTimeout(sampleTimer);sampleWake?.();await sampler;sampler=null;
    if(report.test.code!==0||report.test.signal||report.samplingFailed)throw Error('Source audio test or active Pulse sampling failed');
    validatePulseActivity([report.firstStreamWitness].filter(Boolean),report.sinksJSON);
    if(mode==='normal'){const read=name=>fs.readFile(path.join(output,name),'utf8').then(JSON.parse);const summarize=report=>({passed:report.passed,scope:report.scope,filter:report.filter,engines:report.engines,acceptanceComplete:report.acceptanceCoverage?.complete});report.qualification={identity:await read('identity.json'),sourcePrefix:summarize(await read('release-results.json')),root:summarize(await read('dist-root/release-results.json'))};const {verifyCandidate}=await import('./qualify.mjs');const candidate=await verifyCandidate(directoryCandidate);validatePulseQualification(report.qualification,candidate);}
    report.passed=true;
  }catch(error){failure=interrupted||error;report.error=failure.message;}
  finally{
    clearTimeout(setupTimer);
    active=false;clearTimeout(sampleTimer);sampleWake?.();
    const cleanup=async action=>{try{await action();}catch(error){failure??=error;(report.cleanupErrors||=[]).push(error.message);}};
    await Promise.all([runner&&runnerClosed?cleanup(()=>stopOwnedChild(runner,runnerClosed,{group:true})):null,daemon&&daemonClosed?cleanup(async()=>{await stopOwnedChild(daemon,daemonClosed);report.server.closed=await daemonClosed;}):null]);
    if(sampler)await cleanup(()=>sampler);
    if(directory&&(!daemon||daemon.exitCode!==null||daemon.signalCode!==null))try{await fs.rm(directory,{recursive:true,force:true});if(report.server)report.server.privateRemoved=true;}catch(error){failure??=error;(report.cleanupErrors||=[]).push(error.message);}
    if(!failure&&interrupted){failure=interrupted;report.error=interrupted.message;}if(failure)report.passed=false;report.finishedAt=new Date().toISOString();
    process.off('SIGINT',signalINT);process.off('SIGTERM',signalTERM);
    if(mode==='normal'&&report.passed)try{validatePulseBackendReport(report,{inputs:report.inputs,payload:report.payload});}catch(error){failure??=error;report.error=error.message;report.passed=false;}
    try{await fs.writeFile(path.join(output,'pulseaudio.log'),serverLog);await fs.writeFile(path.join(output,mode==='normal'?'backend.json':'control.json'),JSON.stringify(report,null,2)+'\n');}catch(error){if(!failure)throw error;console.error('Pulse evidence persistence failed: '+error.message);}
  }
  if(failure)throw failure;return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runPulseControl(parsePulseControl(process.argv.slice(2))).catch(error=>{console.error(error.message);process.exitCode=1;});
