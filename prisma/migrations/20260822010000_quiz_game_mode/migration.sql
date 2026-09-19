-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN "gameMode" "QuestionGame" NOT NULL DEFAULT 'QUIZ';

-- CreateIndex
CREATE INDEX "Quiz_gameMode_status_idx" ON "Quiz"("gameMode", "status");
