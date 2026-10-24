import { getArm } from '@/lib/alfazaa/domain/catalog';
import type { AlfazaaState } from '@/lib/alfazaa/domain/types';

export type TutorialSection = 'city' | 'training';
export type TutorialGoal = 'merge' | 'recruit' | 'castle' | 'start' | 'route' | 'win';
export interface TutorialStep {
  id: TutorialGoal;
  title: string;
  instruction: string;
  section: TutorialSection;
  actionLabel: string;
  done: boolean;
}

const steps: Omit<TutorialStep, 'done'>[] = [
  {
    id: 'merge',
    title: 'ادمج وحدتين متطابقتين',
    section: 'city',
    actionLabel: 'اذهب إلى المدينة',
    instruction:
      'اضغط على أحد الجنديين المتطابقين، ثم اضغط على الآخر. تندمج الوحدتان في جندي من المستوى التالي. لن ينجح الدمج مع نوع أو مستوى مختلف.',
  },
  {
    id: 'recruit',
    title: 'جنّد جنديًا بعد الدمج',
    section: 'city',
    actionLabel: 'افتح التجنيد',
    instruction:
      'من قسم تجنيد اضغط تجنيد بجانب الجندي الذي تريده. يُخصم الثمن المعروض ويظهر الجندي في أول خانة فارغة. احتفظ بوحدتين على الأقل في المدينة.',
  },
  {
    id: 'castle',
    title: 'طوّر القلعة إلى المستوى 2',
    section: 'city',
    actionLabel: 'اذهب إلى القلعة',
    instruction:
      'اضغط تطوير القلعة من لوحة إدارة المدينة. افحص تكاليف الترقية والموارد المطلوبة؛ إذا لم تكفِ الموارد، اجمع إنتاج المدينة عندما يصبح جاهزًا.',
  },
  {
    id: 'start',
    title: 'ابدأ المرحلة الأولى',
    section: 'training',
    actionLabel: 'افتح تدريب الأبراج',
    instruction:
      'افتح تدريب الأبراج، ثم اختر المرحلة 1. راجع توزيع الأبراج والحواجز في المعاينة، ثم ابدأ التدريب.',
  },
  {
    id: 'route',
    title: 'أرسل جنود برجك الأزرق',
    section: 'training',
    actionLabel: 'اذهب إلى التدريب',
    instruction:
      'اختر برجًا أزرق تملكه، ثم اختر البرج الهدف لإنشاء مسار الجنود. الحواجز تمنع المسارات التي تعبرها. يمكنك إيقاف مسارك من زر إيقاف المسار أسفل الساحة.',
  },
  {
    id: 'win',
    title: 'سيطر على جميع أبراج المرحلة 1',
    section: 'training',
    actionLabel: 'أكمل التدريب',
    instruction:
      'راقب أعداد الجنود وأرسلهم إلى أبراج الخصم والمحايدة. تفوز عندما تصبح جميع الأبراج ملكك؛ تُسجّل المرحلة مكتملة بعد تحقق اللعبة من النتيجة. إذا خسرت، أعد المحاولة.',
  },
];

/** Derive guidance from game state; this model neither grants nor records rewards. */
export function tutorialProgress(state: AlfazaaState) {
  const troops = state.cells.filter((cell) => cell?.kind === 'troop');
  const merged = troops.some((cell) => (getArm(cell!.cfgId)?.level ?? 0) >= 2);
  const won = state.completedTowerLevels.includes(1);
  const completed: Record<TutorialGoal, boolean> = {
    merge: merged,
    recruit: merged && troops.length >= 2 && state.nextId > 3,
    castle: state.castleLevel >= 2,
    start: won || state.battle?.levelId === 1,
    route: won || (state.battle?.routes.length ?? 0) > 0,
    win: won,
  };
  const progress = steps.map((step) => ({ ...step, done: completed[step.id] }));
  const completedCount = progress.filter((step) => step.done).length;
  return {
    steps: progress,
    completedCount,
    current: progress.find((step) => !step.done),
    complete: completedCount === progress.length,
  };
}
