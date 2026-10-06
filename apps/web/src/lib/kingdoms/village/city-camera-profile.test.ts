import { describe, expect, it } from 'vitest';
import { getCityCameraProfile } from './city-camera-profile';

describe('city artwork camera profiles', () => {
  it.each([[360, 800], [390, 844], [430, 932], [768, 1024], [834, 1194]])(
    'selects the independent portrait composition at %i×%i', (width, height) => {
      expect(getCityCameraProfile({ width, height })).toMatchObject({ id: 'portrait', world: { width: 900, height: 1600 } });
    },
  );
  it.each([[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440], [3840, 2160]])(
    'selects the full panoramic composition at %i×%i', (width, height) => {
      expect(getCityCameraProfile({ width, height })).toMatchObject({ id: 'desktop', world: { width: 1600, height: 900 } });
    },
  );
});
