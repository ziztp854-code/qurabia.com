import { afterEach, describe, expect, it, vi } from 'vitest';
import { markerSvgs, registerMapMarkerImages } from '../src/markers';

afterEach(() => vi.unstubAllGlobals());

function harness(contextAvailable = true, decodeError = false) {
  const decode = vi.fn(async () => {
    if (decodeError) throw new Error('Image decode failed');
  });
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      decode = decode;
    },
  );
  const drawImage = vi.fn();
  const getImageData = vi.fn(() => ({
    width: 48,
    height: 48,
    data: new Uint8ClampedArray(48 * 48 * 4),
  }));
  const canvases: { width: number; height: number; getContext: () => unknown }[] = [];
  const createElement = vi.fn(() => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => (contextAvailable ? { drawImage, getImageData } : null),
    };
    canvases.push(canvas);
    return canvas;
  });
  vi.stubGlobal('document', { createElement });
  const registered = new Set<string>();
  const addImage = vi.fn((id: string) => {
    registered.add(id);
  });
  const map = { hasImage: (id: string) => registered.has(id), addImage } as unknown as Parameters<
    typeof registerMapMarkerImages
  >[0];
  return { map, addImage, decode, drawImage, getImageData, canvases, registered, createElement };
}

describe('shared HiDPI marker atlas', () => {
  it.each([
    [0.5, 1],
    [2.5, 2.5],
    [8, 4],
  ])('clamps DPR %s to %s while keeping logical marker size', async (requested, expected) => {
    const h = harness();
    await registerMapMarkerImages(h.map, { pixelRatio: requested });
    expect(h.addImage).toHaveBeenCalledTimes(markerSvgs().length);
    expect(
      h.canvases.every(
        (canvas) => canvas.width === 48 * expected && canvas.height === 48 * expected,
      ),
    ).toBe(true);
    expect(h.addImage).toHaveBeenCalledWith('mamluk-capital', expect.anything(), {
      pixelRatio: expected,
    });
    expect(h.getImageData).toHaveBeenCalledWith(0, 0, 48 * expected, 48 * expected);
  });

  it('uses display DPR and reuses already registered images after repeat calls', async () => {
    const h = harness();
    vi.stubGlobal('devicePixelRatio', 3);
    await registerMapMarkerImages(h.map);
    expect(h.addImage).toHaveBeenCalledWith('mamluk-army', expect.anything(), { pixelRatio: 3 });
    const count = h.decode.mock.calls.length;
    await registerMapMarkerImages(h.map);
    expect(h.decode).toHaveBeenCalledTimes(count);
  });

  it('avoids duplicate writes when concurrent style registration finishes', async () => {
    const h = harness();
    await Promise.all([registerMapMarkerImages(h.map), registerMapMarkerImages(h.map)]);
    expect(h.addImage).toHaveBeenCalledTimes(markerSvgs().length);
  });

  it('surfaces unavailable drawing contexts without publishing broken images', async () => {
    const h = harness(false);
    await expect(registerMapMarkerImages(h.map)).rejects.toThrow('canvas unavailable');
    expect(h.addImage).not.toHaveBeenCalled();
  });

  it('surfaces image decoding failure so the caller can provide a map fallback', async () => {
    const h = harness(true, true);
    await expect(registerMapMarkerImages(h.map)).rejects.toThrow('Image decode failed');
    expect(h.addImage).not.toHaveBeenCalled();
    expect(h.createElement).not.toHaveBeenCalled();
  });
});
