import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import{validateWorkflows}from'../../scripts/check-workflows.mjs';import{ROOT}from'../helpers/config.mjs';import{parse,stringify}from'yaml';
const input={ci:await fs.readFile(ROOT+'/.github/workflows/ci.yml','utf8'),pages:await fs.readFile(ROOT+'/.github/workflows/pages.yml','utf8'),pins:JSON.parse(await fs.readFile(ROOT+'/.github/action-pins.json'))};
test('ACC-CI-02 workflow DAG action pins credentials transport and native runners fail closed',()=>{assert.equal(validateWorkflows(input).passed,true);for(const change of[
 {ci:input.ci.replace('contents: read','contents: write')},{ci:input.ci.replace('pull_request:','pull_request_target:')},{ci:input.ci.replace('persist-credentials: false','persist-credentials: true')},{ci:input.ci.replace('ubuntu-24.04-arm','ubuntu-latest')},{ci:input.ci.replace('macos-15','macos-15-intel')},{ci:input.ci.replace("engines: 'firefox,webkit'","engines: webkit")},{ci:input.ci.replace('engines: chromium, install: chromium',"engines: 'chromium,firefox', install: 'chromium firefox'")},{ci:input.ci.replace('--group release --engines','--group static --engines')},{ci:input.ci.replace('needs: [build, legacy, browsers]','needs: [build, browsers]')},{ci:input.ci.replace('digest-mismatch: error','digest-mismatch: warn')},{pages:input.pages.replace('cancel-in-progress: false','cancel-in-progress: true')},{pages:input.pages.replace('name: github-pages','name: unprotected')},{pages:input.pages.replace('needs: qualification','needs: []')},{pages:input.pages.replace('enablement: false','enablement: true')},{ci:input.ci.replace(input.pins.actions['actions/checkout'].commit,'v7')}
])assert.throws(()=>validateWorkflows({...input,...change}));assert.equal(validateWorkflows(input).hostedRun,'not_executed');});
test('Known-good record follows successful verification and rollback downloads validated prior run before NEW upload',()=>{const pages=input.pages;assert.ok(pages.indexOf('--record .artifacts/known-good.json')>pages.indexOf('actions/deploy-pages@'));assert.ok(pages.indexOf('path: .artifacts/known-good.json')>pages.indexOf('--record .artifacts/known-good.json'));const rollback=pages.slice(pages.indexOf('  rollback:'));assert.ok(rollback.indexOf('--resolve')<rollback.indexOf('actions/download-artifact@'));assert.ok(rollback.includes('run-id:'));assert.ok(rollback.indexOf('node scripts/rollback.mjs .artifacts/prior')<rollback.indexOf('actions/upload-pages-artifact@'));assert.ok(rollback.indexOf('actions/upload-pages-artifact@')<rollback.indexOf('actions/deploy-pages@'));assert.ok(rollback.includes('npm run verify:live'));});

test('Exact native engine mapping is order-independent and rejects duplicate report/platform routing',()=>{
 const mac="          - {os: macos-15, platform: darwin, engines: 'firefox,webkit', install: 'firefox webkit', name: mac}";
 const linux="          - {os: ubuntu-24.04-arm, platform: linux, engines: chromium, install: chromium, name: linux}";
 assert.ok(input.ci.includes(linux+'\n'+mac));
 assert.equal(validateWorkflows({...input,ci:input.ci.replace(linux+'\n'+mac,mac+'\n'+linux)}).passed,true);
 for(const ci of[input.ci.replace(linux,mac),input.ci.replace('install: chromium, name: linux','install: chromium, name: mac'),input.ci.replace('platform: darwin','platform: linux'),input.ci.replace("install: 'firefox webkit'","install: firefox")])assert.throws(()=>validateWorkflows({...input,ci}),/mapping/);
});

test('Temporary diagnostic environment is bound only to the existing Linux browser step',()=>{
 const selected="${{ matrix.name == 'linux' && 'linux-firefox-mesa' || '' }}";
 assert.ok(input.ci.includes(selected));
 for(const value of['linux-firefox-mesa',"${{ matrix.name == 'mac' && 'linux-firefox-mesa' || '' }}"] )assert.throws(()=>validateWorkflows({...input,ci:input.ci.replace(selected,value)}),/diagnostic control/);
});

test('CI runs once per PR or Pages call and keeps main Pages workflow intact',()=>{
 assert.match(input.ci,/on:\n  pull_request:\n  workflow_call:/);assert.doesNotMatch(input.ci,/^  push:/m);assert.match(input.pages,/^  push:/m);
 assert.throws(()=>validateWorkflows({...input,ci:input.ci.replace('  pull_request:','  push:\n  pull_request:')}),/CI triggers/);
 assert.throws(()=>validateWorkflows({...input,ci:input.ci.replace('xvfb-run -a','unowned-display')}),/preflight branch/);
});

test('Temporary diagnostic route cannot assemble and normal full gate code restores without deleted suites',()=>{
 const diagnostic=parse(input.ci);assert.equal(diagnostic.jobs.legacy.if,'${{ false }}');assert.equal(diagnostic.jobs.assemble.if,'${{ false }}');
 for(const job of ['legacy','assemble']){const bad=structuredClone(diagnostic);delete bad.jobs[job].if;assert.throws(()=>validateWorkflows({...input,ci:stringify(bad)}),/Diagnostic route/);}
 const normal=structuredClone(diagnostic);delete normal.jobs.legacy.if;delete normal.jobs.assemble.if;
 normal.jobs.browsers.steps=normal.jobs.browsers.steps.filter(step=>!(step.if==="matrix.name == 'mac'"&&step.run?.includes('this run cannot qualify')));
 const release=normal.jobs.browsers.steps.find(step=>step.run?.includes('--group release --engines'));delete release.env;release.run='npm run qualify -- --phase test --candidate .artifacts/candidate --group release --engines ${{ matrix.engines }} --output .artifacts/reports/${{ matrix.name }}';
 assert.equal(validateWorkflows({...input,ci:stringify(normal)}).passed,true);
 for(const job of ['legacy','assemble'])for(const value of [false,'${{ false }}']){const bad=structuredClone(normal);bad.jobs[job].if=value;assert.throws(()=>validateWorkflows({...input,ci:stringify(bad)}),/Normal qualification gates/);}assert.deepEqual(normal.jobs.legacy.steps,diagnostic.jobs.legacy.steps);assert.deepEqual(normal.jobs.assemble.steps,diagnostic.jobs.assemble.steps);
});
