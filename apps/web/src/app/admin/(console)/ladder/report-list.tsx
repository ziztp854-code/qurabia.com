'use client';

import { useState } from 'react';
import type { LadderRoomSnapshot } from '@tahaddi/domain';
import { LadderReport } from '@/components/games/ladder/ladder-report';
import { Button } from '@/components/ui';

export function LadderReportList({ rooms }: { rooms: LadderRoomSnapshot[] }) {
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const activeRoom = rooms.find((room) => room.roomCode === activeCode);
  return (
    <div>
      {rooms.map((room) => (
        <div key={room.roomCode}>
          <Button
            type="button"
            variant="ghost"
            aria-pressed={activeCode === room.roomCode}
            onClick={() => setActiveCode(activeCode === room.roomCode ? null : room.roomCode)}
          >
            غرفة <bdi>{room.roomCode}</bdi> ·{' '}
            {room.endedAt
              ? new Intl.DateTimeFormat('ar-SA', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Asia/Riyadh',
                }).format(new Date(room.endedAt))
              : 'التاريخ غير متوفر'}{' '}
            · {room.rightScore} - {room.leftScore}
          </Button>
        </div>
      ))}
      {activeRoom && <LadderReport key={activeRoom.roomCode} room={activeRoom} />}
    </div>
  );
}
