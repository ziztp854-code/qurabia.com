CREATE TABLE "LadderRoom" (
    id TEXT NOT NULL PRIMARY KEY,
    "roomCode" TEXT NOT NULL UNIQUE,
    "hostId" TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "totalRounds" INTEGER NOT NULL DEFAULT 10,
    "rightScore" INTEGER NOT NULL DEFAULT 0,
    "leftScore" INTEGER NOT NULL DEFAULT 0,
    "rightPosition" INTEGER NOT NULL DEFAULT 0,
    "leftPosition" INTEGER NOT NULL DEFAULT 0,
    "winningPosition" INTEGER NOT NULL DEFAULT 10,
    "currentQuestion" TEXT,
    "startedAt" TIMESTAMP,
    "endedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "LadderQuestion" (
    id TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL UNIQUE,
    "questionText" TEXT NOT NULL,
    options JSONB NOT NULL,
    "correctOptionId" TEXT NOT NULL,
    "timeLimit" INTEGER NOT NULL DEFAULT 15,
    "roundNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "LadderTeam" (
    id TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    team TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "LadderTeam_roomId_team_playerName_key" ON "LadderTeam"("roomId", team, "playerName");
CREATE INDEX "LadderRoom_roomCode_status_idx" ON "LadderRoom"("roomCode", status);
CREATE INDEX "LadderQuestion_roomId_idx" ON "LadderQuestion"("roomId");
CREATE INDEX "LadderTeam_roomId_idx" ON "LadderTeam"("roomId");
