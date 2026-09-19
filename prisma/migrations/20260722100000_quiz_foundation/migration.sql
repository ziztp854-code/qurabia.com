CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

CREATE TABLE "Quiz" (
  "id" TEXT NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" VARCHAR(1000),
  "ownerId" TEXT NOT NULL,
  "roomCode" VARCHAR(8) NOT NULL,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "status" "QuizStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuizQuestion" (
  "quizId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,

  CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("quizId", "questionId")
);

CREATE UNIQUE INDEX "Quiz_roomCode_key" ON "Quiz"("roomCode");
CREATE INDEX "Quiz_ownerId_status_idx" ON "Quiz"("ownerId", "status");
CREATE INDEX "Quiz_isPublic_status_idx" ON "Quiz"("isPublic", "status");
CREATE INDEX "Quiz_createdAt_idx" ON "Quiz"("createdAt");
CREATE UNIQUE INDEX "QuizQuestion_quizId_position_key" ON "QuizQuestion"("quizId", "position");
CREATE INDEX "QuizQuestion_questionId_idx" ON "QuizQuestion"("questionId");

ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_quizId_fkey"
  FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
