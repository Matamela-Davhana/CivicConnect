# Member 3: staging, performance and release evidence

Status: tooling implemented; application execution blocked pending backend/UI integration.
This is supporting evidence for the existing PED v3.0, not a replacement PED.

## Contribution boundary

This branch starts from main `006cea10ba2a29f6c889346de65a0d710ac1b36b`.
It does not copy, replace or merge the domain rules/test suite/CI from [PR #15](https://github.com/Matamela-Davhana/CivicConnect/pull/15).
That PR remains a separate dependency. No backend routes or frontend journeys are implemented by this contribution.

Implemented here:

- Dependency-free Node tools for API smoke checks and one bounded performance scenario.
- Automated tool self-tests against an in-memory HTTP fixture, not CivicConnect.
- A separate CI job for these self-tests (not a substitute for the application Quality gate).
- Staging, rollback, performance and evidence procedures below.
- A disposable local PostgreSQL preparation script and its configuration guard tests; see [local database procedure](local-staging-database.md). Database infrastructure is separate from a completed application deployment.

## 1. Verify the tools now

From the repository root, using Node 24 to match PR #15's CI:

```text
node --test tools/m3/checks.test.mjs
node --test tools/m3/local-db.test.mjs
node tools/m3/run.mjs --help
```

The self-test fixture is deliberately temporary and local. Its successful results MUST NOT be labelled as application acceptance, E2E or NFR-003 performance results. The separate workflow `release-tooling.yml` automatically runs these tests on PRs to main and pushes to main. Its failure fails that job; only repository protection makes a check a merge blocker. Retain the application's required Quality gate and two-review rule.

Local verification on 2026-10-16: Windows, Node v24.19.0, 15 tool self-tests passed, zero failed. Covered unsafe-target rejection, workload validation, percentile calculation, malformed/empty/error/redirect/timeout handling, warm-up failures, measured failures, report redaction and refusal to overwrite evidence. This is not the M3 minimum of 15 application test cases; these helper tests are additional engineering checks. CI evidence should be linked from the contribution PR after it runs.

The initial 15-test tooling contribution is published in [PR #16](https://github.com/Matamela-Davhana/CivicConnect/pull/16), with a [successful tooling workflow](https://github.com/Matamela-Davhana/CivicConnect/actions/runs/38958399061) for commit `137a8bbd755c752025d9b7f3416ae9896c7a4b64`. That run does not cover later local-database additions; their new commit/run must be recorded separately.

## 2. Prepare an isolated staging environment

M3 permits a credible simulated environment. Recommended initial approach: run a separate checkout/process and a dedicated disposable PostgreSQL database locally; migrate to team-owned cloud staging only after the core application runs. This is a proposed M3 execution arrangement, not a silently approved change to M2 hosting.

The M2 document contains both a Render/Supabase hosting decision and a university-server deployment assumption. Confirm one M3 arrangement as a team and record the resolved choice/impact in the existing decision log. Do not claim both were deployed.

Before execution:

1. Select an exact candidate SHA after reviewed changes are integrated. A moving branch name is insufficient.
2. Use a separate checkout of that SHA and record `git rev-parse HEAD` and `git status --short`. Record runtime/OS/database versions and machine limits. Do not tag a release candidate on behalf of the team before scope freeze.
3. Confirm `source/backend/src/app.js`, `src/server.js`, password hashing, login, health and business routes exist. Also confirm React implements the critical journeys; the starter screen is not a working UI.
4. Install using committed lockfiles (`npm ci` in each project). Follow the backend owner's reviewed migration instructions against the dedicated test database only.
5. Configure database credentials and authentication secrets outside Git. Do not put secrets in screenshots, reports, commands shared in GitHub, or frontend build variables. Browser variables are public.
6. Record actual configuration names from the implementation. Expected by PR #15: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `BASE_URL`; confirm these rather than assuming the backend supports them.
7. Seed synthetic users/requests, record a SQL count and the seed procedure. Do not use real personal data. Use authorised staff test credentials to obtain `M3_STAFF_TOKEN`; set it privately in the environment.
8. Verify the deployed revision independently (checkout plus process startup record locally, provider deployment-to-commit record remotely). The tooling's `--commit` is an operator declaration, NOT automatic proof of the server revision.
9. Keep the test environment inaccessible to unintended users. Remote tests require team/provider permission; no paid infrastructure is authorised by this guide.

### Smoke check

Replace the SHA and dataset count below with verified values. Run from the repository root. Set `M3_STAFF_TOKEN` securely first; it is never passed on the command line.

```text
node tools/m3/run.mjs --mode smoke --base-url http://127.0.0.1:3000 --commit FULL_40_CHARACTER_SHA --environment local-m3-staging --dataset-count 10000
```

Checks: health returns HTTP 200 with JSON; authenticated staff list returns nonempty `{items:[...]}` with record IDs/statuses; anonymous staff-list request returns HTTP 401 with JSON. Contract source: PR #15's `source/backend/tests/helpers/contract.js`. This is intentionally minimal and does not validate list completeness, ownership, database integrity or UI behaviour. Adjust the contract only through reviewed API decisions, not merely to make a failure green.

Reports go to ignored `artifacts/m3/` by default. Copy reviewed, sanitised results into a controlled evidence location or upload them as CI artifacts and link them in PED/RTM. Existing report names are not overwritten. An INCOMPLETE report is never a pass.

### System journeys

Use PR #15's two existing E2E tests after the backend is implemented and those tests reviewed. They are API-driven, not browser-driven. Additionally demonstrate the React journey if claiming end-to-end UI operation.

**Warning:** the existing E2E helper truncates users, service requests and history. Run ONLY against a dedicated disposable database whose loss is acceptable. Never enable `ALLOW_DESTRUCTIVE_TEST_DB` for a shared Supabase database. A localhost address alone does not make a database disposable. Do not run E2E resets concurrently with performance measurement.

Retain evidence for submit -> accept -> assign -> in progress -> resolve -> close, and rejection/access-boundary behaviour. Label skipped/blocked runs honestly.

## 3. PERF-001: staff request-list performance

Basis: NFR-003 and the M2 ASR performance scenario (10,000 records, 50 concurrent users, p95 below 2 seconds). This chosen list operation is one slice of the requirement, not proof of every core action.

- Why: staff must retrieve work promptly as the request dataset grows.
- Data: independently verify 10,000 synthetic requests with varied categories/statuses/dates; retain seed recipe and SQL count evidence.
- Workload: 50 concurrent virtual-user loops; each sends one GET, reads its complete JSON response, then waits 2 seconds. One shared staff account is used; this does not reproduce 50 distinct user sessions.
- Warm-up: 60 seconds, excluded from measured samples. Any observed warm-up error blocks the measured phase.
- Measurement: 300 seconds, plus bounded completion time for in-flight requests. Record actual elapsed duration. Closed-loop load waits for responses; it cannot establish a guaranteed request-arrival rate or overload capacity.
- Timeout: 10 seconds per HTTP request. Redirects are rejected to avoid forwarding credentials to another target.
- Target: all requests successful with the expected minimum response shape and p95 < 2,000 ms. Zero unexpected errors is a proposed scenario criterion, not a newly invented baseline NFR.
- Output: all sample durations/statuses, nearest-rank median/p95/max, errors, throughput and workload metadata; no response bodies or tokens.
- Boundaries: max 50 users and 10 minutes measured time. No automatic cloud run in CI.

```text
node tools/m3/run.mjs --mode performance --base-url http://127.0.0.1:3000 --commit FULL_40_CHARACTER_SHA --environment local-m3-staging --dataset-count 10000
```

For a permitted team-owned HTTPS staging target, supply its origin and `--allow-remote`. Do not load-test third-party/shared/production systems without permission. Verify hosting limits before a remote run.

To debug a setup, use `--users 2 --warmup-seconds 2 --duration-seconds 10`. Such a run is reduced-load diagnostic evidence, not verification of the 50-user baseline.

Interpretation: slow successful responses fail the performance target; fast errors fail correctness; unavailable application/invalid credentials/missing fixture data block execution. A pass demonstrates only this scenario in the recorded environment. It does not prove browser speed, all API operations, production capacity, uptime or recovery objectives. Record cold-start behaviour separately if relevant rather than hiding it in warm-up.

## 4. Rollback/recovery rehearsal

1. Identify the exact previous known-working commit/artifact and preserve its deployment configuration securely. If there is none yet, record rollback as unproven rather than inventing a version.
2. Before schema changes, take a verified test-database backup/snapshot and record how it is restored. Do not assume a provider tier includes backups.
3. Check whether the old application can read/write the new schema. Reverting code does not revert data or migrations.
4. In the isolated environment, stop writes, restore the previous application and compatible configuration. If database restoration is necessary, record expected data loss and restore only with explicit authorisation.
5. Re-run smoke and critical journeys. Record timestamps, restored SHA, results, recovery duration and limitations. A written plan alone is not an executed recovery drill.

## 5. Evidence index for the existing PED / RTM

| PED section | Evidence to link | Current position |
|---|---|---|
| 5 CI | PR #15 workflow/run; required-check/two-review settings; blocked merge evidence; release-tooling self-test run | Application CI depends on backend; settings reported confirmed by user, independent evidence still to link |
| 7 System validation | Two critical journeys with candidate SHA, actual results and defects | Blocked pending backend and integrated application |
| 8 Performance | PERF-001 script, data/environment evidence, raw report and interpretation | Tool available; real application run not executed |
| 10 Release readiness | Candidate identity, staging record, rollback evidence, gate summary, open risks | No release approval made |

Add links to the existing RTM, not a duplicate RTM: NFR-003 -> existing acceptance criterion -> staff-list route/query -> PERF-001 -> authentic report -> result/defect. Coordinate functional IDs for system journeys with the current RTM because earlier M2 sections use inconsistent numbering.

Release decision remains NOT READY for the inspected repository baseline: missing application backend and business UI prevent integrated acceptance and deployment evidence. Reassess after genuine candidate runs; a tool self-test pass cannot change that decision.

## 6. AI usage disclosure (contribution record)

2026-10-16: Codex assisted Mkhanyisi Mqadi with release-check tooling, tool tests, workflow and this guide. Inputs: team M3 allocation, supplied M2/M3 briefs, main repository and PR #15's API/test contract. Tool tests validate the helper implementation only. Human review still required for API compatibility, environment/data safety, target interpretation and evidence classification. Transfer/link this entry into the team's existing AI Usage Register; do not represent it as already reviewed by the team.
