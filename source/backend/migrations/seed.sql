-- LOCAL / DISPOSABLE TEST DATA ONLY. Never seed a hosted or production database.
BEGIN;
DO $$
BEGIN
    IF current_database() NOT IN ('civicconnect_local_review', 'civicconnect_test') THEN
        RAISE EXCEPTION 'Sample seed is restricted to the named local/test databases';
    END IF;
    IF EXISTS (SELECT 1 FROM users) THEN
        RAISE EXCEPTION 'Sample seed requires an empty users table; existing accounts will not be changed';
    END IF;
END $$;
-- =========
-- USERS
-- =========
-- bcrypt cost 12 for the public, disposable test password "password123".
-- These accounts must never be used with real data or on a public deployment.
INSERT INTO users (name, email, password_hash, role) VALUES
    ('Max Div', 'admin@example.com', '$2b$12$Fv6JtnGymqdmxvVfzVPhmuQBEk8riKB963dlCdZMgNf7.V6XOQehK', 'admin'),
    ('Sam Sum', 'staff@example.com', '$2b$12$Fv6JtnGymqdmxvVfzVPhmuQBEk8riKB963dlCdZMgNf7.V6XOQehK', 'staff'),
    ('Ben Ten', 'management@example.com', '$2b$12$Fv6JtnGymqdmxvVfzVPhmuQBEk8riKB963dlCdZMgNf7.V6XOQehK', 'management'),
    ('Tom Hen', 'requester@example.com', '$2b$12$Fv6JtnGymqdmxvVfzVPhmuQBEk8riKB963dlCdZMgNf7.V6XOQehK', 'requester');

-- ==================
-- SERVICE_REQUESTS
-- ==================
-- link requests to categories and users by subquerying IDs
INSERT INTO service_requests (reference, category_id, description, status, requester_id)
VALUES
    ('REQ-001',
     (SELECT id FROM categories WHERE name='IT Support'),
     'Laptop not booting',
     'submitted',
     (SELECT id FROM users WHERE email='requester@example.com')),

    ('REQ-002',
     (SELECT id FROM categories WHERE name='Maintenance'),
     'Air conditioner leaking',
     'submitted',
     (SELECT id FROM users WHERE email='requester@example.com')),

    ('REQ-003',
     (SELECT id FROM categories WHERE name='Security Concern'),
     'Unauthorized access attempt',
     'submitted',
     (SELECT id FROM users WHERE email='requester@example.com'));

-- ================
-- STATUS_HISTORY
-- ================
-- audit trail entry
INSERT INTO status_history (request_id, old_status, new_status, changed_by)
VALUES
    ((SELECT id FROM service_requests WHERE reference='REQ-001'),
     NULL, 'submitted',
     (SELECT id FROM users WHERE email='requester@example.com'));

-- =================
-- REQUEST_ENTRIES
-- =================
-- public/internal comments
INSERT INTO request_entries (request_id, entry_type, author_id, content)
VALUES
    ((SELECT id FROM service_requests WHERE reference='REQ-001'),
     'public',
     (SELECT id FROM users WHERE email='staff@example.com'),
     'Request acknowledged by staff team'),

    ((SELECT id FROM service_requests WHERE reference='REQ-001'),
     'internal',
     (SELECT id FROM users WHERE email='staff@example.com'),
     'Assigned to IT technician for resolution');
COMMIT;
