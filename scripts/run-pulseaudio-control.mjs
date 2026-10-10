import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ROOT,node24} from '../tests/helpers/config.mjs';
export function parsePulseControl(args){
  if(args.length!==2||args[0]!=='--output'||!args[1])throw Error('Pulse control requires exactly --output <fresh directory>');
  return {output:path.resolve(args[1])};
}
export function pulsePrivateEnvironment(directory,env=process.env){
  if(!path.isAbsolute(directory))throw Error('Invalid owned Pulse directory');
  return {...env,PULSE_SERVER:'unix:'+path.join(directory,'pulse.sock'),PULSE_RUNTIME_PATH:path.join(directory,'runtime'),PULSE_STATE_PATH:path.join(directory,'state'),PULSE_COOKIE:path.join(directory,'auth-cookie')};
}
export function pulseLaunchArgs(socket,cookie=path.join(path.dirname(socket),'auth-cookie')){
  if(!path.isAbsolute(socket)||socket.length>100)throw Error('Invalid owned Pulse UNIX socket');
  return ['--daemonize=no','--use-pid-file=no','--exit-idle-time=-1','--fail','--log-target=stderr','-n','-L','module-native-protocol-unix socket='+socket+' auth-cookie='+cookie,'-L','module-null-sink sink_name=just_snake_ci'];
}
export async function stopOwnedChild(child,closed,{graceMs=3000,killMs=1000}={}){
  if(!child)return;
  const wait=ms=>{let timer;return Promise.race([closed.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),ms);})]).finally(()=>clearTimeout(timer));};
  if(child.exitCode!==null||child.signalCode!==null){await closed;return;}
  child.kill('SIGTERM');if(await wait(graceMs))return;
  child.kill('SIGKILL');if(!await wait(killMs))throw Error('Owned Pulse child did not close');
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
export function validatePulseActivity(samples,sinks){
  const sink=sinks?.find(sink=>sink.name==='just_snake_ci'&&Number.isSafeInteger(sink.index));
  if(!sink||!Array.isArray(samples))throw Error('Actual owned null sink/client activity missing');
  const firefox=client=>Number.isSafeInteger(client.index)&&(/firefox/i.test(client.properties?.['application.name']||'')||/(?:^|\/)firefox(?:-esr)?$/i.test(client.properties?.['application.process.binary']||''));
  for(const sample of samples){const clients=sample.clients?.filter(firefox)||[];if(sample['sink-inputs']?.some(stream=>stream.sink===sink.index&&clients.some(client=>client.index===stream.client)))return true;}
  throw Error('No actual Firefox client and associated null-sink stream captured while case active');
}
export async function runPulseControl({output}){
  node24();if(process.platform!=='linux'||process.arch!=='arm64')throw Error('Pulse control is native Linux ARM64 only');
  await fs.mkdir(output,{recursive:false});
  const report={schemaVersion:1,diagnosticOnly:true,qualified:false,passed:false,platform:process.platform,architecture:process.arch,startedAt:new Date().toISOString(),samples:[],method:'One real owned per-user foreground PulseAudio UNIX server/null sink; one-second OS client/stream sampling during unchanged source test'};
  let directory,daemon,daemonClosed,runner,runnerClosed,sampler,failure,active=false,serverLog='';
  try{
    report.packageArchitecture=(await command('dpkg',['--print-architecture'])).stdout;
    report.packages=(await command('dpkg-query',['-W','-f=${binary:Package} ${Architecture} ${Version}\n','pulseaudio','pulseaudio-utils'])).stdout;
    report.binary=(await command('file',['/usr/bin/pulseaudio','/usr/bin/pactl'])).stdout;
    report.versions=[await command('pulseaudio',['--version']),await command('pactl',['--version'])];
    directory=await fs.mkdtemp(path.join(os.tmpdir(),'js-pulse-'));await fs.chmod(directory,0o700);
    const env=pulsePrivateEnvironment(directory);await fs.mkdir(env.PULSE_RUNTIME_PATH,{mode:0o700});await fs.mkdir(env.PULSE_STATE_PATH,{mode:0o700});await fs.writeFile(env.PULSE_COOKIE,randomBytes(256),{mode:0o600});
    const socket=path.join(directory,'pulse.sock');report.server={socket,runtime:env.PULSE_RUNTIME_PATH,state:env.PULSE_STATE_PATH,authCookie:'Private ephemeral local authentication; never logged or retained',transport:'private Unix socket',args:pulseLaunchArgs(socket,env.PULSE_COOKIE)};
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
    active=true;
    sampler=(async()=>{while(active&&report.samples.length<180){const sample={at:new Date().toISOString()};for(const type of ['clients','sink-inputs'])try{sample[type]=JSON.parse((await command('pactl',['-f','json','list',type],env,1500)).stdout);}catch(error){sample.error=error.message;report.samplingFailed=true;}report.samples.push(sample);if(active)await new Promise(resolve=>setTimeout(resolve,1000));}})();
    const args=[path.join(ROOT,'scripts/run-tests.mjs'),'release','--engines=firefox','--only=queued held input audio suspension and stale resume ownership'];report.command={file:process.execPath,args};
    runner=spawn(process.execPath,args,{cwd:ROOT,env:{...env,TEST_ARTIFACTS:path.join(output,'source-audio')},stdio:['ignore','inherit','inherit']});
    runnerClosed=new Promise((resolve,reject)=>{runner.once('error',reject);runner.once('close',(code,signal)=>resolve({code,signal}));});
    let timer;try{report.test=await Promise.race([runnerClosed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Source audio runner180s deadline exceeded')),180000);})]);}finally{clearTimeout(timer);}
    active=false;await sampler;sampler=null;
    if(report.test.code!==0||report.test.signal||report.samplingFailed)throw Error('Source audio test or active Pulse sampling failed');
    validatePulseActivity(report.samples,report.sinksJSON);report.passed=true;
  }catch(error){failure=error;report.error=error.message;}
  finally{
    active=false;
    if(runner&&runnerClosed)try{await stopOwnedChild(runner,runnerClosed);}catch(error){failure??=error;(report.cleanupErrors||=[]).push(error.message);}
    if(sampler)try{await sampler;}catch(error){failure??=error;(report.cleanupErrors||=[]).push(error.message);}
    if(daemon&&daemonClosed)try{await stopOwnedChild(daemon,daemonClosed);report.server.closed=await daemonClosed;}catch(error){failure??=error;(report.cleanupErrors||=[]).push(error.message);}
    if(directory&&(!daemon||daemon.exitCode!==null||daemon.signalCode!==null))try{await fs.rm(directory,{recursive:true,force:true});}catch(error){failure??=error;(report.cleanupErrors||=[]).push(error.message);}
    if(failure)report.passed=false;report.finishedAt=new Date().toISOString();
    try{await fs.writeFile(path.join(output,'pulseaudio.log'),serverLog);await fs.writeFile(path.join(output,'control.json'),JSON.stringify(report,null,2)+'\n');}catch(error){if(!failure)throw error;console.error('Pulse evidence persistence failed: '+error.message);}
  }
  if(failure)throw failure;return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runPulseControl(parsePulseControl(process.argv.slice(2))).catch(error=>{console.error(error.message);process.exitCode=1;});
