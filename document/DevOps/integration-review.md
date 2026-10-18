# Local integration review — 18 October 2026

Branch: `role1/integration-review`. Local only; not pushed and not a release candidate.

## Inputs and reconciliation

- Backend PR #21: `bf527fe2a2ddb1dd6698cc52500c7f506a33955f`.
- Frontend PR #20 (includes #19): `16a091f8f4b336d73e377950da54eb80728f26df`.
- DevOps PR #18: `4b4e8b6ab6b7642f63712d264b7970dbb637ea35`.
- Login fix PR #22: `eeb3e2fdc745a453a440e135655969b4a0379917`.

Merged those histories on an isolated local branch. Kept the backend's current
login response (both top-level role and user.role) and retained the HTTP regression
suite from #22. Removed duplicate app exports, loaded dotenv before reading PORT,
and guarded the listener so importing the app does not open a second port. Default
binding is loopback; hosting must explicitly set HOST=0.0.0.0.

This does not update or resolve the conflict on the remote PR #22 itself.

## Changes

- Replaced plaintext sample passwords with valid cost-12 bcrypt hashes.
- Seed is transactional, limited to the two explicitly named test databases,
  and rejects any existing users instead of replacing their accounts.
- Seed relationships use exact test emails rather than a potentially nonunique role.
- Declared bcrypt, cors and jsonwebtoken in the backend package, so it does not
  depend on an accidental installation in the repository root.
- Added backend start, lint, unit and PostgreSQL login integration commands.
- Accepted DATABASE_URL for CI while preserving existing DB_* configuration.
- Strengthened the frontend CI contract to require its test command.
- Added the local-only sample seed step before the CI PostgreSQL login tests.

## Verification performed on the combined working tree

Node 24.19.0 on Windows:

- Frontend: 39 tests in 9 files passed; lint and production build passed.
- Backend: 13 Node test results passed (includes the parent login suite), lint passed.
  These use a database stub and validate seed hash contents; they are not real DB evidence.
- DevOps helper tests: 32 passed. These are not application tests.
- Backend and frontend npm audits: zero reported vulnerabilities at this check.
  The separate repository-root dependency manifest is not covered by these audits.
- git diff --check passed.

Frontend axe tests still report the jsdom canvas limitation: this does not establish
colour-contrast compliance. An initial frontend install hit a Windows file-access
error; retry completed and the above checks used Node 24 explicitly.

## Local PostgreSQL progress

The user applied the corrected seed to localhost:5432 database
`civicconnect_local_review`: their terminal screenshot confirms COMMIT after
inserting 4 accounts, 3 requests, 1 history record and 2 comments. Their subsequent
terminal screenshot confirms the real PostgreSQL login suite passed: 7 checks plus
the parent test (8 reported results), zero failed or skipped. This is user-run
evidence, not a test executed by the assistant. No password was shared or saved.
An attempt to initialize a separate temporary PostgreSQL cluster stalled
in this execution environment and was cancelled before startup or test execution.

For a fresh local test database only, run psql with `-X`, `-W`, `-v ON_ERROR_STOP=1`, database
`civicconnect_local_review`, and `-f source/backend/migrations/seed.sql` from this
checkout. Do not reapply the initial schema to the existing database. If the seed
reports that users already exist, stop and inspect; do not delete/reset them.

The public fixture password is `password123`; fixture emails are
requester@example.com, staff@example.com, management@example.com, admin@example.com.
These are disposable local test accounts, not production credentials. Never use
this seed on a publicly accessible deployment, even if its database has a test name.

After seeding, run `npm run test:integration` from source/backend with a local
DATABASE_URL and a disposable JWT_SECRET supplied privately to the process.
The suite fails rather than skipping when configuration or sample users are absent.
It performs real HTTP sign-in against PostgreSQL for all four roles, health, wrong
password and unknown-user cases. It does not exercise the browser or request lifecycle.

## Outstanding release blockers

- Real PostgreSQL My Requests isolation suite awaits the user's terminal run;
  login integration has passed as documented above.
- Backend API journey test:e2e and browser test:e2e suites/commands remain absent.
  The existing CI contract and quality gate intentionally continue to fail.
- My Requests list alignment is implemented locally (details below), pending real DB verification.
- Frontend needs GET /api/categories, /api/staff/assignees, /api/management/summary,
  admin GET/PATCH endpoints and POST /api/requests/:id/actions; current backend
  routes do not provide these interfaces. Do not hide these failures in the UI.
- Request detail lookup lacks ownership enforcement and returns internal entries.
  Backend input validation and safe response fields also require review (e.g. admin
  create-user currently returns password_hash). No security-completeness claim.
- Reconcile response fields and workflow/status semantics with both application owners.
- Confirm teammate's matching root package.json/lockfile and fresh audit after the
  earlier forced dependency changes. Do not overwrite her uncommitted test work.
- No fresh GitHub CI run, Render deployment, full browser journey, performance or
  rollback evidence exists for this combined branch.

## My Requests follow-up

- Added GET /api/requests/mine before the /:id route; retained the legacy GET
  /api/requests response unchanged for compatibility.
- The new list is requester-only and filters by the verified token's user ID,
  never an owner ID supplied in the URL. It returns only id, reference, category,
  status, createdAt and updatedAt, with deterministic newest-first ordering.
- updatedAt uses the latest submission, status-history or public-entry timestamp.
  Internal comment timestamps/content are excluded. This does not claim to track
  changes that the current backend does not record in those tables.
- Database errors return a generic JSON message compatible with the frontend retry state.
- Backend lint and all 21 Node unit/contract results passed after the change.
  All 6 frontend MyRequestsPage component tests also passed (the existing jsdom
  canvas/contrast limitation remains).
  An initial HTTP test attempt was blocked by environment network permissions;
  rerun after granting localhost access passed. Database-stub tests do not prove SQL isolation.
- Added a real PostgreSQL test with three temporary requester accounts and three
  requests. App queries use the same real transaction as the fixtures; no SQL is
  mocked. The test checks ordering, exact response fields, cross-requester isolation,
  ignored query-string identity, empty lists, visible update dates and fallback dates.
  Cleanup rolls the transaction back and verifies the temporary accounts are gone.
- The local Test-LocalLogin.ps1 helper accepts -IncludeMyRequests to run this new
  suite alongside the previously passing login checks. No sample seed rerun is needed.
- Request detail authorization, other API gaps and complete browser journeys are
  still outstanding. Do not treat the list fix as a release/security approval.

## AI use

Codex assisted with local branch integration, the narrow startup/seed/dependency
fixes, regression tests and this evidence note. Human/team review and the remaining
database/browser checks are required before approval or deployment.
