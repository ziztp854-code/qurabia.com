BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE;

-- Bind the two user-requested public IDs to verified, immutable account identities.
-- Missing accounts are allowed on clean installations; conflicting identities are not.
DO $$
DECLARE binding RECORD;
BEGIN
  FOR binding IN SELECT * FROM (VALUES
    ('cmrw9rfv9000204l72z55ai5b', 123456800, 2),
    ('cmupvygjx000204jq4bir1i4x', 123456821, 78)
  ) AS reserved(user_id, old_number, new_number) LOOP
    IF EXISTS (SELECT 1 FROM "User"
      WHERE "accountNumber" IN (binding.old_number, binding.new_number)
        AND id <> binding.user_id) THEN
      RAISE EXCEPTION 'Reserved account number belongs to a different account';
    END IF;
    IF EXISTS (SELECT 1 FROM "User" WHERE id = binding.user_id
      AND ("role"::text = 'OWNER'
        OR "accountNumber" NOT IN (binding.old_number, binding.new_number))) THEN
      RAISE EXCEPTION 'Reserved account precondition did not match';
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE "User" DROP CONSTRAINT "User_accountNumber_range_check";

CREATE OR REPLACE FUNCTION assign_user_account_number() RETURNS trigger
LANGUAGE plpgsql AS $$
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
      NEW."accountNumber" := nextval('"User_accountNumber_seq"');
    END IF;
    -- Never reassign compatibility URLs to a different account.
    WHILE NEW."accountNumber" IN (123456800, 123456821) LOOP
      NEW."accountNumber" := nextval('"User_accountNumber_seq"');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE "User" SET "accountNumber" = 2
WHERE id = 'cmrw9rfv9000204l72z55ai5b' AND "accountNumber" = 123456800;
UPDATE "User" SET "accountNumber" = 78
WHERE id = 'cmupvygjx000204jq4bir1i4x' AND "accountNumber" = 123456821;

ALTER TABLE "User" ADD CONSTRAINT "User_accountNumber_range_check"
  CHECK (
    ("role"::text = 'OWNER' AND "accountNumber" = 1)
    OR ("role"::text <> 'OWNER' AND (
      (id = 'cmrw9rfv9000204l72z55ai5b' AND "accountNumber" = 2)
      OR (id = 'cmupvygjx000204jq4bir1i4x' AND "accountNumber" = 78)
      OR (id NOT IN ('cmrw9rfv9000204l72z55ai5b', 'cmupvygjx000204jq4bir1i4x')
        AND "accountNumber" BETWEEN 100000000 AND 999999999
        AND "accountNumber" NOT IN (123456800, 123456821))
    ))
  );
COMMIT;
