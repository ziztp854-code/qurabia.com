import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { verifyLiveAccessToken } from '@tahaddi/contracts';
import type {
  ClientToServerEvents,
  LiveRole,
  ServerToClientEvents,
} from '@tahaddi/contracts';
import type { Server, Socket } from 'socket.io';
import {
  allowWebSocketOrigin,
  allowWebSocketRequest,
} from '../config/web-origins.js';
import { resolveTokenSecret } from '../config/token-secret.js';
import { GameService, gameRoom, hostRoom, playerRoom } from './game.service.js';
import { getLiveConnectionMetadata } from './connection-metadata.js';
import type { LiveSocketIdentity } from './types.js';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

@WebSocketGateway({
  cors: {
    origin: allowWebSocketOrigin,
    credentials: true,
  },
  allowRequest: allowWebSocketRequest,
  namespace: '/',
})
export class GameGateway
  implements OnGatewayInit<GameServer>, OnGatewayDisconnect<GameSocket>
{
  @WebSocketServer()
  server!: GameServer;

  private readonly identities = new Map<string, LiveSocketIdentity>();

  constructor(
    private readonly gameService: GameService,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: GameServer) {
    this.gameService.setServer(server);
  }

  async handleDisconnect(client: GameSocket) {
    const identity = this.identities.get(client.id);
    this.identities.delete(client.id);
    if (identity) await this.gameService.disconnected(identity, client.id);
  }

  @SubscribeMessage('game:join')
  async handleGameJoin(
    @ConnectedSocket() client: GameSocket,
    @MessageBody()
    payload: {
      sessionId: string;
      subjectId: string;
      accessToken: string;
      role: LiveRole;
    },
  ) {
    if (
      !payload?.sessionId ||
      !payload.subjectId ||
      !payload.accessToken ||
      !['host', 'player'].includes(payload.role)
    ) {
      client.emit('game:error', {
        code: 'INVALID_JOIN',
        message: 'بيانات الانضمام إلى الجلسة غير مكتملة.',
      });
      return;
    }

    const secret = resolveTokenSecret(this.config);
    const identity: LiveSocketIdentity = {
      sessionId: payload.sessionId,
      subjectId: payload.subjectId,
      role: payload.role,
    };
    const validToken = verifyLiveAccessToken(secret, {
      ...identity,
      token: payload.accessToken,
    });
    if (!validToken || !(await this.gameService.validateIdentity(identity))) {
      client.emit('game:error', {
        code: 'JOIN_DENIED',
        message: 'تعذّر التحقق من هوية الجلسة. افتح رابط الغرفة من جديد.',
      });
      return;
    }

    const oldIdentity = this.identities.get(client.id);
    if (oldIdentity) {
      await client.leave(gameRoom(oldIdentity.sessionId));
      await client.leave(hostRoom(oldIdentity.sessionId));
      await client.leave(
        playerRoom(oldIdentity.sessionId, oldIdentity.subjectId),
      );
    }
    this.identities.set(client.id, identity);
    await client.join(gameRoom(identity.sessionId));
    if (identity.role === 'host') {
      await client.join(hostRoom(identity.sessionId));
    } else {
      await client.join(playerRoom(identity.sessionId, identity.subjectId));
    }

    const snapshot = await this.gameService.joined(
      identity,
      getLiveConnectionMetadata(client),
    );
    if (!snapshot) {
      client.emit('game:error', {
        code: 'SESSION_NOT_FOUND',
        message: 'الجلسة غير متاحة.',
      });
      return;
    }
    client.emit('game:snapshot', snapshot);
  }

  @SubscribeMessage('question:start')
  async handleQuestionStart(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { sessionId: string },
  ) {
    const identity = this.requireHost(client, payload?.sessionId);
    if (!identity) return;
    await this.gameService.startQuestion(
      identity.sessionId,
      identity.subjectId,
    );
  }

  @SubscribeMessage('question:next')
  async handleQuestionNext(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { sessionId: string },
  ) {
    const identity = this.requireHost(client, payload?.sessionId);
    if (!identity) return;
    await this.gameService.next(identity.sessionId, identity.subjectId);
  }

  @SubscribeMessage('question:skip')
  async handleQuestionSkip(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { sessionId: string },
  ) {
    const identity = this.requireHost(client, payload?.sessionId);
    if (!identity) return;
    await this.gameService.skip(identity.sessionId, identity.subjectId);
  }

  @SubscribeMessage('question:reveal')
  async handleQuestionReveal(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { sessionId: string; questionId: string },
  ) {
    const identity = this.requireHost(client, payload?.sessionId);
    if (!identity || !payload?.questionId) return;
    await this.gameService.revealQuestion(
      identity.sessionId,
      payload.questionId,
    );
  }

  @SubscribeMessage('answer:submit')
  async handleAnswerSubmit(
    @ConnectedSocket() client: GameSocket,
    @MessageBody()
    payload: { sessionId: string; questionId: string; optionId: string },
  ) {
    const receivedAt = Date.now();
    const identity = this.identities.get(client.id);
    if (
      !identity ||
      identity.role !== 'player' ||
      identity.sessionId !== payload?.sessionId ||
      !payload.questionId ||
      !payload.optionId
    ) {
      client.emit('answer:rejected', {
        questionId: payload?.questionId ?? '',
        reason: 'INVALID_PLAYER',
      });
      return;
    }
    await this.gameService.submitAnswer(identity, client.id, {
      questionId: payload.questionId,
      optionId: payload.optionId,
      receivedAt,
    });
  }

  @SubscribeMessage('game:finish')
  async handleGameFinish(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { sessionId: string },
  ) {
    const identity = this.requireHost(client, payload?.sessionId);
    if (!identity) return;
    await this.gameService.finishGame(identity.sessionId, identity.subjectId);
  }

  @SubscribeMessage('clock:ping')
  handleClockPing(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: { clientSentAt: number },
  ) {
    client.emit('clock:pong', {
      clientSentAt: Number(payload?.clientSentAt) || Date.now(),
      serverTime: Date.now(),
    });
  }

  private requireHost(client: GameSocket, sessionId: string | undefined) {
    const identity = this.identities.get(client.id);
    if (
      !identity ||
      identity.role !== 'host' ||
      identity.sessionId !== sessionId
    ) {
      client.emit('game:error', {
        code: 'HOST_ONLY',
        message: 'هذا الإجراء متاح للمضيف فقط.',
      });
      return null;
    }
    return identity;
  }
}
