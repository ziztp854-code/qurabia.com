import { StrictMode } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollEnhancement } from './scroll-enhancement';

const state = vi.hoisted(() => ({ pathname: '/', cleanup: vi.fn(), start: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('./load-scroll-runtime', () => ({
  loadScrollRuntime: () => Promise.resolve({ startScrollRuntime: state.start }),
}));

describe('deferred scroll lifecycle', () => {
  beforeEach(() => {
    state.pathname = '/';
    state.cleanup.mockReset();
    state.start.mockReset().mockReturnValue(state.cleanup);
  });
  it('initializes once in StrictMode and cleans up on a game route', async () => {
    const view = render(
      <StrictMode>
        <ScrollEnhancement />
      </StrictMode>,
    );
    await waitFor(() => expect(state.start).toHaveBeenCalledTimes(1));
    state.pathname = '/games/kingdoms/world-map';
    view.rerender(
      <StrictMode>
        <ScrollEnhancement />
      </StrictMode>,
    );
    expect(state.cleanup).toHaveBeenCalledTimes(1);
    await act(async () => {
      await Promise.resolve();
    });
    expect(state.start).toHaveBeenCalledTimes(1);
  });
  it('does not start when unmounted while import is pending', async () => {
    const view = render(<ScrollEnhancement />);
    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(state.start).not.toHaveBeenCalled();
  });
  it('switches to native scroll immediately when the live motion preference changes', async () => {
    const preference = new EventTarget();
    Object.assign(preference, { matches: false });
    const mock = vi.spyOn(window, 'matchMedia').mockReturnValue(preference as MediaQueryList);
    const view = render(<ScrollEnhancement />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(state.start).toHaveBeenCalledTimes(1);
    Object.assign(preference, { matches: true });
    act(() => {
      preference.dispatchEvent(new Event('change'));
    });
    expect(state.cleanup).toHaveBeenCalledTimes(1);
    Object.assign(preference, { matches: false });
    await act(async () => {
      preference.dispatchEvent(new Event('change'));
      await Promise.resolve();
    });
    expect(state.start).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(state.cleanup).toHaveBeenCalledTimes(2);
    mock.mockRestore();
  });
});
