CREATE TYPE "QuestionGame" AS ENUM (
  'QUIZ',
  'CATEGORY_BOARD',
  'LETTER_CHALLENGE',
  'MILLIONAIRE'
);

CREATE TABLE "Category" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

ALTER TABLE "Question"
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "gameTypes" "QuestionGame"[] NOT NULL DEFAULT ARRAY['QUIZ']::"QuestionGame"[];

INSERT INTO "Category" ("id", "name")
SELECT
  'cat_' || md5(btrim("category")),
  btrim("category")
FROM "Question"
WHERE nullif(btrim("category"), '') IS NOT NULL
GROUP BY btrim("category")
ON CONFLICT ("name") DO NOTHING;

UPDATE "Question" AS question
SET "categoryId" = category."id"
FROM "Category" AS category
WHERE category."name" = btrim(question."category")
  AND nullif(btrim(question."category"), '') IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Question"
    WHERE nullif(btrim("category"), '') IS NOT NULL
      AND "categoryId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Question category migration left unmapped rows';
  END IF;
END $$;

UPDATE "Question"
SET "gameTypes" = CASE
  WHEN "type" = 'MULTIPLE_CHOICE' THEN
    ARRAY['QUIZ', 'CATEGORY_BOARD', 'MILLIONAIRE']::"QuestionGame"[]
  ELSE
    ARRAY['QUIZ', 'CATEGORY_BOARD']::"QuestionGame"[]
  END
  || CASE
    WHEN coalesce("category", '') ILIKE '%حروف%' THEN
      ARRAY['LETTER_CHALLENGE']::"QuestionGame"[]
    ELSE
      ARRAY[]::"QuestionGame"[]
  END;

DROP INDEX IF EXISTS "Question_category_status_idx";
ALTER TABLE "Question" DROP COLUMN "category";

CREATE INDEX "Question_categoryId_status_difficulty_idx"
  ON "Question"("categoryId", "status", "difficulty");
CREATE INDEX "Question_gameTypes_idx" ON "Question" USING GIN ("gameTypes");

ALTER TABLE "Question"
  ADD CONSTRAINT "Question_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
