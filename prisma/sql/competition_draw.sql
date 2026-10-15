-- The competition draw's result, owned by the admin portal (see
-- CompetitionDrawMatch in schema.prisma). One row per match, the green corner
-- against the pink one; each new draw replaces all four rows. The backend
-- neither reads nor writes this table.
--
-- Apply once against the shared Supabase database (SQL editor, or
-- `npx prisma db execute --file prisma/sql/competition_draw.sql`).
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS "competition_draw_matches" (
  "match_number" INTEGER      NOT NULL,
  "green_team"   TEXT         NOT NULL,
  "pink_team"    TEXT         NOT NULL,
  "drawn_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "drawn_by"     TEXT         NOT NULL,

  CONSTRAINT "competition_draw_matches_pkey" PRIMARY KEY ("match_number"),
  CONSTRAINT "competition_draw_matches_corners_differ" CHECK ("green_team" <> "pink_team")
);

-- Supabase exposes public tables over PostgREST; nothing but the portal's
-- direct Postgres connection should touch this one.
ALTER TABLE "competition_draw_matches" ENABLE ROW LEVEL SECURITY;
