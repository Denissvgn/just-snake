import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha} from './release-contract.mjs';
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const id=value=>typeof value==='string'&&/^[1-9]\d*$/.test(value)&&Number.isSafeInteger(Number(value));
export function selectLiveProducer(needs){
 const selected=['deploy','rollback'].filter(name=>needs?.[name]?.result==='success');
 if(selected.length!==1)throw Error('Exactly one successful Pages producer is required');
 const mode=selected[0],o=needs[mode].outputs;
 if(!id(o?.manifest_id)||!digest(o.manifest_digest))throw Error('Missing exact same-run live manifest identity');
 const url=new URL(o.page_url);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/'))throw Error('Invalid producer Pages URL');
 const result={mode,manifest_id:o.manifest_id,manifest_digest:o.manifest_digest,page_url:url.href};
 if(mode==='deploy'){
  if(!id(o.qualified_id)||o.qualified_id===o.manifest_id||!digest(o.qualified_digest)||!/^([1-9]|[12]\d|30)$/.test(o.retention_days||''))throw Error('Missing real qualified artifact identity/retention');
  Object.assign(result,{qualified_id:o.qualified_id,qualified_digest:o.qualified_digest,retention_days:o.retention_days});
 }
 return result;
}
export async function verifyLiveManifest(file,expected){
 if(!digest(expected))throw Error('Invalid expected live manifest digest');
 const bytes=await fs.readFile(file);if(sha(bytes)!==expected)throw Error('Live manifest transport digest mismatch');
 const manifest=JSON.parse(bytes);
 if(manifest.schemaVersion!==1||manifest.product!=='just-snake'||!manifest.inputs||!manifest.payload)throw Error('Invalid producer candidate manifest');
 return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [operation,file,expected]=process.argv.slice(2);
 if(operation==='select'&&!file){const selected=selectLiveProducer(JSON.parse(process.env.LIVE_PRODUCERS||'null'));if(!process.env.GITHUB_OUTPUT)throw Error('Missing workflow output file');await fs.appendFile(process.env.GITHUB_OUTPUT,Object.entries(selected).map(([key,value])=>key+'='+value+'\n').join(''));}
 else if(operation==='verify'&&file&&expected){await verifyLiveManifest(file,expected);console.log('Same-run candidate manifest digest verified');}
 else throw Error('Expected select or verify <manifest> <digest>');
}
