CREATE TABLE "MobilePushDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expoPushToken" VARCHAR(255) NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "deviceName" VARCHAR(120),
    "deviceModel" VARCHAR(120),
    "osVersion" VARCHAR(64),
    "appVersion" VARCHAR(32),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobilePushDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobilePushDevice_expoPushToken_key"
ON "MobilePushDevice"("expoPushToken");

CREATE INDEX "MobilePushDevice_userId_enabled_idx"
ON "MobilePushDevice"("userId", "enabled");

CREATE INDEX "MobilePushDevice_lastSeenAt_idx"
ON "MobilePushDevice"("lastSeenAt");

ALTER TABLE "MobilePushDevice"
ADD CONSTRAINT "MobilePushDevice_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
