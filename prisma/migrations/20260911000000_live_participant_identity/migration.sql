ALTER TABLE "LiveParticipant" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "LiveParticipant_sessionId_userId_key" ON "LiveParticipant"("sessionId", "userId");
CREATE INDEX "LiveParticipant_userId_idx" ON "LiveParticipant"("userId");
ALTER TABLE "LiveParticipant" ADD CONSTRAINT "LiveParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
