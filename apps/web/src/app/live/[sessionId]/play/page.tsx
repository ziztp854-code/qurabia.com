import { redirect } from 'next/navigation';
import { BroadcastLayout } from '@/components/layout';
import { LivePlayerExperience } from '@/components/live';
import { EmptyState } from '@/components/ui';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { verifyPlayerLiveAccessToken } from '@/lib/live/access-token';

export default async function LivePlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ participantId?: string; token?: string }>;
}) {
  const [{ sessionId }, query] = await Promise.all([params, searchParams]);
  const participantId = query.participantId ?? '';
  const accessToken = query.token ?? '';

  if (!hasDatabaseUrl()) redirect('/');

  const validAccess =
    participantId &&
    accessToken &&
    verifyPlayerLiveAccessToken(sessionId, participantId, accessToken);
  const participant = validAccess
    ? await getPrismaClient().liveParticipant.findFirst({
        where: { id: participantId, sessionId },
        select: { id: true, displayName: true },
      })
    : null;

  return (
    <BroadcastLayout>
      <section className="royal-live royal-player-route">
        <div className="container royal-player-route__content">
          {!participant ? (
            <EmptyState
              title="رابط اللاعب غير صالح"
              description="ارجع إلى رابط الدعوة وأدخل اسمك للانضمام من جديد."
            />
          ) : (
            <LivePlayerExperience
              sessionId={sessionId}
              participantId={participant.id}
              accessToken={accessToken}
              displayName={participant.displayName}
            />
          )}
        </div>
      </section>
    </BroadcastLayout>
  );
}
