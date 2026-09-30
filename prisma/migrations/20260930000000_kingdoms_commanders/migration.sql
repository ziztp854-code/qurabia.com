-- Additive aggregate backfill only. Preserve players, villages, troops, movements,
-- resources, configuration and nextEventAt. Existing commander records are untouched.
-- New and old application versions can both read the extra optional JSON key.
UPDATE "KingdomWorld"
SET "state" = jsonb_set("state"::jsonb, '{commanders}', '{}'::jsonb, true),
    "revision" = "revision" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE jsonb_typeof("state"::jsonb) = 'object'
  AND NOT ("state"::jsonb ? 'commanders');
