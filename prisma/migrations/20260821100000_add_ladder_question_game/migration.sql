-- Explicit game tag for Ladder on the shared question bank (no duplicate rows).
ALTER TYPE "QuestionGame" ADD VALUE IF NOT EXISTS 'LADDER';
