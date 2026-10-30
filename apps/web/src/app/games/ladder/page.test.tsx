import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LadderPage from './page';

vi.mock('@/components/layout', () => ({ SiteLayout: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/games/ladder/ladder-room', () => ({
  LadderRoom: ({ initialRoomCode, initialPlayerName, initialTeam }: {
    initialRoomCode?: string; initialPlayerName?: string; initialTeam?: string;
  }) => <p>{JSON.stringify({ initialRoomCode, initialPlayerName, initialTeam })}</p>,
}));

describe('ladder invitation page', () => {
  it('passes the room, name, and selected team from the invitation', async () => {
    render(await LadderPage({ searchParams: Promise.resolve({ room: 'AB12CD34', name: ' لاعب ', team: 'left' }) }));
    expect(screen.getByText('{"initialRoomCode":"AB12CD34","initialPlayerName":"لاعب","initialTeam":"left"}')).toBeInTheDocument();
  });

  it('rejects an unrecognized team', async () => {
    render(await LadderPage({ searchParams: Promise.resolve({ room: 'AB12CD34', name: 'لاعب', team: 'invalid' }) }));
    expect(screen.getByText('{"initialRoomCode":"AB12CD34","initialPlayerName":"لاعب"}')).toBeInTheDocument();
  });
});
