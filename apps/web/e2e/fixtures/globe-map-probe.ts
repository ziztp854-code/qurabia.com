import { Map } from 'maplibre-gl';

declare global {
  interface Window { __globeFixtureMap?: Map }
}

// Observe the actual SDK instance without replacing rendering, workers, tiles or sources.
const getCanvas = Map.prototype.getCanvas;
Map.prototype.getCanvas = function () {
  window.__globeFixtureMap = this;
  return getCanvas.call(this);
};
