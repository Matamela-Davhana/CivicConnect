# Login contract alignment for PR #21

Prepared on `role1/backend-login-alignment`, based on backend commit
`4fb7e983265f517a398f9faaf6dcbae31a1d605f`. Compared with frontend PR #20
commit `16a091f8f4b336d73e377950da54eb80728f26df`.

## Changes

- Mount the existing auth, requests and staff routers under `/api`, matching
  the frontend client. The login path is now `POST /api/auth/login`.
- Return `user.role` alongside `user.id`, `user.name` and `user.email`.
  Retain the existing top-level `role` for compatibility.
- Export the Express app without starting a listener, so tests can open and
  close an isolated loopback server.

The frontend's `VITE_API_BASE_URL` must be the backend origin, without `/api`:
the frontend client appends `/api` itself. No hosted origin is confirmed yet.

## Verification

With Node 24.19.0, from the repository root:

```text
npm ci --ignore-scripts --no-audit --no-fund
node --test source/backend/tests/login-contract.test.cjs
git diff --check
```

The root dependency files are used because that is where PR #21 declares
its authentication dependencies. This does not resolve the CI/package-folder
alignment issue raised in the review.

Result: 9 contract cases passed (Node reports 10 tests including their parent).
Cases cover login for all four frontend roles, response fields, signed token
claims and expiry, rejection of unknown accounts and wrong passwords, the
API prefix, and anonymous rejection on the requests/staff routes.

Express, HTTP, bcrypt and JWT are real; database queries are stubbed with
disposable fixtures. No real credentials or database are used. These are not
PostgreSQL integration tests or browser end-to-end tests. Dependency audit
was not performed for this patch.

## Remaining work (not changed by this patch)

- Server startup/PORT configuration and `/api/health`.
- Mounting the admin and management routers.
- Backend package scripts, dependency layout and full CI integration.
- Database schema/setup, test accounts and connected login verification.
- Full endpoint/response alignment and authorization review. Aligning prefixes
  does not establish that request handling or permissions are correct.

The database configuration and existing frontend checkout were not modified.
Review this small patch with the backend owner before integrating it into the
backend branch; it is not a release-readiness approval.

## AI assistance

Codex prepared the route/response changes and contract tests, inspected the
frontend consumer, and executed the isolated checks described above. Human
review and real-database testing remain required.
