import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createWorld, executeCommand, projectWorld } from '@/lib/kingdoms/engine';
import { plantFarm, farmQuote, farmState } from '@/lib/kingdoms/sultan-farm';
import { SultanFarmPanel, FarmPlantVisual } from './sultan-farm-panel';
import type { GameProps } from '../shared';

const at = 1700000000000;
function props(ripe = false, legacy = false): GameProps {
  const world = executeCommand(
    createWorld(at),
    'owner',
    { type: 'found', name: 'Test garden' },
    at,
  );
  const village = Object.values(world.villages)[0];
  if (ripe)
    plantFarm(
      world.config,
      village,
      2,
      0,
      'wheat',
      at - farmQuote(world.config, 0, 'wheat').growMs,
    );
  if (legacy) {
    const state = farmState(village);
    state.plots[2] = {
      version: 9,
      plant: {
        crop: 'beans',
        plantedAt: at - 100000,
        readyAt: at - 1,
        seedFood: 10,
        harvestFood: 40,
        rotated: false,
        policyVersion: 1,
      },
    };
    village.sultanFarm = state;
  }
  return {
    view: {
      ...projectWorld(world, 'owner', at),
      worldId: 'test',
      worldName: 'Test',
      revision: 1,
      paused: false,
    },
    village,
    busy: false,
    send: vi.fn().mockResolvedValue(undefined),
  };
}
describe('Sultan garden RTL interaction', () => {
  it('opens the management game inside the farm and returns without sending kingdom commands', () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    const original = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = showModal;
    try {
      const p = props();
      const outerKeyDown = vi.fn();
      render(
        <div onKeyDown={outerKeyDown}>
          <SultanFarmPanel {...p} />
        </div>,
      );
      const trigger = screen.getByRole('button', { name: 'افتح لعبة المزرعة' });
      fireEvent.click(trigger);
      expect(showModal).toHaveBeenCalledOnce();
      fireEvent.keyDown(screen.getByRole('dialog', { name: 'لعبة إدارة مزرعة السلطان' }), {
        key: 'Escape',
      });
      expect(outerKeyDown).not.toHaveBeenCalled();
      const frame = screen.getByTitle('لعبة إدارة مزرعة السلطان');
      const url = new URL(frame.getAttribute('src')!, 'https://example.test');
      expect(url.pathname).toBe('/games/sultan-farm/index.html');
      expect(JSON.parse(url.searchParams.get('save')!)).toEqual([
        p.view.worldId,
        p.village.ownerId,
        p.village.id,
      ]);
      fireEvent.click(screen.getByRole('button', { name: 'العودة إلى المزرعة' }));
      expect(screen.queryByTitle('لعبة إدارة مزرعة السلطان')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      expect(p.send).not.toHaveBeenCalled();
    } finally {
      HTMLDialogElement.prototype.showModal = original;
    }
  });
  it('shows a badge earned in another village and never promises the same award again', () => {
    const p = props();
    p.view.player!.achievements.push('garden:first-bloom');
    render(<SultanFarmPanel {...p} />);
    fireEvent.click(screen.getByText('أوسمة الحديقة — المكتسب والأهداف'));
    expect(screen.getByText('أول حصاد — مكتسب')).toBeInTheDocument();
    expect(screen.getByText('وسام مكتسب لحسابك')).toBeInTheDocument();
    const preview = document.querySelector('[class*="reward"]')!;
    expect(preview.textContent).not.toContain('وسام أول حصاد');
  });
  it('shows 12 plots, ten plant choices including lotus, and free planting details', () => {
    const p = props();
    p.village.resources.food = 0;
    render(<SultanFarmPanel {...p} />);
    expect(screen.getByRole('region', { name: 'مزرعة السلطان' })).toHaveAttribute('dir', 'rtl');
    expect(
      screen.getByRole('group', { name: 'أحواض المزرعة' }).querySelectorAll('button'),
    ).toHaveLength(12);
    expect(
      within(screen.getByRole('group', { name: 'اختر النبات — البذور مجانية' })).getAllByRole(
        'button',
      ),
    ).toHaveLength(10);
    expect(screen.getByText('مدة النمو')).toBeInTheDocument();
    expect(screen.getByText(/الجمع يمنح حصادًا واحدًا/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /اللوتس.*متاح/ }));
    expect(screen.getByRole('button', { name: 'ازرع اللوتس' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /القمح.*متاح/ }));
    fireEvent.click(screen.getByRole('button', { name: 'الحوض 4، فارغ' }));
    fireEvent.click(screen.getByRole('button', { name: 'ازرع القمح' }));
    expect(p.send).toHaveBeenCalledWith({
      type: 'farmPlant',
      villageId: p.village.id,
      plotId: 3,
      expectedVersion: 0,
      crop: 'wheat',
      expectedQuote: farmQuote(p.view.config, 0, 'wheat').quoteKey,
    });
    fireEvent.click(screen.getByRole('button', { name: /السوسن.*متبقي/ }));
    expect(screen.getByRole('button', { name: 'ازرع السوسن' })).toBeDisabled();
    expect(screen.getByText(/لفتح السوسن: المكتسب/)).toBeInTheDocument();
  });
  it('summarizes the 12 real beds and exposes all five growth stages in the selected detail', () => {
    const p = props(true);
    render(<SultanFarmPanel {...p} />);
    expect(screen.getByText('١١ فارغ')).toBeInTheDocument();
    expect(screen.getByText('١ ناضج')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'الحوض 3، القمح، ناضج' }));
    const stages = screen.getByRole('list', { name: 'مراحل النمو' });
    expect(within(stages).getAllByRole('listitem')).toHaveLength(5);
    expect(within(stages).getByText('ناضج').closest('li')).toHaveAttribute('aria-current', 'step');
  });
  it('collects explicitly with version, even at full storage; the timer sends no commands', () => {
    const p = props(true);
    p.village.resources.food = 999999;
    render(<SultanFarmPanel {...p} />);
    expect(p.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'الحوض 3، القمح، ناضج' }));
    const collect = screen.getByRole('button', { name: /اجمع الحوض/ });
    expect(collect).toBeEnabled();
    fireEvent.click(collect);
    expect(p.send).toHaveBeenCalledWith({
      type: 'farmHarvest',
      villageId: p.village.id,
      plotId: 2,
      expectedVersion: 1,
    });
  });
  it('discloses the frozen paid old reward and keeps it when storage is full', () => {
    const p = props(false, true);
    p.village.resources.food = 999999;
    render(<SultanFarmPanel {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'الحوض 3، الفاصوليا، ناضج' }));
    expect(screen.getByText(/محصول قديم مدفوع/)).toBeInTheDocument();
    expect(screen.getByText(/المخزن لا يسع المحصول القديم/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /احصد الحوض/ })).toBeDisabled();
  });
  it('shows earned and remaining badge goals, and locked decoration without a price', () => {
    const p = props();
    p.village.sultanFarm = {
      ...farmState(p.village),
      garden: {
        version: 1,
        harvests: 5,
        collected: { wheat: 2, beans: 2, rose: 1 },
        style: 'natural',
      },
    };
    p.view.player!.achievements = [
      'merchant',
      'garden:first-bloom',
      'garden:variety',
      'garden:caretaker',
    ];
    render(<SultanFarmPanel {...p} />);
    fireEvent.click(screen.getByText('أوسمة الحديقة — المكتسب والأهداف'));
    expect(screen.getByText('راعي الحديقة — مكتسب')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /إطار عاجي.*طبّق/ }));
    expect(p.send).toHaveBeenCalledWith({
      type: 'farmStyle',
      villageId: p.village.id,
      style: 'ivory',
    });
    expect(screen.getByRole('button', { name: /إطار ذهبي.*متبقي/ })).toBeDisabled();
  });
  it('renders the saved frame and preserves a new bed draft across an older request completion', () => {
    const p = props();
    p.village.sultanFarm = {
      ...farmState(p.village),
      garden: { version: 1, harvests: 12, collected: { wheat: 12 }, style: 'ivory' },
    };
    const rendered = render(<SultanFarmPanel {...p} />);
    const farm = screen.getByRole('region', { name: 'مزرعة السلطان' });
    expect(farm).toHaveAttribute('data-garden-style', 'ivory');
    expect(screen.getByRole('button', { name: /إطار عاجي.*مطبّق/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /إطار ذهبي.*طبّق/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: 'الحوض 5، فارغ' }));
    fireEvent.click(screen.getByRole('button', { name: /دوار الشمس.*متاح/ }));
    expect(screen.getByRole('button', { name: 'ازرع دوار الشمس' })).toBeEnabled();
    rendered.rerender(<SultanFarmPanel {...p} busy />);
    expect(screen.getByRole('button', { name: 'الحوض 5، فارغ' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'ازرع دوار الشمس' })).toBeDisabled();
  });
  it('disables planting, collecting and decoration while paused, busy or ended', () => {
    const p = props();
    p.view.paused = true;
    render(<SultanFarmPanel {...p} />);
    expect(screen.getByRole('button', { name: 'ازرع القمح' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /أحواض طبيعية/ })).toBeDisabled();
  });
  it('renders photographic crop assets with declared ripe/seed stages', () => {
    const make = (crop: 'rose' | 'jasmine' | 'lotus') => ({
      crop,
      plantedAt: at - 60000,
      readyAt: at,
      seedFood: 0 as const,
      harvestFood: 0 as const,
      rotated: false as const,
      policyVersion: 2 as const,
    });
    const { container, rerender } = render(<FarmPlantVisual plant={make('rose')} now={at} />);
    expect(container.querySelector('image')).toHaveAttribute(
      'href',
      expect.stringContaining('rose-ripe.webp'),
    );
    expect(container.querySelector('g[transform]')).toHaveAttribute('transform');
    expect(container.querySelector('g[transform] > g > image')).toBeInTheDocument();
    rerender(<FarmPlantVisual plant={make('jasmine')} now={at} />);
    expect(container.querySelector('image')).toHaveAttribute(
      'href',
      expect.stringContaining('jasmine-ripe.webp'),
    );
    expect(container.querySelector('svg')).toHaveAttribute('data-stage', 'ripe');
    rerender(<FarmPlantVisual plant={make('lotus')} now={at - 60000} />);
    expect(container.querySelector('svg')).toHaveAttribute('data-stage', 'seed');
    expect(container.querySelector('image')).not.toBeInTheDocument();
  });
});
