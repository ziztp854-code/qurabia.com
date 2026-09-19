'use client';

import { useState } from 'react';
import { CircleDot, Circle, UserPlus, Swords } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button, Card, Input } from '@/components/ui';
import { useRouter } from 'next/navigation';
import styles from './ladder-room.module.css';

type JoinLadderProps = {
  roomCode?: string;
};

export function JoinLadder({ roomCode }: JoinLadderProps) {
  const [playerName, setPlayerName] = useState('');
  const [team, setTeam] = useState<'right' | 'left'>('right');
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const teamPress = reduceMotion ? undefined : { scale: 0.98 };
  const teamHover = reduceMotion ? undefined : { y: -2 };

  const handleStart = () => {
    const params = new URLSearchParams();
    params.set('name', playerName.trim());
    params.set('team', team);
    if (roomCode) params.set('room', roomCode);
    router.push(`/games/ladder?${params.toString()}`);
  };

  return (
    <section className={styles.ladderRoom} dir="rtl">
      <div className={styles.ladderShell}>
        <Card className={styles.ladderIntro}>
          <span className={styles.ladderKicker}>
            <Swords aria-hidden="true" /> لعبة تنافسية
          </span>
          <h1>السلم</h1>
          <p>فريقان يتنافسان على السلم: إجابة صحيحة تصعد، وخاطئة تنزل. أول من يبلغ القمة يفوز.</p>
        </Card>

        <Card className={styles.ladderEntryPanel}>
          <div
            className={styles.entryTeamChoice}
            role="radiogroup"
            aria-label="اختيار الفريق"
          >
            <motion.button
              whileHover={teamHover}
              whileTap={teamPress}
              type="button"
              role="radio"
              aria-checked={team === 'right'}
              data-team="right"
              onClick={() => setTeam('right')}
              className={styles.entryTeamOption}
            >
              <span className={styles.entryTeamIconWrap}>
                <CircleDot
                  aria-hidden="true"
                  className={styles.entryTeamIcon}
                  data-team="right"
                  size={24}
                />
              </span>
              <span className={styles.entryTeamLabel}>فريق اليمين</span>
            </motion.button>
            <motion.button
              whileHover={teamHover}
              whileTap={teamPress}
              type="button"
              role="radio"
              aria-checked={team === 'left'}
              data-team="left"
              onClick={() => setTeam('left')}
              className={styles.entryTeamOption}
            >
              <span className={styles.entryTeamIconWrap}>
                <Circle
                  aria-hidden="true"
                  className={styles.entryTeamIcon}
                  data-team="left"
                  size={24}
                />
              </span>
              <span className={styles.entryTeamLabel}>فريق اليسار</span>
            </motion.button>
          </div>

          <Input
            id="ladder-player-name"
            label="اسم اللاعب"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="الاسم الظاهر"
            maxLength={30}
            autoComplete="nickname"
            description="يجب أن يكون الاسم من حرفين على الأقل"
          />

          <Button
            variant="gold"
            size="lg"
            disabled={playerName.trim().length < 2}
            onClick={handleStart}
            fullWidth
          >
            <UserPlus aria-hidden="true" />
            {roomCode ? 'انضمام للعبة' : 'ابدأ اللعبة'}
          </Button>
        </Card>
      </div>
    </section>
  );
}
