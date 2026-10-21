BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

INSERT INTO "ProfileCosmetic" (id, name, description, kind, tier, token, "assetUrl", free, "updatedAt") VALUES
('entrance-owner-sapphire', 'دخول المالك الياقوتي', 'بوابة ملكية ذهبية وكحلية، حصرية لحساب المالك.', 'EFFECT', 'royal', 'royal', '/community-assets/entrance-owner-sapphire.webp', false, CURRENT_TIMESTAMP),
('entrance-amira-rose', 'دخول Amira', 'بوابة ذهب وردي ولؤلؤ، حصرية لحساب Amira.', 'EFFECT', 'royal', 'royal', '/community-assets/entrance-amira-rose.webp', false, CURRENT_TIMESTAMP);

ALTER TABLE "UserCosmetic" ADD CONSTRAINT "UserCosmetic_exclusive_entrances_check" CHECK (
  "cosmeticId" NOT IN ('entrance-owner-sapphire', 'entrance-amira-rose')
  OR ("cosmeticId" = 'entrance-owner-sapphire' AND "userId" = 'cmrw9nc29000004l7a6kkosgy')
  OR ("cosmeticId" = 'entrance-amira-rose' AND "userId" = 'cmrw9rfv9000204l72z55ai5b')
);
ALTER TABLE "ProfileCosmetic" ADD CONSTRAINT "ProfileCosmetic_exclusive_entrances_check" CHECK (
  id NOT IN ('entrance-owner-sapphire', 'entrance-amira-rose') OR (kind = 'EFFECT' AND NOT free)
);

INSERT INTO "UserCosmetic" (id, "userId", "cosmeticId", "grantedBy")
SELECT 'exclusive-' || u.id || '-' || binding.effect_id, u.id, binding.effect_id, 'cmrw9nc29000004l7a6kkosgy'
FROM "User" u JOIN (VALUES
  ('cmrw9nc29000004l7a6kkosgy', 1, 'entrance-owner-sapphire'),
  ('cmrw9rfv9000204l72z55ai5b', 2, 'entrance-amira-rose')
) AS binding(user_id, account_number, effect_id)
ON u.id = binding.user_id AND u."accountNumber" = binding.account_number;

UPDATE "Profile" p SET appearance = jsonb_set(p.appearance, '{effectId}', to_jsonb(binding.effect_id)),
  "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
  ('cmrw9nc29000004l7a6kkosgy', 'entrance-owner-sapphire'::text),
  ('cmrw9rfv9000204l72z55ai5b', 'entrance-amira-rose'::text)
) AS binding(user_id, effect_id)
WHERE p."userId" = binding.user_id;
COMMIT;
