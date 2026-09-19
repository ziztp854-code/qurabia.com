import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MafiaPlayerPicker } from './mafia-player-picker';

describe('MafiaPlayerPicker Accessibility', () => {
  it('uses native radio inputs for keyboard accessibility', () => {
    const players = [
      { id: 'p1', displayName: 'أحمد' },
      { id: 'p2', displayName: 'خالد' },
      { id: 'p3', displayName: 'محمد' },
    ];
    const onSelect = () => {};
    render(<MafiaPlayerPicker players={players} selectedId={null} onSelect={onSelect} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
  });

  it('supports arrow key navigation between radio options', async () => {
    const players = [
      { id: 'p1', displayName: 'أحمد' },
      { id: 'p2', displayName: 'خالد' },
      { id: 'p3', displayName: 'محمد' },
    ];
    let selected: string | null = null;
    const onSelect = (id: string) => {
      selected = id;
    };
    render(<MafiaPlayerPicker players={players} selectedId={null} onSelect={onSelect} />);
    const radios = screen.getAllByRole('radio');
    radios[0].focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(selected).toBe('p2');
  });

  it('supports Space to select an option', async () => {
    const players = [
      { id: 'p1', displayName: 'أحمد' },
      { id: 'p2', displayName: 'خالد' },
    ];
    let selected: string | null = null;
    const onSelect = (id: string) => {
      selected = id;
    };
    render(<MafiaPlayerPicker players={players} selectedId={null} onSelect={onSelect} />);
    const radios = screen.getAllByRole('radio');
    radios[1].focus();
    await userEvent.keyboard(' ');
    expect(selected).toBe('p2');
  });

  it('does not select disabled options', async () => {
    const players = [
      { id: 'p1', displayName: 'أحمد' },
      { id: 'p2', displayName: 'خالد' },
    ];
    let selected: string | null = null;
    const onSelect = (id: string) => {
      selected = id;
    };
    render(
      <MafiaPlayerPicker
        players={players}
        selectedId={null}
        onSelect={onSelect}
        disabledIds={['p2']}
        disabledLabel="تم التحقيق سابقًا"
      />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios[1]).toBeDisabled();
    expect(screen.getByText('تم التحقيق سابقًا')).toBeInTheDocument();
    await userEvent.click(radios[1]);
    expect(selected).toBeNull();
  });
});
