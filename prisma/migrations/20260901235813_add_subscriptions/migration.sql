-- CreateEnum
CREATE TYPE "SubscriptionSource" AS ENUM ('STAMP', 'ACHIEVEMENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionStampStatus" AS ENUM ('UNUSED', 'REDEEMED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "SubscriptionStamp" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "planCode" VARCHAR(16) NOT NULL,
    "planVersion" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "status" "SubscriptionStampStatus" NOT NULL DEFAULT 'UNUSED',
    "note" VARCHAR(200),
    "issuedBy" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedBy" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SubscriptionStamp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planCode" VARCHAR(16) NOT NULL,
    "planVersion" INTEGER NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "SubscriptionSource" NOT NULL DEFAULT 'STAMP',
    "stampId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "periodStart" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionStamp_code_key" ON "SubscriptionStamp"("code");

-- CreateIndex
CREATE INDEX "SubscriptionStamp_status_planCode_idx" ON "SubscriptionStamp"("status", "planCode");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_stampId_key" ON "UserSubscription"("stampId");

-- CreateIndex
CREATE INDEX "UserSubscription_userId_status_expiresAt_idx" ON "UserSubscription"("userId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsageCounter_userId_key_periodStart_key" ON "UsageCounter"("userId", "key", "periodStart");

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "SubscriptionStamp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageCounter" ADD CONSTRAINT "UsageCounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
