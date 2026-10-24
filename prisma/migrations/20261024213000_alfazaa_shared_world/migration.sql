-- Isolated independent Alfazaa world; no KingdomWorld or external game account changes.
CREATE TABLE "AlfazaaWorld" (
 "id" TEXT PRIMARY KEY, "state" JSONB NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "AlfazaaWorldCommand" (
 "worldId" TEXT NOT NULL REFERENCES "AlfazaaWorld"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "key" VARCHAR(128) NOT NULL, "fingerprint" CHAR(64) NOT NULL, "result" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("worldId", "userId", "key")
);
CREATE INDEX "AlfazaaWorldCommand_createdAt_idx" ON "AlfazaaWorldCommand"("createdAt");
ALTER TABLE "AlfazaaWorld" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlfazaaWorldCommand" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AlfazaaWorld", "AlfazaaWorldCommand" FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
 FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
   EXECUTE format('REVOKE ALL ON TABLE "AlfazaaWorld", "AlfazaaWorldCommand" FROM %I', api_role);
  END IF;
 END LOOP;
END $$;
