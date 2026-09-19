import { MessageCircle, Play, SkipForward, Users, Volume2, VolumeX } from 'lucide-react';
import { notFound } from 'next/navigation';
import {
  advanceMafiaPhase,
  deleteMafiaMessage,
  startMafiaGame,
  toggleMafiaChat,
} from '@/app/mafia/actions';
import { SiteLayout } from '@/components/layout';
import { RoomPoller } from '@/components/live';
import { MafiaLobbyPlayer, MafiaPhaseHeader } from '@/components/mafia';
import { RoomCode } from '@/components/quiz';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { cn, formatNumber } from '@/lib/utils';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requireActiveUser } from '@/lib/auth/session';
import { mafiaPhaseGuides, type MafiaPhaseName } from '@/lib/mafia/guidance';
import { mafiaPhaseLabels } from '@/lib/mafia/rules';
import { filterMessagesForHost } from '@/lib/mafia/security-filter';

export default async function MafiaHostPage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ gameId }, query, user] = await Promise.all([
    params,
    searchParams,
    requireActiveUser('/mafia'),
  ]);
  const game = await getPrismaClient().mafiaGame.findFirst({
    where: { id: gameId, hostId: user.id },
    select: {
      id: true,
      roomCode: true,
      status: true,
      winner: true,
      currentRound: true,
      autoMode: true,
      chatEnabled: true,
      phaseEndsAt: true,
      daySeconds: true,
      nightSeconds: true,
      votingSeconds: true,
      maxPlayers: true,
      killerCount: true,
      participants: {
        orderBy: { joinedAt: 'asc' },
        select: { id: true, displayName: true, role: true, status: true, isMuted: true },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          body: true,
          channel: true,
          createdAt: true,
          participant: { select: { displayName: true } },
        },
      },
    },
  });
  if (!game) notFound();
  const phase = game.status as MafiaPhaseName;
  const phaseDuration =
    game.status === 'NIGHT'
      ? game.nightSeconds
      : game.status === 'DAY'
        ? game.daySeconds
        : game.status === 'VOTING'
          ? game.votingSeconds
          : null;

  const phaseGuide = mafiaPhaseGuides[phase];

  const hostParticipants = game.participants.map((participant) => ({
    id: participant.id,
    displayName: participant.displayName,
    status: participant.status,
    isMuted: participant.isMuted,
    role: participant.role,
  }));

  const hostMessages = filterMessagesForHost(game.messages);

  return (
    <SiteLayout user={{ name: user.name, role: user.role }}>
      <main className="section mafia-page mafia-surface-lobby">
        <div className="container mafia-game-shell">
          {game.status !== 'FINISHED' && <RoomPoller endpoint={`/api/mafia/${game.id}/tick`} />}

          <MafiaPhaseHeader
            phase={phase}
            currentRound={game.currentRound}
            phaseEndsAt={game.phaseEndsAt?.toISOString() ?? null}
            durationSeconds={phaseDuration}
            autoMode={game.autoMode}
            tickEndpoint={`/api/mafia/${game.id}/tick`}
          />

          <div className="mafia-lobby-room-row">
            <div className="mafia-room-code-block">
              <span className="mafia-room-code" aria-label="رمز الغرفة">
                {game.roomCode}
              </span>
              <RoomCode code={game.roomCode} url={`/join/${game.roomCode}`} />
            </div>
            <Badge className="mafia-phase-badge mafia-phase-badge-lobby">
              {mafiaPhaseLabels[game.status]}
            </Badge>
          </div>

          {query.error === 'players' && (
            <p className="text-danger" role="alert">
              تحتاج اللعبة إلى خمسة لاعبين على الأقل قبل البدء.
            </p>
          )}

          {game.status === 'LOBBY' && (
            <div className="mafia-lobby-composition">
              <div className="mafia-composition-header">
                <h3>التكوين المتوقع</h3>
              </div>
              <div className="mafia-composition-roles">
                {Array.from({ length: game.killerCount }).map((_, i) => (
                  <span key={`k-${i}`} className="mafia-role-chip mafia-role-chip-killer">
                    قاتل
                  </span>
                ))}
                <span className="mafia-role-chip mafia-role-chip-special">محقق</span>
                <span className="mafia-role-chip mafia-role-chip-special">طبيب</span>
                {game.maxPlayers >= 7 && (
                  <span className="mafia-role-chip mafia-role-chip-special">حارس</span>
                )}
                {game.maxPlayers >= 8 && (
                  <span className="mafia-role-chip mafia-role-chip-special">شاهد</span>
                )}
                <span className="mafia-role-chip mafia-role-chip-civilian">
                  {game.maxPlayers -
                    game.killerCount -
                    (game.maxPlayers >= 7 ? 3 : 2) -
                    (game.maxPlayers >= 8 ? 1 : 0)}{' '}
                  مواطن
                </span>
              </div>
            </div>
          )}

          <Card className="mafia-lobby-players-card">
            <div className="mafia-card-header">
              <h2>
                <Users aria-hidden="true" />
                اللاعبون
              </h2>
              <Badge>
                {formatNumber(game.participants.length)} /{' '}
                {formatNumber(game.maxPlayers)}
              </Badge>
            </div>
            <div className="mafia-card-body">
              {game.participants.length ? (
                <div className="mafia-player-grid">
                  {hostParticipants.map((participant) => (
                    <MafiaLobbyPlayer
                      key={participant.id}
                      showRole={game.status !== 'LOBBY'}
                      participant={{
                        id: participant.id,
                        displayName: participant.displayName,
                        role: participant.role,
                        status: participant.status,
                        isMuted: participant.isMuted,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="بانتظار اللاعبين"
                  description="شارك الرمز أو رمز QR حتى ينضم خمسة لاعبين على الأقل."
                />
              )}
            </div>
          </Card>

          {game.status === 'LOBBY' && (
            <form action={startMafiaGame} className="mafia-start-form">
              <input type="hidden" name="gameId" value={game.id} />
              <Button type="submit" size="lg" fullWidth disabled={game.participants.length < 5}>
                <Play aria-hidden="true" />
                بدء اللعبة
                {game.participants.length < 5 && (
                  <span className="mafia-start-hint">(تحتاج 5 لاعبين على الأقل)</span>
                )}
              </Button>
            </form>
          )}

          {game.status !== 'LOBBY' && game.status !== 'FINISHED' && (
            <Card className="mafia-host-controls-card">
              <div className="mafia-card-header">
                <h2>التحكم في المرحلة</h2>
                <Badge>{mafiaPhaseLabels[game.status]}</Badge>
              </div>
              <div className="mafia-card-body">
                <p className="mafia-text-muted">{phaseGuide.summary}</p>
                <div className="mafia-host-task">
                  <strong>مهمتك</strong>
                  <p>{phaseGuide.hostTask}</p>
                  <span>التالي: {phaseGuide.next}</span>
                </div>
                <form action={advanceMafiaPhase} className="mafia-host-actions">
                  <input type="hidden" name="gameId" value={game.id} />
                  <Button type="submit" variant="secondary" fullWidth>
                    <SkipForward aria-hidden="true" />
                    المرحلة التالية الآن
                  </Button>
                </form>
                <form action={toggleMafiaChat} className="mafia-host-actions">
                  <input type="hidden" name="gameId" value={game.id} />
                  <input type="hidden" name="enabled" value={String(!game.chatEnabled)} />
                  <Button type="submit" variant="outline" fullWidth>
                    {game.chatEnabled ? (
                      <VolumeX aria-hidden="true" />
                    ) : (
                      <Volume2 aria-hidden="true" />
                    )}
                    {game.chatEnabled ? 'إيقاف الدردشة' : 'تشغيل الدردشة'}
                  </Button>
                </form>
              </div>
            </Card>
          )}

          {game.status === 'FINISHED' && (
            <Card className="mafia-finished-card">
              <div className="mafia-card-body" style={{ textAlign: 'center' }}>
                <Badge className="mafia-phase-badge mafia-phase-badge-finished">انتهت اللعبة</Badge>
                <h2 style={{ margin: 'var(--space-3) 0 0' }}>
                  الفائز: {game.winner === 'KILLERS' ? 'القتلة' : 'المواطنون'}
                </h2>
              </div>
            </Card>
          )}

          <Card className="mafia-chat-card">
            <div className="mafia-card-header">
              <h2>
                <MessageCircle aria-hidden="true" />
                سجل الغرفة
              </h2>
              <Badge>{game.chatEnabled ? 'الدردشة مفعلة' : 'متوقفة'}</Badge>
            </div>
            <div className="mafia-card-body">
              <div className="mafia-messages" role="log" aria-label="سجل الرسائل">
                {[...hostMessages].reverse().map((message) => (
                  <div
                    className={cn(
                      'mafia-chat-message',
                      message.channel === 'SYSTEM' && 'mafia-chat-message-system',
                      message.channel === 'KILLERS' && 'mafia-chat-message-killers',
                      message.channel === 'GHOSTS' && 'mafia-chat-message-ghosts',
                    )}
                    key={message.id}
                  >
                    <div className="mafia-chat-message-head">
                      <span className="mafia-chat-message-author">
                        {message.participant?.displayName ?? 'النظام'}
                      </span>
                      <span className="mafia-chat-message-time">
                        {message.createdAt.toLocaleTimeString('ar-SA-u-nu-latn', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {message.channel !== 'PUBLIC' && message.channel !== 'SYSTEM' && (
                        <span className="mafia-chat-message-channel">
                          {message.channel === 'KILLERS' ? 'قناة القتلة' : 'قناة المستبعدين'}
                        </span>
                      )}
                    </div>
                    <p className="mafia-chat-message-body">{message.body}</p>
                    <form
                      action={deleteMafiaMessage}
                      style={{ marginBlockStart: 'var(--space-2)' }}
                    >
                      <input type="hidden" name="gameId" value={game.id} />
                      <input type="hidden" name="messageId" value={message.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        حذف
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </main>
    </SiteLayout>
  );
}
