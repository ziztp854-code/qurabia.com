import type { VillageCamera } from './village-camera';

/** Fixed village: pointer, wheel, and keyboard gestures do not pan or zoom. */
export function bindVillageInput(element: HTMLElement, camera: VillageCamera) {
  void camera;
  element.dataset.fixedView = 'true';
  return () => {
    delete element.dataset.fixedView;
  };
}
