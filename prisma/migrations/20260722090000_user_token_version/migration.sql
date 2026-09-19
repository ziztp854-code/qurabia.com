ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_user_token_version_on_sensitive_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."role" IS DISTINCT FROM OLD."role"
    OR NEW."passwordHash" IS DISTINCT FROM OLD."passwordHash"
  THEN
    NEW."tokenVersion" := OLD."tokenVersion" + 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "User_increment_token_version" ON "User";

CREATE TRIGGER "User_increment_token_version"
BEFORE UPDATE ON "User"
FOR EACH ROW
EXECUTE FUNCTION increment_user_token_version_on_sensitive_change();
