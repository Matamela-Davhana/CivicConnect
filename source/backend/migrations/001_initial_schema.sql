-- CivicConnect — Initial schema
-- Migration: 001_initial_schema
-- Traces to: M1 PED v1.0 §5 (FR-001 to FR-018, NFR-007, NFR-008)
-- Tool: node-pg-migrate compatible raw SQL (see README for run instructions)

-- ============================================================
-- USER
-- Requirement links: FR-001 (RBAC), FR-018 (Admin maintains roles)
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('requester', 'staff', 'management', 'admin')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CATEGORY
-- Requirement links: FR-003, RD-03 (controlled fixed category set)
-- ============================================================
CREATE TABLE categories (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name    VARCHAR(50) NOT NULL UNIQUE,
    active  BOOLEAN NOT NULL DEFAULT true
);

-- Seed the M1-baselined category set (RD-03)
INSERT INTO categories (name) VALUES
    ('Facility Fault'),
    ('Damaged Equipment'),
    ('Security Concern'),
    ('IT Support'),
    ('Maintenance'),
    ('Lost Property'),
    ('Other');

-- ============================================================
-- SERVICE_REQUEST
-- Requirement links: FR-002, FR-004, FR-005, FR-009, FR-010, FR-011
-- NFR-007: unique reference enforced at DB level, not app level
-- ============================================================
CREATE TABLE service_requests (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference               VARCHAR(20) NOT NULL UNIQUE,
    category_id             UUID NOT NULL REFERENCES categories(id),
    description             TEXT NOT NULL,
    other_explanation       TEXT, -- required only when category = 'Other' (FR-003), enforced in application layer
    status                  VARCHAR(20) NOT NULL DEFAULT 'submitted'
                                CHECK (status IN (
                                    'submitted', 'accepted', 'assigned',
                                    'in_progress', 'on_hold', 'resolved',
                                    'closed', 'rejected'
                                )),
    requester_id            UUID NOT NULL REFERENCES users(id),
    assignee_id             UUID REFERENCES users(id),
    target_resolution_date  DATE, -- required once accepted/assigned (FR-010), enforced in application layer
    submitted_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Optimistic concurrency control: prevents two staff members
    -- overwriting each other's assignment/status change unnoticed.
    row_version             INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_service_requests_status ON service_requests(status);
CREATE INDEX idx_service_requests_category ON service_requests(category_id);
CREATE INDEX idx_service_requests_target_date ON service_requests(target_resolution_date);
CREATE INDEX idx_service_requests_requester ON service_requests(requester_id);

-- ============================================================
-- STATUS_HISTORY  (append-only — the audit trail itself)
-- Requirement links: NFR-008 (auditability), FR-017
-- No UPDATE/DELETE grants should be issued on this table to the
-- application's runtime DB role — inserts only.
-- ============================================================
CREATE TABLE status_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES service_requests(id),
    old_status      VARCHAR(20),
    new_status      VARCHAR(20) NOT NULL,
    changed_by      UUID NOT NULL REFERENCES users(id),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_history_request ON status_history(request_id);

-- ============================================================
-- REQUEST_ENTRY  (append-only — public updates + internal comments)
-- Requirement links: FR-012 (public/internal split), FR-006, FR-013
-- entry_type is the access-control boundary: application queries for
-- Requesters and Management summaries MUST filter entry_type = 'public'.
-- ============================================================
CREATE TABLE request_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  UUID NOT NULL REFERENCES service_requests(id),
    entry_type  VARCHAR(10) NOT NULL CHECK (entry_type IN ('public', 'internal')),
    author_id   UUID NOT NULL REFERENCES users(id),
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_request_entries_request ON request_entries(request_id);
CREATE INDEX idx_request_entries_type ON request_entries(entry_type);
