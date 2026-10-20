import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), fetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { ProfileOverview } from './profile-overview';
const props = {
  accountNumber: 123456789,
  profile: { displayName: 'عبدالعزيز', username: 'aziz', bio: 'أحب التحدّي', image: null },
  role: 'USER',
  planCode: 'KNIGHT' as const,
  followers: 12,
  following: 3,
  joined: 'أغسطس ٢٠٢٦',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
});
const open = () => fireEvent.click(screen.getByRole('button', { name: 'تعديل البروفايل' }));
describe('ProfileOverview', () => {
  it('renders real social counts and lets a new account create its identity without admin privileges', () => {
    render(<ProfileOverview {...props} profile={{ ...props.profile, username: null, bio: '' }} />);
    expect(screen.getAllByRole('definition')).toHaveLength(2);
    expect(screen.getByText('أضف اسم مستخدم')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إضافة صورة شخصية' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'إدارة المنصة' })).not.toBeInTheDocument();
    open();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('keeps invalid input and focuses a linked error summary before any request', async () => {
    render(<ProfileOverview {...props} />);
    open();
    fireEvent.change(screen.getByLabelText('اسم المستخدم'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    const alert = screen.getByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(within(alert).getByRole('link')).toHaveAttribute('href', '#profile-username');
    expect(screen.getByLabelText('اسم المستخدم')).toHaveValue('x');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('prevents duplicate submissions and updates identity only after confirmed persistence', async () => {
    let resolve!: (value: unknown) => void;
    mocks.fetch.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<ProfileOverview {...props} />);
    open();
    fireEvent.change(screen.getByLabelText('الاسم الظاهر'), { target: { value: 'الاسم الجديد' } });
    const button = screen.getByRole('button', { name: 'حفظ التغييرات' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'عبدالعزيز' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    resolve({
      ok: true,
      json: async () => ({ profile: { ...props.profile, displayName: 'الاسم الجديد' } }),
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'الاسم الجديد' })).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
    const sent = mocks.fetch.mock.calls[0][1].body as FormData;
    expect(sent.get('displayName')).toBe('الاسم الجديد');
    expect(sent.has('role')).toBe(false);
  });
  it('keeps the editor and typed values on conflict so the user can retry', async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ code: 'USERNAME_TAKEN', error: 'اسم المستخدم مستخدم بالفعل.' }),
    });
    render(<ProfileOverview {...props} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));
    await waitFor(() =>
      expect(screen.getByLabelText('اسم المستخدم')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('اسم المستخدم')).toHaveValue('aziz');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus());
    expect(screen.getByRole('button', { name: 'حفظ التغييرات' })).toBeEnabled();
  });
});
