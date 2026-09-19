CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE');
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "QuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

CREATE TABLE "Question" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "type" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
  "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT',
  "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'MEDIUM',
  "prompt" VARCHAR(1000) NOT NULL,
  "explanation" VARCHAR(2000),
  "category" VARCHAR(120),
  "source" VARCHAR(500),
  "timeLimit" INTEGER NOT NULL DEFAULT 20,
  "basePoints" INTEGER NOT NULL DEFAULT 1000,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionOption" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "text" VARCHAR(500) NOT NULL,
  "isCorrect" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Question_ownerId_status_idx" ON "Question"("ownerId", "status");
CREATE INDEX "Question_ownerId_updatedAt_idx" ON "Question"("ownerId", "updatedAt");
CREATE INDEX "Question_category_status_idx" ON "Question"("category", "status");
CREATE UNIQUE INDEX "QuestionOption_questionId_position_key" ON "QuestionOption"("questionId", "position");

ALTER TABLE "Question" ADD CONSTRAINT "Question_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
