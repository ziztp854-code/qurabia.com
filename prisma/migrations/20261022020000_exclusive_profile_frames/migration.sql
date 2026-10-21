BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

INSERT INTO "ProfileCosmetic" (id, name, description, kind, tier, token, "assetUrl", free, "updatedAt") VALUES
('frame-owner-sapphire', 'إطار المالك الياقوتي', 'إطار ذهبي مرصّع بالياقوت الأزرق، حصري لحساب المالك.', 'FRAME', 'royal', 'royal', '/community-assets/frame-owner-sapphire.webp', false, CURRENT_TIMESTAMP),
('frame-amira-rose', 'إطار Amira', 'إطار ذهب وردي مرصّع باللؤلؤ والأحجار الوردية، حصري لحساب Amira.', 'FRAME', 'royal', 'royal', '/community-assets/frame-amira-rose.webp', false, CURRENT_TIMESTAMP);

-- Exclusive grants cannot be reassigned through any account-management path.
ALTER TABLE "UserCosmetic" ADD CONSTRAINT "UserCosmetic_exclusive_frames_check" CHECK (
  "cosmeticId" NOT IN ('frame-owner-sapphire', 'frame-amira-rose')
  OR ("cosmeticId" = 'frame-owner-sapphire' AND "userId" = 'cmrw9nc29000004l7a6kkosgy')
  OR ("cosmeticId" = 'frame-amira-rose' AND "userId" = 'cmrw9rfv9000204l72z55ai5b')
);
ALTER TABLE "ProfileCosmetic" ADD CONSTRAINT "ProfileCosmetic_exclusive_frames_check" CHECK (
  id NOT IN ('frame-owner-sapphire', 'frame-amira-rose') OR (kind = 'FRAME' AND NOT free)
);

INSERT INTO "UserCosmetic" (id, "userId", "cosmeticId", "grantedBy")
SELECT 'exclusive-' || u.id || '-' || binding.frame_id, u.id, binding.frame_id, 'cmrw9nc29000004l7a6kkosgy'
FROM "User" u JOIN (VALUES
  ('cmrw9nc29000004l7a6kkosgy', 1, 'frame-owner-sapphire'),
  ('cmrw9rfv9000204l72z55ai5b', 2, 'frame-amira-rose')
) AS binding(user_id, account_number, frame_id)
ON u.id = binding.user_id AND u."accountNumber" = binding.account_number;

-- Equip once; preserve all existing profile data and the other appearance selections.
INSERT INTO "Profile" (id, "userId", "displayName", appearance, "updatedAt")
SELECT 'profile-exclusive-' || u.id, u.id, COALESCE(NULLIF(u.name, ''), 'عضو تحدّي'),
  jsonb_build_object('frameId', binding.frame_id, 'effectId', NULL, 'primaryBadgeId', NULL,
    'nameCardId', NULL, 'backgroundId', NULL, 'glowId', NULL), CURRENT_TIMESTAMP
FROM "User" u JOIN (VALUES
  ('cmrw9nc29000004l7a6kkosgy', 1, 'frame-owner-sapphire'),
  ('cmrw9rfv9000204l72z55ai5b', 2, 'frame-amira-rose')
) AS binding(user_id, account_number, frame_id)
ON u.id = binding.user_id AND u."accountNumber" = binding.account_number
ON CONFLICT ("userId") DO UPDATE SET
  appearance = jsonb_build_object('frameId', NULL, 'effectId', NULL, 'primaryBadgeId', NULL,
    'nameCardId', NULL, 'backgroundId', NULL, 'glowId', NULL)
    || CASE WHEN jsonb_typeof("Profile".appearance) = 'object' THEN "Profile".appearance ELSE '{}'::jsonb END
    || jsonb_build_object('frameId', EXCLUDED.appearance->>'frameId'),
  "updatedAt" = CURRENT_TIMESTAMP;
COMMIT;
