import { formatNumber } from '@/lib/utils';
import { Moon, Shield, Users } from 'lucide-react';
import { createMafiaGame } from '@/app/mafia/actions';
import { GameContentGenerator } from '@/components/games/game-content-generator';
import { GAME_GUIDES, GameHowTo } from '@/components/games/shared';
import { JoinQuizForm } from '@/components/home/join-quiz-form';
import { SiteLayout } from '@/components/layout';
import { MafiaGameSettings } from '@/components/mafia/mafia-game-settings';
import { Badge, Button, ButtonLink, Card, EmptyState } from '@/components/ui';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { getCurrentSession } from '@/lib/auth/session';
import { buildPublicPageMetadata } from '@/lib/metadata/site';

export const metadata = buildPublicPageMetadata({
  path: '/mafia',
  title: 'لعبة القاتل الجماعية | تحدّي',
  description:
    'العب لعبة القاتل العربية مع أصدقائك بأدوار سرية وإدارة تلقائية أو يدوية، وادخل مباشرة باستخدام رمز الغرفة.',
});

export default async function MafiaPage() {
  const session = await getCurrentSession();
  let games: Array<{
    id: string;
    roomCode: string;
    status: string;
    _count: { participants: number };
  }> = [];
  if (session?.user?.id && hasDatabaseUrl()) {
    try {
      games = await getPrismaClient().mafiaGame.findMany({
        where: { hostId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          roomCode: true,
          status: true,
          _count: { select: { participants: true } },
        },
      });
    } catch {
      // history is optional
    }
  }

  return (
    <SiteLayout user={session?.user ? { name: session.user.name, role: session.user.role } : null}>
      <main className="section mafia-page mafia-surface-lobby">
        <div className="container">
          <div className="mafia-landing-hero">
            <span className="eyebrow">
              <Moon aria-hidden="true" />
              لعبة اجتماعية سرية
            </span>
            <h1>القاتل</h1>
            <p className="mafia-landing-tagline">كل كلمة قد تكون دليلاً.</p>
            <p className="mafia-landing-desc">
              لعبة اجتماعية سرية بإدارة آلية أو يدوية، وأدوار لا يراها إلا أصحابها.
            </p>
          </div>

          <GameHowTo guide={GAME_GUIDES.mafia} />

          <section className="mafia-create-section" aria-labelledby="mafia-create-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  <Shield aria-hidden="true" />
                  أنشئ ليلتك
                </span>
                <h2 id="mafia-create-title">اختر أسلوب المباراة وسنضبط التفاصيل لك</h2>
              </div>
            </div>

            <div className="card-grid two mafia-entry-grid">
              <Card>
                <Badge>للاعب</Badge>
                <h2>ادخل برمز الغرفة</h2>
                <p className="muted">لا تحتاج إلى حساب. الاسم والرمز يكفيان.</p>
                <JoinQuizForm inviteMode />
              </Card>

              <Card>
                <Badge className="badge-live">للمضيف</Badge>
                <h2>أنشئ غرفة قاتل</h2>
                {session?.user ? (
                  <form action={createMafiaGame} className="stack-form" id="mafia-create-form">
                    <MafiaGameSettings />

                    <GameContentGenerator game="mafia" hiddenInputName="aiScenario" />

                    <Button type="submit" size="lg" fullWidth>
                      <Shield aria-hidden="true" />
                      إنشاء الغرفة
                    </Button>
                  </form>
                ) : (
                  <>
                    <EmptyState
                      title="سجّل دخولك كمضيف"
                      description="اللاعب يدخل كزائر، أما إنشاء الغرفة وإدارتها فيحتاجان حسابًا."
                    />
                    <div className="center-actions">
                      <ButtonLink href="/auth/sign-in?next=%2Fmafia">تسجيل الدخول</ButtonLink>
                    </div>
                  </>
                )}
              </Card>
            </div>
          </section>

          {games.length > 0 && (
            <section className="mafia-history">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    <Users aria-hidden="true" />
                    غرفك الأخيرة
                  </span>
                  <h2>متابعة وإدارة</h2>
                </div>
              </div>
              <div className="card-grid three">
                {games.map((game) => (
                  <Card key={game.id}>
                    <div className="inline-between">
                      <Badge>{game.roomCode}</Badge>
                      <span className="muted">
                        {formatNumber(game._count.participants)} لاعب
                      </span>
                    </div>
                    <h3>{game.status === 'FINISHED' ? 'لعبة منتهية' : 'غرفة قابلة للمتابعة'}</h3>
                    <ButtonLink href={`/mafia/${game.id}`} variant="outline">
                      فتح لوحة المضيف
                    </ButtonLink>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </SiteLayout>
  );
}
