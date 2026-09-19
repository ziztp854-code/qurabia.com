-- Backfill: existing QUIZ MCQ / true-false questions remain eligible for Ladder
-- without creating duplicate question rows.
UPDATE "Question"
SET "gameTypes" = array_append("gameTypes", 'LADDER'::"QuestionGame")
WHERE "type" IN ('MULTIPLE_CHOICE', 'TRUE_FALSE')
  AND 'QUIZ'::"QuestionGame" = ANY ("gameTypes")
  AND NOT ('LADDER'::"QuestionGame" = ANY ("gameTypes"));
