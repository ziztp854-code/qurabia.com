import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import ContactPage from '@/app/contact/page';
import { SupportAssistant } from './support-assistant';

vi.mock('@/components/layout', () => ({ SiteLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function ask(question = 'كيف أنضم إلى المسابقة؟') {
  fireEvent.change(screen.getByLabelText('سؤالك عن تحدّي'), { target: { value: question } });
  fireEvent.click(screen.getByRole('button', { name: 'أرسل السؤال' }));
}

describe('SupportAssistant', () => {
  it('only mounts the assistant for the configured provider and preserves support cards', () => {
    vi.stubEnv('LOBBY_ASSISTANT_PROVIDER', 'glm');
    const { rerender } = render(<ContactPage />);
    expect(screen.queryByRole('region', { name: 'اسأل مساعد تحدّي' })).not.toBeInTheDocument();
    vi.stubEnv('LOBBY_ASSISTANT_PROVIDER', 'openclaw');
    rerender(<ContactPage />);
    expect(screen.getByRole('region', { name: 'اسأل مساعد تحدّي' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'دعم المسابقات' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'الحساب والمحتوى' })).toBeInTheDocument();
  });

  it('sends a question and renders plain text with safe suggested routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      ok: true, reply: '<b>انضم برمز الغرفة</b>', suggestions: [
        { label: 'الانضمام', route: '/join' }, { label: 'رابط غير آمن', route: '//example.com' },
      ],
    }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<SupportAssistant />);
    expect(screen.getByRole('button', { name: 'أرسل السؤال' })).toBeDisabled();
    ask();
    expect(await screen.findByText('<b>انضم برمز الغرفة</b>')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'الانضمام' })).toHaveAttribute('href', '/join');
    expect(screen.queryByText('رابط غير آمن')).not.toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      topic: 'المساعدة في استخدام تحدّي', messages: [{ role: 'user', content: 'كيف أنضم إلى المسابقة؟' }],
    });
  });

  it('offers sign in when the session is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    render(<SupportAssistant />);
    ask();
    expect(await screen.findByRole('link', { name: 'سجّل الدخول' })).toHaveAttribute('href', '/auth/sign-in?callbackUrl=%2Fcontact');
  });

  it.each([429, 502, 503])('shows actionable error and retries the same request for %s', async (status) => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status }).mockResolvedValueOnce({
      ok: true, json: async () => ({ ok: true, reply: 'يمكنك الانضمام برمز.', suggestions: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SupportAssistant />);
    ask();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'أعد المحاولة' }));
    await screen.findByText('يمكنك الانضمام برمز.');
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
  });

  it('bounds history and truncates assistant context to the API limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, reply: 'أ'.repeat(500), suggestions: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<SupportAssistant />);
    for (let i = 0; i < 5; i += 1) {
      ask(`السؤال ${i}`);
      await waitFor(() => expect(screen.getByLabelText('سؤالك عن تحدّي')).toHaveValue(''));
    }
    const sent = JSON.parse(fetchMock.mock.calls[4][1].body);
    expect(sent.messages).toHaveLength(7);
    expect(sent.messages.every((message: { content: string }) => message.content.length <= 240)).toBe(true);
  });

  it('prevents duplicate sends and aborts the pending request on unmount', () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = render(<SupportAssistant />);
    ask();
    expect(screen.getByRole('button', { name: 'جارٍ الرد…' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signal = fetchMock.mock.calls[0][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it.each(['network', 'invalid'])('retains the draft after %s failure', async (failure) => {
    const fetchMock = failure === 'network' ? vi.fn().mockRejectedValue(new Error('private details')) :
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, reply: 123 }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<SupportAssistant />);
    ask();
    await screen.findByRole('alert');
    expect(screen.getByLabelText('سؤالك عن تحدّي')).toHaveValue('كيف أنضم إلى المسابقة؟');
    expect(screen.queryByText('private details')).not.toBeInTheDocument();
  });
});
