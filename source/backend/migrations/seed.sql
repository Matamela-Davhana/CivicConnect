-- =========
-- USERS
-- =========
-- hash passwords pre-computed "password123" for all
INSERT INTO users (name, email, password_hash, role) VALUES
    ('Max Div', 'admin@example.com', '$2b$10$hashedpassword', 'admin'),
    ('Sam Sum', 'staff@example.com', '$2b$10$hashedpassword', 'staff'),
    ('Ben Ten', 'management@example.com', '$2b$10$hashedpassword', 'management'),
    ('Tom Hen', 'requester@example.com', '$2b$10$hashedpassword', 'requester');

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
     (SELECT id FROM users WHERE role='requester')),

    ('REQ-002',
     (SELECT id FROM categories WHERE name='Maintenance'),
     'Air conditioner leaking',
     'submitted',
     (SELECT id FROM users WHERE role='requester')),

    ('REQ-003',
     (SELECT id FROM categories WHERE name='Security Concern'),
     'Unauthorized access attempt',
     'submitted',
     (SELECT id FROM users WHERE role='requester'));

-- ================
-- STATUS_HISTORY
-- ================
-- audit trail entry
INSERT INTO status_history (request_id, old_status, new_status, changed_by)
VALUES
    ((SELECT id FROM service_requests WHERE reference='REQ-001'),
     NULL, 'submitted',
     (SELECT id FROM users WHERE role='requester'));

-- =================
-- REQUEST_ENTRIES
-- =================
-- public/internal comments
INSERT INTO request_entries (request_id, entry_type, author_id, content)
VALUES
    ((SELECT id FROM service_requests WHERE reference='REQ-001'),
     'public',
     (SELECT id FROM users WHERE role='staff'),
     'Request acknowledged by staff team'),

    ((SELECT id FROM service_requests WHERE reference='REQ-001'),
     'internal',
     (SELECT id FROM users WHERE role='staff'),
     'Assigned to IT technician for resolution');
