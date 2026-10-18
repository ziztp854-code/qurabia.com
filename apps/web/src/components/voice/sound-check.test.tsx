import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundCheck } from './sound-check';

const m = {
  stop: vi.fn(),
  close: vi.fn(),
  getUserMedia: vi.fn(),
  resume: vi.fn(),
  signal: false,
  oscillatorStart: vi.fn(),
  sink: vi.fn(),
};
const borrowed = {
  readyState: 'live',
  enabled: true,
  stop: vi.fn(),
} as unknown as MediaStreamTrack;
class Context {
  state = 'running';
  currentTime = 0;
  destination = {};
  close = m.close;
  resume = m.resume;
  setSinkId = m.sink;
  createAnalyser() {
    return {
      fftSize: 512,
      disconnect: vi.fn(),
      getByteTimeDomainData: (data: Uint8Array) => data.fill(m.signal ? 150 : 128),
    };
  }
  createMediaStreamSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: m.oscillatorStart,
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
  }
}
const props = {
  inputId: 'default',
  outputId: 'default',
  roomMicActive: false,
  getMicrophoneTrack: () => undefined,
};
function open() {
  const details = screen.getByText('فحص الصوت').closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
}
async function click(name: string) {
  await act(async () => fireEvent.click(screen.getByRole('button', { name })));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  m.signal = false;
  m.close.mockResolvedValue(undefined);
  m.resume.mockResolvedValue(undefined);
  m.sink.mockResolvedValue(undefined);
  m.getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: m.stop }] });
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor(public tracks: MediaStreamTrack[]) {}
      getTracks() {
        return this.tracks;
      }
    },
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: m.getUserMedia },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('local sound check privacy and lifecycle', () => {
  it('does not open a microphone or play audio without an explicit action', () => {
    const view = render(<SoundCheck {...props} />);
    open();
    expect(m.getUserMedia).not.toHaveBeenCalled();
    expect(m.oscillatorStart).not.toHaveBeenCalled();
    view.unmount();
  });
  it('measures a local signal and stops owned capture automatically', async () => {
    m.signal = true;
    const view = render(<SoundCheck {...props} />);
    open();
    await click('اختبار الميكروفون');
    expect(m.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: false }));
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole('meter')).toHaveAttribute('value', '100');
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText('رُصد صوت من الميكروفون على هذا الجهاز.')).toBeInTheDocument();
    expect(m.stop).toHaveBeenCalled();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('never stops the borrowed live room microphone', async () => {
    borrowed.stop = vi.fn();
    const view = render(
      <SoundCheck {...props} roomMicActive getMicrophoneTrack={() => borrowed} />,
    );
    open();
    await click('اختبار الميكروفون');
    expect(m.getUserMedia).not.toHaveBeenCalled();
    await click('إيقاف الفحص');
    view.unmount();
    expect(borrowed.stop).not.toHaveBeenCalled();
  });
  it('stops a late stream if a pending permission request outlives the panel', async () => {
    let grant!: (stream: unknown) => void;
    m.getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        grant = resolve;
      }),
    );
    const view = render(<SoundCheck {...props} />);
    open();
    await click('اختبار الميكروفون');
    view.unmount();
    await act(async () => grant({ getTracks: () => [{ stop: m.stop }] }));
    expect(m.stop).toHaveBeenCalledTimes(1);
  });
  it('releases capture on device change and allows a new test', async () => {
    const view = render(<SoundCheck {...props} />);
    open();
    await click('اختبار الميكروفون');
    view.rerender(<SoundCheck {...props} inputId="another-mic" />);
    open();
    expect(m.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'اختبار الميكروفون' })).not.toBeDisabled();
    view.unmount();
  });
  it('reports permission denial without pretending the microphone works', async () => {
    m.getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const view = render(<SoundCheck {...props} />);
    open();
    await click('اختبار الميكروفون');
    expect(screen.getByRole('alert')).toHaveTextContent('اسمح باستخدام الميكروفون');
    expect(screen.queryByText('رُصد صوت من الميكروفون على هذا الجهاز.')).not.toBeInTheDocument();
    view.unmount();
  });
  it('routes a tone to the selected output and requires the user to confirm hearing it', async () => {
    const view = render(<SoundCheck {...props} outputId="chosen-speaker" />);
    open();
    await click('تشغيل نغمة الاختبار');
    expect(m.sink).toHaveBeenCalledWith('chosen-speaker');
    expect(m.oscillatorStart).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(900));
    expect(screen.queryByText('أكدت سماع نغمة الاختبار.')).not.toBeInTheDocument();
    await click('سمعت النغمة');
    expect(screen.getByText('أكدت سماع نغمة الاختبار.')).toBeInTheDocument();
    view.unmount();
  });
});
