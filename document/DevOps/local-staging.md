# Local simulated staging and performance evidence

This procedure demonstrates an exact application candidate separately from normal
development. It is not a public deployment or a production-readiness approval.
M3 sections 13 and 14 permit a small justified performance exercise and credible
simulated staging. Section 5.1 requires assessor-accessible demonstration instructions.

## Configuration decision for team review

For the M3 assessment, use isolated local simulated staging: a copy exported from
an exact Git commit, a production frontend build served by Vite preview, a separate
Express process, and a fresh loopback-only PostgreSQL cluster. Do not use the ordinary
development server or the user's civicconnect_local_review database.

This is an assessment arrangement, not a replacement for the M2 Render/Supabase
hosting decision. The team should record its acceptance in the existing decision
log/PED. Windows/PostgreSQL 18 and localhost do not reproduce hosted Linux resource
limits, TLS, cold starts, network latency or Supabase privileges. Public deployment
still requires appropriate authentication provisioning, restricted CORS, secure
secrets, least-privilege database access and hosting verification.

## Reproduce the candidate demonstration

Prerequisites: Windows PowerShell, Git, Node 24+, PostgreSQL 18 binaries and npm.
The exact candidate commit must exist locally. Dependency and browser downloads
need network access; no cloud account or paid resource is created.

From the repository root, after checking out the intended review candidate:

```powershell
$candidateSha = (git rev-parse HEAD).Trim()
.\tools\m3\stage-local.ps1 `
  -CandidateSha $candidateSha `
  -NodePath "C:\path\to\node.exe"
```

Check that `$candidateSha` is the intended full commit ID before running. Uncommitted
application edits are not included. The runner exports this exact candidate rather than the working tree, installs
locked backend/frontend dependencies, creates a new isolated database, applies
migrations 001/002 and the synthetic seed, builds the frontend, and runs all three
candidate Chromium journeys. The API uses NODE_ENV=test for the guarded tests;
the UI is built with NODE_ENV=production. Relative API requests use the preview
proxy. No external API origin is embedded into the build.

For a live recording/demo without repeating the load test:

```powershell
$candidateSha = (git rev-parse HEAD).Trim()
.\tools\m3\stage-local.ps1 `
  -CandidateSha $candidateSha `
  -NodePath "C:\path\to\node.exe" -SkipPerformance -HoldForDemo
```

After automated browser verification, open the loopback URL printed by the runner.
Show the candidate SHA/provenance and one critical journey. The seed accounts are
admin@example.com, requester@example.com, staff@example.com and management@example.com;
their public synthetic password is password123. Never expose this environment to
the internet or use these credentials with real users/data. Press Enter in the
runner after the demonstration to stop its services. Skipping performance is
explicitly recorded and cannot be presented as a new performance pass.

Each invocation creates a fresh artifacts/staging-<id> directory; it never resets,
reuses or deletes an existing database. Database authentication is SCRAM with a
random per-run password; the signing secret is also random. The ignored private
password file is retained locally. Ignore rules are not access control: keep the
machine/account private and never upload the entire staging directory.

## Performance protocol and interpretation

The existing PR #16 tools are reused with attribution. Their former `{items:[]}`
staff-list expectation was updated to the integrated API's JSON array; an explicit
regression test rejects the old envelope. Health must return `{status:'ok'}`.
The tools still reject redirects, require explicit permission for remote targets,
bound the workload, preserve failed/INCOMPLETE results and omit tokens/response
bodies. The staging wrapper only permits its own freshly created local database.

PERF-001 measures GET /api/staff/requests: staff need to retrieve their queue
promptly as the dataset grows. A guarded fixture generator adds synthetic request
snapshots with varied categories, statuses and dates until the SQL count is exactly
10,000. It checks that the authenticated API returns 10,000 distinct IDs. The fixture
snapshots are not evidence that every lifecycle transition occurred; the browser
suite supplies separate lifecycle evidence.

- Diagnostic: two concurrent loops, two-second warm-up, ten-second measurement.
- Selected baseline protocol: 50 concurrent loops, 60-second warm-up, 300-second
  measurement, two-second think time and ten-second request timeout.
- Target: nearest-rank p95 below 2,000 ms and zero unexpected errors. This operationalises
  one staff-list slice of the earlier NFR-003 scenario, not all core operations.
- Timing includes the complete response and JSON decoding. The queue is unpaginated,
  so each successful response contains the full 10,000-row result.
- A shared staff account is used, not 50 independently authenticated people. Closed-loop
  load, local resource contention and one operation do not establish production capacity.
- Warm-up errors block measurement. Diagnostic failure stops before the full test.
  A failed or blocked run is retained; do not rerun blindly or lower the target to get green.

## Evidence and release boundaries

Each run's evidence directory records candidate/archive identity, separate tool
hashes, browser JSON results, SQL/API counts, dataset/environment details, raw timing
samples, summary and completion/shutdown status. The candidate's HTML browser report
is under candidate/source/frontend/playwright-report. Review/redact reports before
sharing; no traces or videos are recorded. Keep database files, private password files
and unscreened service logs out of the evidence bundle.

The application SHA and tool hashes are separate: the runner records the tooling
checkout's HEAD and whether tools/m3 has local changes. Tools can measure an older
candidate without falsely claiming the tooling is in that application's SHA.
Link selected evidence into the existing PED, RTM and registers, rather than creating
a replacement PED/RTM. No new release tag, merge, reviewer approval or hosted deployment
is implied by this procedure. The tools need peer review before publication.

Rollback approach: stop this run's processes and redeploy an explicitly identified
previous known-working candidate with its compatible configuration/database snapshot.
Do not treat stopping a disposable cluster as an executed rollback/recovery drill.
Migration reversal, data restore, RTO and RPO remain unverified; do not run a restore
against shared data without separate authorisation.

AI use: Codex assisted with the API-contract correction, isolated runner, fixture
generation, verification and interpretation on 18 October 2026. Human review and
transfer into the existing AI Usage Register remain required.

## Execution results

18 October 2026: **setup blocked in the assistant's automated Windows session**.

- The 16 release-tool self-tests passed after network access was granted. The
  initial permission-restricted run could not reach its loopback HTTP fixtures;
  that was an environment prerequisite, not an application regression.
- PowerShell parsing and JavaScript syntax checks passed. This does not prove
  the complete staging launcher works on this machine.
- Exact candidate export and both locked dependency installs succeeded. The
  initial PostgreSQL bootstrap stalled while selecting memory settings and was
  interrupted before schema/data creation. A fresh attempt with a bounded
  bootstrap and requested max_connections=100/shared_buffers=128MB also stalled
  during initdb's probes and timed out. No performance test was started.
- On the timeout path, the external Windows process-cleanup command was rejected
  by the automated environment; the tool session was interrupted. The runner now
  terminates its tracked initializer through its process handle instead. This
  revised timeout path still needs execution verification.
- Both attempts are retained locally in ignored artifacts/staging-1bb68888c80049bfa15b7ca2676139e6
  and artifacts/staging-67b4dca5d92a4cddb08277faf486863c. The latter has a failure
  completion record. Neither is staging, browser, performance or release-pass evidence.
- No existing review database was accessed, and no PR, commit, merge or deployment
  was performed. Run the documented command from normal PowerShell to check whether
  the initialization problem is specific to the automated session. If it still
  fails, inspect that fresh run's initdb logs; do not keep retrying blindly.

At that point the independent successful GitHub CI run for cf82d64 remained valid,
but did not replace local staging/performance evidence. Subsequent results follow.

The first user-console attempt exposed a launcher compatibility defect: Windows
PowerShell 5.1 stripped quotes from the inline JavaScript version check, then falsely
reported that Node 24 was missing despite Node 24.19.0 being installed. This occurred
before any run directory or database was created. The check now parses `node --version`
in PowerShell; a Windows-only regression executes that exact check using powershell.exe.

The subsequent user-console run (staging-294e22c9b7934a74a6e10fed7f34a580)
completed initdb successfully according to its stdout log, but the launcher falsely
failed because Windows PowerShell 5.1 returned a null ExitCode after redirected
Start-Process and timed WaitForExit. A small redirected-process reproduction showed
null without retaining the process handle and zero with the handle retained. Both
initdb and pg_ctl launches now retain that handle before waiting. A regression runs
real redirected processes returning 0 and 7 in powershell.exe, verifying that genuine
failure still fails. That run's existing failure record is preserved; application,
browser and performance verification had not started.

### First completed application/load run: functional PASS, performance FAIL

Run `staging-8dae0186eab54dd5a18f225dc10e7c97`, candidate
`cf82d64d5f903145bf1a5e52e78b21f26917aa7f`, completed on 18 October 2026.
The candidate tree matches PR #23's merge tree, but this run identifies the
pre-merge candidate SHA; it is not evidence of a separate test of the merge commit.

- The production frontend build, readiness checks and all three Chromium journeys
  passed (browser suite: 10.4 seconds).
- Independently verified SQL and API counts: 10,000 distinct requests.
- Two-user diagnostic: p95 223.29 ms, zero errors, PASS.
- Full protocol: 50 concurrent loops, 60-second warm-up, 300-second measurement,
  two-second think time, complete unpaginated responses and unchanged 2,000 ms target.
- Full measurement: 3,795 requests, all HTTP 200; median 1,699.63 ms,
  **p95 3,979.43 ms**, maximum 7,605.80 ms, throughput 12.55 requests/second.
- Result: **FAIL on latency**, not functionality or HTTP error rate. Measurement
  finished at 19:56:00 UTC; the completion record confirms database shutdown.

The original `evidence/performance.json`, raw samples, browser results, dataset
description and failure completion record remain unchanged in that ignored run
directory. Do not lower the target or replace this record with a later pass.
The local staff-list performance requirement remains unmet by this candidate.

### Targeted investigation and proposed correction

Investigation used a copy of the stopped, disposable 10,000-row cluster, not the
original run or `civicconnect_local_review`. Read-only query/encoding comparisons
are retained under `artifacts/queue-profile-394a5c41668e44c99155f000535025da`.
These are diagnostic microbenchmarks, not release acceptance tests.
The profile directory also contains the private database copy and service logs;
do not upload it wholesale. Only reviewed JSON evidence should be shared.

Three alternating rounds of 50 queries with ten concurrent workers compared the
existing path, flat SQL columns with JavaScript assembly, and database-generated
JSON text. All three outputs were checked for equal parsed values and ordering.
The original path took 2.76–4.00 seconds per round, flat columns 2.45–2.98 seconds,
and JSON text 0.82–1.15 seconds. This supports reducing API-side conversion work;
it does not by itself establish a passing HTTP p95 or isolate every source of cost.

The narrow application change aggregates the same explicit fields into JSON in
PostgreSQL, returns it as text to avoid automatic driver JSON decoding, and sends
it with an explicit application/json content type. It retains role/session checks,
filters, timestamp/ID sorting, UTC millisecond dates, empty-array responses and the
entire queue. There is no cache, pagination, reduced dataset, extra database index
or relaxed threshold. Regression coverage includes JSON escaping, content type,
null fields, timezone independence and timestamp/ID tie ordering.

The follow-up HTTP diagnostic identifies the base commit and changed route SHA-256
explicitly because it runs uncommitted working-tree code. It is not a new reviewed
release candidate. A release decision still requires a committed, reviewed candidate
and its applicable CI/staging evidence.

Local regression verification after the change: 146 backend unit/HTTP-contract
checks, 74 real PostgreSQL integration checks and 74 frontend tests passed; backend
lint passed. The database tests used rollback-only fixtures in the disposable copy.
Before load measurement, the changed HTTP response was compared with the original
SQL/driver result: all 10,000 rows, field values and ordering matched exactly.
The API used a read-only connection during the load test. Browser journeys have
not yet been rerun against this change; the earlier three passes belong to cf82d64.

### Follow-up full HTTP diagnostic: PASS (uncommitted fix)

Evidence: `artifacts/queue-profile-394a5c41668e44c99155f000535025da/http-after.json`.
Application identity: base `cf82d64d5f903145bf1a5e52e78b21f26917aa7f` plus the
modified `source/backend/routes/staff.js`, SHA-256
`dbc072ed731558a5580da7236bfa4799538b259dfbea4fa2fbe1fa6915f5517e`.
The route hash was checked again after measurement. This is explicitly a local
working-tree result, not a claim that cf82d64 or the merged PR contains the fix.

| Full staff-queue protocol | Original candidate | Local correction |
| --- | ---: | ---: |
| Database records / rows per response | 10,000 / 10,000 | 10,000 / 10,000 |
| Concurrent loops / think time | 50 / 2 s | 50 / 2 s |
| Warm-up / measurement | 60 s / 300 s | 60 s / 300 s |
| Completed requests | 3,795 | 6,865 |
| Unexpected errors | 0 | 0 |
| Median | 1,699.63 ms | 160.08 ms |
| p95 (target below 2,000 ms) | **3,979.43 ms — FAIL** | **269.20 ms — PASS** |
| Maximum | 7,605.80 ms | 1,963.96 ms |
| Throughput | 12.55 requests/s | 22.88 requests/s |

All corrected responses were HTTP 200. The dataset count remained 10,000 after
the test, and the runner stopped its API and copied database successfully.
The original failed result, original database and ordinary review database were
not changed. This paired local comparison supports the narrow fix; it is one
follow-up run, not repeated trials or hosted-production capacity evidence. The
load generator, API and database still share one machine. Full-queue payloads
remain large (about 3.2 MB), and browser rendering of 10,000 rows was not measured.

Next release step: review the correction and obtain CI plus fresh staging evidence
for its exact committed candidate. Use the new full SHA, not cf82d64, to verify the
correction. The historical working-tree result above must keep its original label.

The follow-up also includes the release-tool self-tests in the CI helper job.
Local verification of those tools plus the existing disposable-target guards passed
28 tests, including both Windows PowerShell 5.1 regressions. Those two Windows-only
checks are explicitly skipped on the Linux CI runner, not counted as passes there.
The complete local helper/safety/release-tool test command passed 60 tests.
