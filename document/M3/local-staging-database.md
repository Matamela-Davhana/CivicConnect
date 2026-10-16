# Local simulated staging: database preparation

Owner: Member 3. Scope: the database infrastructure for an isolated local M3 rehearsal. This is supporting material for PED v3.0 sections 4/7/10, not a replacement PED or an approval to change the team's hosting baseline.

## What the setup does

`tools/m3/local-db.mjs` uses an existing PostgreSQL installation to create a **new cluster**, not just a new database on somebody's shared server. Its files are restricted to `artifacts/m3/local-staging`, its listener to `127.0.0.1:55432`, and its database to `civicconnect_m3_staging`. It cannot accept a remote URL, uses no existing PostgreSQL Windows service and has no delete/reset command. An existing staging directory makes `init` refuse to proceed.

The script applies the repository's existing `001_initial_schema.sql` in one transaction. It records the migration's SHA-256, then checks the five application tables, seven baseline categories, database identity, restricted runtime role, audit-table privileges and password rejection. It stops and restarts the new cluster and repeats the checks. It stops the database before successful initialisation exits.

The runtime role is not a superuser. It can read/insert/update users, categories and requests, but only read/insert audit history and request entries, matching the append-only intent of the migration. These database permissions do **not** implement requester/staff/management authorisation or public/internal visibility; those remain application responsibilities. The runtime role deliberately lacks TRUNCATE and database/schema administration privileges.

## Run it

Use Node 24 and an installed PostgreSQL distribution. On this machine the default PostgreSQL directory is `C:\Program Files\PostgreSQL\18\bin`. The directory can be supplied explicitly on first initialisation; the target database and port cannot be overridden.

From the repository root, on a machine where this staging directory does not exist:

```text
node tools/m3/local-db.mjs init
```

For a different PostgreSQL installation:

```text
node tools/m3/local-db.mjs init --pg-bin "C:\Program Files\PostgreSQL\17\bin"
```

After initialisation, use these separate commands as needed:

```text
node tools/m3/local-db.mjs start
node tools/m3/local-db.mjs verify
node tools/m3/local-db.mjs stop
```

`stop` retains data. Do not use `init` as a reset. A failed setup is retained for investigation; first confirm its owned cluster has stopped before any manually authorised relocation. A port conflict must be resolved without stopping unrelated PostgreSQL services.

## Private configuration

The ignored folder contains:

- `private.json`: generated database administration credentials and setup identity. Never publish it.
- `.env.staging`: generated restricted runtime database credentials, a generated authentication secret, `PORT=3300` and `BASE_URL=http://127.0.0.1:3300`. These names are provisional until the backend configuration is integrated and verified.
- `data/`: the disposable cluster's data, not source code or a submission artifact.
- `postgres.log`: private diagnostics; review/redact before sharing.
- `verification-*.json`: credential-free infrastructure results. Review the machine/version details before publishing.

Ignore rules are not encryption or access control. Keep this machine/account secure and restrict access to the folder. Never attach the entire artifacts folder or force-add ignored secrets. Do not move the credentials into the frontend. The generated application configuration is not loaded automatically into any application by this tool.

## Separation from acceptance tests and performance evidence

PR #15's fixture helper truncates application tables. Do not point that helper at a shared or populated staging database. Before running it, the test owner must arrange a separate disposable fixture database and a deliberately scoped test role, or explicitly agree to a controlled disposable reset. Never give the running application the setup administrator credentials just to make fixture cleanup pass.

This setup seeds categories only, not application users or service requests. It is **not** the 10,000-request performance dataset. Prepare representative synthetic records with the agreed password helper and schema after the backend is integrated, record counts and obtain a real test-staff token before running PERF-001. The performance runner's default port is 3000; explicitly use `--base-url http://127.0.0.1:3300` if the verified staging application uses port 3300.

Local PostgreSQL 18.4 differs from PR #15's PostgreSQL 17 CI service and does not reproduce Supabase/Render networking, TLS, resource limits or platform features. Record this difference; a local result does not prove hosted performance or environment parity. No app candidate SHA is claimed by database-only setup. Later pin the integrated app to a reviewed commit, record its actual startup/checkout identity and verify all critical journeys.

Restarting this cluster checks basic persistence of its seeded categories; it is not a backup restore, application rollback or a proven recovery-time objective. Retain the rollback/recovery procedure in `member3-release-guide.md` and rehearse it separately on an agreed candidate.

## Verification boundaries

The five `local-db.test.mjs` checks are tool configuration/safety tests and can run in CI without PostgreSQL. Actual database verification is performed locally by `init`/`verify`; CI must not be described as running those database checks unless it really does. Neither set replaces the milestone's minimum application test cases.

## Executed local evidence — 16 October 2026

Environment: Windows, Node v24.19.0, PostgreSQL 18.4, loopback port 55432. Setup was developed on top of tooling commit `137a8bbd755c752025d9b7f3416ae9896c7a4b64`; the new tool was still uncommitted when these local checks ran. This is not an application release-candidate identity.

| Check | Actual result |
|---|---|
| Tool tests: existing release checks plus new configuration guards | 20 passed, 0 failed |
| Fresh-cluster migration and infrastructure verification | 8 checks passed |
| Verification after stopping/restarting the cluster | The same 8 checks passed; 7 categories retained |
| Separate start / verify / stop commands | Passed; database stopped with data retained |
| Attempt to initialise over the existing staging directory | Correctly refused with exit code 1; no reset performed |
| Git exclusion of credentials and database data | Confirmed with `git check-ignore` |
| Application users / service requests | Not seeded; service-request count 0 |
| Real application smoke, E2E and performance runs | Not executed; application integration still required |

The eight infrastructure checks cover cluster identity/listener, unchanged migration hash, five tables, seven readable categories, non-superuser runtime privileges, append-only audit grants, an actual rejected audit UPDATE and rejection of an incorrect database password. Their repeated execution is not eight additional application test cases each time.

Original credential-free reports are retained locally at `artifacts/m3/local-staging/verification-1792181115030.json` (before restart), `verification-1792181117471.json` (after restart), and `verification-1792181227807.json` (separate lifecycle commands). The first post-restart result was recorded at 20:05:17 UTC / 22:05:17 SAST. They remain ignored until intentionally reviewed and selected for the final evidence bundle.

Executed local-file SHA-256 fingerprints (raw bytes, so line-ending conversions can change them):

- `tools/m3/local-db.mjs`: `5bc381836e1b1b7d21b6e38e8819ab7dc2f298e883fb4bd0eef01f4f3a168b7d`.
- Existing migration: `de2773eabe77d4b15894b34cd0ef2321e650a0fad40c24f5c668e60a10a022aa`.

An initial attempt exposed inherited Windows pipe handles during background startup. The launcher was corrected to avoid capturing the background server's pipes; the stopped failed setup was preserved in a separate ignored folder, and the successful run used a fresh cluster. No pre-existing database was altered. The new additions still require peer review and a new PR workflow run. Release readiness remains NOT READY until integrated application evidence is complete.

Implementation references: PostgreSQL's [initdb documentation](https://www.postgresql.org/docs/18/app-initdb.html) describes creating a new cluster and password-based authentication; [pg_ctl documentation](https://www.postgresql.org/docs/18/app-pg-ctl.html) covers managing the explicitly selected cluster. Project schema: `source/backend/migrations/001_initial_schema.sql`.

AI use: 2026-10-16, Codex assisted Member 3 with the isolated setup script, configuration guard tests and this procedure. Human review is still required for compatibility with the integrated backend, runtime privileges and the team's selected staging arrangement. Link the contribution to the existing AI Usage Register.
