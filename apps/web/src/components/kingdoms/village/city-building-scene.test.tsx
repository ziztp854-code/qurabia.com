import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CityBuildingScene } from './city-building-scene';
import type { ReactNode } from 'react';

// The facility shell contract is independent of GPU setup. The actual palace
// renderer, camera, garden and cleanup are exercised by the browser suite.
vi.mock('./sultan-palace-scene', () => ({ SultanPalaceScene: ({ children, garden }: { children: ReactNode; garden?: ReactNode }) => <div data-sultan-palace="">{children}{garden}</div> }));

afterEach(cleanup);

describe('independent city facility scenes', () => {
  it('keeps covered page navigation inactive and restores it when returning to the city', () => {
    const rendered = render(<><button type="button">خلف المشهد</button><CityBuildingScene scene="market" onClose={vi.fn()}><button type="button">التجارة</button></CityBuildingScene></>);
    const background = screen.getByText('خلف المشهد');
    expect(background.inert).toBe(true);
    rendered.unmount();
    expect(background.inert).toBe(false);
  });

  it('opens independent artwork with an accessible return action and preserves gameplay when artwork fails', () => {
    const onClose = vi.fn();
    const rendered = render(<CityBuildingScene scene="barracks" onClose={onClose}><button type="button">تدريب الجنود</button></CityBuildingScene>);
    const scene = screen.getByRole('region', { name: 'مشهد الثكنة' });
    const image = scene.querySelector('img')!;
    expect(image).toHaveAttribute('src', '/game-art/kingdoms/city-scenes/barracks.webp');
    expect(scene.querySelector('source')).toHaveAttribute('srcset', '/game-art/kingdoms/city-scenes/barracks-portrait.webp');
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
    const rendered = render(<CityBuildingScene scene="palace" onClose={vi.fn()} garden={<button type="button">تعديل الحديقة</button>}><p>دار الحكم</p></CityBuildingScene>);
    expect(screen.queryByRole('button', { name: 'تعديل الحديقة' })).not.toBeInTheDocument();
    const image = rendered.container.querySelector('img')!;
    Object.defineProperties(image, { naturalWidth: { value: 1672 }, naturalHeight: { value: 941 } });
    fireEvent.load(image);
    expect(screen.getByRole('button', { name: 'تعديل الحديقة' })).toBeInTheDocument();
    expect(image.closest('picture')?.parentElement).toContainElement(screen.getByRole('button', { name: 'تعديل الحديقة' }));
  });
});
