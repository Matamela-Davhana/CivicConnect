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

- The user-run PostgreSQL login and My Requests suites both passed (14 reported
  results including parent tests, zero failures/skips), as shown in the subsequent
  terminal screenshot. Full browser verification remains outstanding.
- Backend API journey test:e2e and browser test:e2e suites/commands remain absent.
  The existing CI contract and quality gate intentionally continue to fail.
- My Requests passed user-run PostgreSQL and browser checks (details below).
- Frontend still needs admin GET/PATCH endpoints. Staff interfaces passed the user-run
  database/browser checks below. Management summary is now implemented locally, with
  its real database/browser checks still pending.
- Request details passed user-run PostgreSQL and owner browser checks (below).
  Submission subsequently passed user-run real DB and browser checks (below).
  Other backend input validation and safe response fields still require review (e.g. admin
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
- User supplied a successful run of that combined command: all login checks and
  five My Requests checks passed, including rollback cleanup. This is user-run
  PostgreSQL evidence, distinct from assistant-run stub tests.
- Prepared local Start-BrowserReview.ps1/browser-review.cjs helpers (outside the
  repository) to start this checkout's loopback API and Vite UI. Credentials pass
  privately through stdin, are not written to a file, and are excluded from the
  frontend child process. Helpers passed syntax checks; actual browser startup
  and requester login/list display still await the user.
- Request detail authorization, other API gaps and complete browser journeys are
  not established by the list-only verification above. Do not treat that list fix
  as a release/security approval; later detail changes are recorded below.

## Request details follow-up

The user confirmed requester sign-in and the three seeded My Requests rows work
in the browser against the local database. This is user-reported browser evidence,
not an automated browser suite or proof of other journeys.

- GET /api/requests/:id now implements the frontend summary and unified timeline
  contract, with explicit output fields rather than SELECT * responses.
- Access matches App.jsx and the frontend handoff: requester owners and staff only.
  Management/admin/unknown roles receive 403; anonymous requests receive 401.
- Ownership is enforced in the request SQL. Another owner's ID and a nonexistent
  ID both receive the same 404, and no timeline query is made for an invisible request.
  Malformed UUIDs also return 404 before reaching PostgreSQL.
- Requesters receive only public entries, filtered in SQL. Staff also receive
  internal entries and minimal requester/assignee IDs/names; no email or password
  fields are exposed. Status history and comment entries are merged chronologically
  with distinct prefixed IDs, author names, readable messages and ISO timestamps.
- Target dates are returned as date-only strings to avoid timezone conversion.
  Database errors return safe JSON for the existing frontend error/retry state.
- Verified locally: backend lint; 33 Node unit/contract test results; 12 frontend
  MyRequestsPage/RequestDetailPage tests; PowerShell helper syntax; git diff --check.
  Unit HTTP checks use a database stub. The jsdom canvas limitation still applies.
- Expanded the rollback-only PostgreSQL suite with real owner, other-requester,
  staff, management and admin logins. It verifies detail field mapping, timeline
  order/privacy, staff-only identities, identical 404s, role restrictions, query
  parameter bypass attempts and empty timelines. Six temporary users are rolled
  back along with their requests/history/comments. The user subsequently supplied
  a passing PostgreSQL run: 22 reported results including parents, zero failures/skips.
- User's subsequent browser screenshot of REQ-001 confirms description/category,
  public acknowledgement and initial history render, without internal comments
  or staff actions. Equal seed timestamps put the acknowledgement first; the
  submission follow-up below implements an explicit tie-breaker.
- At this checkpoint submission and staff actions were unfinished. No remote branch was
  pushed, no PR was approved and no deployment was performed by this follow-up.

## Request submission follow-up

- GET /api/categories returns active categories, IDs/names and isOther, sorted
  by name/ID for authenticated recognized roles. Anonymous access is rejected.
- POST /api/requests accepts the agreed camelCase fields: categoryId, description,
  otherExplanation. The old snake_case submission fields are no longer the
  interface; team clients/tests must use the agreed frontend contract.
- Only requesters can submit. The backend takes owner from the signed token,
  forces submitted status and generates a 19-character cryptographic reference.
  A database uniqueness collision retries at most three transaction attempts.
- Server validation rejects invalid UUID/type, descriptions outside 10–1000 trimmed
  characters, unavailable/inactive categories and missing Other explanations.
  Explanation length is capped at 1000 characters on both UI and server; ordinary
  categories discard an unnecessary explanation. Field errors use the form's
  category/description/otherExplanation IDs with status 422.
- A dedicated database connection saves the request and initial status history
  atomically. The category is locked FOR SHARE during validation/save, preventing
  a concurrent category disable. Errors roll back; every connection is released.
- Success returns status 201 and only id/reference, which the existing frontend
  uses to navigate to the saved detail page. Malformed JSON and oversized payloads
  receive generic JSON errors; unexpected exceptions do not expose stack traces.
- Timeline ties sort initial history, then other status changes, then comments,
  retaining chronological ordering and a deterministic ID tie-breaker. No timeline
  ordering metadata is exposed in the API response.
- Verified: backend lint and 62 Node unit/contract results; frontend lint, all 42
  tests in 9 files and production build. Existing jsdom canvas limitation remains.
- New PostgreSQL suite covers active categories, real inserts/history, detail/list
  reads, cross-owner denial, invalid/disabled categories, boundary input failures,
  Other, injected history-SQL failure rollback, real unique-reference retry and
  equal-timestamp timeline ordering. The user's subsequent screenshot confirms all
  36 combined login/list/detail/submission results passed, zero failures/skips.
- That suite uses an outer rollback-only fixture transaction and maps application
  transaction boundaries to savepoints in a test-only connection adapter. Business
  SQL runs against PostgreSQL, but durable commit persistence is not proved by this
  adapter. The user then created CC-297171E0CA299772 (Other / Public lighting) in
  the browser, supplied its detail screenshot, and confirmed both refresh and the
  My Requests entry work. That is user-reported durable browser evidence, not an
  automated full-browser suite. The test record was intentionally retained locally.
- Remaining release gaps include staff/admin/management workflows, browser automation,
  full CI integration, review, deployment and operational evidence. No push or approval.

## Staff workflow follow-up

- User explicitly chose the existing database lifecycle and target date on acceptance
  rather than the frontend's incompatible completed state. UI labels and choices now
  match submitted/accepted/assigned/in_progress/on_hold/resolved/closed/rejected.
  The local action policy and API payloads are documented in document/Frontend/README.md;
  team review is still required before freezing/merging this integration contract.
- Staff queue uses frontend filter/response names, minimal requester/assignee identities,
  deterministic newest-first order and literal case-insensitive reference search. Filters
  are validated and parameterized. Assignee lookup returns staff IDs/names only.
- Staff-only POST /api/requests/:id/actions handles acceptance/rejection, assignment,
  target dates and public/internal updates. Date shape/calendar validity, text lengths,
  staff membership, lifecycle transitions and required fields are checked server-side.
- All request changes and audit entries share a transaction. Every action compares and
  advances row_version; stale reads or a lost compare-and-swap receive 409. Detail returns
  rowVersion only to staff. Assignment/date changes also append attributable entries.
  The old non-atomic status endpoint returns 410, not an unprotected alternate write path.
- UI requires acceptance date, offers only the allowed next states, keeps failed drafts,
  offers explicit refresh after errors and disables repeat saves until new detail data
  arrives. Internal comment selection does not hide the accompanying public status history.
- Assistant-run checks: backend lint and 102 unit/contract results passed; frontend lint,
  56 tests in 10 files and production build passed. Existing jsdom canvas/colour-contrast
  limitation remains. Database-stub tests are not proof of real PostgreSQL transactions.
- Added rollback-only PostgreSQL suite for queue/filter/minimal fields, roles, invalid
  acceptance dates, injected history/entry SQL failures, acceptance, stale versions,
  staff-only assignment, date audits, comment privacy, all lifecycle stages, rejection,
  terminal-state restrictions and the retired write route. The user's subsequent terminal
  screenshot shows all 53 combined PostgreSQL results passed, zero failures/skips.
  The savepoint adapter does not prove durable commits or simultaneous multi-connection races.
- The user then supplied staff browser screenshots and confirmations: acceptance and date,
  assignment, public progress, staff-only comment hidden from requester, resolution, closure,
  queue/status/reference filters, rejected request/reason visible to its owner, target-date
  change, hold/resume and stale-tab conflict with retained draft/refresh/retry all worked.
  These are user-reported manual checks, not assistant-observed browser automation or
  a claim of comprehensive simultaneous-load testing. Local test requests were retained.
- Test-LocalLogin.ps1 accepts -IncludeStaff alongside the prior flags. No migrations or
  seeds need to be reapplied for these checks.
- No push, PR approval, deployment or green CI claim. Management/admin, full browser/API
  journey automation, root dependency reconciliation and operational evidence remain open.

## Management summary follow-up

- Added management-only GET /api/management/summary matching the existing UI. Preserved
  the legacy overview response and added safe retry errors to both routes. Other roles
  and unauthenticated callers are denied before SQL; query-string roles/IDs/include flags
  do not expand or filter the response.
- Aggregation happens in PostgreSQL and selects no requester, assignee, reference,
  description, explanation, history or comment content. One SQL statement returns a
  consistent snapshot of numeric open/overdue/completed totals and status/category counts.
- Open excludes resolved/closed/rejected; completed means resolved plus closed. Rejected
  requests remain in breakdowns. Overdue is open with target date strictly before today
  in Africa/Johannesburg; due today, null dates and terminal states are excluded. Disabled
  categories still contribute their historical requests. UI now explains these definitions.
- Updated component tests to real lifecycle labels and added rejected-only and retry checks.
  Assistant-run verification: backend lint and 112 unit/contract results passed; frontend
  lint, 58 tests in 10 files and build passed. Existing jsdom canvas/contrast limitation
  remains. Unit database stubs do not establish correctness of SQL aggregate calculations.
- Added a PostgreSQL suite using connection-local temporary tables cloned from production
  column definitions, allowing empty/all-status/date-boundary/privacy/refresh/rejected-only
  cases without modifying existing application data. Database session timezone is deliberately
  different from the reporting timezone. Fixture writes explicitly target pg_temp, and
  rollback cleanup checks the temporary request table is gone. Test JWTs exercise real
  authentication middleware; this suite is not a login or production constraint test.
- Management PostgreSQL suite and live browser review are NOT yet run. The secure helper
  accepts -IncludeManagement; run it with the earlier suite flags, then restart the review
  server and sign in as management@example.com. No seed or migration rerun is needed.
- No remote push, deployment or full CI claim. Admin, browser/API journey automation,
  root dependency reconciliation and operational evidence remain outstanding.

## AI use

Codex assisted with local branch integration, the narrow startup/seed/dependency
fixes, regression tests and this evidence note. Human/team review and the remaining
database/browser checks are required before approval or deployment.
