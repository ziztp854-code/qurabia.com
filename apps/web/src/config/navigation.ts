import {
  BarChart3,
  BookOpen,
  CircleHelp,
  Gamepad2,
  Home,
  LayoutDashboard,
  MonitorPlay,
  Skull,
  Trophy,
  UserCircle2,
} from 'lucide-react';

export const publicNavigation = [
  { label: 'الرئيسية', href: '/', icon: Home },
  { label: 'الألعاب', href: '/games', icon: Gamepad2 },
  { label: 'المسابقات', href: '/quizzes', icon: Trophy },
  { label: 'لوحة الشرف', href: '/leaderboard', icon: BarChart3 },
  { label: 'الدعم', href: '/contact', icon: CircleHelp },
  { label: 'الحساب', href: '/profile', icon: UserCircle2 },
] as const;

export const primaryNavigation = [
  { label: 'الرئيسية', href: '/', icon: Home },
  { label: 'المسابقات', href: '/quizzes', icon: Trophy },
  { label: 'شاشة العرض', href: '/display', icon: MonitorPlay },
  { label: 'الألعاب', href: '/games', icon: Gamepad2 },
  { label: 'من هو القاتل؟', href: '/mafia', icon: Skull },
  { label: 'لوحة التحكم', href: '/dashboard', icon: LayoutDashboard },
  { label: 'بنك الأسئلة', href: '/questions', icon: BookOpen },
] as const;
