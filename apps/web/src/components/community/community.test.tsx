import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountActions, previewImageUrl } from './community-ui';
import { CommunityProfilePage } from './profile-view';
import { AppearanceEditor } from './appearance-editor';
import { AdminIdentity } from './admin-identity';
import { CommunityAssetField } from './asset-field';
import { fixtureAdmin, fixtureAppearance, fixtureProfile } from './community-fixtures';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('community identity UI', () => {
  it('copies the numeric public ID and announces the outcome', async () => {
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<AccountActions accountNumber={123456789} />);
    fireEvent.click(screen.getByRole('button', { name: 'نسخ معرّف الحساب' }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith('123456789'));
    expect(screen.getByRole('status')).toHaveTextContent('تم نسخ المعرّف.');
  });
  it('renders actual public data, allows tab navigation and uses a hard voice-room link', () => {
    render(<CommunityProfilePage accountNumber={123456789} initialProfile={fixtureProfile} />);
    expect(screen.getByRole('heading', { name: 'عضو التجربة' })).toBeInTheDocument();
    expect(screen.getByText('الفارس')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /مجلس المساء/ })).toHaveAttribute(
      'href',
      '/voice/fixture-room',
    );
    expect(screen.queryByText('fixture-user')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'الإنجازات' }));
    expect(screen.getByText('لم تُسجّل إنجازات مكتسبة بعد.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
  it('follows a real account through the API and refreshes the public result', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { following: true } })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { ...fixtureProfile, isSelf: false, isFollowing: true, followerCount: 1 },
          }),
        ),
      );
    vi.stubGlobal('fetch', request);
    render(
      <CommunityProfilePage
        accountNumber={123456789}
        initialProfile={{ ...fixtureProfile, isSelf: false }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'متابعة' }));
    await screen.findByRole('button', { name: 'إلغاء المتابعة' });
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/community/profiles/123456789/follow',
      expect.objectContaining({ method: 'POST' }),
    );
  });
  it('does not offer locked cosmetics and never activates a preview before save', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: 'ITEM_NOT_OWNED' }), { status: 403 }),
      );
    vi.stubGlobal('fetch', request);
    const locked = { ...fixtureAppearance.catalog[0], id: 'locked-frame', name: 'إطار غير مملوك' };
    render(
      <AppearanceEditor
        initialData={{ ...fixtureAppearance, catalog: [...fixtureAppearance.catalog, locked] }}
      />,
    );
    expect(screen.queryByRole('option', { name: 'إطار غير مملوك' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('إطار الصورة'), { target: { value: '' } });
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('هذا المقتنى غير متاح لحسابك'),
    );
    expect(screen.getByLabelText('إطار الصورة')).toHaveValue('');
  });
  it('keeps administrative badge grant choices reserved for the owner', () => {
    const sensitive = {
      ...fixtureAdmin.badges[0],
      id: 'platform-founder',
      name: 'مؤسس المنصة',
      category: 'ADMIN',
      sensitive: true,
    };
    render(
      <AdminIdentity
        canGrantSensitive={false}
        initialData={{ ...fixtureAdmin, badges: [...fixtureAdmin.badges, sensitive] }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'المنح والسحب' }));
    expect(screen.queryByRole('option', { name: 'مؤسس المنصة' })).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('معرّف العنصر')).getByRole('option', { name: 'حضور ذهبي' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('نوع العنصر'), { target: { value: 'cosmetic' } });
    const selector = screen.getByLabelText('معرّف العنصر');
    expect(within(selector).queryByRole('option', { name: 'حضور ذهبي' })).toBeInTheDocument();
    expect(within(selector).queryByRole('option', { name: 'مؤسس المنصة' })).not.toBeInTheDocument();
  });
  it('rejects unsupported uploads before sending bytes', () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    render(<CommunityAssetField label="صورة الشارة" value={null} onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/رفع PNG أو WebP/), {
      target: { files: [new File(['<svg/>'], 'unsafe.svg', { type: 'image/svg+xml' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('اختر صورة PNG أو WebP');
    expect(request).not.toHaveBeenCalled();
  });
  it('confirms badge revocation before sending the administrative command', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: null })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: fixtureAdmin })));
    vi.stubGlobal('fetch', request);
    render(
      <AdminIdentity
        canGrantSensitive
        initialData={{
          ...fixtureAdmin,
          grants: [
            {
              id: 'fixture-grant',
              userId: 'fixture-user',
              accountNumber: 123456789,
              name: 'عضو التجربة',
              badge: fixtureAdmin.badges[0],
              grantedAt: '2026-10-01T12:00:00.000Z',
              expiresAt: null,
              revokedAt: null,
            },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'المنح والسحب' }));
    fireEvent.click(screen.getByRole('button', { name: 'سحب' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('123456789');
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد السحب' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        '/api/community/admin',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            operation: 'revokeBadge',
            accountNumber: 123456789,
            badgeId: 'gold-member',
          }),
        }),
      ),
    );
  });
  it('never previews script or non-image data URLs', () => {
    expect(previewImageUrl('javascript:alert(1)')).toBeNull();
    expect(previewImageUrl('data:text/html,test')).toBeNull();
    expect(previewImageUrl('//example.com/image.png')).toBeNull();
    expect(previewImageUrl('https://example.com/image.png')).toBe('https://example.com/image.png');
  });
  it('keeps equipped visuals visible when the collection is private and renders custom frame artwork', () => {
    const background = {
      ...fixtureAppearance.ownedCosmetics[0],
      id: 'custom-background',
      kind: 'BACKGROUND' as const,
      tier: 'diamond' as const,
      assetUrl: '/profile/cover.png',
    };
    const nameCard = {
      ...fixtureAppearance.ownedCosmetics[0],
      id: 'custom-name',
      kind: 'NAME_CARD' as const,
      tier: 'royal' as const,
      assetUrl: '/uploads/community/nameplate.png',
    };
    const glow = {
      ...fixtureAppearance.ownedCosmetics[0],
      id: 'custom-glow',
      kind: 'GLOW' as const,
      tier: 'gold' as const,
    };
    const { container } = render(
      <CommunityProfilePage
        accountNumber={123456789}
        initialProfile={{
          ...fixtureProfile,
          showCollection: false,
          cosmetics: [],
          activeAppearance: { background, nameCard, glow },
          frame: {
            ...fixtureAppearance.ownedCosmetics[0],
            assetUrl: '/uploads/community/custom-frame.png',
          },
        }}
      />,
    );
    expect(container.querySelector('header')).toHaveAttribute('data-background-tier', 'diamond');
    expect(container.querySelector('header')).toHaveAttribute('data-name-card-tier', 'royal');
    expect(container.querySelector('[data-glow-tier="gold"]')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'بطاقة اسم عضو التجربة' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'غلاف الملف الشخصي' })).toHaveAttribute(
      'src',
      '/profile/cover.png',
    );
    expect(
      container.querySelector('img[src="/uploads/community/custom-frame.png"]'),
    ).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'المقتنيات' }));
    expect(screen.getByText('معرض المقتنيات مخفي بحسب إعدادات الخصوصية.')).toBeInTheDocument();
  });
});
