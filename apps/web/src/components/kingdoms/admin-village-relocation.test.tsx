import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createWorld, executeCommand } from '@/lib/kingdoms/engine';
import { provisionVillageGeography } from '@/lib/mamluk-map/village-geography';
import { AdminVillageRelocation } from './admin-village-relocation';

function fixture(used = false) {
  const state = provisionVillageGeography(
    'world1',
    executeCommand(createWorld(1000), 'amira', { type: 'found', name: 'Amira' }, 1000),
  );
  const villageId = Object.keys(state.villages)[0]!;
  const geography = used
    ? {
        ...state.geography!,
        villageRelocations: {
          [villageId]: { actorId: 'amira', at: 2000, longitude: 35, latitude: 32 },
        },
      }
    : state.geography;
  return { world: { id: 'world1', state: { ...state, geography } }, villageId };
}
function chooseAndEnter(villageId: string) {
  fireEvent.change(screen.getByLabelText('القرية المطلوب نقلها'), { target: { value: villageId } });
  fireEvent.change(screen.getByLabelText('خط طول الوجهة'), { target: { value: '٥١٫٥٣٠٩٦' } });
  fireEvent.change(screen.getByLabelText('خط عرض الوجهة'), { target: { value: '٢٥٫٢٨٥٤٥' } });
}
describe('administrator relocation consent', () => {
  it('shows the selected owner and location and requires consent before submitting normalized coordinates', () => {
    const { world, villageId } = fixture();
    const submit = vi.fn();
    render(<AdminVillageRelocation world={world} paused={false} busy={false} onSubmit={submit} />);
    chooseAndEnter(villageId);
    expect(screen.getByText('Amira', { selector: 'dd' })).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'تأكيد النقل الإداري' });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(button);
    expect(submit).toHaveBeenCalledExactlyOnceWith({
      action: 'relocate',
      worldId: 'world1',
      villageId,
      expectedOwnerId: 'amira',
      longitude: 51.53096,
      latitude: 25.28545,
      confirmed: true,
    });
  });
  it('resets consent when the destination changes', () => {
    const { world, villageId } = fixture();
    const submit = vi.fn();
    render(<AdminVillageRelocation world={world} paused={false} busy={false} onSubmit={submit} />);
    chooseAndEnter(villageId);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('خط طول الوجهة'), { target: { value: '52' } });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'تأكيد النقل الإداري' })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });
  it.each([
    { used: true, paused: false, busy: false },
    { used: false, paused: true, busy: false },
    { used: false, paused: false, busy: true },
  ])('blocks unavailable transfers %o', ({ used, paused, busy }) => {
    const { world, villageId } = fixture(used);
    const submit = vi.fn();
    render(<AdminVillageRelocation world={world} paused={paused} busy={busy} onSubmit={submit} />);
    fireEvent.change(screen.getByLabelText('القرية المطلوب نقلها'), {
      target: { value: villageId },
    });
    expect(screen.getByRole('button', { name: 'تأكيد النقل الإداري' })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });
  it('rejects invalid coordinates without sending an operation', () => {
    const { world, villageId } = fixture();
    const submit = vi.fn();
    render(<AdminVillageRelocation world={world} paused={false} busy={false} onSubmit={submit} />);
    chooseAndEnter(villageId);
    fireEvent.change(screen.getByLabelText('خط طول الوجهة'), { target: { value: '180' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد النقل الإداري' }));
    expect(screen.getByRole('alert')).toHaveTextContent('اختر إحداثيات');
    expect(submit).not.toHaveBeenCalled();
  });
});
