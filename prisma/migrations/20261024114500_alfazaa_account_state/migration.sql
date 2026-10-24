-- Local reviewable migration only. Apply through the existing Prisma release flow.
-- NextAuth identities are not Supabase Auth UUIDs. No Data API policy is added:
-- the trusted Prisma server connection owns these tables and checks sessions.
CREATE TABLE "AlfazaaState" (
  "userId" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AlfazaaState_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "AlfazaaState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AlfazaaCommand" (
  "userId" TEXT NOT NULL,
  "key" VARCHAR(128) NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlfazaaCommand_pkey" PRIMARY KEY ("userId", "key"),
  CONSTRAINT "AlfazaaCommand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AlfazaaState"("userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AlfazaaCommand_createdAt_idx" ON "AlfazaaCommand"("createdAt");

ALTER TABLE "AlfazaaState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlfazaaCommand" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AlfazaaState", "AlfazaaCommand" FROM PUBLIC;

-- These roles exist on Supabase, but may not exist in an isolated plain Postgres.
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "AlfazaaState", "AlfazaaCommand" FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
