import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MafiaGameSettings } from './mafia-game-settings';

describe('MafiaGameSettings', () => {
  it('updates the composition and restricts killers to the selected player count', async () => {
    const user = userEvent.setup();
    render(
      <form aria-label="إعدادات الغرفة">
        <MafiaGameSettings />
      </form>,
    );
    const players = screen.getByRole('spinbutton', { name: 'عدد اللاعبين المتوقع' });
    await user.click(screen.getByText('إعدادات متقدمة'));
    const killers = screen.getByRole('combobox', { name: 'عدد القتلة' });
    await user.selectOptions(killers, '3');
    expect(within(screen.getByRole('status')).getByText('3 قاتل')).toBeInTheDocument();
    await user.clear(players);
    await user.type(players, '5');
    expect(killers).toHaveValue('1');
    expect(screen.getByRole('option', { name: 'قاتلان' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'ثلاثة قتلة' })).toBeDisabled();
    const preview = within(screen.getByRole('status'));
    expect(preview.queryByText('1 حارس')).not.toBeInTheDocument();
    expect(preview.queryByText('1 شاهد')).not.toBeInTheDocument();
    expect(preview.getByText('2 مواطن')).toBeInTheDocument();
    const form = screen.getByRole('form');
    expect(new FormData(form as HTMLFormElement).get('killerCount')).toBe('1');
  });

  it('changes timers without changing the group size or killer choice', async () => {
    const user = userEvent.setup();
    render(
      <form>
        <MafiaGameSettings />
      </form>,
    );
    await user.click(screen.getByText('إعدادات متقدمة'));
    await user.selectOptions(screen.getByRole('combobox', { name: 'عدد القتلة' }), '2');
    const players = screen.getByRole('spinbutton', { name: 'عدد اللاعبين المتوقع' });
    await user.clear(players);
    await user.type(players, '8');
    await user.click(screen.getByRole('radio', { name: /السريع/ }));
    expect(players).toHaveValue(8);
    expect(screen.getByRole('combobox', { name: 'عدد القتلة' })).toHaveValue('2');
    expect(screen.getByRole('spinbutton', { name: 'وقت الليل (ثانية)' })).toHaveValue(23);
    expect(screen.getByRole('spinbutton', { name: 'وقت النهار (ثانية)' })).toHaveValue(45);
    expect(screen.getByRole('spinbutton', { name: 'وقت التصويت (ثانية)' })).toHaveValue(23);
    expect(within(screen.getByRole('status')).getByText('1 شاهد')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /كلاسيكي/ }));
    expect(players).toHaveValue(8);
    expect(screen.getByRole('spinbutton', { name: 'وقت الليل (ثانية)' })).toHaveValue(45);
  });

  it('keeps incomplete modes unavailable', () => {
    render(<MafiaGameSettings />);
    for (const name of [/الأعمى/, /القاتل المنفرد/, /الفوضى/]) {
      expect(screen.getByRole('radio', { name })).toBeDisabled();
    }
  });
});
