import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/layout', () => ({
  SiteLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/games/ladder/join-ladder', () => ({
  JoinLadder: ({ roomCode }: { roomCode?: string }) => <p>غرفة {roomCode}</p>,
}));

import LadderJoinPage from './page';

describe('LadderJoinPage', () => {
  it('يعرض رمز الغرفة عندما يمرر Next 16 المعاملات كـ Promise', async () => {
    render(await LadderJoinPage({ params: Promise.resolve({ code: 'AB12CD34' }) }));

    expect(screen.getByText('غرفة AB12CD34')).toBeVisible();
  });
});
