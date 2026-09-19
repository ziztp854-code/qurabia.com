CREATE TYPE "LiveSessionStatus" AS ENUM ('WAITING', 'ACTIVE', 'FINISHED');
CREATE TYPE "LiveParticipantStatus" AS ENUM ('CONNECTED', 'DISCONNECTED');

CREATE TABLE "LiveSession" (
  "id" TEXT NOT NULL,
  "quizId" TEXT NOT NULL,
  "hostId" TEXT NOT NULL,
  "roomCode" VARCHAR(8) NOT NULL,
  "status" "LiveSessionStatus" NOT NULL DEFAULT 'WAITING',
  "currentQuestionPosition" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiveParticipant" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "displayName" VARCHAR(80) NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "correctCount" INTEGER NOT NULL DEFAULT 0,
  "status" "LiveParticipantStatus" NOT NULL DEFAULT 'CONNECTED',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LiveParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiveAnswer" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "optionId" TEXT NOT NULL,
  "isCorrect" BOOLEAN NOT NULL,
  "earnedPoints" INTEGER NOT NULL DEFAULT 0,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LiveAnswer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LiveSession_quizId_status_idx" ON "LiveSession"("quizId", "status");
CREATE INDEX "LiveSession_hostId_createdAt_idx" ON "LiveSession"("hostId", "createdAt");
CREATE INDEX "LiveSession_roomCode_status_idx" ON "LiveSession"("roomCode", "status");
CREATE UNIQUE INDEX "LiveParticipant_sessionId_displayName_key" ON "LiveParticipant"("sessionId", "displayName");
CREATE INDEX "LiveParticipant_sessionId_score_idx" ON "LiveParticipant"("sessionId", "score");
CREATE UNIQUE INDEX "LiveAnswer_participantId_questionId_key" ON "LiveAnswer"("participantId", "questionId");
CREATE INDEX "LiveAnswer_sessionId_receivedAt_idx" ON "LiveAnswer"("sessionId", "receivedAt");
CREATE INDEX "LiveAnswer_questionId_idx" ON "LiveAnswer"("questionId");
CREATE INDEX "LiveAnswer_optionId_idx" ON "LiveAnswer"("optionId");

ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_quizId_fkey"
  FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_hostId_fkey"
  FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LiveParticipant" ADD CONSTRAINT "LiveParticipant_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveAnswer" ADD CONSTRAINT "LiveAnswer_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveAnswer" ADD CONSTRAINT "LiveAnswer_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "LiveParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveAnswer" ADD CONSTRAINT "LiveAnswer_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LiveAnswer" ADD CONSTRAINT "LiveAnswer_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "QuestionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
