import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PalaceGarden } from './palace-garden';
afterEach(() => vi.unstubAllGlobals());
const response = (slots: { slotId: number; itemId: string }[] = [], playerId = 'alice', villageId = 'a') =>
  new Response(JSON.stringify({ success: true, data: { worldId: 'world', villageId, playerId, revision: 8, slots } }));
describe('Palace garden editor', () => {
  it('shows slot targets only during editing and saves a real flower asset then refetches', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response([{ slotId: 0, itemId: 'red-roses' }]))
      .mockResolvedValueOnce(response([{ slotId: 0, itemId: 'red-roses' }]));
    vi.stubGlobal('fetch', fetcher);
    render(<PalaceGarden worldId="world" villageId="a" playerId="alice" />);
    await screen.findByRole('button', { name: 'تخصيص الحديقة' });
    expect(screen.queryByRole('button', { name: 'مساحة الحديقة 1' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تخصيص الحديقة' }));
    expect(screen.getAllByRole('button', { name: /مساحة الحديقة/ })).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: 'مساحة الحديقة 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'ورد أحمر' }));
    expect(screen.getByRole('img', { name: 'ورد أحمر في مساحة 1' })).toHaveAttribute('src', '/game-art/kingdoms/city-scenes/garden/red-roses.webp');
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الحديقة' }));
    await screen.findByText('حُفظت حديقتك.');
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ worldId: 'world', villageId: 'a', slots: [{ slotId: 0, itemId: 'red-roses' }] });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('button', { name: 'مساحة الحديقة 1' })).not.toBeInTheDocument();
  });
  it('cancels unsaved edits and keeps the saved garden intact', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
    render(<PalaceGarden worldId="world" villageId="a" playerId="alice" />);
    fireEvent.click(await screen.findByRole('button', { name: 'تخصيص الحديقة' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'اختيار مساحة الحديقة' }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'ورد أحمر' }));
    expect(screen.getByText('تغييرات غير محفوظة')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء التعديل' }));
    expect(screen.queryByRole('img', { name: 'ورد أحمر في مساحة 3' })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('retains edits after save failure so the owner can retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response()).mockRejectedValue(new Error('تعذّر الاتصال.')));
    render(<PalaceGarden worldId="world" villageId="a" playerId="alice" />);
    fireEvent.click(await screen.findByRole('button', { name: 'تخصيص الحديقة' }));
    fireEvent.click(screen.getByRole('button', { name: 'مساحة الحديقة 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'ورد أحمر' }));
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الحديقة' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'حفظ الحديقة' })).toBeEnabled();
    expect(screen.getByRole('img', { name: 'ورد أحمر في مساحة 1' })).toBeInTheDocument();
  });
  it('does not leak a previous player garden when an old response arrives after switching', async () => {
    let resolveAlice!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveAlice = resolve; });
    const fetcher = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(response([], 'bob', 'b'));
    vi.stubGlobal('fetch', fetcher);
    const { rerender } = render(<PalaceGarden worldId="world" villageId="a" playerId="alice" />);
    rerender(<PalaceGarden worldId="world" villageId="b" playerId="bob" />);
    await screen.findByRole('button', { name: 'تخصيص الحديقة' });
    resolveAlice(response([{ slotId: 0, itemId: 'red-roses' }]));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('img', { name: 'ورد أحمر في مساحة 1' })).not.toBeInTheDocument();
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
