# ADR-M2-DATA-001: Persistence Model

**Status:** Approved — 29 September 2026
**Owner:** Jininy Nkomo (Data, Persistence & Technology Stack)

## Context

CivicConnect's data is structurally relational: Request, User, Category,
StatusHistory and RequestEntry all have fixed, well-defined relationships.
NFR-007 (no duplicate references, no partial transactions) and NFR-008
(complete, attributable audit trail) both require atomic, consistent writes
across related tables — a status change and its history entry must commit
together or not at all.

## Constraints considered

- CON-003 (cost): free/low-cost preferred, limits must be documented.
- CON-008 (technology): no stack prescribed, decision must be justified.
- NFR-003: 10,000 stored requests, 50 concurrent users, sub-2-second common
  operations.
- RISK-001: technology-stack unfamiliarity, already flagged critical in M1.

## Alternatives considered

| Option | Why considered | Why accepted/rejected |
|---|---|---|
| **Relational (PostgreSQL)** | Structured entities, foreign-key relationships, ACID transactions | **Accepted** |
| Document store (MongoDB) | Some team exposure via other modules | Rejected — NFR-007's atomicity requirement (status change + history entry as one unit) is awkward across document collections without relational transaction guarantees; CivicConnect has no unstructured or high-variability data to justify the trade-off |
| Hybrid (relational + cache layer) | Could pre-empt performance concerns | Rejected for M2 — NFR-003's targets are easily met by a single well-indexed PostgreSQL instance at this scale; adding a cache layer now is complexity the project evidence doesn't yet justify |

## Decision

PostgreSQL as the sole persistence store for M2.

## Rationale

Matches the actual shape of CivicConnect's data and provides transactional
integrity guarantees natively rather than requiring the team to build them
in application code. Free and open-source (satisfies CON-003). See A2 Task 2
research (Persistence & Data Integrity) for the deeper comparison of
transaction isolation levels — not duplicated here per the M2 brief's
instruction not to copy A2 research into the PED.

## Integrity, concurrency and risk measures

- **Uniqueness:** `reference` has a database-level UNIQUE constraint —
  duplicates are rejected by the database, not just the application
  (NFR-007).
- **Concurrency:** Optimistic locking via a `row_version` column on
  `service_requests`, checked on every write. Chosen over long-held locks
  because the concurrent-user count is small (NFR-003: 50) and a rare
  conflict (two staff accepting the same request) is an acceptable,
  detectable event rather than one requiring pessimistic locking overhead.
- **Auditability:** `status_history` and `request_entries` are append-only
  by design — the application's runtime database role should not be granted
  UPDATE or DELETE on these tables (NFR-008).
- **Backup/recovery (Should, NFR-010/011):** Supabase's managed Postgres
  includes automated backups; a documented (not yet tested) restore
  procedure satisfies the M2 expectation that this be anticipated, not
  fully implemented, at this stage.
- **SPOF:** A single database instance is a single point of failure.
  Accepted as proportionate risk at M2 scale (CON-001/CON-003) and recorded
  in the Risk Register (RISK-008) rather than silently ignored.

## Trade-offs

Less flexibility for unstructured/evolving data shapes than a document
store would offer — accepted because CivicConnect's entities are stable
and well understood from the M1 baseline.

## Later consequence

If a future requirement introduced genuinely unstructured or highly
variable data (e.g. rich file attachments with varying metadata), this
decision would need to be revisited through formal change control, per
CON-009.
