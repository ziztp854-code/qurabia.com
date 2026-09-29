'use client';

import { Eye, Flag, Shield, Swords, type LucideIcon } from 'lucide-react';
import type { Unit } from '@/lib/kingdoms/types';

const unitIcons: Record<Unit, LucideIcon> = {
  guard: Shield,
  rider: Swords,
  scout: Eye,
  settler: Flag,
};

/**
 * أيقونة الوحدة على خريطة القرية ولوحاتها، من الأيقونات نفسها التي يراها الجميع
 * فوق الرسم حتى لا تتعارض رموز اللوحات مع رموز الخريطة.
 */
export function UnitIcon({ unit, size = 18 }: { unit: Unit; size?: number }) {
  const Icon = unitIcons[unit];
  return <Icon size={size} aria-hidden="true" />;
}
