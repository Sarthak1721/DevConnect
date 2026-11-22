-- Custom SQL migration (drizzle-kit can't express extensions).
-- It runs first because migration 0001 creates trigram indexes that depend on it.

-- pg_trgm: similarity search on short text (usernames, names, skills) using three-letter chunks.
-- Ships with Postgres and is available on managed providers (Neon included).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
