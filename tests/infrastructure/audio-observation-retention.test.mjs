import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EventEmitter} from 'node:events';
import {ROOT} from '../helpers/config.mjs';
const source=fs.readFileSync(ROOT+'/tests/release/recovery.spec.mjs','utf8');
const declaration=source.match(/function retainAudioConsole\(records,message\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(declaration,'Actual console collector declaration exists');
const retain=new Function('return ('+declaration+')')();
const prefix='[just-snake audio-observation] ';
test('Actual bounded audio collector retains native/fake records after simulated page closure without driver reads',()=>{
 const page=new EventEmitter(),records=[];let driverReads=0;
 page.evaluate=()=>{driverReads++;throw Error('Target page/context/browser closed');};
 const listener=message=>retain(records,message);page.on('console',listener);
 const events=[{kind:'resume entry',at:1,context:{native:true,state:'suspended'}},{kind:'resume return',at:2,promise:true},{kind:'unlock entry',at:3,context:{native:false,state:'suspended'}}];
 for(const event of events)page.emit('console',{text:()=>prefix+JSON.stringify(event)});
 page.emit('close');page.off('console',listener);
 const attachment=JSON.parse(JSON.stringify({events:records,eventCount:records.length}));
 assert.deepEqual(attachment.events,events);assert.equal(attachment.eventCount,3);assert.equal(driverReads,0);
 for(const text of ['unrelated debug',prefix+'not JSON',prefix+'null',prefix+'[]',prefix+'{}',prefix+'{"kind":"bad","at":"1"}'])retain(records,{text:()=>text});
 assert.equal(records.length,3);
 for(let i=3;i<250;i++)retain(records,{text:()=>prefix+JSON.stringify({kind:'observed',at:i})});
 assert.equal(records.length,200);assert.equal(records.at(-1).at,199);
});
test('Node-held failure attachment precedes optional live-page diagnostics and active sequence remains unchanged',()=>{
 const body=source.slice(source.indexOf("test('ACC-RECOVER-01 queued held input"),source.indexOf("test('ACC-RECOVER-02 actual GPU restore"));
 assert.ok(body.indexOf('page.on(\'console\',audioConsole)')<body.indexOf('await open(page'));
 assert.ok(body.indexOf("info.attach('audio-recovery-node-held'")<body.indexOf('try{const observation=await page.evaluate'));
 assert.match(body,/await start\(page\);await page\.evaluate\(\(\)=>\{window\.arrangeNextMovement\(100000\);window\.__recovery\.initializeAudio\(\);\}\);await page\.waitForFunction/);
 assert.match(source,/console\.debug\('\[just-snake audio-observation\] '\+JSON\.stringify\(event\)\)/);
});

test('Actual ensureCtx semantic dedup ignores render timestamps but retains guard/context transitions and native outcomes',()=>{
 const semanticDeclaration=source.match(/function audioEnsureSemantic\(event\)\{[\s\S]*?\n\}/)?.[0];assert.ok(semanticDeclaration);
 const semantic=new Function('return ('+semanticDeclaration+')')();
 const noteDeclaration=source.match(/const audioNote=([\s\S]*?);\n const seenNative/)?.[1];assert.ok(noteDeclaration);
 const monitor={active:true,events:[],ensureKeys:new Map()};const output=[];
 let health={state:'playing',runId:'run',ownsPlayer:true,enabled:true,unlocked:false,activation:{app:true,available:true,active:false,sticky:true},recovery:{blocked:false,background:false,lost:false,failed:false,generation:1},hidden:false,focused:true,frames:1,ctx:{id:1,native:true,state:'suspended',currentTime:0,sampleRate:48000}};
 const note=new Function('audioMonitor','audioHealth','audioEnsureSemantic','console','performance','return ('+noteDeclaration+')')(monitor,()=>health,semantic,{debug:text=>output.push(text)},{now:()=>health.frames});
 for(let i=0;i<1000;i++){health={...health,frames:i,ctx:{...health.ctx,currentTime:i/60}};note('ensureCtx entry');note('ensureCtx return',{nullResult:false});}
 assert.equal(monitor.events.length,2);assert.equal(output.length,2);
 for(const change of [{recovery:{...health.recovery,blocked:true}},{ownsPlayer:false},{activation:{...health.activation,sticky:false}},{ctx:{...health.ctx,id:2,native:false,state:'running'}}]){health={...health,...change};note('ensureCtx entry');note('ensureCtx return',{nullResult:false});}
 assert.equal(monitor.events.length,10);
 for(const kind of ['resume entry','resume return','resume fulfilled','resume rejected','suspend entry','suspend return','suspend fulfilled','suspend rejected','native statechange','unlock return','unlock fulfilled','unlock rejected']){note(kind);note(kind);}
 assert.equal(monitor.events.length,34);assert.equal(output.length,34);
 assert.ok(monitor.events.some(event=>event.ctx?.native===false));
});
