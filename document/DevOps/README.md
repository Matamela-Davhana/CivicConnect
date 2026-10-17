# CivicConnect restart: DevOps foundation

Owner: mqadi11 — Role 1 (DevOps). Prepared: 17 October 2026.

## What this contribution does

This is the first CI foundation for the restarted web application, not a finished deployment. It uses the existing React/Vite frontend and Node.js/Express/PostgreSQL layout. Hosted Supabase compatibility still needs application-level verification.

The branch starts from `main` at `006cea10ba2a29f6c889346de65a0d710ac1b36b`. Previous branches, PRs and milestone documents are preserved. Previous implementation/test results are not evidence for this restarted application. Restarting implementation does not, by itself, approve changes to the M2 requirements or scope.

The active workflow is `.github/workflows/restart-ci.yml`. The pre-existing `github/workflows/` directory is not GitHub Actions' active workflow location and is left untouched.

## Checks and blocking behaviour

| Check | What it establishes | What it does not establish |
| --- | --- | --- |
| DevOps helper self-tests | Contract checks, readiness probes and fail-closed gate logic work in the tested cases | Application rules or journeys work |
| Frontend lint and build | The frontend can be checked and compiled from its lockfile | The starter screen is a complete application |
| Backend suite | Unit tests, real database/API integration tests and HTTP journeys pass | Browser interaction or hosted Supabase settings work |
| Browser end-to-end | The built UI, API and disposable database work together for the supplied journeys | Every requirement, device or production workload is covered |
| Dependency audits | No known high/critical runtime or development advisory blocks the audit at that time | The application is free from vulnerabilities |
| Secret scan | No configured Gitleaks rule detects a secret in the scanned changes/history | No possible secret exists anywhere |
| Restart quality gate | Every required job succeeds | Deployment approval or release sign-off |

The gate rejects failed, missing, cancelled and skipped required jobs. Missing application scripts/tests fail explicitly; they are not bypassed. Test filenames and scripts are only a structural contract: reviewers must check the assertions, requirement coverage and test results.

The workflow runs for PRs targeting `main`, pushes to `main` or `role1/devops-foundation`, and manual dispatch once available. Duplicate runs for the same branch/PR are cancelled. It uses Node 24.19.0, `npm ci`, pinned action commits and read-only repository permissions. PostgreSQL 17 services are disposable and isolated per job; patch-level runner/database images can change, so record the actual environment for release evidence.

High/critical dependency findings block. Lower-severity findings still need triage in the team's register. Do not add `continue-on-error`, `--passWithNoTests`, `--if-present` or success placeholders to make the checks green.

## Interface for the backend member

Keep `source/backend/package.json` and its committed lockfile consistent. Provide the following real commands; the test framework is your choice:

| npm script | Required behaviour |
| --- | --- |
| `start` | Start the Express API using `HOST` and `PORT` |
| `lint` | Check the backend and fail on errors |
| `test:unit` | Execute business-rule/status-model tests under `tests/unit/` |
| `test:integration` | Execute database/API tests under `tests/integration/` or `tests/api/` |
| `test:e2e` | Execute HTTP journeys under `tests/e2e/` against the already-running `BASE_URL` |

Name test files `*.test.js`, `*.spec.ts` or equivalent supported JS/TS extensions. Suites must fail if required tests are absent or fail; a successful empty run is not acceptable.

CI supplies `NODE_ENV=test`, `HOST=127.0.0.1`, `PORT=3000`, `DATABASE_URL`, `DATABASE_SSL=false`, `JWT_SECRET` and `BASE_URL=http://127.0.0.1:3000`. These are the proposed integration contract, not a claim that the missing backend already implements them.

Provide `GET /api/health` returning HTTP 200 with JSON containing `{"status":"ok"}` when ready; do not report ready if required database access is unavailable. Testable Express app creation should be separate from starting the listening server.

The pipeline applies the existing `migrations/001_initial_schema.sql` to a fresh `civicconnect_test` database with stop-on-error enabled. If the schema/migration approach changes, update the pipeline with DevOps in the same reviewed change. This script is not a production migration or rollback procedure.

Tests must create synthetic users/requests and clean up their own fixtures. Agree on a fixture strategy with the frontend member so browser tests do not depend on a developer's local data or tests from another job. Never point these test suites at a live database. The CI database uses a disposable superuser; it does not prove production least-privilege grants or Supabase RLS.

## Interface for the frontend member

Preserve `lint`, `build` and `preview`. Add a genuine browser suite under `source/frontend/tests/e2e/` or `source/frontend/e2e/`, plus:

- `test:e2e:install`: install the chosen browser-test runtime. For Playwright, an example is `playwright install --with-deps chromium`.
- `test:e2e`: run the browser journeys against the already-started preview server; for Playwright, use `playwright test` with its base URL taken from `E2E_BASE_URL`.

CI supplies `E2E_BASE_URL=http://127.0.0.1:4173` and the public build-time API address `VITE_API_BASE_URL=http://127.0.0.1:3000`. Configure the UI to use that address and coordinate CORS or a proxy with the backend member. Never put database passwords, signing secrets or Supabase service-role keys into a `VITE_` variable: frontend configuration is public.

The browser job installs dependencies, builds the UI, applies migrations to its own fresh database, starts the API and preview server, checks readiness and runs the suite. Coordinate at least two critical user journeys and the necessary synthetic fixtures with DevOps. A health check or HTTP-only test is not a browser journey.

The previously discussed seven-page list is a proposal, not an approved scope baseline. Agree on pages, roles, request states and API response shapes before writing journey assertions.

## GitHub review and evidence

1. Push this branch and open a draft PR while the backend/browser contracts are still unimplemented. Request review from both non-authors.
2. Preserve existing branch protections. After coordinating the integrated pipeline with the repository owner, make `Restart quality gate` a required status check on `main`, and retain the two-approval rule. A workflow file alone cannot enforce branch protection. Current settings have not been independently verified in this contribution.
3. Integrate the missing implementation and real tests through reviewed changes. Do not merge a failing candidate or disable required checks to get past a dependency between PRs; coordinate a shared integration branch/PR if needed.
4. Save the actual Actions run URL, tested checkout SHA, PR head SHA, test reports and meaningful reviewer comments. The run summary distinguishes a PR's temporary merge SHA from the author's head commit.
5. Before the milestone recording, demonstrate an intentionally failing real application test on a separate evidence branch/PR, capture the failed required check and blocked merge, then restore/fix the test through review. Local gate self-tests are not proof of GitHub's branch-protection enforcement.

Reports/logs are uploaded from explicit paths for 14 days. Preserve the selected, reviewed milestone evidence before it expires. Browser data must be synthetic, and logs/reports must not expose credentials or tokens. Secret-scan artifact upload is disabled; investigate any finding without copying the secret into a PR or document.

## Still to do for Role 1

- Run the full Linux/Actions pipeline against the real backend and browser suites; map tests/evidence to the existing RTM and required milestone coverage.
- Agree on staging hosting and isolated test data. No account, paid resource, production environment or hosted deployment has been created here.
- Add deployment only after the integrated candidate passes: identify the exact revision, use protected environment secrets and verify the deployed release identity.
- Rehearse and record rollback to a known-good revision, including database compatibility. Reverting application code does not automatically undo a migration.
- Record a bounded performance test, environment differences, residual risks and the READY / CONDITIONALLY READY / NOT READY decision. No readiness approval is claimed now.
- Decide whether a Dockerfile materially helps the chosen hosting setup. No Kubernetes cluster or container deployment is required by this foundation.

## Local verification and AI disclosure

See [verification.md](verification.md) for checks actually executed, limitations and the dependency finding. Review and incorporate the AI-use entry there into the team's shared register; it is not human sign-off.

Implementation references: [GitHub Node.js CI](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs), [PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers), [Playwright CI](https://playwright.dev/docs/ci-intro), [Gitleaks action](https://github.com/gitleaks/gitleaks-action).
