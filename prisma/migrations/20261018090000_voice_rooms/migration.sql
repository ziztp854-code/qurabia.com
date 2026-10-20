CREATE TABLE "VoiceRoom" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "inviteHash" CHAR(64),
    "inviteExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VoiceRoom_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VoicePreference" (
    "userId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VoicePreference_pkey" PRIMARY KEY ("userId")
);
CREATE TABLE "VoiceReport" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "messageId" TEXT,
    "reason" VARCHAR(500) NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceReport_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VoiceCover" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceCover_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VoiceRoom_active_isPrivate_updatedAt_idx" ON "VoiceRoom"("active", "isPrivate", "updatedAt");
CREATE INDEX "VoiceRoom_hostId_active_idx" ON "VoiceRoom"("hostId", "active");
CREATE INDEX "VoiceReport_roomId_createdAt_idx" ON "VoiceReport"("roomId", "createdAt");
CREATE INDEX "VoiceReport_reporterId_createdAt_idx" ON "VoiceReport"("reporterId", "createdAt");
CREATE INDEX "VoiceCover_ownerId_idx" ON "VoiceCover"("ownerId");
ALTER TABLE "VoiceRoom" ADD CONSTRAINT "VoiceRoom_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoicePreference" ADD CONSTRAINT "VoicePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceReport" ADD CONSTRAINT "VoiceReport_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "VoiceRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceReport" ADD CONSTRAINT "VoiceReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoiceCover" ADD CONSTRAINT "VoiceCover_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
