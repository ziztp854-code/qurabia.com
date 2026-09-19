-- Additive migration for ScrambledWordsPuzzle (scrambled-words-live game).
-- Applied manually because `prisma db push` is blocked by unrelated legacy
-- drift on the LadderRoom/LadderQuestion tables.

DO $$ BEGIN
  CREATE TYPE "ScrambledWordsPuzzleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ScrambledWordsPuzzle" (
    "id" TEXT NOT NULL,
    "imageUrl" VARCHAR(500) NOT NULL,
    "words" TEXT[] NOT NULL,
    "category" VARCHAR(80),
    "status" "ScrambledWordsPuzzleStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScrambledWordsPuzzle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScrambledWordsPuzzle_status_createdAt_idx"
  ON "ScrambledWordsPuzzle"("status", "createdAt");
