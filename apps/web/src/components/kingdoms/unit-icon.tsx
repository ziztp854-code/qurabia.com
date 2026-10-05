'use client';

import { Castle, Eye, Flag, Shield, Swords, Target, Wrench, type LucideIcon } from 'lucide-react';
import type { Unit } from '@/lib/kingdoms/types';

const unitIcons: Record<Unit, LucideIcon> = {
  guard: Shield,
  rider: Swords,
  scout: Eye,
  settler: Flag,
  archer: Target,
  mounted_archer: Swords,
  sultan_guard: Shield,
  siege_engineer: Wrench,
  siege_tower: Castle,
};

/**
 * أيقونة الوحدة على خريطة القرية ولوحاتها، من الأيقونات نفسها التي يراها الجميع
 * فوق الرسم حتى لا تتعارض رموز اللوحات مع رموز الخريطة.
 */
export function UnitIcon({ unit, size = 18 }: { unit: Unit; size?: number }) {
  const Icon = unitIcons[unit];
  return <Icon size={size} aria-hidden="true" />;
}
