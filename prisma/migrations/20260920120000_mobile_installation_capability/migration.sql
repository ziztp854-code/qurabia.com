ALTER TABLE "MobilePushDevice"
  ADD COLUMN "installationId" VARCHAR(64),
  ADD COLUMN "installationSecretHash" VARCHAR(64),
  ADD COLUMN "registrationRevision" VARCHAR(64);

CREATE UNIQUE INDEX "MobilePushDevice_installationId_key"
  ON "MobilePushDevice"("installationId");

ALTER TABLE "Session"
  ADD COLUMN "mobileInstallationId" VARCHAR(64),
  ADD COLUMN "mobileInstallationSecretHash" VARCHAR(64);

CREATE INDEX "Session_mobileInstallationId_idx"
  ON "Session"("mobileInstallationId");
