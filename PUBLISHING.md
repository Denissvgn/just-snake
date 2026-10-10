# Publishing just-snake

This is the qualification and publication procedure, not a claim that a site is deployed. The repository and GitHub Pages project name must both be exactly `just-snake`; the expected project mount is `/just-snake/`.

Complete native ARM64 qualification through either a local full invocation or one genuine full hosted matrix: install exact lockfiles with Node 24, regenerate the social image if needed before freezing inputs, build, check distribution budgets, and run all required static, legacy and three-engine release cases. Obtain genuine independent review of the complete matching evidence before deployment. Retain the immutable source revision, both lockfile hashes, report and payload SHA256 map outside `dist/`. Publish only those checked bytes, never a later rebuild. Current benchmark methodology and its limitations are documented in [PERFORMANCE.md](docs/PERFORMANCE.md).

During an explicitly authorized publishing run, discover the authenticated account, repository, default branch, Pages configuration and existing protections. Reuse an authorized repository named `just-snake`, or create that exact name under the authenticated personal account when creation is authorized. A conflicting unrelated repository is an external blocker; do not choose another slug or overwrite it. Preserve branch protections, required human reviews, environments and any custom domain. Derive canonical/social absolute URLs and bug-report links only from verified discovery; local metadata currently uses relative assets.

Every new working branch must be created without tracking:

```sh
git switch --no-track -c <branch> <verified-base-ref>
git status -sb
git for-each-ref --format='%(refname:short) %(upstream:short)' refs/heads/<branch>
```

Check `branch.<branch>.remote` and `branch.<branch>.merge` too; remove accidentally inherited tracking before proceeding. Authorized publication uses an explicit same-name destination:

```sh
git push --set-upstream <remote> <branch>:refs/heads/<branch>
```

Verify the upstream is `<remote>/<branch>` and merge ref is `refs/heads/<branch>`. A blocked/deferred push leaves no upstream. Feature branches never implicitly push to the default branch.

PR checks must remain read-only and cannot deploy. Pages deployment runs only on the discovered default branch or authorized dispatch, after every required check. Pin reviewed action commits; use `pages:write` and `id-token:write` only for deployment, the existing `github-pages` environment, and deployment concurrency with `cancel-in-progress:false`. Upload the already qualified `dist/` digest and retain a separate qualified-candidate artifact with payload/provenance for 30 days or the lower existing retention maximum. No dotfiles, `.nojekyll`, source maps, tests, credentials or reports belong in the Pages payload.

Hosted workflow success and live root/alias/seeded-prefix smoke evidence are required before claiming publication. Poll external operations with bounded exponential backoff for at most ten minutes. Missing access, enforced review or runner/Pages capability produces a sanitized external blocker with operation, reason, required capability, retry command and completed local artifact links. Finish independent local work; do not bypass protections or claim success.

Rollback uses an already qualified known-good artifact: download by artifact ID, verify its digest/provenance, upload the checked payload as a new Pages artifact in the rollback run, and deploy it. A prior run ID alone is not a deploy-pages input. Missing or expired provenance cannot qualify rollback. During an authorized update, automatic rollback is permitted only after failed verification and to a previously qualified artifact. A first-deploy failure remains failed; a recovered previous version is `rolled_back`, and the failed candidate returns for repair and requalification.

An empty newly authorized public repository needs an explicit initial public `main` commit from a qualified allowlisted source tree. Export only the reviewed source, local assets, exact package/locks, current scripts/tests/workflows, operational docs, machine test contracts and notices and independent attestation; exclude local tools, reports, credentials and unrelated historical patch recipes. Initialize this public tree independently. Never push the original private workspace history, or implicitly push the task branch into public main. Record the reviewed private revision and new public/deploy revision separately, comparing every checked executable input and payload byte map. Existing repositories instead follow their verified protections and reviewed branch route.

The local/public commands and complete review record format are in [RELEASE_QUALIFICATION.md](docs/RELEASE_QUALIFICATION.md). CI produces pending-review results; the independent reviewer supplies the actual attestation. Pages verifies that record and its own full hosted results before uploading checked bytes. Successful live verification then persists the authoritative known-good record. Rollback dispatch requires both the retained qualified artifact ID and its live-record artifact ID, authenticates their actual successful trusted GitHub run metadata, validates the raw archive before extraction, re-uploads the verified old bytes as a new Pages artifact, and verifies served bytes again. A caller-supplied JSON claim alone cannot authorize a predecessor.
