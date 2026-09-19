INSERT INTO "ScrambledWordsPuzzle" (id, "imageUrl", words, category, status, "createdAt", "updatedAt")
VALUES
  ('demo_beach', '/game-art/friends-challenge.webp', '{بحر,امواج,شاطئ,رمال}', 'تجريبي', 'PUBLISHED', now(), now()),
  ('demo_words', '/game-art/word-code.webp', '{كلمات,مفككة,مباشرة,سباق}', 'تجريبي', 'PUBLISHED', now(), now())
ON CONFLICT (id) DO NOTHING;
