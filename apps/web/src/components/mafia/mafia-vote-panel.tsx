'use client';

import { useState, useTransition } from 'react';
import { Vote } from 'lucide-react';
import { Button } from '@/components/ui';
import { MafiaPlayerPicker } from './mafia-player-picker';

export function MafiaVotePanel({
  players,
  onSubmit,
  disabled,
}: {
  players: { id: string; displayName: string }[];
  onSubmit: (targetId: string) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const handleSubmit = () => {
    if (!selectedId || pending || disabled) return;
    setError('');
    startTransition(async () => {
      try {
        if (await onSubmit(selectedId)) {
          setSubmittedId(selectedId);
          return;
        }
      } catch {
        // Keep the selection so the player can retry after a network failure.
      }
      setError('تعذّر تسجيل صوتك. تحقق من اتصالك وأن التصويت ما زال مفتوحًا، ثم أعد المحاولة.');
    });
  };

  return (
    <div className="mafia-vote-panel">
      <p className="mafia-vote-prompt">من تشك أنه القاتل؟</p>
      <MafiaPlayerPicker
        players={players}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setError('');
        }}
        disabledIds={pending || disabled ? players.map((player) => player.id) : []}
        placeholder="اختر المشتبه به"
      />
      {selectedId && (
        <p className="mafia-vote-current">
          اختيارك الحالي: <strong>{players.find((p) => p.id === selectedId)?.displayName}</strong>
        </p>
      )}
      <p className="mafia-text-muted">يمكنك تغيير اختيارك حتى نهاية الوقت</p>
      {submittedId && (
        <div className="mafia-vote-confirmation" role="status">
          <strong>تم تسجيل صوتك</strong>
          <p>
            الصوت المسجل: {players.find((player) => player.id === submittedId)?.displayName ?? '—'}
          </p>
        </div>
      )}
      {error && (
        <p className="mafia-action-error" role="alert">
          {error}
        </p>
      )}
      <Button
        type="button"
        size="lg"
        onClick={handleSubmit}
        loading={pending}
        disabled={!selectedId || selectedId === submittedId || disabled || pending}
        className="mafia-confirm-btn"
      >
        <Vote aria-hidden="true" />
        تثبيت التصويت
      </Button>
    </div>
  );
}
