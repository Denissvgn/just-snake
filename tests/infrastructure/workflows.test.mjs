import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import{validateWorkflows}from'../../scripts/check-workflows.mjs';import{ROOT}from'../helpers/config.mjs';import{parse,stringify}from'yaml';
const input={ci:await fs.readFile(ROOT+'/.github/workflows/ci.yml','utf8'),pages:await fs.readFile(ROOT+'/.github/workflows/pages.yml','utf8'),pins:JSON.parse(await fs.readFile(ROOT+'/.github/action-pins.json'))};
test('ACC-CI-02 workflow DAG action pins credentials transport and native runners fail closed',()=>{assert.equal(validateWorkflows(input).passed,true);for(const change of[
 {ci:input.ci.replace('contents: read','contents: write')},{ci:input.ci.replace('pull_request:','pull_request_target:')},{ci:input.ci.replace('persist-credentials: false','persist-credentials: true')},{ci:input.ci.replace('ubuntu-24.04-arm','ubuntu-latest')},{ci:input.ci.replace('macos-15','macos-15-intel')},{ci:input.ci.replace("engines: firefox","engines: chromium")},{ci:input.ci.replace("engines: 'chromium,webkit', install: 'chromium webkit'","engines: 'firefox,webkit', install: 'firefox webkit'")},{ci:input.ci.replace('--group release --engines','--group static --engines')},{ci:input.ci.replace('needs: [build, legacy, browsers]','needs: [build, browsers]')},{ci:input.ci.replace('digest-mismatch: error','digest-mismatch: warn')},{pages:input.pages.replace('cancel-in-progress: false','cancel-in-progress: true')},{pages:input.pages.replace('name: github-pages','name: unprotected')},{pages:input.pages.replace('needs: qualification','needs: []')},{pages:input.pages.replace('enablement: false','enablement: true')},{ci:input.ci.replace(input.pins.actions['actions/checkout'].commit,'v7')}
])assert.throws(()=>validateWorkflows({...input,...change}));assert.equal(validateWorkflows(input).hostedRun,'not_executed');});
test('Native live gate consumes one successful same-run producer without Pages or Actions privilege',()=>{
 const pages=parse(input.pages),{deploy,rollback,verify_live:live}=pages.jobs;
 assert.deepEqual(live.needs,['deploy','rollback']);assert.equal(live['runs-on'],'macos-15');assert.deepEqual(live.permissions,{contents:'read'});
 for(const producer of [deploy,rollback]){assert.equal(producer['runs-on'],'ubuntu-24.04-arm');assert.ok(producer.steps.some(step=>step.id==='live_manifest'&&step.with.archive===false));assert.ok(!producer.steps.some(step=>step.run?.includes('verify:live')));}
 const r=rollback.steps;assert.ok(r.findIndex(step=>step.run?.includes('--resolve'))<r.findIndex(step=>step.uses?.startsWith('actions/download-artifact@')));assert.ok(r.some(step=>step.with?.['run-id']));assert.ok(r.findIndex(step=>step.run?.startsWith('node scripts/rollback.mjs .artifacts/prior'))<r.findIndex(step=>step.uses?.startsWith('actions/upload-pages-artifact@')));
 for(const mutate of [
  p=>p.jobs.verify_live.needs=['deploy'],p=>p.jobs.verify_live['runs-on']='ubuntu-24.04-arm',p=>p.jobs.verify_live.permissions.actions='read',p=>p.jobs.verify_live.if=p.jobs.verify_live.if.replace('always()','success()'),
  p=>p.jobs.deploy.outputs.qualified_digest=p.jobs.deploy.outputs.manifest_digest,
  p=>p.jobs.rollback.steps.find(step=>step.id==='live_manifest').with.archive=true,
  p=>p.jobs.verify_live.steps.find(step=>step.uses?.startsWith('actions/download-artifact@')).with['artifact-ids']='${{ needs.deploy.outputs.manifest_id }}',
  p=>p.jobs.verify_live.steps.find(step=>step.uses?.startsWith('actions/download-artifact@')).with['run-id']='123',
  p=>p.jobs.verify_live.steps.find(step=>step.run?.includes('live-verification-input.mjs verify')).env.MANIFEST_DIGEST='${{ steps.selection.outputs.qualified_digest }}',
  p=>p.jobs.verify_live.steps.find(step=>step.with?.path==='.artifacts/known-good.json').if='always()',
  p=>p.jobs.verify_live.steps.find(step=>step.run?.includes('npm run verify:live')).env.QUALIFIED_ARTIFACT_ID='${{ steps.selection.outputs.manifest_id }}'
 ]){const changed=structuredClone(pages);mutate(changed);assert.throws(()=>validateWorkflows({...input,pages:stringify(changed)}));}
});
test('Exact Linux Firefox and Mac Chromium/WebKit mappings reject missing duplicate or unsupported routing',()=>{
 const mac="          - {os: macos-15, platform: darwin, engines: 'chromium,webkit', install: 'chromium webkit', name: mac}";
 const linux="          - {os: ubuntu-24.04-arm, platform: linux, engines: firefox, install: firefox, name: linux}";
 assert.ok(input.ci.includes(mac+'\n'+linux));assert.equal(validateWorkflows({...input,ci:input.ci.replace(mac+'\n'+linux,linux+'\n'+mac)}).passed,true);
 for(const ci of[input.ci.replace(linux,mac),input.ci.replace("install: firefox, name: linux","install: 'chromium firefox', name: mac"),input.ci.replace('platform: darwin','platform: linux'),input.ci.replace("engines: 'chromium,webkit', install: 'chromium webkit'",'engines: firefox, install: firefox')])assert.throws(()=>validateWorkflows({...input,ci}),/mapping/);
});
test('CI runs once per PR or Pages call and retains exact owned Linux Firefox display profile',()=>{
 assert.match(input.ci,/on:\n  pull_request:\n  workflow_call:/);assert.doesNotMatch(input.ci,/^  push:/m);assert.match(input.pages,/^  push:/m);
 assert.throws(()=>validateWorkflows({...input,ci:input.ci.replace('  pull_request:','  push:\n  pull_request:')}),/CI triggers/);
 assert.throws(()=>validateWorkflows({...input,ci:input.ci.replace('xvfb-run -a --server-args="-screen 0 1000x700x24" node scripts/run-pulseaudio-control.mjs','unowned-display node scripts/run-pulseaudio-control.mjs')}),/preflight branch/);
 assert.throws(()=>validateWorkflows({...input,ci:input.ci.replace("'llvmpipe'","'hardware'")}),/software display/);
});
test('Restored normal full gates retain exact Pulse/deadline requirements and reject every diagnostic leftover',()=>{
 const normal=parse(input.ci);assert.equal(Object.hasOwn(normal.jobs.legacy,'if'),false);assert.equal(Object.hasOwn(normal.jobs.assemble,'if'),false);
 for(const job of ['legacy','assemble'])for(const value of [false,'${{ false }}']){const bad=structuredClone(normal);bad.jobs[job].if=value;assert.throws(()=>validateWorkflows({...input,ci:stringify(bad)}),/Normal qualification gates/);}
 for(const run of ['node scripts/check-browser-capabilities.mjs --engines chromium','node scripts/run-tests.mjs release --only=ACC-A11Y-03','echo Diagnostic-only','exit 1']){const bad=structuredClone(normal);bad.jobs.browsers.steps.push({run});assert.throws(()=>validateWorkflows({...input,ci:stringify(bad)}),/Leftover diagnostic/);}
 for(const env of [{JUST_SNAKE_CHROMIUM_DIAGNOSTIC:'mac-metal'},{JUST_SNAKE_PREFLIGHT_CONTROL:'old-control'}]){const bad=structuredClone(normal);bad.jobs.browsers.steps.push({run:'echo stale-control',env});assert.throws(()=>validateWorkflows({...input,ci:stringify(bad)}),/Leftover diagnostic/);}
 for(const change of [ci=>ci.replace('--mode normal','--mode diagnostic'),ci=>ci.replace('120 * 60000','121 * 60000'),ci=>ci.replace('JUST_SNAKE_BROWSER_JOB_START_MS=','WRONG_START='),ci=>ci.replace('xvfb xauth pulseaudio pulseaudio-utils','xvfb xauth')])assert.throws(()=>validateWorkflows({...input,ci:change(input.ci)}));
 assert.ok(normal.jobs.legacy.steps.some(step=>step.run?.includes('--group legacy')));assert.ok(normal.jobs.assemble.steps.some(step=>step.run?.includes('--phase assemble')));
});
