# CivicConnect – Milestone 3 – Role 3 (Frontend) Evidence Pack

**Scope:** Frontend Developer / UI-UX Designer (Role 3) only. Code: `source/frontend`.
**Branch:** [`feature/frontend-ui`](https://github.com/Matamela-Davhana/CivicConnect/tree/feature/frontend-ui), latest commit [`0fdf3d1`](https://github.com/Matamela-Davhana/CivicConnect/commit/0fdf3d1) (17 Oct 2026).
**Last full run:** `npm test` 9 files, **39 passed / 0 failed**; `npm run lint` clean; `npm run build` succeeds (17 Oct 2026, 21:33).
**Pull request:** `[[PR link – add after opening the PR]]`

> Placeholders left in `[[double brackets]]` are things that do not exist yet or that only the code or the team can answer. Replace them before the PED PDF is produced. This file is the repo evidence; PED v3.0 should link to it, not copy it.

## 0. Check before you rely on the requirement IDs

PED v2.0 uses **two different numberings** for the same FR IDs:

| ID | Section 8 (RTM table) | Sections 10, 14 and the decision log |
|----|-----------------------|--------------------------------------|
| FR-002 | Enforce roles | Requester creates a request |
| FR-011 | Submit request | Staff update status |
| FR-015 | Update assignment/status | Management summary |

This pack follows **sections 10 and 14 and DEC-003/004**, because they agree with each other and with the ERD. **Before submission, compare against the M1 RTM** and have the team correct whichever section is wrong. An assessor can trace an ID back to M1, and a defender cannot explain a requirement that has two meanings. FR-001 (authenticate users) appears only in section 8, so confirm it too.

---

## 1. Scope frozen for M3 (agreed by the team, 17 Oct 2026)

| # | Page | Purpose | Roles |
|---|------|---------|-------|
| 1 | Login | Sign in and go to the correct dashboard | all |
| 2 | My Requests | Own requests, reference numbers, statuses | requester |
| 3 | Submit a Request | Category, description, explanation when "Other" | requester |
| 4 | Request Details and Timeline | Details, status history, updates; internal comments and actions for staff only | requester, staff |
| 5 | Staff Dashboard | Queue, filter, accept/reject, assign, target dates, progress | staff |
| 6 | Management Dashboard | Open/overdue/completed summaries; no requester details or internal comments | management |
| 7 | Admin Management | Users, roles, request categories | admin |

Every page that fetches data has loading, empty, error (with retry) and unauthorised (401/403) states. Layout: skip link; `header`, `nav`, `main`, `footer` landmarks; per-page titles.

---

## 2. Test evidence records

Common to all records: **Level** component/page test (Vitest + React Testing Library, API layer mocked) unless stated; **Evidence** `npm test` output of 17 Oct 2026 21:33 at `0fdf3d1`, CI run `[[CI run link]]`; **Status** Pass; **Files** `source/frontend/src/pages/*.test.jsx`, `source/frontend/src/test/routing.test.jsx`.

| ID | Test (file > name) | Test basis | Why selected | Technique / category | Input / precondition | Expected result | Actual | Interpretation and limit |
|----|--------------------|-----------|--------------|----------------------|----------------------|-----------------|--------|--------------------------|
| TC-FE-01 | SubmitRequestPage > requires an explanation only when "Other" is chosen | FR-002, RD-03 | A wrong rule admits vague requests or blocks valid ones | Decision table / EP (Other vs non-Other); high priority | Categories loaded; Other with empty explanation, then a normal category | Other without explanation rejected with an error; others submit without one | Pass | Proves the client-side rule. Backend enforcement is not shown. |
| TC-FE-02 | SubmitRequestPage > reports every missing field and moves focus to the summary | FR-002, NFR-005 | Users who cannot perceive errors are blocked | EP (empty / invalid), negative; high priority | Empty form submitted | All missing fields listed; focus moves to the error summary | Pass | Proves behaviour in jsdom. Real screen-reader announcement untested. |
| TC-FE-03 | RequestDetailPage > hides internal comments and staff actions from requesters | FR-012, NFR-001, NFR-002, DEC-003 | Leaking internal comments is a privacy failure | Negative / unauthorised; high priority | Detail data with an internal comment; signed in as requester | Internal comments and staff actions not rendered | Pass | Proves the UI hides them. **Hiding is not access control**; the API must withhold them too (RISK-011). |
| TC-FE-04 | MyRequestsPage states > shows an unauthorised state when the API answers 403 | NFR-001, NFR-002, FR-004, FR-005 | Blocked users must understand why | Negative / unauthorised | Mock API returns 403 | Unauthorised message, no data | Pass | Proves handling of a mocked 403. Real response shape unverified. |
| TC-FE-05 | MyRequestsPage states > asks the person to sign in again when the API answers 401 | FR-001, NFR-001 | Expired session must not look like an outage | Negative / failure | Mock API returns 401 | Sign-in-again message | Pass | Same limit as TC-FE-04. |
| TC-FE-06 | AdminPage > stops administrators changing their own role or status | FR-018, NFR-001 | An admin removing their own access | Business rule, component; high priority | Signed in as admin; own row shown | Own role select and Deactivate disabled | Pass | Proves the UI guard. The backend must reject it too. |
| TC-FE-07 | ManagementDashboardPage > shows operational totals without requester details | FR-015, NFR-002, DEC-003 | Privacy exposure on the management view | Negative / privacy plus accessibility scan; high priority | Summary data loaded | Totals shown; no requester column; no axe violations | Pass (after DEF-FE-01) | Proves what this page renders. Data minimisation must also hold in the API response. |
| TC-FE-08 | LoginPage > sends a requester to My requests after signing in | FR-001, NFR-001 | Wrong landing page breaks the journey | Black-box functional (role-based routing) | Valid requester credentials (mocked) | Navigates to `/requests` | Pass | Requester role only. Staff, management and admin routing is a gap (G-FE-02). |
| TC-FE-09 | LoginPage > shows a plain message for wrong credentials | FR-001 | Unclear errors cause lockouts and support load | Negative | Mock API rejects credentials | Plain-language message, no technical text | Pass | Message handling only; no rate-limit or lockout evidence. |
| TC-FE-10 | StaffDashboardPage > lists the queue and flags overdue requests | FR-010, FR-011 `[[confirm the FR ID for queue view and overdue flag]]` | Staff miss overdue work | Black-box functional; BVA candidate on `target_resolution_date` | Queue with one overdue and one on-time request | Overdue flagged, other not | Pass | Confirm the data includes a date on the boundary. If not, add it before claiming BVA. |
| TC-FE-11 | routing > makes the skip link the first keyboard stop and targets `<main>` | NFR-005, ASR-07 | Keyboard users forced through navigation | Black-box functional (accessibility) | Page rendered; Tab pressed once | Skip link focused first; target is `main` | Pass | Structure in jsdom only. Visible focus styling and real browsers untested. |
| TC-FE-12 | AdminPage > has no accessibility violations | NFR-005 | Regression guard for DEF-FE-01 | Static a11y scan (jest-axe), regression | Users and categories loaded | No axe violations | Pass | Axe in jsdom does not run colour-contrast checks (TD-FE-01). |

**Contribution to the team minimums.** Unit/component and black-box counts are met from this table. Negative/unauthorised (≥3): TC-FE-02, 03, 04, 05, 07, 09. High-priority (≥5): TC-FE-01, 02, 03, 06, 07. Techniques shown: equivalence partitioning (TC-FE-02), decision table (TC-FE-01); BVA only if TC-FE-10 data is confirmed. **Not yet covered by the frontend:** API/integration (≥3) and E2E/system (≥2). These need the real API and a deployed build (section 7).

---

## 3. RTM rows for the frontend (add to the existing RTM; columns follow PED section 8, plus M3 evidence columns)

| Requirement | ASR / component | Architecture decision | Acceptance / verification evidence | Test(s) | Status |
|-------------|-----------------|-----------------------|------------------------------------|---------|--------|
| FR-001 Authenticate users | ASR-01; `LoginPage.jsx`, `RequireRole.jsx`, `AuthProvider.jsx` | ADR-TECH-001, ADR-MOD-001 | Valid sign-in lands on the correct page; wrong credentials give a plain message; 401 asks for sign-in | TC-FE-05, TC-FE-08, TC-FE-09 | Verified against mocked API (requester path); real API pending; other roles G-FE-02 |
| FR-004, FR-005 Requester views own requests | ASR-01/07; `MyRequestsPage.jsx`, `DataState.jsx` | ADR-TECH-001 | Own requests with reference and status; empty, error, 401, 403 states | TC-FE-04 and the MyRequests loading/empty/error tests | Verified against mocked API; real API pending |
| FR-002 Submit request (with RD-03 "Other") | ASR-02/07; `SubmitRequestPage.jsx` | ADR-TECH-001 | Category and description required; explanation required only for Other; confirmation shows reference | TC-FE-01, TC-FE-02, submit test | Verified against mocked API; atomic create is a backend test (ASR-02) |
| FR-009, FR-012, FR-017 Detail, public/internal split, history | ASR-01/03; `RequestDetailPage.jsx`, `StaffActions.jsx` | ADR-MOD-001 | Requester sees public updates only; staff see internal comments and actions; history shown | TC-FE-03, plus RequestDetail tests | UI verified; API-level enforcement `[[backend evidence]]` |
| FR-010, FR-011 Staff manage queue and status | ASR-01/02/03; `StaffDashboardPage.jsx`, `StaffActions.jsx` | ADR-MOD-001 | Queue and overdue shown; accept/reject, assign, target date, progress | TC-FE-10 | **Partial**: queue and overdue verified; action controls untested (G-FE-01) |
| FR-015 Management summary without private data | ASR-01; `ManagementDashboardPage.jsx` | DEC-003 | Open/overdue/completed totals; no requester details or internal comments | TC-FE-07 | UI verified; DEF-FE-01 closed |
| FR-018 Administration | ASR-01; `AdminPage.jsx`, `UsersPanel.jsx`, `CategoriesPanel.jsx` | ADR-MOD-001 | Manage users, roles, categories; admin cannot change own role or status | TC-FE-06, TC-FE-12, save-role and category-validation tests | Verified against mocked API |
| NFR-005, NFR-006 Accessibility and responsiveness | ASR-07; `Layout.jsx`, all pages | ADR-TECH-001 | WCAG 2.2 AA; 360/768/1280 px on latest two Chrome, Edge, Firefox | TC-FE-02, 11, 12 | jsdom checks pass; **browser and viewport record not yet run** (section 6) |
| NFR-003 Performance (frontend part) | ASR-04; Vite build | ADR-TECH-001 | React bundle measured (PED section 9) | Bundle measurements, section 6 | Measured; no formal target, no code splitting |

---

## 4. Defect register (frontend entries)

| ID | Defect | Severity | Found by | Status | Fix | Regression evidence |
|----|--------|----------|----------|--------|-----|---------------------|
| DEF-FE-01 | Scrollable table wrapper (`role="region"`) had the same accessible name as its parent `<section aria-labelledby>` on the Admin and Management pages, so the landmarks could not be told apart (axe `landmark-unique`) | Medium (accessibility, NFR-005) | jest-axe in AdminPage and ManagementDashboardPage tests | Closed | Wrapper labels now end in "table" in `UsersPanel.jsx`, `CategoriesPanel.jsx`, `ManagementDashboardPage.jsx`; commit `0fdf3d1` | Same axe tests retained |
| DEF-FE-02 | First test run: 6 failures from ambiguous queries (duplicate text in visually hidden spans, two `role="status"` regions, a query matching a lead paragraph) | Low (test design, not product behaviour) | `npm test` | Closed | Queries made specific; commit `df6cdd7` | Tests pass in current run |
| DEF-FE-03 | `eslint` error `'process' is not defined` in `vite.config.js` | Low | `npm run lint` | Closed | `df6cdd7` | `npm run lint` clean |

Quality lesson: two of the first-run failures were defects in the tests, not the app, so a green suite is only as strong as its queries.

---

## 5. Technical debt, gaps, risks, AI usage

**Technical Debt Register**

| ID | Debt | Consequence | Next step / owner |
|----|------|-------------|-------------------|
| TD-FE-01 | Colour-contrast checks do not run in jsdom (canvas not implemented) | Contrast failures could be undetected | Lighthouse / axe DevTools in a real browser, fix findings. Frontend owner |
| TD-FE-02 | Canvas `getContext` warning in test output | Noise could hide a real warning | Stub `HTMLCanvasElement.prototype.getContext` in test setup. Frontend owner |
| TD-FE-03 | Frontend tested against a mocked API layer | API shape or status-code mismatch not yet caught | Integration and E2E against the real API. Frontend owner with backend owner |
| TD-FE-04 | Single JS bundle, no code splitting | Slower first load on mobile | Re-measure; split routes if a target is missed. Frontend owner |
| TD-FE-05 | No `.gitattributes`; LF/CRLF warnings on every add | Noisy diffs | Add `* text=auto`. Frontend owner |

**Known gaps:** G-FE-01 staff accept/reject, assign, target date and progress controls have no automated test. G-FE-02 login routing tested for requester only. G-FE-03 nothing yet runs against the real backend; no E2E.

**Risk Register additions** (continue the PED's numbering after RISK-008; confirm the next free IDs with the team)

| ID | Risk | Probability / impact | Mitigation | Owner |
|----|------|----------------------|------------|-------|
| RISK-009 | UI built against an assumed API contract diverges from the real backend | Medium / High | Agree endpoint and status contract with the backend owner; integration tests | Frontend owner |
| RISK-010 | Contrast and other accessibility problems undetectable in jsdom | Medium / Medium | Browser audit, keyboard walkthrough, viewport record | Frontend owner |
| RISK-011 | UI hiding of internal comments or admin controls mistaken for access control | Medium / High | Backend enforces authorisation; negative API tests (ASR-01) | Frontend and backend owners |
| (existing) | "React initial-load performance" row in PED section 9 | – | Bundle measured (section 6); code splitting only if a target is missed | Frontend owner |

**AI Usage Register entries** (PED Appendix A format; the member named must confirm each entry is true for them)

| Date | Member | Tool | Engineering task | AI contribution | Verification | Decision | Issues found |
|------|--------|------|------------------|-----------------|--------------|----------|--------------|
| 17 October 2026 | `[[member name]]` | Claude | Frontend construction: router, layout, 7 pages, data states, tests | Generated the initial frontend structure, pages and tests | Ran `npm test`, `npm run lint`, `npm run build`; reviewed the changes; PR review `[[PR link]]` | Used after human review and controlled peer approval | First run: 6 test failures and 1 lint error; corrected in `df6cdd7` |
| 17 October 2026 | `[[member name]]` | Claude | Accessibility defect diagnosis (axe `landmark-unique`) | Explained the cause and proposed unique wrapper labels | Re-ran the suite (39/39), reviewed the 3 changed files | Accepted after verification | Initial advice guessed one file's label text; corrected from the real source |

---

## 6. Frontend performance, browser and viewport evidence (PED ASR-04 and ASR-07)

**Bundle measurement (NFR-003, PED section 9 "React initial-load performance")**

| Build | JS (raw / gzip) | CSS (raw / gzip) |
|-------|-----------------|------------------|
| After first commit `20ce120` | 299.51 kB / 92.06 kB | 8.71 kB / 2.65 kB |
| At `0fdf3d1` | 299.53 kB / 92.07 kB | 8.71 kB / 2.65 kB |

Interpretation: this is a build-size measurement only. It does not show load time on a real device or network. The PED sets no numeric bundle target, so state that as a limitation instead of inventing one. A small Lighthouse run (mobile profile) on My Requests or Management Dashboard gives the time evidence: record the environment, date, score and the main timings `[[run and record]]`.

**Browser and viewport record (NFR-006, ASR-07).** Not yet run. Fill this in during the browser audit; do not mark Pass without running it.

| Browser (latest two versions) | 360 px | 768 px | 1280 px | Notes |
|-------------------------------|--------|--------|---------|-------|
| Chrome | `[[ ]]` | `[[ ]]` | `[[ ]]` | |
| Edge | `[[ ]]` | `[[ ]]` | `[[ ]]` | |
| Firefox | `[[ ]]` | `[[ ]]` | `[[ ]]` | |

**Hosting note that affects frontend evidence.** ADR-M2-TECH-002 records that the free Render tier spins down after 15 minutes and takes about a minute to wake. The first request after idle will show the loading state for a long time. E2E tests against staging need generous timeouts, and the loading state is the user-facing mitigation. Cite this in the staging section.

---

## 7. PED v3.0 text for the frontend (paste into the existing PED; evidence-index style)

**Section 4, Construction/configuration.** The frontend is a React single-page application (Vite, `react-router-dom`) in `source/frontend`, built on `feature/frontend-foundation` then `feature/frontend-ui` and integrated through PR `[[PR link]]`. It calls the backend only through HTTP endpoints, as PED section 5.5 requires. The API base URL comes from `[[env variable name]]`; no secrets are committed.

**Section 5, CI and automated verification.** CI runs `npm ci`, `npm run lint`, `npm test` and `npm run build` in `source/frontend` (`[[workflow link]]`). A failure in any step blocks the merge. A green run shows the frontend compiles and passes its component and accessibility tests against a mocked API. It does not show colour-contrast compliance or agreement with the real backend.

**Section 6, Quality strategy applied.** Verification was concentrated on privacy (internal comments hidden from requesters, management view without requester data), role rules (admin cannot change own role) and input validation ("Other" explanation, missing fields), because those failures harm users or expose data. Every page received an automated accessibility scan.

**Section 7, Black-box validation.** Equivalence partitioning (form validation) and a decision table (the "Other" rule); negative cases for 401, 403, wrong credentials and requester access to staff information. Records TC-FE-01 to TC-FE-12 in `document/Frontend/M3-Frontend-Evidence.md`.

**Section 8, Performance.** Production bundle measured at about 299.5 kB raw / 92.1 kB gzip (section 6). `[[add the Lighthouse result and what it does not prove]]`

**Section 9, Defects.** DEF-FE-01 (landmark-unique) was found by automated scanning, fixed in `0fdf3d1` and guarded by the retained axe tests. DEF-FE-02 and DEF-FE-03 were test and tooling defects from the first run.

**Residual risks (frontend).** (1) Behaviour against the real API is only as strong as the integration and E2E evidence `[[add result]]`. (2) Contrast and screen-reader behaviour are not proven. (3) Client-side hiding of sensitive content is not access control (RISK-011).

---

## 8. Remaining work for Role 3 (in order)

1. Get the PR approved by **two** non-author teammates with real review comments; link the PR above.
2. Resolve section 0 with the team (FR numbering) and the placeholders that remain.
3. Add tests for G-FE-01 (staff actions) and G-FE-02 (login routing for staff, management, admin).
4. Agree the API contract with the backend owner; write at least 3 integration tests and 2 E2E journeys (sign in → submit → see it in My requests with a reference; staff sign in → open request → change status) and run them against staging.
5. Browser audit: Lighthouse or axe DevTools on all 7 pages, keyboard walkthrough, the viewport table above; fix findings.
6. Update `document/Frontend/README.md` (run, test, build, env variables, page-to-requirement map).
7. Confirm the CI workflow runs the frontend gate and staging builds with the configured API URL.

---

## 9. Individual defence preparation (rehearse in your own words)

**Requirement-to-evidence trace: "Other" requires an explanation.** Need: reliable reporting with enough detail to act (agreed journey 3). Requirement FR-002 with RD-03 (fixed categories plus "Other"). Criterion: choosing Other without an explanation is rejected; other categories need none. Implementation: `SubmitRequestPage.jsx`. Test: TC-FE-01. Evidence: `npm test` at `0fdf3d1`, RTM row. If the test passes but the criterion is unmet: the backend may accept an empty explanation, or the mocked categories may not match the real ones.

**Engineering decision: one shared data-state pattern and a mocked API layer.** Alternatives: per-page ad hoc loading and error code; testing only against the live API. Chosen: a common `DataState` pattern and a thin API module so every page has the same four states and tests run fast and deterministically. Consequence: consistent, fast tests, but integration risk (RISK-009) until real-API tests exist. Link to PED section 5.5 (React calls only documented HTTP endpoints).

**Quality interpretation.** "39 passed" shows the components behave as specified against mocks and pass axe's jsdom rules. It does not show contrast, screen-reader behaviour, the real API contract, load time or cross-browser behaviour.

**Failure and risk.** A token expires mid-session and the API returns 401: the UI shows a sign-in prompt (TC-FE-05). Control: `[[where 401 is handled: src/api/client.js or per page – confirm in the code]]`. Residual: refresh and return-to-page behaviour is untested end to end.

**Release readiness.** Honest frontend-level classification today: **Conditionally ready**. Core journeys and states are verified against mocks; the conditions are real-API integration, E2E on staging, and the browser, viewport and contrast audit.
