'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn, getInitials, getRoleChipClasses, getRoleLabel } from '@/components/mafia/mafia-player-utils';

type ParticipantStatus = 'ALIVE' | 'ELIMINATED';

const STATUS_CONFIG: Record<ParticipantStatus, { label: string; className: string }> = {
  ALIVE: { label: 'جاهز', className: 'mafia-lobby-player-status-ready' },
  ELIMINATED: { label: 'مستبعد', className: 'mafia-lobby-player-status-disconnected' },
};

interface MafiaLobbyPlayerProps {
  participant: {
    id: string;
    displayName: string;
    role?: string | null;
    status: ParticipantStatus;
    isMuted: boolean;
  };
  onMute?: (muted: boolean) => void;
  showRole?: boolean;
}

export function MafiaLobbyPlayer({ participant, onMute, showRole = false }: MafiaLobbyPlayerProps) {
  const statusConfig = STATUS_CONFIG[participant.status] ?? STATUS_CONFIG.ALIVE;
  const roleType = participant.role as 'KILLER' | 'DETECTIVE' | 'DOCTOR' | 'GUARD' | 'WITNESS' | 'CITIZEN' | null | undefined;

  return (
    <div className={cn('mafia-lobby-player', participant.status === 'ELIMINATED' && 'mafia-eliminated')}>
      <div className="mafia-lobby-player-avatar" aria-hidden="true">
        {getInitials(participant.displayName)}
      </div>
      <div className="mafia-lobby-player-info">
        <strong className="mafia-lobby-player-name">{participant.displayName}</strong>
        <div className="mafia-lobby-player-meta">
          {showRole && roleType && (
            <span className={getRoleChipClasses(roleType)}>
              {getRoleLabel(roleType)}
            </span>
          )}
          <span className={cn('mafia-lobby-player-status', statusConfig.className)}>
            <span className="mafia-lobby-player-status-dot" aria-hidden="true" />
            {statusConfig.label}
          </span>
        </div>
      </div>
      {onMute && (
        <form className="mafia-lobby-player-actions">
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            aria-label={participant.isMuted ? 'إلغاء الكتم' : 'كتم'}
            onClick={() => onMute(!participant.isMuted)}
          >
            {participant.isMuted ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          </Button>
        </form>
      )}
    </div>
  );
}
