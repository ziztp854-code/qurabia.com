ALTER TABLE "Quiz"
  ADD COLUMN "maxPlayers" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "autoLockAnswers" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "autoAdvance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "speedScoring" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "LiveSession"
  ADD COLUMN "questionStartedAt" TIMESTAMP(3),
  ADD COLUMN "questionAdvanceAt" TIMESTAMP(3);

ALTER TABLE "LiveParticipant"
  ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TYPE "MafiaGameStatus" AS ENUM ('LOBBY', 'NIGHT', 'DAY', 'VOTING', 'FINISHED');
CREATE TYPE "MafiaRole" AS ENUM ('KILLER', 'DETECTIVE', 'DOCTOR', 'GUARD', 'WITNESS', 'CITIZEN');
CREATE TYPE "MafiaPlayerStatus" AS ENUM ('ALIVE', 'ELIMINATED');
CREATE TYPE "MafiaWinner" AS ENUM ('CITIZENS', 'KILLERS');
CREATE TYPE "MafiaMessageChannel" AS ENUM ('PUBLIC', 'KILLERS', 'GHOSTS', 'SYSTEM');
CREATE TYPE "MafiaActionType" AS ENUM ('KILL', 'INVESTIGATE', 'HEAL', 'PROTECT');

CREATE TABLE "MafiaGame" (
  "id" TEXT NOT NULL,
  "hostId" TEXT NOT NULL,
  "roomCode" VARCHAR(8) NOT NULL,
  "status" "MafiaGameStatus" NOT NULL DEFAULT 'LOBBY',
  "winner" "MafiaWinner",
  "currentRound" INTEGER NOT NULL DEFAULT 0,
  "maxPlayers" INTEGER NOT NULL DEFAULT 20,
  "killerCount" INTEGER NOT NULL DEFAULT 1,
  "autoMode" BOOLEAN NOT NULL DEFAULT true,
  "daySeconds" INTEGER NOT NULL DEFAULT 90,
  "nightSeconds" INTEGER NOT NULL DEFAULT 45,
  "votingSeconds" INTEGER NOT NULL DEFAULT 45,
  "chatEnabled" BOOLEAN NOT NULL DEFAULT true,
  "slowModeSeconds" INTEGER NOT NULL DEFAULT 2,
  "phaseEndsAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MafiaGame_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MafiaParticipant" (
  "id" TEXT NOT NULL,
  "accessToken" VARCHAR(64) NOT NULL,
  "gameId" TEXT NOT NULL,
  "displayName" VARCHAR(80) NOT NULL,
  "role" "MafiaRole",
  "status" "MafiaPlayerStatus" NOT NULL DEFAULT 'ALIVE',
  "isMuted" BOOLEAN NOT NULL DEFAULT false,
  "privateNote" VARCHAR(500),
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageAt" TIMESTAMP(3),
  "eliminatedAt" TIMESTAMP(3),
  CONSTRAINT "MafiaParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MafiaMessage" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "participantId" TEXT,
  "channel" "MafiaMessageChannel" NOT NULL DEFAULT 'PUBLIC',
  "body" VARCHAR(280) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MafiaMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MafiaAction" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "round" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "type" "MafiaActionType" NOT NULL,
  "resultIsKiller" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MafiaAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MafiaVote" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "round" INTEGER NOT NULL,
  "voterId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MafiaVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MafiaGame_roomCode_key" ON "MafiaGame"("roomCode");
CREATE INDEX "MafiaGame_hostId_createdAt_idx" ON "MafiaGame"("hostId", "createdAt");
CREATE INDEX "MafiaGame_roomCode_status_idx" ON "MafiaGame"("roomCode", "status");
CREATE UNIQUE INDEX "MafiaParticipant_gameId_displayName_key" ON "MafiaParticipant"("gameId", "displayName");
CREATE UNIQUE INDEX "MafiaParticipant_accessToken_key" ON "MafiaParticipant"("accessToken");
CREATE INDEX "MafiaParticipant_gameId_status_idx" ON "MafiaParticipant"("gameId", "status");
CREATE INDEX "MafiaParticipant_gameId_role_idx" ON "MafiaParticipant"("gameId", "role");
CREATE INDEX "MafiaMessage_gameId_channel_createdAt_idx" ON "MafiaMessage"("gameId", "channel", "createdAt");
CREATE UNIQUE INDEX "MafiaAction_gameId_round_type_actorId_key" ON "MafiaAction"("gameId", "round", "type", "actorId");
CREATE INDEX "MafiaAction_gameId_round_type_idx" ON "MafiaAction"("gameId", "round", "type");
CREATE INDEX "MafiaAction_targetId_idx" ON "MafiaAction"("targetId");
CREATE UNIQUE INDEX "MafiaVote_gameId_round_voterId_key" ON "MafiaVote"("gameId", "round", "voterId");
CREATE INDEX "MafiaVote_gameId_round_targetId_idx" ON "MafiaVote"("gameId", "round", "targetId");

ALTER TABLE "MafiaGame" ADD CONSTRAINT "MafiaGame_hostId_fkey"
  FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MafiaParticipant" ADD CONSTRAINT "MafiaParticipant_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "MafiaGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MafiaMessage" ADD CONSTRAINT "MafiaMessage_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "MafiaGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MafiaMessage" ADD CONSTRAINT "MafiaMessage_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "MafiaParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MafiaAction" ADD CONSTRAINT "MafiaAction_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "MafiaGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MafiaAction" ADD CONSTRAINT "MafiaAction_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "MafiaParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MafiaAction" ADD CONSTRAINT "MafiaAction_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "MafiaParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MafiaVote" ADD CONSTRAINT "MafiaVote_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "MafiaGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MafiaVote" ADD CONSTRAINT "MafiaVote_voterId_fkey"
  FOREIGN KEY ("voterId") REFERENCES "MafiaParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MafiaVote" ADD CONSTRAINT "MafiaVote_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "MafiaParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
