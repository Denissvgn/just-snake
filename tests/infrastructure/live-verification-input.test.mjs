import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {selectLiveProducer,verifyLiveManifest} from '../../scripts/live-verification-input.mjs';
import {sha} from '../../scripts/release-contract.mjs';
const outputs={manifest_id:'11',manifest_digest:'a'.repeat(64),page_url:'https://fixture.invalid/just-snake/',qualified_id:'12',qualified_digest:'b'.repeat(64),retention_days:'30'};
const needs={deploy:{result:'success',outputs},rollback:{result:'skipped',outputs:{}}};
test('Same-run producer selection rejects ambiguous success and keeps qualified and manifest identities separate',()=>{
 const selected=selectLiveProducer(needs);assert.equal(selected.mode,'deploy');assert.equal(selected.manifest_id,'11');assert.equal(selected.qualified_id,'12');assert.equal(selected.qualified_digest,'b'.repeat(64));
 const rollback=selectLiveProducer({deploy:{result:'skipped'},rollback:{result:'success',outputs}});assert.equal(rollback.mode,'rollback');assert.equal(Object.hasOwn(rollback,'qualified_id'),false);assert.equal(Object.hasOwn(rollback,'retention_days'),false);
 for(const value of [null,{}, {deploy:{result:'failure'},rollback:{result:'skipped'}},{deploy:{result:'success',outputs},rollback:{result:'success',outputs}}])assert.throws(()=>selectLiveProducer(value));
 for(const change of [{manifest_id:'0'},{manifest_id:'9007199254740992'},{manifest_digest:'sha256:'+'a'.repeat(64)},{page_url:'http://fixture.invalid/'},{page_url:'https://user@fixture.invalid/'},{page_url:'https://fixture.invalid/?x=1'},{qualified_id:''},{qualified_id:'11'},{qualified_digest:''},{retention_days:'31'}])assert.throws(()=>selectLiveProducer({...needs,deploy:{result:'success',outputs:{...outputs,...change}}}));
});
test('Raw same-run manifest content digest is checked before JSON parsing or use',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'snake-live-input-')),file=path.join(directory,'live-candidate.json');
 try{const manifest={schemaVersion:1,product:'just-snake',inputs:{sha256:'c'.repeat(64)},payload:{}};const bytes=JSON.stringify(manifest)+'\n';await fs.writeFile(file,bytes);assert.deepEqual(await verifyLiveManifest(file,sha(bytes)),manifest);await assert.rejects(()=>verifyLiveManifest(file,'a'.repeat(64)),/digest mismatch/);await fs.writeFile(file,'not json');await assert.rejects(()=>verifyLiveManifest(file,sha(bytes)),/digest mismatch/);await assert.rejects(()=>verifyLiveManifest(file,sha('not json')));await fs.writeFile(file,'{}');await assert.rejects(()=>verifyLiveManifest(file,sha('{}')),/candidate manifest/);}finally{await fs.rm(directory,{recursive:true,force:true});}
});
