ALTER TABLE "LiveParticipant"
  ADD COLUMN "lastDeviceHash" CHAR(64);

ALTER TABLE "LiveParticipantConnection"
  ADD COLUMN "deviceHash" CHAR(64);

CREATE INDEX "LiveParticipantConnection_deviceHash_idx"
  ON "LiveParticipantConnection"("deviceHash");
