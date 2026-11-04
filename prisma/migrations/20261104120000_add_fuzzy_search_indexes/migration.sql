-- Manual migration: GIN indexes for fuzzy search (added 2026-10-31)
-- These were added directly via Supabase SQL Editor during the fuzzy search implementation.
-- This file baselines them so Prisma's migration history matches the actual DB schema.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_business_name_trgm ON "businesses" USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_business_desc_trgm ON "businesses" USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_category_name_trgm ON "categories" USING gin (name gin_trgm_ops);
