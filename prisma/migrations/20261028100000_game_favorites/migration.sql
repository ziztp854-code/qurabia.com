CREATE TABLE "GameFavorite" (
  "userId" TEXT NOT NULL,
  "gameId" VARCHAR(80) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameFavorite_pkey" PRIMARY KEY ("userId", "gameId"),
  CONSTRAINT "GameFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "GameFavorite" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "GameFavorite" FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "GameFavorite" FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
