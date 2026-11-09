import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResultShareCard } from './result-share-card';

describe('createResultShareCard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the game and personal result into a PNG', async () => {
    const fillText = vi.fn();
    const gradient = { addColorStop: vi.fn() };
    const context = {
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText,
      createLinearGradient: vi.fn(() => gradient),
      createRadialGradient: vi.fn(() => gradient),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as ReturnType<HTMLCanvasElement['getContext']>,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
      callback(new Blob(['png'], { type: 'image/png' })),
    );

    const file = await createResultShareCard({
      gameTitle: 'تحدي المعرفة',
      name: 'سارة',
      rank: 2,
      score: 1200,
    });

    expect(file.type).toBe('image/png');
    expect(file.name).toBe('tahaddi-result.png');
    expect(fillText).toHaveBeenCalledWith('تحدي المعرفة', 1090, 230, 560);
    expect(fillText).toHaveBeenCalledWith('سارة', 1090, 368, 560);
    expect(fillText).toHaveBeenCalledWith('2', 300, 390, 245);
    expect(fillText).toHaveBeenCalledWith('1,200 نقطة', 1090, 480, 560);
  });
});
