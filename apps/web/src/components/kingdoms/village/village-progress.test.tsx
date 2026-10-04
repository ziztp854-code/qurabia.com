import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { VillageProgress } from './village-progress';
import { ConstructionQueue } from './construction-queue';
import type { WorldView } from '../shared';
import { BuildingPanel } from '../building-panel';

afterEach(cleanup);
const now = 1800000000000;
function fixture() {
  let world = executeCommand(createWorld(now), 'p', { type: 'found', name: 'اختبار' }, now);
  const id = Object.keys(world.villages)[0];
  world = executeCommand(world, 'p', { type: 'build', villageId: id, building: 'farm' }, now);
  world = executeCommand(world, 'p', { type: 'build', villageId: id, building: 'wall' }, now);
  const view: WorldView = { ...projectWorld(world, 'p', now), worldId: 'w', worldName: 'عالم', revision: 2, paused: false };
  return { view, village: view.villages[0] };
}
it('shows only server progression and exposes milestone requirements and max level', () => {
  const { view, village } = fixture();
  const progression = { ...village.progression!, level: 12, rank: 'قرية مزدهرة', visualTier: 3, xp: 2400, levelStartXp: 2000, nextLevelXp: 2600,
    requirements: [{ building: 'hall' as const, required: 8, actual: 7 }] };
  const rendered = render(<VillageProgress village={{ ...village, progression }} config={view.config} />);
  expect(screen.getByText(village.name)).toBeInTheDocument();
  expect(screen.getByLabelText('مرتبة المظهر')).toHaveTextContent('قرية مزدهرة');
  expect(screen.getByLabelText('مستوى القرية')).toHaveTextContent('١٢');
  expect(screen.getByLabelText('قوة القرية')).toHaveTextContent(String(new Intl.NumberFormat('ar-SA').format(progression.power.total)));
  expect(screen.getByRole('navigation', { name: 'تنقل القرية' })).toHaveTextContent('البناء');
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '400');
  expect(screen.getByText(/دار الحكم.*٨/)).toBeInTheDocument();
  rendered.rerender(<VillageProgress village={{ ...village, progression: { ...progression, nextLevelXp: null } }} config={view.config} />);
  expect(screen.getByText('بلغت القرية أعلى مستوى')).toBeInTheDocument();
  rendered.rerender(<VillageProgress village={{ ...village, progression: undefined }} config={view.config} />);
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});
it('lists server queue schedules and sends cancellation intent without granting refunds locally', () => {
  const { view, village } = fixture();
  const send = vi.fn();
  render(<ConstructionQueue view={view} village={village} send={send} busy={false} />);
  expect(screen.getByText('قيد البناء')).toBeInTheDocument();
  expect(screen.getByText('في الانتظار')).toBeInTheDocument();
  expect(screen.getByText(/المتبقي/)).toBeInTheDocument();
  expect(screen.getAllByText(/يبدأ/)).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /إلغاء.*السور/ }));
  expect(send).toHaveBeenCalledWith({ type: 'cancelBuild', villageId: village.id, itemId: village.constructionQueue![1].id });
});
it('prices and previews the next queued upgrade, then blocks a full queue', () => {
  const { view, village } = fixture();
  const pending = village.constructionQueue![0];
  const next = { ...village, resources: { wood: 5000, stone: 5000, iron: 5000, food: 5000, gold: 5000 }, constructionQueue: [pending, { ...pending, id: 'second', fromLevel: 1, targetLevel: 2, status: 'QUEUED' as const }] };
  const send = vi.fn();
  const rendered = render(<BuildingPanel view={view} village={next} send={send} busy={false} building="farm" onClose={vi.fn()} />);
  expect(screen.getByText(/المستوى التالي/)).toHaveTextContent('٣');
  fireEvent.click(screen.getByRole('button', { name: 'أضف إلى قائمة البناء' }));
  expect(send).toHaveBeenCalledWith({ type: 'build', villageId: village.id, building: 'farm' });
  fireEvent.click(screen.getByRole('tab', { name: 'إنتاج' }));
  expect(screen.getByText(/الإنتاج بعد الترقية/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'ترقية' }));
  rendered.rerender(<BuildingPanel view={{ ...view, config: { ...view.config, construction: { maxPending: 2, historyLimit: 100, queuedRefund: 1, activeRefund: 0.5 } } }} village={next} send={send} busy={false} building="farm" onClose={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'أضف إلى قائمة البناء' })).toBeDisabled();
});
