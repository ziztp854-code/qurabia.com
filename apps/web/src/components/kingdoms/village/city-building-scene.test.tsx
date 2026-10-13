import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  FacilityArtworkScene as CityBuildingScene,
  CityBuildingScene as CityBuildingEntry,
} from './city-building-scene';
import { useContext, useEffect, useState, type ReactNode } from 'react';
import type { GameProps } from '../shared';
import { FarmSceneContext } from './farm-scene-context';

// The facility shell contract is independent of GPU setup. The actual palace
// renderer, camera, garden and cleanup are exercised by the browser suite.
vi.mock('./sultan-palace-scene', () => ({
  SultanPalaceScene: ({ children, garden }: { children: ReactNode; garden?: ReactNode }) => (
    <div data-sultan-palace="">
      {children}
      {garden}
    </div>
  ),
}));
vi.mock('./sultan-farm-scene', () => ({
  SultanFarmScene: ({ children }: { children: ReactNode }) => (
    <div data-sultan-farm-scene="">{children}</div>
  ),
}));

function FarmContextProbe() {
  const farm = useContext(FarmSceneContext);
  const [focused, setFocused] = useState<number | null>(null);
  useEffect(() => farm?.registerFocus(setFocused), [farm]);
  return (
    <>
      <button type="button" onClick={() => farm?.select(4)}>
        اختر الحوض الخامس
      </button>
      <output aria-label="الحوض المركّز">{focused}</output>
    </>
  );
}

afterEach(cleanup);

describe('independent city facility scenes', () => {
  it('opens Sultan farm directly as a 3D world and retains the palace garden as a separate return path', () => {
    const farm = {
      view: { worldId: 'world' },
      village: { id: 'village', ownerId: 'owner' },
    } as GameProps;
    const onClose = vi.fn();
    render(
      <CityBuildingEntry scene="sultan-garden" farm={farm} onClose={onClose}>
        <FarmContextProbe />
      </CityBuildingEntry>,
    );
    expect(screen.getByTitle('مزرعة السلطان ثلاثية الأبعاد')).toHaveAttribute(
      'src',
      '/games/sultan-farm/index.html?save=%5B%22world%22%2C%22owner%22%2C%22village%22%5D',
    );
    expect(screen.queryByRole('button', { name: 'افتح لعبة المزرعة' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'العودة إلى القرية' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'حديقة القصر' }));
    expect(screen.queryByTitle('مزرعة السلطان ثلاثية الأبعاد')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إدارة الحديقة' })).toBeInTheDocument();
  });
  it('follows the iPhone visual viewport when the keyboard opens and removes listeners on close', () => {
    const viewport = Object.assign(new EventTarget(), { height: 664, offsetTop: 0 });
    const removeListener = vi.spyOn(viewport, 'removeEventListener');
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('visualViewport', viewport);
    try {
      const rendered = render(
        <CityBuildingScene scene="barracks" onClose={vi.fn()}>
          <input aria-label="عدد الجنود" />
        </CityBuildingScene>,
      );
      const scene = screen.getByRole('region', { name: 'مشهد الثكنة' });
      expect(scene.style.getPropertyValue('--facility-viewport-height')).toBe('664px');
      viewport.height = 320;
      viewport.offsetTop = 30;
      viewport.dispatchEvent(new Event('resize'));
      expect(scene.style.getPropertyValue('--facility-viewport-height')).toBe('320px');
      expect(scene.style.getPropertyValue('--facility-viewport-top')).toBe('30px');
      rendered.unmount();
      expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
  it('keeps covered page navigation inactive and restores it when returning to the city', () => {
    const rendered = render(
      <>
        <button type="button">خلف المشهد</button>
        <CityBuildingScene scene="market" onClose={vi.fn()}>
          <button type="button">التجارة</button>
        </CityBuildingScene>
      </>,
    );
    const background = screen.getByText('خلف المشهد');
    expect(background.inert).toBe(true);
    rendered.unmount();
    expect(background.inert).toBe(false);
  });

  it('opens independent artwork with an accessible return action and preserves gameplay when artwork fails', () => {
    const onClose = vi.fn();
    const rendered = render(
      <CityBuildingScene scene="barracks" onClose={onClose}>
        <button type="button">تدريب الجنود</button>
      </CityBuildingScene>,
    );
    const scene = screen.getByRole('region', { name: 'مشهد الثكنة' });
    const image = scene.querySelector('img')!;
    expect(image).toHaveAttribute('src', '/game-art/kingdoms/city-scenes/barracks.webp');
    expect(scene.querySelector('source')).toHaveAttribute(
      'srcset',
      '/game-art/kingdoms/city-scenes/barracks-portrait.webp',
    );
    expect(screen.getByRole('button', { name: 'العودة إلى المدينة' })).toHaveFocus();
    fireEvent.error(image);
    expect(screen.getByRole('alert')).toHaveTextContent('تعذر تحميل المشهد.');
    expect(screen.getByRole('button', { name: 'تدريب الجنود' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.load(rendered.container.querySelector('img')!);
    expect(scene).toHaveAttribute('data-phase', 'active');
    fireEvent.click(screen.getByRole('button', { name: 'العودة إلى المدينة' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('waits for palace artwork before attaching garden decor to the same art frame', () => {
    const rendered = render(
      <CityBuildingScene
        scene="palace"
        onClose={vi.fn()}
        garden={<button type="button">تعديل الحديقة</button>}
      >
        <p>دار الحكم</p>
      </CityBuildingScene>,
    );
    expect(screen.queryByRole('button', { name: 'تعديل الحديقة' })).not.toBeInTheDocument();
    const image = rendered.container.querySelector('img')!;
    Object.defineProperties(image, {
      naturalWidth: { value: 1672 },
      naturalHeight: { value: 941 },
    });
    fireEvent.load(image);
    expect(screen.getByRole('button', { name: 'تعديل الحديقة' })).toBeInTheDocument();
    expect(image.closest('picture')?.parentElement).toContainElement(
      screen.getByRole('button', { name: 'تعديل الحديقة' }),
    );
  });

  it('keeps the garden artwork mounted while its mobile management sheet opens and closes', () => {
    const onClose = vi.fn();
    const rendered = render(
      <CityBuildingScene scene="sultan-garden" onClose={onClose} farm={{} as GameProps}>
        <FarmContextProbe />
      </CityBuildingScene>,
    );
    const scene = screen.getByRole('region', { name: 'مشهد حديقة السلطان' });
    const image = rendered.container.querySelector('img')!;
    fireEvent.load(image);

    expect(screen.getByRole('button', { name: 'العودة إلى القرية' })).toHaveFocus();
    const manage = screen.getByRole('button', { name: 'إدارة الحديقة' });
    expect(manage).toHaveAttribute('aria-expanded', 'false');
    expect(manage).toHaveAttribute('aria-controls', 'sultan-farm-management');
    fireEvent.click(manage);
    expect(scene).toHaveAttribute('data-farm-managing', 'true');
    expect(scene).toHaveAttribute('data-farm-sheet', 'half');
    expect(manage).toHaveAttribute('aria-expanded', 'true');
    expect(rendered.container.querySelector('[data-sultan-farm-scene]')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'توسيع لوحة الحديقة' }));
    expect(scene).toHaveAttribute('data-farm-sheet', 'full');

    fireEvent.click(screen.getByRole('button', { name: 'اختر الحوض الخامس' }));
    expect(screen.getByRole('status', { name: 'الحوض المركّز' })).toHaveTextContent('4');
    expect(scene).toHaveAttribute('data-farm-sheet', 'half');

    screen.getByRole('button', { name: 'اختر الحوض الخامس' }).focus();
    fireEvent.keyDown(scene, { key: 'Escape' });
    expect(scene).toHaveAttribute('data-farm-managing', 'false');
    expect(scene).toHaveAttribute('data-farm-sheet', 'closed');
    expect(manage).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(scene, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
