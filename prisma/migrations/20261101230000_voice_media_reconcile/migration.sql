CREATE TABLE "VoiceMediaReconcileJob" (
  "roomId" TEXT NOT NULL,
  "generation" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoiceMediaReconcileJob_pkey" PRIMARY KEY ("roomId"),
  CONSTRAINT "VoiceMediaReconcileJob_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "VoiceRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "VoiceMediaReconcileJob_nextAttemptAt_leaseExpiresAt_idx" ON "VoiceMediaReconcileJob"("nextAttemptAt", "leaseExpiresAt");
ALTER TABLE "VoiceMediaReconcileJob" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "VoiceMediaReconcileJob" FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "VoiceMediaReconcileJob" FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
