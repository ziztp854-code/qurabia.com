import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CommandProfile, resolveCommandBadges } from './command-profile';

const stats = [
  { label: 'المسابقات', value: '3', hint: 'في حسابك', series: [1, 2, 3], tone: 'azure' as const },
  { label: 'الأسئلة', value: '12', hint: 'في بنكك', series: [4, 5, 8], tone: 'gold' as const },
  { label: 'المتابعون', value: '40', hint: 'في جلساتك', series: [2, 6, 9], tone: 'gold' as const },
];

function originalImageSource(image: HTMLElement): string {
  const renderedSource = image.getAttribute('src') ?? '';
  return new URL(renderedSource, 'http://localhost').searchParams.get('url') ?? renderedSource;
}

describe('CommandProfile', () => {
  it('يعرض مشهد القيادة للمدير مع التاج والشارات والصلاحيات الفعلية', () => {
    render(
      <CommandProfile
        name="عبدالعزيز بن سلطان العتيبي"
        email="owner@qurabia.com"
        role="OWNER"
        status="ACTIVE"
        planCode="SULTAN"
        stats={stats}
        platformStats={[
          { label: 'حالة الإعلانات', value: '—', hint: 'لا توجد حملات إعلانية في المنصة' },
          { label: 'حسابات المنصة', value: '100', hint: 'غير محذوفة' },
          { label: 'الغرف الحية', value: '2', hint: 'منتظرة أو نشطة' },
        ]}
      />,
    );

    const rankArtwork = screen.getByRole('img', { name: 'بطاقة رتبة السلطان' });
    expect(originalImageSource(rankArtwork)).toBe('/ranks/sultan.png');
    expect(screen.getByRole('heading', { name: /عبدالعزيز بن سلطان العتيبي/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /شارات القيادة/ })).toBeInTheDocument();
    expect(screen.getByText('مالك المنصة')).toBeInTheDocument();
    expect(screen.getByText('باني تحدّي')).toBeInTheDocument();
    expect(screen.getByText('رائد الجمهور')).toBeInTheDocument();
    expect(screen.getAllByText('مدير موثّق').length).toBeGreaterThan(0);
    expect(screen.getByText('المسابقات')).toBeInTheDocument();
    expect(screen.getByText('المتابعون')).toBeInTheDocument();
    expect(screen.getByText('حالة الإعلانات')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'المسابقات: مسار 3 أسابيع، الاتجاه صاعد' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /إدارة المنصة/ })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: /بنك الأسئلة/ })).toHaveAttribute('href', '/questions');
    expect(screen.getByRole('link', { name: /إدارة الصفحة/ })).toHaveAttribute('href', '/host');
    expect(screen.getByRole('heading', { name: /صلاحيات الخاص/ })).toBeInTheDocument();
    expect(screen.getByText('إدارة المستخدمين')).toBeInTheDocument();
    expect(screen.getAllByText('Unlocked').length).toBeGreaterThan(0);
    expect(screen.queryByText('أمين المحتوى')).not.toBeInTheDocument();
    expect(screen.queryByText('البريد')).not.toBeInTheDocument();
  });

  it('يخفي اختصار الإدارة وشارات القيادة عن المستخدم العادي', () => {
    render(
      <CommandProfile
        name="لاعب تحدّي"
        email="player@qurabia.com"
        role="USER"
        status="ACTIVE"
        stats={stats}
      />,
    );

    expect(screen.getByText('لاعب تحدّي')).toBeInTheDocument();
    const rankArtwork = screen.getByRole('img', { name: 'بطاقة رتبة المشاهد' });
    expect(originalImageSource(rankArtwork)).toBe('/ranks/spectator.png');
    expect(screen.queryByRole('link', { name: /إدارة المنصة/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /بنك الأسئلة/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /مسابقة جديدة/ })).toBeInTheDocument();
    expect(screen.getByText('البريد')).toBeInTheDocument();
    expect(screen.queryByText('صلاحيات الخاص')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /شارات القيادة/ })).not.toBeInTheDocument();
  });

  it('resolveCommandBadges يمنح شارات المؤسس للمدير فقط', () => {
    const ownerBadges = resolveCommandBadges({
      role: 'OWNER',
      status: 'ACTIVE',
      stats,
      platformStats: [
        { label: 'حسابات المنصة', value: '100', hint: 'غير محذوفة' },
        { label: 'الغرف الحية', value: '2', hint: 'منتظرة أو نشطة' },
      ],
    });
    expect(ownerBadges.map((badge) => badge.id)).toEqual(
      expect.arrayContaining(['verified', 'command', 'builder', 'active', 'audience']),
    );
    expect(ownerBadges.find((badge) => badge.id === 'command')?.label).toBe('مالك المنصة');

    const adminBadges = resolveCommandBadges({
      role: 'ADMIN',
      status: 'ACTIVE',
      stats: [{ label: 'المسابقات', value: '0', hint: 'في حسابك' }],
    });
    expect(adminBadges.map((badge) => badge.id)).toContain('verified');
    expect(adminBadges.map((badge) => badge.id)).not.toContain('builder');
    expect(adminBadges.map((badge) => badge.id)).not.toContain('audience');
    expect(resolveCommandBadges({ role: 'USER', status: 'ACTIVE', stats: [] })).toEqual([]);
  });
});
