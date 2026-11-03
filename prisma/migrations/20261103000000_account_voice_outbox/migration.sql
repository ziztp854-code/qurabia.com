-- The account update and event commit together; this trigger never locks a room.
CREATE TABLE "AccountVoiceOutbox" (
  "id" BIGSERIAL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cursorRoomId" TEXT,
  "hadBusyRoom" BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX "AccountVoiceOutbox_userId_idx" ON "AccountVoiceOutbox" ("userId");
CREATE INDEX "AccountVoiceOutbox_nextAttemptAt_id_idx" ON "AccountVoiceOutbox" ("nextAttemptAt", "id");
CREATE TABLE "AccountVoiceOutboxRoom" (
  "eventId" BIGINT NOT NULL REFERENCES "AccountVoiceOutbox" ("id") ON DELETE CASCADE,
  "roomId" TEXT NOT NULL,
  PRIMARY KEY ("eventId", "roomId")
);
ALTER TABLE "AccountVoiceOutboxRoom" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AccountVoiceOutboxRoom" FROM PUBLIC;
ALTER TABLE "AccountVoiceOutbox" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AccountVoiceOutbox" FROM PUBLIC;
REVOKE ALL ON SEQUENCE "AccountVoiceOutbox_id_seq" FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "AccountVoiceOutbox" FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON TABLE "AccountVoiceOutboxRoom" FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON SEQUENCE "AccountVoiceOutbox_id_seq" FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
CREATE FUNCTION enqueue_account_voice_reconcile() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "AccountVoiceOutbox" ("userId") VALUES (NEW."id");
  RETURN NEW;
END;
$$;
CREATE TRIGGER "User_account_voice_outbox"
AFTER UPDATE ON "User"
FOR EACH ROW
WHEN (OLD."status" IS DISTINCT FROM NEW."status" OR OLD."tokenVersion" IS DISTINCT FROM NEW."tokenVersion")
EXECUTE FUNCTION enqueue_account_voice_reconcile();
