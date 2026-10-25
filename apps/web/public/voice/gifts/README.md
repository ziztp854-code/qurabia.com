# Realistic Tahaddi gift assets

Local photographic-style product artwork and cinematic VFX, 25 October 2026.
No gift images are imported from the player repositories or a third-party stock
catalog. These images are not photographs of existing physical products.

- Rose, applause, star, crown: derivatives of the existing project-generated
  `studio-gifts.webp`, retained unchanged. Four individual crops allow lazy loading.
- Heart, car, fireworks: generated for this task with the OpenAI image-generation
  tool, transparent source `/workspace/generated_images/exec-a90d67fb-6a9e-4ab0-a17c-0478344c69ac.png`
  (1254 × 1254). Cropped separately at their actual bounds to avoid atlas bleed.
- Dragon: generated for this task from the same visual reference, transparent
  source `/workspace/generated_images/exec-f0f3fa18-6fc2-45ea-8713-37b725d584e6.png`
  (1576 × 984), isolated from other objects.

Masters remain in the session generated-images directory. Production derivatives
are local WebP, quality 85 / alpha quality 100, 640 × 640 (display scenes) and
192 × 192 (`-thumb`, catalog and receipts), with aspect-preserving transparent
padding. Original source boundaries are preserved; source detail is not inferred
from the larger derivative dimensions. The car/dragon are padded rather than
stretched. The old four product images retain their photographed dark background.

CSS performs bounded transformations; these files are still-image assets, not
video or articulated sprite sequences. No playback sound is attached. Code
licenses for VAP/SVGA/dotLottie/tsParticles/Motion do not license external artwork.
Original tool-generated artwork is delivered under the applicable generation
service terms, with no separate third-party stock license asserted.

## Delivered sizes

| Gift      | Thumbnail bytes (192²) | Scene bytes (640²) |
| --------- | ---------------------: | -----------------: |
| rose      |                   4760 |              28456 |
| applause  |                   3530 |              19982 |
| star      |                   3940 |              20012 |
| crown     |                   8820 |              61904 |
| heart     |                  16790 |             109386 |
| car       |                  10040 |              64278 |
| fireworks |                  27610 |             225378 |
| dragon    |                  16028 |             111660 |
