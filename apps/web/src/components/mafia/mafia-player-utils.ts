import { mafiaRoleLabels, type MafiaRoleName } from '@/lib/mafia/rules';
import { cn } from '@/lib/utils';

export { cn };

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function getRoleChipClasses(role: MafiaRoleName | null | undefined): string {
  if (!role) return 'mafia-role-chip mafia-role-chip-civilian';
  if (role === 'KILLER') return 'mafia-role-chip mafia-role-chip-killer';
  if (['DETECTIVE', 'DOCTOR', 'GUARD', 'WITNESS'].includes(role)) return 'mafia-role-chip mafia-role-chip-special';
  return 'mafia-role-chip mafia-role-chip-civilian';
}

export function getRoleLabel(role: MafiaRoleName | null | undefined): string {
  if (!role) return 'ينتظر توزيع الدور';
  return mafiaRoleLabels[role];
}
