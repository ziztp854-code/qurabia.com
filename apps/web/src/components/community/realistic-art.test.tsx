import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RealBadgeArtwork, RealFrameArtwork, RealEntranceArtwork } from './realistic-art';
import { CommunityAvatar, PhotoNameCard } from './community-ui';

describe('real photographic community artwork', () => {
  it.each(['owner-sapphire', 'amira-rose'])(
    'keeps the %s exclusive entrance correctly aligned with live content',
    (name) => {
      const { container } = render(
        <RealEntranceArtwork tier="royal" assetUrl={`/community-assets/entrance-${name}.webp`}>
          <strong>الاسم الفعلي</strong>
        </RealEntranceArtwork>,
      );
      const board = container.querySelector('[data-exclusive-entrance]') as HTMLElement;
      expect(board.style.getPropertyValue('--entrance-avatar-x')).toBe('21%');
      expect(board.style.getPropertyValue('--entrance-avatar-y')).toBe('47%');
      expect(container.querySelector('img')).toHaveAttribute(
        'src',
        `/community-assets/entrance-${name}.webp`,
      );
      expect(screen.getByText('الاسم الفعلي')).toBeVisible();
    },
  );
  it('keeps legacy atlas URLs cropped while delivering current WebP assets', () => {
    const { container } = render(
      <>
        <RealBadgeArtwork
          badgeId="platform-founder"
          assetUrl="/community-assets/badge-atlas.png"
          name="شارة قديمة"
        />
        <RealFrameArtwork
          tier="royal"
          assetUrl="/community-assets/frame-atlas.png#royal"
          name="إطار قديم"
        />
      </>,
    );
    expect(screen.getByRole('img', { name: 'شارة قديمة' }).style.backgroundImage).toContain(
      'badge-atlas.webp',
    );
    expect(screen.getByRole('img', { name: 'إطار قديم' }).style.backgroundImage).toContain(
      'frame-atlas.webp',
    );
    expect(container.querySelector('img')).toBeNull();
  });
  it.each(['ordinary', 'silver', 'gold', 'diamond', 'royal', 'legend'] as const)(
    'renders the %s photographic entrance with live identity content',
    (tier) => {
      const { container } = render(
        <RealEntranceArtwork tier={tier} name="لوحة الدخول">
          <span>الاسم الحقيقي</span>
        </RealEntranceArtwork>,
      );
      expect(screen.getByRole('img', { name: 'لوحة الدخول' }).style.backgroundImage).toContain(
        'entrance-atlas.webp',
      );
      expect(screen.getByText('الاسم الحقيقي')).toBeVisible();
      expect(container.querySelector('[data-entrance-tier]')).toHaveAttribute(
        'data-entrance-tier',
        tier,
      );
      expect(container.querySelector('svg')).toBeNull();
    },
  );
  it('replaces a built-in legacy badge symbol with the photographic atlas', () => {
    const { container } = render(
      <RealBadgeArtwork
        badgeId="platform-founder"
        assetUrl="/profile/badge-owner.png"
        name="مؤسس المنصة"
      />,
    );
    expect(screen.getByRole('img', { name: 'مؤسس المنصة' }).style.backgroundImage).toMatch(
      /\/community-assets\/badge-atlas\.(?:png|webp)/,
    );
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('img[src="/profile/badge-owner.png"]')).toBeNull();
  });
  it('preserves custom photographic badge and frame assets', () => {
    render(
      <>
        <RealBadgeArtwork
          badgeId="custom-award"
          assetUrl="/uploads/community/reviewed.png"
          name="وسام مخصص"
        />
        <RealFrameArtwork tier="gold" assetUrl="/uploads/community/frame.png" name="إطار مخصص" />
      </>,
    );
    expect(screen.getByRole('img', { name: 'وسام مخصص' })).toHaveAttribute(
      'src',
      '/uploads/community/reviewed.png',
    );
    expect(screen.getByRole('img', { name: 'إطار مخصص' })).toHaveAttribute(
      'src',
      '/uploads/community/frame.png',
    );
  });
  it('uses neutral missing-image text instead of icons, initial letters, or invented faces', () => {
    const { container } = render(
      <>
        <RealBadgeArtwork badgeId="unillustrated-badge" name="شارة جديدة" />
        <CommunityAvatar name="عضو التجربة" src={null} />
      </>,
    );
    expect(screen.getByText('لم تُضف صورة')).toBeInTheDocument();
    expect(screen.getByText('صورة غير مضافة')).toBeInTheDocument();
    expect(screen.queryByText('عا')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
  it('falls back to neutral text when the actual member image fails to load', () => {
    render(<CommunityAvatar name="عضو التجربة" src="/uploads/community/unavailable.png" />);
    fireEvent.error(screen.getByRole('img', { name: 'صورة عضو التجربة' }));
    expect(screen.getByText('لم تُضف صورة')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it('uses a reviewed nameplate photograph with the actual display name', () => {
    const { container } = render(
      <PhotoNameCard name="عضو التجربة" assetUrl="/uploads/community/nameplate.png" />,
    );
    expect(screen.getByRole('img', { name: 'بطاقة اسم عضو التجربة' })).toHaveTextContent(
      'عضو التجربة',
    );
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/uploads/community/nameplate.png',
    );
    expect(container.querySelector('svg')).toBeNull();
  });
});
