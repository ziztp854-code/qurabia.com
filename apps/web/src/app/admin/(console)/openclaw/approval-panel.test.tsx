import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApprovalPanel } from './approval-panel';

const proposal = {
  id: 'proposal-1', resourceId: 'question-1', result: 'PENDING',
  createdAt: new Date().toISOString(),
  before: { status: 'APPROVED', version: 3, lastEditedAt: '2026-10-15T08:00:00Z' },
  after: { status: 'ARCHIVED', reason: '<img src=x onerror=alert(1)>' },
};

function mockRequests() {
  const request = vi.fn().mockImplementation((_url, options) => Promise.resolve({
    ok: true,
    json: async () => options?.method === 'POST'
      ? { ok: true }
      : { ok: true, proposals: [proposal] },
  }));
  vi.stubGlobal('fetch', request);
  return request;
}

afterEach(() => vi.unstubAllGlobals());

describe('OpenClaw owner approval', () => {
  it('only reads on entry and renders the exact change as escaped text', async () => {
    const request = mockRequests();
    const { container } = render(<ApprovalPanel />);
    await screen.findByText('question-1');
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
    expect(screen.getByText('ARCHIVED')).toBeInTheDocument();
    expect(screen.getByText(proposal.after.reason)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]?.method).not.toBe('POST');
    expect(screen.getByRole('button', { name: 'الموافقة وتنفيذ التغيير' })).toBeDisabled();
  });

  it('requires explicit acknowledgement and sends only the stored proposal ID', async () => {
    const request = mockRequests();
    render(<ApprovalPanel />);
    await screen.findByText('question-1');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'الموافقة وتنفيذ التغيير' }));
    await screen.findByText('تم تنفيذ التغيير الذي وافقت عليه.');
    const post = request.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(post![1].body)).toEqual({ id: proposal.id, decision: 'approve' });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('rejects without approving or providing replacement arguments', async () => {
    const request = mockRequests();
    render(<ApprovalPanel />);
    await screen.findByText('question-1');
    fireEvent.click(screen.getByRole('button', { name: 'رفض الطلب' }));
    await screen.findByText('تم رفض الطلب دون تغيير السؤال.');
    const post = request.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(post![1].body)).toEqual({ id: proposal.id, decision: 'reject' });
  });

  it('shows a safe error and reloads after a server conflict', async () => {
    const request = mockRequests();
    render(<ApprovalPanel />);
    await screen.findByText('question-1');
    request.mockImplementationOnce(() => Promise.resolve({ ok: false, json: async () => ({ error: 'private detail' }) }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'الموافقة وتنفيذ التغيير' }));
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private detail');
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  });
});
