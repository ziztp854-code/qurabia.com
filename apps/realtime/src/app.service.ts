import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    const rawCommit =
      process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.RENDER_GIT_COMMIT;
    const commit =
      rawCommit && /^[0-9a-f]{7,40}$/i.test(rawCommit.trim())
        ? rawCommit.trim().slice(0, 8)
        : null;

    return {
      commit,
      service: 'tahaddi-realtime',
      status: 'ok',
    } as const;
  }
}
