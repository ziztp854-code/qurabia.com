ALTER TABLE "LiveParticipant"
  ADD COLUMN "lastConnectedAt" TIMESTAMP(3),
  ADD COLUMN "lastDisconnectedAt" TIMESTAMP(3),
  ADD COLUMN "lastIpAddress" VARCHAR(45),
  ADD COLUMN "lastUserAgent" VARCHAR(512),
  ADD COLUMN "lastDeviceLabel" VARCHAR(120);

CREATE TABLE "LiveParticipantConnection" (
  "id" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "socketId" VARCHAR(64) NOT NULL,
  "ipAddress" VARCHAR(45),
  "userAgent" VARCHAR(512),
  "deviceLabel" VARCHAR(120),
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disconnectedAt" TIMESTAMP(3),

  CONSTRAINT "LiveParticipantConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LiveParticipantConnection_socketId_key"
  ON "LiveParticipantConnection"("socketId");
CREATE INDEX "LiveParticipantConnection_participantId_connectedAt_idx"
  ON "LiveParticipantConnection"("participantId", "connectedAt");
CREATE INDEX "LiveParticipantConnection_ipAddress_idx"
  ON "LiveParticipantConnection"("ipAddress");

ALTER TABLE "LiveParticipantConnection"
  ADD CONSTRAINT "LiveParticipantConnection_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "LiveParticipant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
