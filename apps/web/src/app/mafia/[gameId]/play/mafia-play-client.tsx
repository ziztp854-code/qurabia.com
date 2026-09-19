'use client';

import { useSearchParams } from 'next/navigation';
import { type FormEvent, useRef, useState, useTransition } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import {
  MafiaInvestigationDossier,
  MafiaPhaseHeader,
  MafiaPlayerPicker,
  MafiaPrimaryTask,
  MafiaRoleReveal,
  MafiaSecretPanel,
  MafiaVotePanel,
} from '@/components/mafia';
import { sendMafiaMessage, submitMafiaAction, submitMafiaVote } from '@/app/mafia/actions';
import { RoomPoller } from '@/components/live';
import { Badge, Button, Card } from '@/components/ui';
import { type MafiaPhaseName } from '@/lib/mafia/guidance';
import { type MafiaRoleName } from '@/lib/mafia/rules';
import { getInvestigatedTargetIds, type MafiaInvestigationRecord } from '@/lib/mafia/investigation';
import { cn } from '@/lib/utils';

interface GameData {
  id: string;
  currentRound: number;
  phaseEndsAt: string | null;
  autoMode: boolean;
  chatEnabled: boolean;
  messages: Array<{
    id: string;
    channel: string;
    body: string;
    createdAt: Date;
    participant?: { displayName: string } | null;
  }>;
  participants: Array<{
    id: string;
    displayName: string;
    status: string;
    role?: string | null;
    privateNote?: string | null;
  }>;
}

interface PlayerData {
  id: string;
  displayName: string;
  role: string | null;
  status: string;
  isMuted: boolean;
  privateNote: string | null;
}

interface NightTarget {
  id: string;
  displayName: string;
}

function MafiaPlayClient({
  game,
  player,
  phase,
  role,
  phaseDuration,
  nightTargets = [],
  voteTargets = [],
  investigations = [],
}: {
  game: GameData;
  player: PlayerData;
  phase: MafiaPhaseName;
  role: MafiaRoleName | null;
  phaseDuration: number | null;
  nightTargets: NightTarget[];
  voteTargets: NightTarget[];
  investigations: MafiaInvestigationRecord[];
}) {
  const searchParams = useSearchParams();
  const shouldReveal = searchParams.get('reveal') === '1';
  const [roleRevealed, setRoleRevealed] = useState(!shouldReveal);
  const currentInvestigation = investigations.find(
    (investigation) => investigation.round === game.currentRound,
  );
  const [submittedNightRound, setSubmittedNightRound] = useState<number | null>(
    currentInvestigation ? game.currentRound : null,
  );
  const [nightSelection, setNightSelection] = useState<{
    round: number;
    targetId: string | null;
    error: string | null;
  }>({ round: game.currentRound, targetId: null, error: null });
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [nightPending, startNightTransition] = useTransition();
  const [chatPending, startChatTransition] = useTransition();
  const nightSubmitted = submittedNightRound === game.currentRound || Boolean(currentInvestigation);
  const selectedNightTargetId =
    nightSelection.round === game.currentRound ? nightSelection.targetId : null;
  const nightError = nightSelection.round === game.currentRound ? nightSelection.error : null;

  const nightActionRole = role && ['KILLER', 'DETECTIVE', 'DOCTOR', 'GUARD'].includes(role);
  const actionType =
    role === 'KILLER'
      ? 'KILL'
      : role === 'DETECTIVE'
        ? 'INVESTIGATE'
        : role === 'DOCTOR'
          ? 'HEAL'
          : 'PROTECT';

  const handleNightSubmit = () => {
    if (!selectedNightTargetId) return;
    const data = new FormData();
    data.append('gameId', game.id);
    data.append('participantId', player.id);
    data.append('targetId', selectedNightTargetId);
    data.append('type', actionType);
    setNightSelection({ round: game.currentRound, targetId: selectedNightTargetId, error: null });
    startNightTransition(async () => {
      const accepted = await submitMafiaAction(data);
      if (accepted) {
        setSubmittedNightRound(game.currentRound);
        setNightSelection({ round: game.currentRound, targetId: null, error: null });
        return;
      }
      setNightSelection({
        round: game.currentRound,
        targetId: selectedNightTargetId,
        error: 'تعذر تثبيت القرار. حدّث الصفحة واختر لاعبًا متاحًا.',
      });
    });
  };

  const canSendMessage =
    game.chatEnabled &&
    !player.isMuted &&
    (player.status === 'ELIMINATED' || phase !== 'NIGHT' || role === 'KILLER');

  const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = chatDraft.trim();
    if (!body || !canSendMessage) return;
    const data = new FormData();
    data.append('gameId', game.id);
    data.append('participantId', player.id);
    data.append('body', body);
    startChatTransition(async () => {
      await sendMafiaMessage(data);
      setChatDraft('');
    });
  };

  const prepareDiscussionClue = (hint: string) => {
    setChatDraft(hint);
    requestAnimationFrame(() => chatInputRef.current?.focus());
  };

  const handleVoteSubmit = (targetId: string) => {
    const data = new FormData();
    data.append('gameId', game.id);
    data.append('participantId', player.id);
    data.append('targetId', targetId);
    submitMafiaVote(data);
    setVoteSubmitted(true);
  };

  const channelLabel =
    player.status === 'ELIMINATED'
      ? 'قناة المستبعدين'
      : phase === 'NIGHT' && role === 'KILLER'
        ? 'قناة القتلة السرية'
        : 'النقاش العام';

  if (!roleRevealed && role) {
    return (
      <div className="mafia-game-shell">
        <MafiaRoleReveal role={role} onRevealed={() => setRoleRevealed(true)} />
      </div>
    );
  }

  return (
    <div className="mafia-game-shell">
      <MafiaPhaseHeader
        phase={phase}
        currentRound={game.currentRound}
        phaseEndsAt={game.phaseEndsAt}
        durationSeconds={phaseDuration}
        autoMode={game.autoMode}
        tickEndpoint={`/api/mafia/${game.id}/tick`}
        participantId={player.id}
      />

      {player.status === 'ELIMINATED' && (
        <div className="mafia-eliminated-banner">
          <h2>خرجت من الجولة</h2>
          <p>اللعبة مستمرة. يمكنك متابعة الأحداث من قناة المستبعدين.</p>
        </div>
      )}

      <MafiaPrimaryTask phase={phase} role={role} playerStatus={player.status}>
        {phase === 'NIGHT' && nightActionRole && !nightSubmitted && (
          <>
            <MafiaPlayerPicker
              players={nightTargets}
              selectedId={selectedNightTargetId}
              onSelect={(targetId) =>
                setNightSelection({ round: game.currentRound, targetId, error: null })
              }
              disabledIds={role === 'DETECTIVE' ? getInvestigatedTargetIds(investigations) : []}
              disabledLabel={role === 'DETECTIVE' ? 'تم التحقيق سابقًا' : undefined}
              placeholder={
                role === 'KILLER' ? 'اختر الضحية' : role === 'DETECTIVE' ? 'تحقق من' : 'احمِ'
              }
            />
            <div className="mafia-night-confirmation">
              {selectedNightTargetId && role === 'DETECTIVE' && (
                <p>بعد التثبيت ستظهر النتيجة لك وحدك، ولن تتمكن من تغيير الهدف.</p>
              )}
              <Button
                type="button"
                className="mafia-confirm-btn"
                variant={role === 'DETECTIVE' ? 'gold' : 'primary'}
                disabled={!selectedNightTargetId}
                loading={nightPending}
                onClick={handleNightSubmit}
              >
                {role === 'DETECTIVE' ? 'تثبيت التحقيق وكشف النتيجة' : 'تثبيت قرار الليل'}
              </Button>
              {nightError && (
                <p className="mafia-action-error" role="alert">
                  {nightError}
                </p>
              )}
            </div>
          </>
        )}
        {phase === 'NIGHT' && nightActionRole && nightSubmitted && (
          <p className="mafia-night-locked" role="status">
            {role === 'DETECTIVE'
              ? 'أُغلق ملف هذه الليلة. نتيجتك في الملف السري.'
              : 'تم تسجيل قرار الليل'}
          </p>
        )}
        {phase === 'NIGHT' && !nightActionRole && (
          <p className="mafia-text-muted">أغمض عينيك وانتظر انتهاء قرارات الليل.</p>
        )}
        {phase === 'VOTING' && player.status === 'ALIVE' && (
          <MafiaVotePanel
            players={voteTargets}
            onSubmit={handleVoteSubmit}
            disabled={voteSubmitted}
          />
        )}
        {phase === 'DAY' && player.status === 'ALIVE' && (
          <p className="mafia-text-muted">ناقش الأدلة في القناة العامة قبل فتح التصويت.</p>
        )}
      </MafiaPrimaryTask>

      <MafiaSecretPanel
        role={role}
        privateNote={role === 'DETECTIVE' && investigations.length > 0 ? null : player.privateNote}
      />

      {role === 'DETECTIVE' && (
        <MafiaInvestigationDossier
          investigations={investigations}
          phase={phase}
          onPrepareClue={canSendMessage ? prepareDiscussionClue : undefined}
        />
      )}

      <Card className="mafia-chat-card">
        <div className="mafia-card-header">
          <h2>
            <MessageCircle aria-hidden="true" />
            {channelLabel}
          </h2>
          <Badge>{game.chatEnabled ? 'مفتوحة' : 'للقراءة فقط'}</Badge>
        </div>
        <div className="mafia-card-body">
          <div className="mafia-messages" role="log" aria-label="الرسائل">
            {game.messages.length === 0 && (
              <p className="mafia-chat-empty">لا توجد رسائل بعد. ابدأ النقاش عندما تفتح القناة.</p>
            )}
            {game.messages?.map((message) => {
              const isSystem = message.channel === 'SYSTEM';
              const isKillers = message.channel === 'KILLERS';
              const isGhosts = message.channel === 'GHOSTS';
              return (
                <div
                  key={message.id}
                  className={cn(
                    'mafia-chat-message',
                    isSystem && 'mafia-chat-message-system',
                    isKillers && 'mafia-chat-message-killers',
                    isGhosts && 'mafia-chat-message-ghosts',
                  )}
                >
                  <div className="mafia-chat-message-head">
                    <span className="mafia-chat-message-author">
                      {message.participant?.displayName ?? 'النظام'}
                    </span>
                    <span className="mafia-chat-message-time">
                      {new Date(message.createdAt).toLocaleTimeString('ar-SA-u-nu-latn', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {!isSystem && message.channel !== 'PUBLIC' && (
                      <span className="mafia-chat-message-channel">
                        {isKillers ? '🔒 قناة القتلة' : 'قناة المستبعدين'}
                      </span>
                    )}
                  </div>
                  <p className="mafia-chat-message-body">{message.body}</p>
                </div>
              );
            })}
          </div>
          <form className="mafia-chat-form" onSubmit={handleChatSubmit}>
            <label className="mafia-sr-only" htmlFor="mafia-chat-input">
              اكتب رسالة
            </label>
            <input
              ref={chatInputRef}
              id="mafia-chat-input"
              type="text"
              maxLength={280}
              value={chatDraft}
              disabled={!canSendMessage || chatPending}
              placeholder={
                player.isMuted
                  ? 'تم كتمك بواسطة المضيف'
                  : canSendMessage
                    ? 'اكتب رسالتك…'
                    : 'القناة للقراءة فقط الآن'
              }
              onChange={(event) => setChatDraft(event.target.value)}
            />
            <Button
              type="submit"
              size="icon"
              loading={chatPending}
              disabled={!canSendMessage || !chatDraft.trim()}
              aria-label="إرسال الرسالة"
            >
              <Send aria-hidden="true" />
            </Button>
          </form>
        </div>
      </Card>

      <RoomPoller endpoint={`/api/mafia/${game.id}/tick`} participantId={player.id} />
    </div>
  );
}

export { MafiaPlayClient };
