import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {parsePulseControl,pulseLaunchArgs,validatePulseProvenance,validatePulseActivity,pulsePrivateEnvironment,pulseCommandTimeout,stopOwnedChild} from '../../scripts/run-pulseaudio-control.mjs';
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
 assert.match(source,/--engines=firefox/);assert.match(source,/--only=queued held input audio suspension and stale resume ownership/);assert.match(source,/report.samples.length<180/);assert.match(source,/\['clients','sink-inputs'\]/);assert.match(source,/diagnosticOnly:true,qualified:false/);assert.doesNotMatch(source,/autoplay|pkill|killall|ctx\.resume/);
});

test('Owned Pulse runtime/state/auth isolation and active Firefox associated stream proof fail closed',()=>{
 const env=pulsePrivateEnvironment('/tmp/owned',{HOME:'/unchanged',PULSE_COOKIE:'/shared'});assert.equal(env.HOME,'/unchanged');assert.equal(env.PULSE_COOKIE,'/tmp/owned/auth-cookie');assert.equal(env.PULSE_RUNTIME_PATH,'/tmp/owned/runtime');assert.equal(env.PULSE_STATE_PATH,'/tmp/owned/state');assert.equal(env.PULSE_SERVER,'unix:/tmp/owned/pulse.sock');
 assert.equal(pulseCommandTimeout(1),1);for(const timeout of [0,-1,3001,NaN])assert.throws(()=>pulseCommandTimeout(timeout));
 const sink=[{name:'just_snake_ci',index:9}],sample={clients:[{index:5,properties:{'application.name':'Firefox'}}],'sink-inputs':[{client:5,sink:9}]};assert.equal(validatePulseActivity([sample],sink),true);
 for(const samples of [[],[{clients:[],'sink-inputs':[]}],[{...sample,clients:[{index:5,properties:{'application.name':'pactl'}}]}],[{...sample,'sink-inputs':[{client:6,sink:9}]}],[{...sample,'sink-inputs':[{client:5,sink:10}]}]])assert.throws(()=>validatePulseActivity(samples,sink));
 assert.throws(()=>validatePulseActivity([sample],[{name:'other',index:9}]));
});
