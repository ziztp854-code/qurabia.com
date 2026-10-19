import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VoiceParticipant } from '@/lib/voice/types';
import { VoiceRoomAudience } from './voice-room-audience';

const member: VoiceParticipant = {
  id: 'speaker',
  name: 'نورة',
  image: null,
  role: 'speaker',
  seatIndex: 1,
  handRaised: false,
  requestedSeat: null,
  muted: false,
  moderatorMuted: false,
  joinedAt: 1,
  lastSeenAt: 1,
};

describe('Room audience navigation', () => {
  it('opens the actual member profile and exposes speaking and muted states', () => {
    const onProfile = vi.fn();
    const onMembers = vi.fn();
    const { rerender } = render(
      <VoiceRoomAudience
        participants={[member]}
        speakers={['speaker']}
        onProfile={onProfile}
        onMembers={onMembers}
      />,
    );
    const rail = screen.getByRole('complementary', { name: 'الحاضرون والتنقل' });
    fireEvent.click(within(rail).getByRole('button', { name: 'ملف نورة، متحدث، يتحدث الآن' }));
    expect(onProfile).toHaveBeenCalledWith('speaker');
    fireEvent.click(within(rail).getByRole('button', { name: 'عرض جميع أعضاء الغرفة' }));
    expect(onMembers).toHaveBeenCalledOnce();
    rerender(
      <VoiceRoomAudience
        participants={[{ ...member, moderatorMuted: true }]}
        speakers={[]}
        onProfile={onProfile}
        onMembers={onMembers}
      />,
    );
    expect(screen.getByRole('button', { name: 'ملف نورة، متحدث، مكتوم' })).toBeInTheDocument();
    expect(screen.queryByText('يتحدث الآن')).not.toBeInTheDocument();
  });
});
