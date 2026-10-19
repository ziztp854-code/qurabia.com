CREATE TABLE "VoiceDirectMessage" (
  "id" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "text" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "VoiceDirectMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VoiceDirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VoiceDirectMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "VoiceDirectMessage_senderId_recipientId_createdAt_idx" ON "VoiceDirectMessage"("senderId", "recipientId", "createdAt");
CREATE INDEX "VoiceDirectMessage_recipientId_createdAt_idx" ON "VoiceDirectMessage"("recipientId", "createdAt");
