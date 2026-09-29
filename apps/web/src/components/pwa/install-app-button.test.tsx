import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallAppButton } from './install-app-button';

const browserNavigator = navigator;

beforeEach(() => {
  vi.stubGlobal('navigator', browserNavigator);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('installing Tahaddi', () => {
  it('opens accessible instructions for iPhone and Android when no browser prompt is available', async () => {
    const user = userEvent.setup();
    render(<InstallAppButton />);
    await user.click(screen.getByRole('button', { name: 'تثبيت التطبيق' }));
    expect(screen.getByRole('dialog', { name: 'ثبّت تحدّي على جهازك' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'iPhone وiPad' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Android' })).toBeVisible();
    expect(screen.getByText(/فعّل «فتح كتطبيق ويب»/)).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تثبيت التطبيق' })).toHaveFocus();
  });

  it('uses the available browser install prompt and hides the action after acceptance', async () => {
    const user = userEvent.setup();
    render(<InstallAppButton />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(true);
    await user.click(screen.getByRole('button', { name: 'تثبيت التطبيق' }));
    expect(prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'تثبيت التطبيق' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers manual instructions after dismissal and never reuses a consumed browser prompt', async () => {
    const user = userEvent.setup();
    render(<InstallAppButton />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    fireEvent(
      window,
      Object.assign(new Event('beforeinstallprompt'), {
        prompt,
        userChoice: Promise.resolve({ outcome: 'dismissed' }),
      }),
    );
    await user.click(screen.getByRole('button', { name: 'تثبيت التطبيق' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'فهمت' }));
    await user.click(screen.getByRole('button', { name: 'تثبيت التطبيق' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(prompt).toHaveBeenCalledOnce();
  });

  it('provides manual fallback when the native browser prompt fails', async () => {
    const user = userEvent.setup();
    render(<InstallAppButton />);
    fireEvent(
      window,
      Object.assign(new Event('beforeinstallprompt'), {
        prompt: vi.fn().mockRejectedValue(new Error('Browser prompt unavailable')),
        userChoice: Promise.resolve({ outcome: 'dismissed' }),
      }),
    );
    await user.click(screen.getByRole('button', { name: 'تثبيت التطبيق' }));
    expect(screen.getByRole('alert')).toHaveTextContent('يمكنك استخدام الخطوات التالية');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('hides the action when the site is already running as a standalone app', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    render(<InstallAppButton />);
    expect(screen.queryByRole('button', { name: 'تثبيت التطبيق' })).not.toBeInTheDocument();
  });

  it('recognizes the installed iOS standalone state', () => {
    vi.stubGlobal('navigator', Object.create(navigator, { standalone: { value: true } }));
    render(<InstallAppButton />);
    expect(screen.queryByRole('button', { name: 'تثبيت التطبيق' })).not.toBeInTheDocument();
  });

  it('closes instructions and hides the install action when the browser reports installation', async () => {
    const user = userEvent.setup();
    render(<InstallAppButton />);
    await user.click(screen.getByRole('button', { name: 'تثبيت التطبيق' }));
    fireEvent(window, new Event('appinstalled'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تثبيت التطبيق' })).not.toBeInTheDocument();
  });

  it('hides the install action when display mode changes to standalone', () => {
    const query = Object.assign(new EventTarget(), { matches: false });
    vi.spyOn(window, 'matchMedia').mockReturnValue(query as unknown as MediaQueryList);
    render(<InstallAppButton />);
    Object.defineProperty(query, 'matches', { value: true });
    act(() => query.dispatchEvent(new Event('change')));
    expect(screen.queryByRole('button', { name: 'تثبيت التطبيق' })).not.toBeInTheDocument();
  });

  it('releases browser event listeners when the install control unmounts', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const query = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.spyOn(window, 'matchMedia').mockReturnValue(query as unknown as MediaQueryList);
    const view = render(<InstallAppButton />);
    view.unmount();
    expect(remove).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('appinstalled', expect.any(Function));
    expect(query.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
