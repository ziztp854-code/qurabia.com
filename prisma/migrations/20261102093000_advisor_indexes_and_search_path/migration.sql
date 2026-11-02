-- Existing indexes retain their operator-class dependencies when the extension moves.
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- Pin trigger name resolution and qualify the sequence used by account numbering.
ALTER FUNCTION public.increment_user_token_version_on_sensitive_change() SET search_path = pg_catalog;
CREATE OR REPLACE FUNCTION public.assign_user_account_number() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  reserved_number INTEGER;
  retired_number INTEGER;
BEGIN
  SELECT new_number, old_number INTO reserved_number, retired_number FROM (VALUES
    ('cmrw9rfv9000204l72z55ai5b', 123456800, 2),
    ('cmupvygjx000204jq4bir1i4x', 123456821, 78)
  ) AS reserved(user_id, old_number, new_number) WHERE user_id = NEW.id;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id AND
      (reserved_number IS NOT NULL OR OLD.id IN
        ('cmrw9rfv9000204l72z55ai5b', 'cmupvygjx000204jq4bir1i4x')) THEN
      RAISE EXCEPTION 'Reserved account identity cannot be transferred';
    END IF;
    IF NEW."accountNumber" IS DISTINCT FROM OLD."accountNumber" AND NOT (
      reserved_number IS NOT NULL AND OLD."accountNumber" = retired_number
      AND NEW."accountNumber" = reserved_number AND NEW."role"::text <> 'OWNER'
    ) THEN
      RAISE EXCEPTION 'Account numbers cannot be changed';
    END IF;
  END IF;

  IF NEW."role"::text = 'OWNER' THEN
    NEW."accountNumber" := 1;
  ELSIF reserved_number IS NOT NULL THEN
    NEW."accountNumber" := reserved_number;
  ELSIF NEW."accountNumber" IN (2, 78) THEN
    RAISE EXCEPTION 'Account number is reserved';
  ELSE
    IF NEW."accountNumber" = 1 THEN
      NEW."accountNumber" := nextval('public."User_accountNumber_seq"'::regclass);
    END IF;
    -- Never reassign compatibility URLs to a different account.
    WHILE NEW."accountNumber" IN (123456800, 123456821) LOOP
      NEW."accountNumber" := nextval('public."User_accountNumber_seq"'::regclass);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


-- Cover referencing columns for joins and foreign-key maintenance.
CREATE INDEX "AlfazaaWorldCommand_userId_idx" ON "AlfazaaWorldCommand"("userId");
CREATE INDEX "CommunityBadge_effectId_idx" ON "CommunityBadge"("effectId");
CREATE INDEX "CommunityBadge_frameId_idx" ON "CommunityBadge"("frameId");
CREATE INDEX "KingdomReportEntry_playerId_idx" ON "KingdomReportEntry"("playerId");
CREATE INDEX "MafiaAction_actorId_idx" ON "MafiaAction"("actorId");
CREATE INDEX "MafiaMessage_participantId_idx" ON "MafiaMessage"("participantId");
CREATE INDEX "MafiaVote_targetId_idx" ON "MafiaVote"("targetId");
CREATE INDEX "MafiaVote_voterId_idx" ON "MafiaVote"("voterId");
CREATE INDEX "UserBadge_badgeId_idx" ON "UserBadge"("badgeId");
CREATE INDEX "UserCosmetic_cosmeticId_idx" ON "UserCosmetic"("cosmeticId");
