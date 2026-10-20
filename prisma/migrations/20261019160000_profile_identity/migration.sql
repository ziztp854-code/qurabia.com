-- Nullable additions preserve existing accounts and provider photos.
ALTER TABLE "Profile" ADD COLUMN "username" VARCHAR(24), ADD COLUMN "avatarContent" BYTEA;
CREATE UNIQUE INDEX "Profile_username_key" ON "Profile"("username");
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_username_format" CHECK (
  "username" IS NULL OR "username" ~ '^[a-z0-9_]{3,24}$'
);
