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

Security note: the server must enforce ownership and strip internal timeline entries for requesters. The UI hides them as well, but UI checks are not access control.

## Commands

`npm run dev` (proxies `/api` to `http://127.0.0.1:3000`), `npm test`, `npm run lint`, `npm run build`, `npm run preview`.
