import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {acceptanceIds,presentationAttachments,validatePresentationObservation,observedPresentations,observationDigest} from '../../scripts/presentation-report.mjs';
import {validateQualificationScope,isPinnedOriginalRelease,originalReleaseContract,rollbackAcceptanceContract,sha,canonical} from '../../scripts/release-contract.mjs';
const sample=id=>({capturedAt:10,presentation:id,presentationDeclared:true,requestedPresentation:id,renderedPresentation:id,presentationError:null,
 screen:'title',hidden:false,visibility:'visible',focused:true,modalVisible:false,bootErrorVisible:false,failure:null,lost:false,booted:true,
 boardVisible:true,canvasCount:1,renderedFrames:2,boardBounds:{width:500,height:500},scoreSelector:id==='original'?'#score':'#neonScore',
 action:{selector:id==='original'?'#actionBtn':'#neonActionBtn',visible:true,enabled:true,text:'Start game'}});
const attachment=value=>({name:'presentation-evidence',contentType:'application/json',body:Buffer.from(JSON.stringify(value)).toString('base64')});
test('Actual attachment parser validates bytes and view markers, ignores failed attempts, and shares one resource case',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'snake-report-'));
 try{
  assert.deepEqual(acceptanceIds('ACC-PERF-02 ACC-PRES-07 one100cycle'),['ACC-PERF-02','ACC-PRES-07']);assert.deepEqual(acceptanceIds('a title ACC-PRES-07'),[]);
  const parsed=await presentationAttachments([{status:'passed',attachments:[attachment(sample('original')),attachment(sample('neon-district'))]}],directory);
  assert.deepEqual(parsed.presentations,['neon-district','original']);assert.equal(parsed.presentationEvidence[0].observationSha256,observationDigest(sample('original')));
  const changed=structuredClone(parsed.presentationEvidence);changed[0].observation.capturedAt=11;assert.throws(()=>observedPresentations(changed));
  assert.deepEqual((await presentationAttachments([{status:'failed',attachments:[attachment(sample('neon-district'))]}],directory)).presentations,[]);
  for(const change of [{presentationDeclared:false},{renderedPresentation:'neon-district'},{canvasCount:2},{booted:false},{boardVisible:false},{presentation:'unknown'},{focused:false},{action:{selector:'#actionBtn',visible:false,enabled:true}}])await assert.rejects(()=>presentationAttachments([{status:'passed',attachments:[attachment({...sample('original'),...change})]}],directory));
  await fs.writeFile(path.join(directory,'proof.json'),JSON.stringify(sample('original')));
  const file=await presentationAttachments([{status:'passed',attachments:[{name:'presentation-evidence',contentType:'application/json',path:'proof.json'}]}],directory);assert.equal(file.presentationEvidence[0].attachment.path,'proof.json');
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),'snake-outside-proof-'));
  try{const file=path.join(outside,'outside.json');await fs.writeFile(file,JSON.stringify(sample('original')));await assert.rejects(()=>presentationAttachments([{status:'passed',attachments:[{name:'presentation-evidence',contentType:'application/json',path:file}]}],directory),/escaped owned report/);await fs.symlink(file,path.join(directory,'linked-proof.json'));await assert.rejects(()=>presentationAttachments([{status:'passed',attachments:[{name:'presentation-evidence',contentType:'application/json',path:'linked-proof.json'}]}],directory),/escaped owned report/);}finally{await fs.rm(outside,{recursive:true,force:true});}
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('Forged full-scope labels never erase filters failures architecture or candidate identity',()=>{
 const sourceHash='a'.repeat(64),base={scope:'full_group',passed:true,sourceHash,architecture:'arm64',filter:null};
 assert.equal(validateQualificationScope(base,{sourceHash}),true);
 for(const patch of [{filter:'ACC-PRES'},{scope:'filtered_subset'},{incomplete:true},{passed:false},{sourceHash:'b'.repeat(64)},{architecture:'x64'}])assert.throws(()=>validateQualificationScope({...base,...patch},{sourceHash}));
 assert.throws(()=>validateQualificationScope({...base,scope:'full_production_ui',filter:'copied-complete-rows'},{sourceHash,productionUi:true}));
});
test('Historical Original compatibility requires its complete pinned identity, not a label or absent module',async()=>{
 const record=await originalReleaseContract();
 // Existing real reviewed identity supplies the immutable hash map; no new acceptance is authored here.
 const candidate={schemaVersion:1,product:'just-snake',sourceSha256:record.sourceSha256,inputs:record.verifiedInputs,payload:record.verifiedPayload};
 assert.equal(sha(canonical(candidate.inputs.files)),record.inputsSha256);assert.equal(await isPinnedOriginalRelease(candidate),true);
 assert.deepEqual(await rollbackAcceptanceContract(candidate),record.contract);
 for(const mutate of[c=>c.inputs.files['snake-three.html']='a'.repeat(64),c=>c.payload['index.html'].sha256='a'.repeat(64),c=>c.sourceSha256='a'.repeat(64),c=>c.product='other']){const bad=structuredClone(candidate);mutate(bad);await assert.rejects(()=>isPinnedOriginalRelease(bad));}
 assert.equal(await isPinnedOriginalRelease({payload:{}}),false);
});
