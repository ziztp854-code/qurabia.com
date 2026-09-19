ALTER TABLE "Quiz"
ADD COLUMN "roundName" VARCHAR(160),
ADD COLUMN "presentationMode" VARCHAR(16) NOT NULL DEFAULT 'SEQUENTIAL';

ALTER TABLE "QuizQuestion"
ADD COLUMN "durationOverride" INTEGER,
ADD COLUMN "pointsOverride" INTEGER,
ADD COLUMN "questionVersion" INTEGER;

UPDATE "QuizQuestion" AS quiz_question
SET "questionVersion" = COALESCE(question."version", 1)
FROM "Question" AS question
WHERE question.id = quiz_question."questionId";

ALTER TABLE "QuizQuestion"
ALTER COLUMN "questionVersion" SET NOT NULL;
