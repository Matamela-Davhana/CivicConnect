-- Additive migration: preserve all existing users and requests.
-- Apply with psql -X -v ON_ERROR_STOP=1 --single-transaction.
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
-- Abort on existing case-insensitive duplicates; never merge/delete accounts here.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_unique ON users (lower(btrim(email)));
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_normalized_unique ON categories (lower(btrim(name)));
