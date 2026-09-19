import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MafiaInvestigationDossier } from './mafia-investigation-dossier';

const investigations = [
  {
    id: 'investigation-2',
    round: 2,
    targetId: 'player-2',
    targetName: 'سالم',
    resultIsKiller: true,
    createdAt: '2026-08-10T20:00:00.000Z',
  },
  {
    id: 'investigation-1',
    round: 1,
    targetId: 'player-1',
    targetName: 'ناصر',
    resultIsKiller: false,
    createdAt: '2026-08-10T19:00:00.000Z',
  },
];

describe('MafiaInvestigationDossier', () => {
  it('يعرض النتيجة الأحدث وسجل الجولات بوضوح وخصوصية', () => {
    render(<MafiaInvestigationDossier investigations={investigations} phase="DAY" />);

    expect(screen.getByRole('heading', { name: 'ملف التحقيق السري' })).toBeInTheDocument();
    expect(screen.getAllByText('سالم هو القاتل')).toHaveLength(2);
    expect(screen.getByText('يظهر لك وحدك')).toBeInTheDocument();
    expect(screen.getByText('الجولة 1')).toBeInTheDocument();
    expect(screen.getByText('ناصر ليس القاتل')).toBeInTheDocument();
  });

  it('ينقل تلميحًا محايدًا إلى النقاش عند الطلب', async () => {
    const onPrepareClue = vi.fn();
    render(
      <MafiaInvestigationDossier
        investigations={investigations}
        phase="DAY"
        onPrepareClue={onPrepareClue}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'صياغة تلميح للنقاش' }));
    expect(onPrepareClue).toHaveBeenCalledWith(expect.stringContaining('سالم'));
  });

  it('يعرض حالة فارغة مفهومة قبل أول تحقيق', () => {
    render(<MafiaInvestigationDossier investigations={[]} phase="NIGHT" />);
    expect(screen.getByText(/لم تفتح أي ملف بعد/)).toBeInTheDocument();
  });
});
