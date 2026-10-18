# CivicConnect frontend (Role 3)

Prepared: 17 October 2026. Scope: the web UI in `source/frontend`. Backend behaviour, CI and deployment belong to Roles 1 and 2.

## Core journeys frozen for M3

These seven pages were agreed in the team chat on 17 October 2026.

| Page | Route | Who | Job |
| --- | --- | --- | --- |
| Login | `/login` | Everyone | Sign in and go to the role's home page |
| My Requests | `/requests` | Requester | List own requests with reference number and status |
| Submit a Request | `/requests/new` | Requester | Choose a category, describe the problem, explain "Other" |
| Request Details and Timeline | `/requests/:id` | Requester, Staff | Details and history. Requesters see public updates only. Staff also see internal comments and the actions panel |
| Staff Dashboard | `/staff` | Staff | Filter the queue, then open a request to accept or reject, assign, set a target date and post progress |
| Management Dashboard | `/management` | Management | Open, overdue and completed totals plus breakdowns, with no requester details or internal comments |
| Admin Management | `/admin` | Administrator | Manage users, roles and request categories |

Role home pages: requester `/requests`, staff `/staff`, management `/management`, admin `/admin`.
Anything else shows a "no access" page (wrong role), the sign-in page (signed out) or "Page not found".

## States on every page that fetches data

`DataState` renders one of these for every query, so no page can forget one.

| State | When | What the person sees |
| --- | --- | --- |
| Loading | Request in flight | Status message with a spinner |
| Empty | Success with no rows | Explanation and a next step |
| Error | Network failure or 5xx | Alert with the message and a "Try again" button |
| Unauthorised | HTTP 401 or 403 | 401: "Sign in again" button. 403: "You do not have access" |
| Not found | HTTP 404 | "We could not find that" with a way home |

## Accessibility approach (WCAG 2.2 AA target)

- Skip link is the first tab stop. Landmarks: banner, navigation "Main", main, contentinfo.
- One `h1` per page. Focus moves to `<main>` after in-app navigation and the document title changes per page.
- Forms use real labels, hints, `aria-invalid`, `aria-describedby`, an error summary that takes focus, and `noValidate` with our own messages.
- Status never relies on colour alone (badges carry text). Visible focus ring, 44px touch targets, reduced-motion and forced-colours support.
- Every page has a `vitest-axe` test.

## API contract the UI expects (confirm with the backend owner)

All paths are under `/api`. Send `Authorization: Bearer <token>`. Errors: `{ "message": string, "errors"?: { [fieldId]: string } }`.

| Call | Response |
| --- | --- |
| `POST /auth/login` `{email,password}` | `{ token, user: { id, name, role } }` |
| `GET /categories` | `[{ id, name, isOther? }]` (active only) |
| `GET /requests/mine` | `[{ id, reference, category, status, createdAt, updatedAt }]` |
| `POST /requests` `{categoryId, description, otherExplanation?}` | `{ id, reference }` |
| `GET /requests/:id` | `{ id, reference, category, status, description, otherExplanation?, createdAt, targetDate?, requester?, assignee?, rowVersion?, timeline: [{ id, visibility: 'public'｜'internal', author, message, createdAt }] }`; requester/assignee/rowVersion are staff-only |
| `POST /requests/:id/actions` | Every payload requires `rowVersion`. Actions: `{action:'accept',targetDate}`, `{action:'reject',reason}`, `{action:'assign',assigneeId}`, `{action:'set_target',targetDate}`, `{action:'update',message,visibility,status?}`. Response `{id,status,rowVersion}` |
| `GET /staff/requests?status&category&q` | Queue rows with `requester`, `assignee`, `targetDate` |
| `GET /staff/assignees` | `[{ id, name }]` |
| `GET /management/summary` | `{ open, overdue, completed, byStatus:[{status,count}], byCategory:[{category,count}] }` |
| `GET/POST /admin/users`, `PATCH /admin/users/:id` | `{ id, name, email, role, active }`, patch `{role?, active?}` |
| `GET/POST /admin/categories`, `PATCH /admin/categories/:id` | `{ id, name, active }`, patch `{active?}` |

Statuses (local integration alignment, user approved 18 October): `submitted`, `accepted`,
`assigned`, `in_progress`, `on_hold`, `resolved`, `closed`, `rejected`.
Roles: `requester`, `staff`, `management`, `admin`.

The local integration branch follows the existing database lifecycle rather than the
original UI-only `completed` value. This is not a claim that remote PRs are updated.
Accept requires a real date in YYYY-MM-DD format; reject requires a public reason.
Assignment accepts only an existing staff user. Request comments/reasons are trimmed
and limited to 1–1000 characters. Active accepted requests require a target date;
progress beyond acceptance also requires a staff assignee. Calendar dates may be past
or future; no unagreed deadline policy is imposed. Overdue remains based on the browser's
local end of day and excludes resolved/closed/rejected requests.

Normal path: submitted -> accepted -> assigned -> in_progress -> resolved -> closed.
Staff may reject submitted requests, and move in_progress -> on_hold -> in_progress.
No reopen or direct skip-to-closed action is provided. Reassignment and target-date changes
are allowed on accepted/assigned/in_progress/on_hold requests; reassignment does not reset
work already in progress. Resolved requests can receive comments and a closing update.
Closed/rejected requests are read-only. Status changes are always public even when the
accompanying comment is internal. Assignment audit comments are internal; date changes
and rejection reasons are public.

Every save compares and increments rowVersion and commits request/history/comment changes
together. Stale versions return 409: refresh and review before retrying, never auto-replay
the action against a newer version. Failed saves keep the draft comment. The obsolete
PUT /staff/requests/:id/status route returns 410 instead of bypassing these rules.
Queue `q` is a literal case-insensitive reference substring (not a wildcard pattern),
and category is a UUID. Queue/assignee data includes only fields needed by the staff UI.

### Management summary (local integration, 18 October)

GET /management/summary is management-only. It returns numeric counts and aggregate
status/category labels; no request IDs/references, people, descriptions or comments.
Open includes submitted/accepted/assigned/in_progress/on_hold. Completed includes
resolved/closed, not rejected. Overdue is a subset of open with a non-null target date
strictly before today's date in Africa/Johannesburg, independent of the database session
timezone. Requests due today are not overdue. The screen explains these definitions.
All requests, including rejected ones and requests in now-inactive categories, contribute
to the breakdowns and percentage denominators. Only groups with requests appear, in
lifecycle order for statuses and alphabetical category order. An empty dataset returns
zero totals and empty arrays. A single SQL statement supplies all figures from one
snapshot; refreshing the page requests current figures. No live polling is implied.
The legacy /management/overview keeps its aggregate-only response for compatibility.

### Admin accounts and categories (local integration, 18 October)

Apply the additive 002_account_state.sql migration before starting this version or running
integration tests. It adds users.active (default true) and token_version (default zero),
plus case-insensitive trimmed email/category-name uniqueness indexes. Existing duplicate
values cause migration failure/rollback; inspect them with the owner, never silently merge
or delete data. For a fresh disposable database apply 001, then 002, then the guarded seed.
For the existing local review database apply ONLY 002, with ON_ERROR_STOP and a single
transaction; do not rerun 001 or seed. CI setup now applies both numbered migrations.

GET /admin/users returns only id/name/email/role/active. POST accepts name (1–150 trimmed
characters), email (valid shape, max 255, trimmed/lowercased), role and an initial password
(at least 12 characters, at most 72 UTF-8 bytes; no password trimming). The user explicitly
selected an initial-password field for LOCAL TESTING. It is masked, never stored in frontend
session storage, and cleared after success. Passwords are cost-12 bcrypt hashes and neither
passwords nor hashes/session versions appear in admin API responses. New accounts are active.
No invitations, delivery mechanism, password reset or forced first-login password change exists;
do not treat this local account-provisioning flow as deployment-ready.

PATCH /admin/users/:id accepts role and/or boolean active only. Self changes are denied
server-side as well as disabled in the UI. Admin writes are serialized with a transaction
advisory lock; the acting admin's current role, active state and session version are rechecked
inside that transaction, and at least one active admin must remain. Real changes increment
token_version; a no-op does not. Login rejects inactive users. Authorized requests check the
current account state: role changes/deactivation invalidate prior tokens, and reactivation
does not make those old tokens valid again. Existing old-format tokens require a fresh login.
Requests already authorized and in flight are not retroactively cancelled. Cached browser
content is not remotely erased. Disabled/non-staff accounts are absent from the assignee list
and cannot be newly assigned, while existing assignment/history relationships are preserved.

GET /admin/categories includes inactive categories, with only id/name/active. POST accepts
a trimmed 1–50 character name. PATCH accepts boolean active only; no deletion/rename path.
Inactive categories disappear from submission choices and are rejected by submission validation,
but their existing requests and management totals remain. Both users and categories reject
case-insensitive duplicates with 409; invalid forms use 422, missing targets 404, and unexpected
errors return safe retry messages. Account/category administrative changes do not yet have a
dedicated admin audit-history screen or audit table; request status/comment audits are unchanged.

Security note: the server must enforce ownership and strip internal timeline entries for requesters. The UI hides them as well, but UI checks are not access control.

## Commands

`npm run dev` (proxies `/api` to `http://127.0.0.1:3000`), `npm test`, `npm run lint`, `npm run build`, `npm run preview`.
