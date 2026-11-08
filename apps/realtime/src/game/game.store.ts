import { Injectable } from '@nestjs/common';
import { RedisService } from '../infrastructure/redis.service.js';
import type { LiveGameState } from './types.js';

const GAME_TTL_SECONDS = 3 * 60 * 60;
const TRANSITION_LOCK_SECONDS = 8;

@Injectable()
export class GameStore {
  constructor(private readonly redis: RedisService) {}
  private get client() {
    return this.redis.getClient();
  }

  private stateKey(sessionId: string) {
    return `live:${sessionId}:state`;
  }

  private transitionKey(sessionId: string) {
    return `live:${sessionId}:transition`;
  }

  async saveGameState(state: LiveGameState): Promise<boolean> {
    // Redis is a projection. A delayed publisher must never replace a newer
    // question/phase or resurrect a terminal session.
    const result = await this.client.eval(
      `
        local raw = redis.call("GET", KEYS[1])
        local incoming = cjson.decode(ARGV[1])
        if raw then
          local current = cjson.decode(raw)
          local rank = { LOBBY = 0, QUESTION = 1, REVEAL = 2, LEADERBOARD = 3, FINISHED = 4 }
          if current.phase == "FINISHED" and incoming.phase ~= "FINISHED" then return 0 end
          if incoming.phase ~= "FINISHED" then
            if current.currentQuestionPosition > incoming.currentQuestionPosition then return 0 end
            if current.currentQuestionPosition == incoming.currentQuestionPosition then
              local oldStart = tonumber(current.questionStartedAt) or 0
              local newStart = tonumber(incoming.questionStartedAt) or 0
              if oldStart > newStart then return 0 end
              if oldStart == newStart and rank[current.phase] > rank[incoming.phase] then return 0 end
            end
          end
        end
        redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
        return 1
      `,
      1,
      this.stateKey(state.sessionId),
      JSON.stringify(state),
      GAME_TTL_SECONDS,
    );
    return Number(result) === 1;
  }

  async loadGameState(sessionId: string): Promise<LiveGameState | null> {
    const raw = await this.client.get(this.stateKey(sessionId));
    return raw ? (JSON.parse(raw) as LiveGameState) : null;
  }

  async acquireTransition(sessionId: string, token: string) {
    const result = await this.client.set(
      this.transitionKey(sessionId),
      token,
      'EX',
      TRANSITION_LOCK_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  async releaseTransition(sessionId: string, token: string) {
    await this.client.eval(
      `if redis.call("GET", KEYS[1]) == ARGV[1] then
         return redis.call("DEL", KEYS[1])
       end
       return 0`,
      1,
      this.transitionKey(sessionId),
      token,
    );
  }

  async deleteGameState(sessionId: string) {
    await this.client.del(
      this.stateKey(sessionId),
      this.transitionKey(sessionId),
    );
  }
}
