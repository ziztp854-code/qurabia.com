CREATE TABLE "KingdomWorld" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" VARCHAR(80) NOT NULL,
  "state" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "nextEventAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KingdomWorld_revision_check" CHECK ("revision" >= 0)
);
CREATE INDEX "KingdomWorld_nextEventAt_idx" ON "KingdomWorld"("nextEventAt");
CREATE TABLE "KingdomCommand" (
  "worldId" TEXT NOT NULL REFERENCES "KingdomWorld"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "key" VARCHAR(80) NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "revision" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("worldId", "actorId", "key")
);
CREATE INDEX "KingdomCommand_actorId_createdAt_idx" ON "KingdomCommand"("actorId", "createdAt");
-- Game state is accessible through authenticated application handlers only.
ALTER TABLE "KingdomWorld" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KingdomCommand" ENABLE ROW LEVEL SECURITY;
