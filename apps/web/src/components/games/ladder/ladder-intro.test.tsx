import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LadderIntro } from './ladder-intro';

const motionPreference = vi.hoisted(() => ({ reduced: false }));
vi.mock('framer-motion', () => ({ useReducedMotion: () => motionPreference.reduced }));

const props = { rightName: 'عبدالعزيز', leftName: '<خالد>', startedAt: 1000, endsAt: 10775, serverNow: 4000 };

describe('LadderIntro', () => {
  beforeEach(() => {
    motionPreference.reduced = false;
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows actual names as text and resumes the shared timeline', async () => {
    render(<LadderIntro {...props} />);
    expect(screen.getByText('<خالد>')).toBeInTheDocument();
    expect(screen.getByText('عبدالعزيز')).toBeInTheDocument();
    const video = screen.getByLabelText('مقدمة مواجهة السلم') as HTMLVideoElement;
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBeGreaterThanOrEqual(3);
    expect(video.currentTime).toBeLessThan(3.5);
    expect(video).toHaveAttribute('playsinline');
    expect(video).not.toHaveAttribute('loop');
    await waitFor(() => expect(video.play).toHaveBeenCalled());
  });

  it('falls back to muted playback and offers explicit sound activation', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
    render(<LadderIntro {...props} />);
    const video = screen.getByLabelText('مقدمة مواجهة السلم') as HTMLVideoElement;
    await waitFor(() => expect(video.muted).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'تشغيل الصوت' }));
    await waitFor(() => expect(video.muted).toBe(false));
    expect(screen.getByRole('button', { name: 'كتم الصوت' })).toBeInTheDocument();
  });

  it('waits for the server after the media ends instead of opening a question', async () => {
    render(<LadderIntro {...props} />);
    await act(async () => fireEvent.ended(screen.getByLabelText('مقدمة مواجهة السلم')));
    expect(screen.getByRole('status')).toHaveTextContent('بانتظار السؤال الأول');
    expect(screen.queryByText('السؤال الأول', { exact: true })).not.toBeInTheDocument();
  });

  it('keeps a readable matchup when media cannot load', () => {
    render(<LadderIntro {...props} />);
    fireEvent.error(screen.getByLabelText('مقدمة مواجهة السلم'));
    expect(screen.getByRole('status')).toHaveTextContent('تعذّر تشغيل المقدمة');
    expect(screen.getByText('عبدالعزيز')).toBeVisible();
  });

  it('preloads without playback while waiting then uses the same video when the intro starts', async () => {
    const { rerender } = render(<LadderIntro {...props} active={false} />);
    const video = screen.getByLabelText('مقدمة مواجهة السلم');
    expect(video).toHaveAttribute('preload', 'auto');
    expect(video).not.toBeVisible();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    rerender(<LadderIntro {...props} active />);
    expect(screen.getByLabelText('مقدمة مواجهة السلم')).toBe(video);
    await waitFor(() => expect(video).toBeVisible());
  });

  it('respects reduced motion with a static matchup and no automatic audio', () => {
    motionPreference.reduced = true;
    render(<LadderIntro {...props} />);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(screen.getByText('VS')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers retryable sound control even if both autoplay attempts are blocked', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error('blocked'));
    render(<LadderIntro {...props} />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('تعذّر تشغيل المقدمة'));
    fireEvent.click(screen.getByRole('button', { name: 'تشغيل الصوت' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'تشغيل الصوت' })).toBeInTheDocument());
    vi.mocked(HTMLMediaElement.prototype.play).mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'تشغيل الصوت' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'كتم الصوت' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'كتم الصوت' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'تشغيل الصوت' })).toBeInTheDocument());
  });
});
