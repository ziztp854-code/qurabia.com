-- Additive archive. Production application requires separate user approval.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
ALTER TABLE "KingdomWorld" ADD COLUMN "reportsArchived" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "KingdomReportEntry" (
 "worldId" TEXT NOT NULL, "playerId" TEXT NOT NULL, "reportId" VARCHAR(100) NOT NULL,
 "eventAt" TIMESTAMP(3) NOT NULL, "ordinal" INTEGER NOT NULL,
 "category" VARCHAR(20) NOT NULL, "eventKey" VARCHAR(80) NOT NULL,
 "title" VARCHAR(240) NOT NULL, "preview" VARCHAR(400) NOT NULL,
 "searchText" TEXT NOT NULL, "payload" JSONB NOT NULL, "readAt" TIMESTAMP(3),
 CONSTRAINT "KingdomReportEntry_pkey" PRIMARY KEY ("worldId", "playerId", "reportId"),
 CONSTRAINT "KingdomReportEntry_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "KingdomWorld"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "KingdomReportEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "royal_report_timeline_idx" ON "KingdomReportEntry"("worldId", "playerId", "eventAt", "ordinal", "reportId");
CREATE INDEX "royal_report_category_idx" ON "KingdomReportEntry"("worldId", "playerId", "category", "eventAt", "ordinal", "reportId");
CREATE INDEX "royal_report_unread_idx" ON "KingdomReportEntry"("worldId", "playerId", "readAt", "eventAt", "ordinal", "reportId");
CREATE INDEX "royal_report_search_idx" ON "KingdomReportEntry" USING GIN ("searchText" gin_trgm_ops);
