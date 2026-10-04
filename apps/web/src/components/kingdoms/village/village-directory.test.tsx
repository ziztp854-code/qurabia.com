import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import type { WorldView } from '../shared';
import { VillageDirectory } from './village-directory';

const now = 1800000000000;
function fixture(): WorldView {
  const world = executeCommand(createWorld(now), 'p', { type: 'found', name: 'مملكتي' }, now);
  return { ...projectWorld(world, 'p', now), worldId: 'w', worldName: 'عالم الاختبار', revision: 1, paused: false };
}

describe('village building directory', () => {
  it('offers every existing building and the cavalry annex with real selection state', () => {
    const view = fixture();
    const onSelect = vi.fn();
    render(<VillageDirectory view={view} village={view.villages[0]} selected="stable" onSelect={onSelect} />);
    const directory = screen.getByRole('navigation', { name: 'دليل مباني القرية' });
    expect(within(directory).getAllByRole('button')).toHaveLength(13);
    expect(within(directory).getByRole('button', { name: 'اختيار نقطة تجمع الجيوش' })).toBeInTheDocument();
    expect(within(directory).getByRole('button', { name: 'اختيار الإسطبل' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(directory).getByRole('button', { name: 'اختيار مزارع الغذاء' }));
    expect(onSelect).toHaveBeenCalledWith('farm');
    expect(screen.getByRole('status')).toHaveTextContent('الإسطبل');
  });

  it('shows pending upgrades separately without claiming the target level is confirmed', () => {
    const view = fixture();
    const village = { ...view.villages[0], buildings: { ...view.villages[0].buildings, barracks: 2 },
      build: { building: 'barracks' as const, level: 3, endsAt: now + 60000 } };
    render(<VillageDirectory view={view} village={village} selected="stable" onSelect={vi.fn()} />);
    const stable = screen.getByRole('button', { name: 'اختيار الإسطبل' });
    expect(stable).toHaveTextContent('مستوى ٢');
    expect(stable).toHaveTextContent('قيد التطوير');
    expect(stable).toHaveAccessibleDescription('مستوى ٢ قيد التطوير');
    expect(stable).not.toHaveTextContent('مستوى ٣');
    expect(screen.getByRole('status')).toHaveTextContent('قسم الفرسان التابع للثكنة');
  });

  it('keeps unavailable building names discoverable and reports their resource state', () => {
    const view = fixture();
    const village = { ...view.villages[0], resources: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 } };
    render(<VillageDirectory view={view} village={village} selected={null} onSelect={vi.fn()} />);
    const barracks = screen.getByRole('button', { name: 'اختيار الثكنة' });
    expect(barracks).toHaveTextContent('لم يُبنَ');
    expect(barracks).toHaveTextContent('يحتاج موارد');
    expect(barracks).toHaveAccessibleDescription('لم يُبنَ يحتاج موارد');
    expect(barracks).not.toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('اختر مبنى');
  });
});
