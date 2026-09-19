-- Question bank organisation: hierarchy, tags, keywords, SHORT_ANSWER.
-- Safe additive migration: nothing in the existing surface is renamed
-- or removed, so the rest of the app continues to compile while the
-- new admin tooling is wired in.

-- 1. Extend the QuestionType enum with SHORT_ANSWER.
ALTER TYPE "QuestionType" ADD VALUE 'SHORT_ANSWER';

-- 2. Add hierarchy + presentation columns to Category.
ALTER TABLE "Category"
  ADD COLUMN "parentId" TEXT,
  ADD COLUMN "slug" VARCHAR(120),
  ADD COLUMN "description" VARCHAR(500),
  ADD COLUMN "icon" VARCHAR(40),
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. Backfill slugs from names so the new admin routes can use them.
UPDATE "Category"
SET "slug" = lower(regexp_replace(
  translate(
    regexp_replace("name", '[اأإآٱ]', 'ا', 'g'),
    'ة',
    'ه'
  ),
  '[^[:alnum:][:space:]]+',
  '-',
  'g'
))
WHERE "slug" IS NULL;

UPDATE "Category"
SET "slug" = trim(BOTH '-' FROM regexp_replace("slug", '-+', '-', 'g'))
WHERE "slug" IS NOT NULL
  AND ("slug" LIKE '%--%' OR "slug" LIKE '-%' OR "slug" LIKE '%-');

-- 4. Make slugs unique once backfilled, then enforce the constraint.
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- 5. Self-referential FK for the category tree. ON DELETE RESTRICT so
-- a parent with children cannot be deleted silently by a careless
-- admin call; the move/cascade helpers handle re-parenting first.
ALTER TABLE "Category"
  ADD CONSTRAINT "Category_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Category"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Category_parentId_position_idx" ON "Category"("parentId", "position");
CREATE INDEX "Category_isActive_idx" ON "Category"("isActive");

-- 6. Extend the Question model with new metadata fields.
ALTER TABLE "Question"
  ADD COLUMN "expectedAnswer" VARCHAR(200),
  ADD COLUMN "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "lastEditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Question_keywords_idx" ON "Question" USING GIN ("keywords");
CREATE INDEX "Question_timeLimit_idx" ON "Question"("timeLimit");
CREATE INDEX "Question_lastEditedAt_idx" ON "Question"("lastEditedAt");

-- 7. QuestionTag join table for a controlled keyword vocabulary.
CREATE TABLE "QuestionTag" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "tag" VARCHAR(60) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QuestionTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestionTag_questionId_tag_key" ON "QuestionTag"("questionId", "tag");
CREATE INDEX "QuestionTag_tag_idx" ON "QuestionTag"("tag");

ALTER TABLE "QuestionTag"
  ADD CONSTRAINT "QuestionTag_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
