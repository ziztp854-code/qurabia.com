import type { Metadata } from 'next';
import {
  CinematicQuizPreview,
  type CinematicQuizScreen,
} from '../../../components/live/cinematic-quiz-experience';

export const metadata: Metadata = {
  title: 'معاينة رحلة المضيف السينمائية | تحدّي',
};

const screens = new Set<CinematicQuizScreen>([
  'host',
  'lobby',
  'question',
  'reveal',
  'leaderboard',
  'finale',
]);

export default async function HostJourneyPreview({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string }>;
}) {
  const requested = (await searchParams).screen as CinematicQuizScreen | undefined;
  const initialScreen = requested && screens.has(requested) ? requested : 'host';

  return <CinematicQuizPreview initialScreen={initialScreen} />;
}
