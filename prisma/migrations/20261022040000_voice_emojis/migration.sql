CREATE TABLE "VoiceEmojiPack" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "VoiceEmoji" (
  "id" TEXT PRIMARY KEY, "packId" TEXT NOT NULL REFERENCES "VoiceEmojiPack"("id") ON DELETE CASCADE,
  "label" TEXT NOT NULL, "animated" BOOLEAN NOT NULL DEFAULT false, "content" BYTEA NOT NULL, "poster" BYTEA NOT NULL
);
CREATE INDEX "VoiceEmoji_packId_idx" ON "VoiceEmoji"("packId");
CREATE TABLE "VoiceChatCommand" (
  "roomId" TEXT NOT NULL REFERENCES "VoiceRoom"("id") ON DELETE CASCADE, "userId" TEXT NOT NULL, "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("roomId", "userId", "requestId")
);
