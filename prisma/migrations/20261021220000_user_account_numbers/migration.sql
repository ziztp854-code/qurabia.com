BEGIN;

-- The reserved account number must identify a single platform owner.
DO $$
BEGIN
  IF (SELECT count(*) FROM "User" WHERE "role"::text = 'OWNER') > 1 THEN
    RAISE EXCEPTION 'Account numbering requires a single platform owner';
  END IF;
END;
$$;

-- Start with nine readable digits, avoiding zero-padded account identifiers.
CREATE SEQUENCE "User_accountNumber_seq"
  AS INTEGER MINVALUE 100000000 MAXVALUE 999999999 START WITH 123456789 NO CYCLE;

ALTER TABLE "User" ADD COLUMN "accountNumber" INTEGER
  NOT NULL DEFAULT nextval('"User_accountNumber_seq"');
ALTER SEQUENCE "User_accountNumber_seq" OWNED BY "User"."accountNumber";

UPDATE "User" SET "accountNumber" = 1 WHERE "role"::text = 'OWNER';

CREATE UNIQUE INDEX "User_accountNumber_key" ON "User"("accountNumber");
ALTER TABLE "User" ADD CONSTRAINT "User_accountNumber_range_check"
  CHECK (
    ("role"::text = 'OWNER' AND "accountNumber" = 1)
    OR ("role"::text <> 'OWNER' AND "accountNumber" BETWEEN 100000000 AND 999999999)
  );

-- Covers credentials, OAuth, seeds and any other account creation path.
-- Existing account numbers remain immutable except when ownership changes.
CREATE FUNCTION assign_user_account_number() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."accountNumber" IS DISTINCT FROM OLD."accountNumber" THEN
      RAISE EXCEPTION 'Account numbers cannot be changed';
    END IF;
  END IF;

  IF NEW."role"::text = 'OWNER' THEN
    NEW."accountNumber" := 1;
  ELSIF NEW."accountNumber" = 1 THEN
    NEW."accountNumber" := nextval('"User_accountNumber_seq"');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "User_assign_account_number"
  BEFORE INSERT OR UPDATE ON "User"
  FOR EACH ROW EXECUTE FUNCTION assign_user_account_number();

COMMIT;
