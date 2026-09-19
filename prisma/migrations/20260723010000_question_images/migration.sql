ALTER TABLE "Question"
  ADD COLUMN IF NOT EXISTS "imageUrl" VARCHAR(1000),
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "Quiz"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "LiveSession"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "Question_category_status_idx"
  ON "Question"("category", "status");

CREATE INDEX IF NOT EXISTS "Quiz_isPublic_status_idx"
  ON "Quiz"("isPublic", "status");

CREATE INDEX IF NOT EXISTS "Quiz_createdAt_idx"
  ON "Quiz"("createdAt");

CREATE INDEX IF NOT EXISTS "QuizQuestion_questionId_idx"
  ON "QuizQuestion"("questionId");
