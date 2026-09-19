'use client';

import { useState } from 'react';
import { Vote } from 'lucide-react';
import { Button } from '@/components/ui';
import { MafiaPlayerPicker } from './mafia-player-picker';

export function MafiaVotePanel({
  players,
  onSubmit,
  disabled,
}: {
  players: { id: string; displayName: string }[];
  onSubmit: (targetId: string) => void;
  disabled?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!selectedId) return;
    onSubmit(selectedId);
    setSubmitted(true);
  };

  if (submitted && selectedId) {
    const target = players.find((p) => p.id === selectedId);
    return (
      <div className="mafia-vote-confirmation" role="status">
        <strong>تم تسجيل صوتك</strong>
        <p>اختيارك: {target?.displayName ?? '—'}</p>
      </div>
    );
  }

  return (
    <div className="mafia-vote-panel">
      <p className="mafia-vote-prompt">من تشك أنه القاتل؟</p>
      <MafiaPlayerPicker
        players={players}
        selectedId={selectedId}
        onSelect={setSelectedId}
        placeholder="اختر المشتبه به"
      />
      {selectedId && (
        <p className="mafia-vote-current">
          اختيارك الحالي:{' '}
          <strong>{players.find((p) => p.id === selectedId)?.displayName}</strong>
        </p>
      )}
      <p className="mafia-text-muted">يمكنك تغيير اختيارك حتى نهاية الوقت</p>
      <Button
        size="lg"
        onClick={handleSubmit}
        disabled={!selectedId || disabled}
        className="mafia-confirm-btn"
      >
        <Vote aria-hidden="true" />
        تثبيت التصويت
      </Button>
    </div>
  );
}
