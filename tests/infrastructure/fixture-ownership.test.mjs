import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {cleanupFixture,registerFixture} from './fixture-ownership.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function present(p){try{await fs.stat(p);return true;}catch{return false;}}

test('source invocation preserves concurrent declared legacy fixture until owning child closes', {timeout:15000}, async()=>{
 const owned=path.join(root,'__dbg_game.html');
 assert.equal(await present(owned),false,'Foreign suite fixture exists: preserve it and fail the mandatory clean-precondition proof');
 const dir=await fs.mkdtemp(path.join(root,'.artifacts/a01-fixture-'));
 const legacyDir=path.join(dir,'legacy-child');await fs.mkdir(legacyDir);
 const sentinel=path.join(root,`__dbg_unowned_${path.basename(dir)}.html`);
 const sourceArtifacts=path.join(dir,'source');await fs.mkdir(sourceArtifacts);
 const childCode=`import fs from 'node:fs/promises';import {registerFixture} from ${JSON.stringify(new URL('./fixture-ownership.mjs',import.meta.url).href)};process.send('ready');process.on('message',async message=>{if(message==='create'){await fs.writeFile(${JSON.stringify(owned)},'owned active child',{flag:'wx'});await fs.writeFile(${JSON.stringify(sentinel)},'unowned by source runner');await registerFixture(${JSON.stringify(root)},${JSON.stringify(legacyDir)},'test_game.mjs','__dbg_game.html');process.send('created');}else if(message==='finish')process.exit(0);});`;
 const child=spawn(process.execPath,['--input-type=module','--eval',childCode],{stdio:['ignore','pipe','pipe','ipc']});
 let source;const errors=[];child.stderr.on('data',d=>errors.push(String(d)));
 try{
  const [ready]=await once(child,'message');assert.equal(ready,'ready');
  source=spawn(process.execPath,['scripts/run-tests.mjs','static','--only=check_g1_'],{cwd:root,env:{...process.env,TEST_ARTIFACTS:sourceArtifacts},stdio:['ignore','pipe','pipe']});
  let sourceClosed=false;const sourceExit=once(source,'close').then(([code])=>{sourceClosed=true;return code;});
  const deadline=Date.now()+5000;let started=false;
  while(Date.now()<deadline&&!sourceClosed){
   for(const name of await fs.readdir(sourceArtifacts)){if(name.startsWith('static-')&&await present(path.join(sourceArtifacts,name,'check_g1_contracts_mjs'))){started=true;break;}}
   if(started)break;await wait(1);
  }
  assert.equal(started,true,'Observe a running source worker before the legacy child creates fixtures');
  child.send('create');const [created]=await once(child,'message');assert.equal(created,'created');assert.equal(sourceClosed,false,'Fixture exists while source invocation is still active');
  assert.equal(await sourceExit,0);assert.equal(await fs.readFile(owned,'utf8'),'owned active child');assert.equal(await fs.readFile(sentinel,'utf8'),'unowned by source runner');
  const childExit=once(child,'close');child.send('finish');assert.equal((await childExit)[0],0);
  const cleanup=await cleanupFixture(root,legacyDir,'test_game.mjs');assert.equal(cleanup.removed,true);assert.equal(await present(owned),false);assert.equal(await fs.readFile(sentinel,'utf8'),'unowned by source runner');assert.deepEqual(errors,[]);
 }finally{if(source?.exitCode===null)source.kill('SIGKILL');if(child.exitCode===null)child.kill('SIGKILL');await cleanupFixture(root,legacyDir,'test_game.mjs');await fs.rm(sentinel,{force:true});}
});

test('changed fixture bytes and undeclared paths are preserved',async()=>{
 const root=await fs.mkdtemp('/tmp/just-snake-fixtures-');const registry=path.join(root,'child');await fs.mkdir(registry);
 try{
  await fs.writeFile(path.join(root,'__dbg_game.html'),'first');await registerFixture(root,registry,'test_game.mjs','__dbg_game.html');await fs.writeFile(path.join(root,'__dbg_game.html'),'another owner');
  assert.equal((await cleanupFixture(root,registry,'test_game.mjs')).reason,'changed_after_registration');assert.equal(await fs.readFile(path.join(root,'__dbg_game.html'),'utf8'),'another owner');
  await assert.rejects(registerFixture(root,registry,'test_game.mjs','other.html'),/Undeclared/);
  await assert.rejects(cleanupFixture(root,registry,'test_camera.mjs'),/Invalid/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
