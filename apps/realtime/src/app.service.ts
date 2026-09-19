import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    const commit = process.env.RENDER_GIT_COMMIT?.trim().slice(0, 8) || null;

    return {
      commit,
      service: 'tahaddi-realtime',
      status: 'ok',
    } as const;
  }
}
