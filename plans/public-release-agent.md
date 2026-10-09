# just-snake autonomous agent execution runbook

This is an execution handoff, not a request for preferences. Read the current user/session instructions first, then ../PUBLIC_RELEASE_BACKLOG.md, public-release.plan.json and public-release.acceptance.json. The public-release plan takes precedence over conflicting historical feature recipes within its stated scope. It does not supersede runtime security/permission policy or expand publication authorization.

## Current planning deliverables

- The plan has30 tasks:25 local release tasks,2 conditional external publication tasks and3 deferred improvements.
- The acceptance catalog has54 cases:52 local qualification cases and2 live-publication cases.
- All implementation task statuses start pending; deferred tasks start deferred. No fix or deployment has been claimed by creating these files.
- The supplied validator works now: run `python3 scripts/validate_public_release_plan.py` from repository/workspace root.
- A01/A02 provide source-test hook gating and production exclusion before any candidate can qualify. The actual dist artifact has no mutable test controls; legacy source adapters remain source-only.
- Root npm/build/browser commands in the backlog are future interfaces implemented by A01/A02. Do not mistake them for existing commands.
- If the source SHA256 differs from the reviewed baseline, record the new input and inspect affected findings; do not restore the old file or overwrite user changes.

## Startup procedure

1. Discover and read applicable AGENTS.md instructions, current task authorization and tracked/untracked changes. Do not print credentials from .aws/.pi-runtime/.pi-lab/settings/endpoint files.
2. Validate the planning artifacts. Read DEC01-DEC12 completely; they settle the product, runtime, storage, UI, dependency and deployment choices.
3. Implement A00, preserving user edits and recording the baseline. If Git is absent, a future authorized implementation run may initialize local Git; planning alone does not.
4. Read the DAG. Select the earliest pending task whose dependencies are accepted; skip deferred tasks. Acquire every write lock before editing, testing an instrumented source, merging or updating shared configuration.
5. Spawn an implementation agent with one bounded task. Spawn a separate reviewer with the same task/acceptance requirements but a read-only initial assignment. Use the native collaboration tools when available; never substitute a mocked agent response for review evidence.
6. Let other agents work on disjoint ready tasks only when locks allow. Keep one game-source writer, one coordinator-owned manifest writer, <=3 agents including coordinator, <=2 browser processes and one browser-suite worker.
7. Before running browser checks, freeze the source inputs for that check and hold the relevant read/write lock. Legacy scripts share debug filenames and are always sequential.

## Task assignment prompt

Copy this with the selected concrete ID, keeping all other requirements:

> Implement TASK_ID from plans/public-release.plan.json. Read PUBLIC_RELEASE_BACKLOG.md decisions DEC01-DEC12 and every acceptance case assigned to TASK_ID. Work only within the authorized implementation scope and declared source paths/locks. Generated dist/.artifacts/output and temporary fixtures are permitted task outputs; unrelated user files are not. Inspect the current source by symbol rather than trusting historical line numbers. Preserve user changes. Do not run old implement_*.py text-patch recipes. Use real browser behavior for UI acceptance and deterministic source adapters only to arrange difficult simulation fixtures. Finish the implementation, run bounded relevant checks and write .artifacts/tasks/TASK_ID/result.json. Do not ask routine product questions: apply the fixed plan decisions. Record any concrete external capability blocker and finish independent local work. Do not publish externally unless current task/session authorization includes that action. Return changed paths, results, evidence and any remaining defects.

## Independent review prompt

> Review TASK_ID against the manifest, DEC01-DEC12 and assigned cases. Read the actual diff/current files and implementation evidence independently. Verify real behavior or objective source/build invariants; mere function presence/class membership or an implementer's summary is insufficient. Check for unintended gameplay/RNG/storage/DOM changes. Run the relevant assertions in isolated storage; distinguish native GPU, SwiftShader, engine emulation and physical devices. Return accepted or changes_required with precise findings, case IDs and evidence. Do not approve missing/failed/skipped required checks or edit the implementation under review without handing it back.

E04 must be assigned to a reviewer who did not implement the runtime/build changes being qualified. Read-only agent reviews can run alongside implementation, but final acceptance uses the immutable candidate.

## State and resume rules

- pending -> ready: dependencies accepted and locks available.
- ready -> in_progress: coordinator records assignment and source revision/hash.
- in_progress -> in_review: implementation plus relevant evidence exists.
- in_review -> accepted: independent review accepts, required checks pass and inputs still match.
- in_review -> in_progress: reviewer identifies actionable defects; retain evidence of failed checks.
- A01 may be accepted with explicitly reproduced known-red game regressions, because it owns infrastructure rather than all fixes. Each regression remains an open case owned by its later task; E04 requires every local case green.
- blocked_external: a concrete unavailable external capability prevents the specific operation. Continue unrelated ready tasks. Do not mark ordinary hard/slow work or a test failure blocked_external.
- deferred: outside v1 scope; do not implement merely because spare time exists.
- Resume by re-reading manifest status and task result files, validating their source hashes and choosing the next ready task. Never rerun an accepted recipe blindly.
- Dispatch every new task and every requested fix after an implementer final handoff with `collaboration.followup_task`; immediately call `collaboration.list_agents` and verify that implementer is running. `send_message` only queues input to an already running agent and never starts an idle/completed agent.
- Three failed implementation/review attempts require a bounded technical replan by the coordinator: isolate the smallest reproduced failure, narrow the change, preserve tests and try a different justified implementation. This is not a preference question or permission to waive acceptance.
- If an accepted task's code changes later, rerun affected cases and mark its evidence stale until review confirms it. E04 is invalidated by any payload-relevant source/dependency/build change.

Only the coordinator edits task status in the JSON manifest. Other agents deliver result files; this prevents lost concurrent status updates. Keep prose task-status summaries synchronized when publishing a final report.

## Git and source safety

Prefer one local task branch per bounded change when a repository exists. Create it with `git switch --no-track -c task/<lowercase-id> <base-ref>`, then inspect `git status -sb` and `git for-each-ref --format='%(refname:short) %(upstream:short)' refs/heads/task/<lowercase-id>`. Inspect branch remote/merge keys if necessary. Remove inherited tracking immediately.

The base ref does not select a push destination. An authorized push uses only `git push --set-upstream <remote> <branch>:refs/heads/<branch>`. Verify upstream=<remote>/<branch> and merge=refs/heads/<branch>. A blocked/deferred push leaves no upstream. No force-push or automatic task-branch push into main/master is allowed. Do not trust GUI branch labels or default push mode.

Do not commit/stage the entire workspace. The allowlist includes canonical game source, selected assets, root dependency/build/test files, tests excluding node_modules, public docs/specs/plans, workflow files and license notices. Exclude .pi-lab,.pi-runtime,.agents,.codex,.claude,.aws,.env*,setup_key.sh,credentials,local endpoint configurations,.DS_Store,__dbg_*,.artifacts,output,dist,node_modules and caches. Review selected files before initial/public commits. Keep diagnostics local.

Use configured Git author identity; if absent, record it as a local Git capability limitation and continue file implementation/testing. Do not invent the owner's identity or broaden repository permissions to get a commit through. Repository publication must resolve an authenticated, authorized identity noninteractively or remain blocked.

## Architecture, tools and resource limits

- Local workstation architecture is ARM64. Prefer native host tools; Docker is optional.
- Pull/build/run every local Docker image with explicit linux/arm64, then inspect its architecture before launch. Never use AMD64 or emulation unless the user changes that instruction.
- Pin official registry/vendor dependencies exactly during A01/A02; npm ci afterward. Do not continuously upgrade while correcting runtime behavior.
- Native browser availability is capability-checked; use official Playwright browsers or compatible installed native Chrome. Rendering failure is a failed capability/check, never a successful silent skip.
- Default case timeout30s, browser suite timeout180s, full qualification timeout45min, external workflow/deployment poll budget10min. Long measured legacy suites may declare <=300s with evidence; no infinite waits.
- If Docker is selected: <=4 CPUs,4GiB RAM,256 PIDs and one active test container; stop containers/browser/server processes in finally blocks. Never change host security or use an AMD64 workaround.
- Keep terminal output concise and sanitized. Use file/body arguments for multiline GitHub bodies; avoid unsafe command interpolation.
- During active agent work provide meaningful progress updates at least once per60s when tools permit. No blocking sleep/wait>60s without a way to report progress.

## Testing and evidence

A01 owns the central registry of all20 static and26 existing browser suites plus the54 catalog cases. Every check has an explicit target, timeout, exit status and result file. Required legacy migrations have explicit owning paths/locks; replace superseded assertions with equivalent behavioral coverage and document why, never disable them. Local workflow checks are graph/permission/command/failure-injection rehearsals; record hosted_run_not_executed until authorized E05 executes GitHub checks. A failed browser startup or unavailable required engine cannot be treated as pass.

Use fresh storage per ordinary browser case; migration cases seed named legacy keys intentionally. Security probes must set harmless local flags, never extract data or send payloads externally. Source test adapters run in temporary copies and clean them on both success/failure. Built-artifact tests use the exact production bytes; do not create a privileged test-only production build.

Test all modes for simulation invariants, source and dist for release-critical behavior, root/prefix for packaging, and Chromium/Firefox/WebKit for user interactions. A source fix can run its assigned cases first; full matrix is mandatory for E04. Never repeat broad testing without a new change, failure or unresolved concern.

Do not silence every console warning. Handle haptics eligibility in code and test actual activated UI behavior. A narrow known-browser informational allowance must name the exact message/capability and cannot swallow page errors or new messages.

Suggested task result shape:

```json
{
  "schemaVersion": 1,
  "taskId": "A03",
  "status": "in_review",
  "sourceHash": "<actual-sha256>",
  "changedPaths": ["snake-three.html", "tests/release/security.spec.mjs"],
  "checks": [
    {"caseId": "ACC-SEC-01", "command": "<actual-command>", "exitCode": 0, "evidence": "<local-file>"}
  ],
  "reviewer": null,
  "issues": [],
  "blockers": []
}
```

Replace placeholders in actual result files; they are illustrative schema labels here only. Dist/report hashes and source version must be real. No unpublished local preparation is called a live deployment.

## Publishing without routine human interaction

DEC12 is authoritative. An end-to-end publication assignment proceeds automatically with existing authorized account access, repository policy and Pages capability. An implementation-only assignment completes local qualification and records pending_authorization without initiating publication or asking a routine permission question.

Discovery is read-only first. Never fabricate tokens, choose an unrelated organization, purchase services/domains, turn off reviews or mutate unrelated Pages configuration. Repository, public page title, heading, share-card and social-preview naming is exactly just-snake; the project-site path is /just-snake/. Reuse only an authorized matching repository, or create just-snake under the authenticated personal account. Name conflicts produce blocked_external; do not overwrite unrelated code, rename unrelated repositories or choose an alternative slug. Legacy storage keys and snake-three.html remain compatibility details.

Normal same-name branches/PRs and policy-compliant auto-merge are preferred. Existing human-review protections are external infrastructure constraints; preserve them and record blocked_external rather than pretending the no-interaction instruction overrides the service's access policy. Runtime approval review remains binding; if it rejects an action, report the actual rejection separately and complete safer independent work.

External blocker shape:

```json
{
  "taskId": "E05",
  "status": "blocked_external",
  "operation": "enable_pages",
  "code": "missing_pages_write",
  "reason": "Authenticated token lacks repository Pages write capability",
  "requiredExternalCapability": "Existing authorized credential with Pages and required repository administration access",
  "retryCommand": "<prepared-noninteractive-command>",
  "localArtifactsComplete": true
}
```

Publishing discovery/verification/rollback tooling must be implemented in E02 and frozen by E04. E05/E06 execute those tools and write evidence without editing the qualified source/workflows. Retain a generic qualified-candidate artifact with payload/digest/report/provenance for30 days or the existing lower repository limit; download/verify/re-upload a selected old payload into the current rollback run, rather than passing a prior run id to deploy-pages. No retained verified artifact means rollback unavailable.

After deployment, verify the returned URL and served payload; record published only if E06 passes. Reuse verified known-good artifacts for rollback only after an update's candidate verification fails. A successful candidate stays live; routine rollback mechanics are rehearsed locally before qualification. Recovery reports rolled_back with the previous active digest and failed candidate, never candidate published. Do not force-push history or deploy unchecked source as a rollback.

## Final handoff

Report accepted task IDs, source/artifact hashes, meaningful check results, evidence location, remaining deferred tasks and exact external publication state. If Git exists, explicitly name the local branch and its verified upstream or no upstream. If no Git repository could be created, state that plainly.

Stop auxiliary processes and remove temporary debug files. Keep the checked candidate and its evidence for resume. No user question is necessary when all local tasks are accepted and publication is either verified or correctly recorded as outside authorization/externally blocked.
