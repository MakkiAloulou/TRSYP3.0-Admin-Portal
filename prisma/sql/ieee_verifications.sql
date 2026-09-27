-- IEEE membership checks, owned by the admin portal (see IeeeVerification in
-- schema.prisma). The backend neither reads nor writes this table.
--
-- Apply once against the shared Supabase database (SQL editor, or
-- `npx prisma db execute --file prisma/sql/ieee_verifications.sql`).
-- Safe to re-run.

DO $$ BEGIN
  CREATE TYPE "IeeeCheckStatus" AS ENUM ('VERIFIED', 'MISMATCH', 'INACTIVE', 'NOT_FOUND');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ieee_verifications" (
  "id"              TEXT              NOT NULL,
  "participant_id"  TEXT              NOT NULL,
  "status"          "IeeeCheckStatus" NOT NULL,
  "member_status"   TEXT,
  "grade"           TEXT,
  "societies"       TEXT[]            NOT NULL DEFAULT ARRAY[]::TEXT[],
  "first_initial"   TEXT,
  "last_initial"    TEXT,
  "matched_by"      TEXT,
  "issues"          JSONB             NOT NULL DEFAULT '[]',
  "claimed_ieee_id" INTEGER,
  "claimed_type"    TEXT              NOT NULL,
  "claimed_is_ras"  BOOLEAN           NOT NULL,
  "claimed_email"   TEXT              NOT NULL,
  "checked_at"      TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checked_by"      TEXT              NOT NULL,

  CONSTRAINT "ieee_verifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ieee_verifications_participant_id_fkey" FOREIGN KEY ("participant_id")
    REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ieee_verifications_participant_id_key"
  ON "ieee_verifications"("participant_id");

-- Supabase exposes public tables over PostgREST; nothing but the portal's
-- direct Postgres connection should touch this one.
ALTER TABLE "ieee_verifications" ENABLE ROW LEVEL SECURITY;
